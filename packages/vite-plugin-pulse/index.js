/**
 * vite-plugin-pulse
 *
 * Vite plugin that transforms .pulse files to JavaScript ESM modules
 * Uses unified Pulse 3.1 compilation pipeline with IR backend
 */

// Note: When published to npm, this import will resolve via package exports:
// import { compileFile } from 'pulselang/cli/utils/compile';
// During development, use relative path to avoid requiring npm link
import { compileFile } from '../../lib/cli/utils/compile.js';
import { relative } from 'node:path';

/**
 * Normalize runtime import specifiers for npm package distribution
 *
 * Rewrites absolute file:// URLs and relative paths in generated code
 * to package-relative import specifiers (e.g., 'pulselang/runtime').
 * This ensures imports resolve correctly when code is bundled by Vite.
 *
 * @param {string} code - Generated JavaScript code
 * @param {string} sourceFilePath - Original .pls source file path
 * @param {string} projectRoot - Vite project root directory
 * @returns {string} Code with normalized import specifiers
 */
function normalizeRuntimeImportSpecifiers(code, sourceFilePath, projectRoot) {
  // Normalize file:// URLs to package imports
  let normalized = code.replace(/from ['"]file:\/\/.*?\/lib\/runtime\/index\.js['"]/g, "from 'pulselang/runtime'");

  // Normalize relative paths to package imports
  normalized = normalized.replace(/from ['"]\.\.?\/.*?\/lib\/runtime\/index\.js['"]/g, "from 'pulselang/runtime'");
  normalized = normalized.replace(/from ['"]\.\.?\/.*?\/lib\/runtime\/reactivity\.js['"]/g, "from 'pulselang/runtime/reactivity'");

  return normalized;
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
 * Vite plugin for .pls/.pulse files
 */
export default function pulseLang(options = {}) {
  const { include = /\.(pls|pulse)$/, exclude, debug = false } = options;

  let projectRoot = process.cwd();

  return {
    name: 'vite-plugin-pulse',

    configResolved(config) {
      projectRoot = config.root || process.cwd();
    },

    /**
     * Transform .pls/.pulse files to JavaScript
     */
    async transform(code, id) {
      // Only process .pls or .pulse files
      if (!id.endsWith('.pls') && !id.endsWith('.pulse')) {
        return null;
      }

      // Apply include/exclude filters
      if (include && !include.test(id)) return null;
      if (exclude && exclude.test(id)) return null;

      try {
        if (debug) {
          console.log(`[vite-plugin-pulse] Compiling ${id}`);
        }

        // Compile using unified pipeline (IR backend default)
        let js = await compileFile(id, {
          sourcemap: false, // Vite handles source maps
          strictAST: false,
          strictSemantic: false,
          strictTypes: false,
          legacyBackend: false // Use IR backend
        });

        // Normalize runtime import specifiers for bundling
        js = normalizeRuntimeImportSpecifiers(js, id, projectRoot);

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
     * Handle HMR for .pls/.pulse files
     */
    handleHotUpdate({ file, server }) {
      if (file.endsWith('.pls') || file.endsWith('.pulse')) {
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
