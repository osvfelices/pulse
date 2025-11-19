/**
 * Pulse Project Loader
 * Unified project loading: pulse.json, stdlib resolution, dependency graph
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Parser } from '../parser.js';
import { ModuleGraph } from './module-graph.js';

export class ProjectLoader {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.config = null;
    this.graph = new ModuleGraph();
    this.stdlibPath = null;
    this.errors = [];
  }

  /**
   * Load project configuration (pulse.json)
   */
  loadConfig() {
    const configPath = path.join(this.projectRoot, 'pulse.json');

    if (!fs.existsSync(configPath)) {
      // Use default config
      this.config = {
        name: path.basename(this.projectRoot),
        entry: 'src/main.pulse',
        stdlib: 'std'
      };
      return { ok: true, config: this.config };
    }

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      this.config = JSON.parse(content);
      return { ok: true, config: this.config };
    } catch (err) {
      this.errors.push({
        type: 'config',
        message: `Failed to load pulse.json: ${err.message}`,
        file: configPath
      });
      return { ok: false, error: err.message };
    }
  }

  /**
   * Resolve stdlib path
   */
  resolveStdlib() {
    // Stdlib is in the Pulse installation directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.stdlibPath = path.resolve(__dirname, '..', '..');
    return this.stdlibPath;
  }

  /**
   * Load module and parse
   */
  async loadModule(filePath) {
    const uri = 'file://' + path.resolve(this.projectRoot, filePath);

    // Check cache
    const cached = this.graph.getModule(uri);
    if (cached) {
      return { ok: true, uri, ast: cached.ast };
    }

    // Read file
    const absPath = path.resolve(this.projectRoot, filePath);
    if (!fs.existsSync(absPath)) {
      this.errors.push({
        type: 'module',
        message: `Module not found: ${filePath}`,
        file: absPath
      });
      return { ok: false, error: `Module not found: ${filePath}` };
    }

    const source = fs.readFileSync(absPath, 'utf8');

    // Parse
    try {
      const parser = new Parser(source);
      const ast = parser.parseProgram();

      // Add to graph
      this.graph.addModule(uri, source, ast);

      // Extract imports and add dependencies
      this.extractDependencies(uri, ast);

      return { ok: true, uri, ast };
    } catch (err) {
      const parseErrors = err.pulseErrors || (err.code?.startsWith('PULSE') ? [err] : [{ message: err.message }]);

      for (const parseError of parseErrors) {
        this.errors.push({
          type: 'parse',
          message: parseError.message || parseError.error,
          file: absPath,
          line: parseError.line,
          column: parseError.column,
          code: parseError.code
        });
      }

      return { ok: false, error: parseErrors[0].message };
    }
  }

  /**
   * Extract import dependencies from AST
   */
  extractDependencies(uri, ast) {
    if (!ast || !ast.body) return;

    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration' && node.source) {
        const importPath = node.source.value;

        // Resolve import path
        let resolvedPath;
        if (importPath.startsWith('std/')) {
          // Stdlib import
          resolvedPath = 'stdlib:' + importPath;
        } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
          // Relative import
          const currentDir = path.dirname(uri.replace('file://', ''));
          resolvedPath = 'file://' + path.resolve(currentDir, importPath + '.pulse');
        } else {
          // Check if it's a package import
          // Package imports don't start with '.' and are not stdlib
          const packagesDir = path.join(this.projectRoot, '.pulse', 'packages');

          // Extract package name (first part before '/' if present)
          let packageName, packagePath;
          const slashIndex = importPath.indexOf('/');
          if (slashIndex !== -1) {
            packageName = importPath.substring(0, slashIndex);
            packagePath = importPath.substring(slashIndex + 1);
          } else {
            packageName = importPath;
            packagePath = 'index';
          }

          // Check if package exists in .pulse/packages
          const pkgDir = path.join(packagesDir, packageName);
          if (fs.existsSync(pkgDir)) {
            // Package import
            resolvedPath = 'file://' + path.join(pkgDir, packagePath + '.pulse');
          } else {
            // Fallback to absolute project import
            resolvedPath = 'file://' + path.resolve(this.projectRoot, importPath + '.pulse');
          }
        }

        this.graph.addDependency(uri, resolvedPath);
      }
    }
  }

  /**
   * Load entire project
   */
  async loadProject() {
    this.errors = [];

    // Load config
    const configResult = this.loadConfig();
    if (!configResult.ok) {
      return { ok: false, errors: this.errors };
    }

    // Resolve stdlib
    this.resolveStdlib();

    // Load entry point
    const entryPath = this.config.entry || 'src/main.pulse';
    const entryResult = await this.loadModule(entryPath);

    if (!entryResult.ok) {
      return { ok: false, errors: this.errors };
    }

    // Load all dependencies recursively
    await this.loadDependencies(entryResult.uri);

    if (this.errors.length > 0) {
      return { ok: false, errors: this.errors };
    }

    return {
      ok: true,
      entry: entryResult.uri,
      modules: this.graph.getOrderedModules(),
      graph: this.graph
    };
  }

  /**
   * Load dependencies recursively
   */
  async loadDependencies(uri) {
    const deps = this.graph.getDependencies(uri);

    for (const depUri of deps) {
      if (depUri.startsWith('stdlib:')) {
        // Stdlib module - skip actual loading (handled by runtime)
        continue;
      }

      // Check if already loaded
      if (this.graph.getModule(depUri)) {
        continue;
      }

      // Load module
      const depPath = depUri.replace('file://', '');
      const relativePath = path.relative(this.projectRoot, depPath);
      const result = await this.loadModule(relativePath);

      if (result.ok) {
        // Recursively load this module's dependencies
        await this.loadDependencies(depUri);
      }
    }
  }

  /**
   * Get all errors
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Invalidate module (for hot reload)
   */
  invalidateModule(filePath) {
    const uri = 'file://' + path.resolve(this.projectRoot, filePath);
    this.graph.invalidate(uri);

    // Also invalidate dependents
    const dependents = this.graph.getDependents(uri);
    for (const dependent of dependents) {
      this.graph.invalidate(dependent);
    }
  }

  /**
   * Get module graph
   */
  getGraph() {
    return this.graph;
  }
}
