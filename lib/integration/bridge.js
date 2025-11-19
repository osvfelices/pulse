/**
 * LSP-Runtime Bridge
 * Connects LSP server to unified ProjectLoader
 * Provides compile, semantic analysis, go-to-definition using unified module graph
 */

import { ProjectLoader } from './loader.js';
import path from 'path';

export class LSPBridge {
  constructor() {
    this.loaders = new Map(); // workspace -> ProjectLoader
  }

  /**
   * Get or create loader for workspace
   */
  getLoader(workspaceRoot) {
    if (!this.loaders.has(workspaceRoot)) {
      const loader = new ProjectLoader(workspaceRoot);
      this.loaders.set(workspaceRoot, loader);
    }
    return this.loaders.get(workspaceRoot);
  }

  /**
   * Compile project and return diagnostics
   */
  async compile(workspaceRoot) {
    const loader = this.getLoader(workspaceRoot);
    const result = await loader.loadProject();

    if (!result.ok) {
      return loader.getErrors().map(err => ({
        severity: 'error',
        message: err.message,
        uri: err.file,
        range: {
          start: { line: err.line || 0, character: err.column || 0 },
          end: { line: err.line || 0, character: (err.column || 0) + 1 }
        },
        code: err.code
      }));
    }

    return [];
  }

  /**
   * Get AST for document
   */
  async getAST(workspaceRoot, documentUri) {
    const loader = this.getLoader(workspaceRoot);

    // Normalize URI
    const uri = documentUri.startsWith('file://') ? documentUri : 'file://' + documentUri;
    const ast = loader.getGraph().getAST(uri);

    if (ast) {
      return ast;
    }

    // Try to load module
    const filePath = uri.replace('file://', '');
    const relativePath = path.relative(workspaceRoot, filePath);
    const result = await loader.loadModule(relativePath);

    return result.ok ? result.ast : null;
  }

  /**
   * Go-to-definition using unified graph
   */
  async getDefinition(workspaceRoot, documentUri, position) {
    const loader = this.getLoader(workspaceRoot);

    // Normalize URI
    const uri = documentUri.startsWith('file://') ? documentUri : 'file://' + documentUri;
    const ast = loader.getGraph().getAST(uri);

    if (!ast) {
      return null;
    }

    // Find import declarations near position
    if (ast.body) {
      for (const node of ast.body) {
        if (node.kind === 'ImportDecl' || node.type === 'ImportDeclaration') {
          const source = node.source?.value || node.path;

          // Resolve import to file path
          let targetUri;
          if (source && source.startsWith('std/')) {
            // Stdlib import
            const stdlibPath = loader.resolveStdlib();
            targetUri = path.join(stdlibPath, source.replace('std/', 'std/') + '.pulse');
          } else if (source && (source.startsWith('./') || source.startsWith('../'))) {
            // Local import
            const filePath = uri.replace('file://', '');
            const dir = path.dirname(filePath);
            targetUri = path.resolve(dir, source);
          }

          if (targetUri) {
            return {
              uri: targetUri,
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Get project tree
   */
  async getProjectTree(workspaceRoot) {
    const loader = this.getLoader(workspaceRoot);
    const result = await loader.loadProject();

    if (!result.ok) {
      return null;
    }

    const modules = result.modules.map(uri => ({
      uri,
      dependencies: loader.getGraph().getDependencies(uri),
      dependents: loader.getGraph().getDependents(uri)
    }));

    return {
      entry: result.entry,
      modules,
      stats: loader.getGraph().getStats()
    };
  }

  /**
   * Invalidate document (for hot reload)
   */
  invalidateDocument(workspaceRoot, documentUri) {
    const loader = this.getLoader(workspaceRoot);
    const filePath = documentUri.replace('file://', '');
    const relativePath = path.relative(workspaceRoot, filePath);
    loader.invalidateModule(relativePath);
  }

  /**
   * Get diagnostics for specific document
   */
  async getDiagnostics(workspaceRoot, documentUri) {
    const loader = this.getLoader(workspaceRoot);

    // Try to get AST (will parse if not cached)
    const ast = await this.getAST(workspaceRoot, documentUri);

    if (!ast) {
      // Return parse errors
      const errors = loader.getErrors().filter(err => {
        const errUri = err.file;
        return errUri === documentUri || errUri === documentUri.replace('file://', '');
      });

      return errors.map(err => ({
        severity: 1,
        message: err.message,
        line: err.line || 1,
        column: err.column || 0,
        code: err.code
      }));
    }

    return []; // No errors
  }
}
