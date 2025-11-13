/**
 * vite-plugin-pulse
 *
 * Vite plugin that transforms .pulse files to JavaScript ESM modules
 * Supports both dev and production builds with source maps
 */

// During development: use relative imports
// After npm publish: use 'pulselang/parser' and 'pulselang/codegen'
import { Parser } from '../../lib/parser.js';
import { emitProgram } from '../../lib/codegen.js';
import { relative } from 'node:path';

/**
 * Fix runtime import paths in generated code
 * Converts relative paths to node_modules imports
 */
function fixRuntimeImports(code, sourceFilePath, projectRoot) {
  // Replace './lib/runtime/index.js' with 'pulselang/runtime'
  let fixed = code.replace(/from ['"]\.\/lib\/runtime\/index\.js['"]/g, "from 'pulselang/runtime'");

  // Replace './lib/runtime/reactivity.js' with 'pulselang/runtime/reactivity'
  fixed = fixed.replace(/from ['"]\.\/lib\/runtime\/reactivity\.js['"]/g, "from 'pulselang/runtime/reactivity'");

  return fixed;
}

/**
 * Generate a basic source map for debugging
 */
function generateSourceMap(originalCode, generatedCode, sourceFile) {
  const originalLines = originalCode.split('\n');
  const generatedLines = generatedCode.split('\n');

  // Create simple line-by-line mappings
  const mappings = [];
  for (let i = 0; i < generatedLines.length; i++) {
    // Map each generated line to original line (approximation)
    const originalLine = Math.min(i, originalLines.length - 1);
    // Format: generated column, source file index, original line, original column
    mappings.push(`AAAA`); // Simple 1:1 mapping
  }

  return {
    version: 3,
    file: sourceFile,
    sources: [sourceFile],
    sourcesContent: [originalCode],
    names: [],
    mappings: mappings.join(';')
  };
}

/**
 * Vite plugin for .pulse files
 */
export default function pulseLang(options = {}) {
  const { include = /\.pulse$/, exclude, debug = false } = options;

  let projectRoot = process.cwd();

  return {
    name: 'vite-plugin-pulse',

    configResolved(config) {
      projectRoot = config.root || process.cwd();
    },

    /**
     * Transform .pulse files to JavaScript
     */
    async transform(code, id) {
      // Only process .pulse files
      if (!id.endsWith('.pulse')) {
        return null;
      }

      // Apply include/exclude filters
      if (include && !include.test(id)) return null;
      if (exclude && exclude.test(id)) return null;

      try {
        if (debug) {
          console.log(`[vite-plugin-pulse] Compiling ${id}`);
        }

        // Parse Pulse source
        const parser = new Parser(code);
        const ast = parser.parseProgram();

        // Generate JavaScript
        let js = emitProgram(ast);

        // Fix runtime import paths
        js = fixRuntimeImports(js, id, projectRoot);

        if (debug) {
          console.log('[vite-plugin-pulse] Generated code:');
          console.log(js);
        }

        // Generate basic source map
        const map = generateSourceMap(code, js, id);

        // Return transformed code with source map
        return {
          code: js,
          map
        };
      } catch (error) {
        // Improve error messages
        const relativePath = relative(projectRoot, id);
        this.error({
          message: `Pulse compilation failed in ${relativePath}: ${error.message}`,
          id,
          plugin: 'vite-plugin-pulse'
        });
      }
    },

    /**
     * Handle HMR for .pulse files
     */
    handleHotUpdate({ file, server }) {
      if (file.endsWith('.pulse')) {
        // Get the module from the module graph
        const module = server.moduleGraph.getModuleById(file);
        if (!module) {
          return;
        }

        // Invalidate this module
        server.moduleGraph.invalidateModule(module);

        // Collect all modules that import this .pulse file
        const affected = [module];
        const seen = new Set([module]);

        function collectImporters(mod) {
          for (const importer of mod.importers) {
            if (!seen.has(importer)) {
              seen.add(importer);
              affected.push(importer);
              // Don't recurse deeper - let Vite's HMR handle propagation
            }
          }
        }

        collectImporters(module);

        // Return affected modules for fine-grained HMR
        return affected;
      }
    }
  };
}

// Named export for commonjs compatibility
export { pulseLang };
