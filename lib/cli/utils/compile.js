/**
 * Shared compilation utilities for Pulse CLI
 *
 * Centralizes compilation logic used by run, dev, test commands.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, basename, resolve } from 'node:path';
import { Parser } from '../../parser.js';
import { emitProgram } from '../../codegen.js';
import { SemanticAnalyzer } from '../../semantic/index.js';
import '../../runtime/globals.js';

// Enable source map support
import { setSourceMapsEnabled } from 'node:process';
try {
  setSourceMapsEnabled(true);
} catch (e) {
  // Fallback for older Node versions
}

/**
 * Compile a Pulse source file to JavaScript
 *
 * @param {string} filePath - Absolute path to .pulse file
 * @param {Object} options - Compilation options
 * @param {boolean} options.sourcemap - Generate source maps
 * @param {boolean} options.strictAST - Enable strict AST validation
 * @param {boolean} options.strictSemantic - Enable strict semantic analysis
 * @param {boolean} options.strictTypes - Enable optional type checking
 * @param {boolean} options.legacyBackend - Use legacy codegen
 * @returns {Promise<string>} Generated JavaScript code
 */
export async function compileFile(filePath, options = {}) {
  const {
    sourcemap = false,
    strictAST = false,
    strictSemantic = false,
    strictTypes = false,
    legacyBackend = false
  } = options;

  // Ensure absolute path
  const absolutePath = resolve(filePath);

  // Read source
  const source = readFileSync(absolutePath, 'utf8');

  // Parse
  const parser = new Parser(source, { validateAST: strictAST });
  const ast = parser.parseProgram();

  // Semantic analysis
  const analyzer = new SemanticAnalyzer({ strict: strictSemantic });
  const semanticResult = analyzer.analyze(ast);

  if (!semanticResult.valid) {
    if (strictSemantic) {
      for (const error of semanticResult.errors) {
        console.error(error.toString());
      }
      throw new Error('Semantic analysis failed');
    } else {
      for (const error of semanticResult.errors) {
        console.warn('Warning:', error.message);
      }
    }
  }

  // Optional type checking
  if (strictTypes) {
    const { TypeChecker } = await import('../../semantic/type-checker.js');
    const typeResult = TypeChecker.check(ast, semanticResult.scope);

    if (!typeResult.valid) {
      console.error('Type checking failed:');
      for (const error of typeResult.errors) {
        const loc = error.loc;
        if (loc) {
          console.error(`  ${error.message} at line ${loc.start.line}, column ${loc.start.col}`);
        } else {
          console.error(`  ${error.message}`);
        }
      }
      throw new Error('Type checking failed');
    }
  }

  // Code generation
  let js;

  if (legacyBackend) {
    // Legacy codegen
    if (sourcemap) {
      const sourceFileName = basename(absolutePath);
      const result = emitProgram(ast, sourceFileName);
      js = result.code;

      const map = result.map.toJSON();
      map.sourcesContent = [source];
      const base64Map = Buffer.from(JSON.stringify(map)).toString('base64');
      js += `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Map}\n`;
    } else {
      js = emitProgram(ast);
    }
  } else {
    // IR backend (default)
    const { lowerProgram, validateIRModule, optimizeIR, emitJS } = await import('../../ir/index.js');

    let irModule = lowerProgram(ast);

    if (strictTypes) {
      const { attachTypeMetadata } = await import('../../ir/type-pass.js');
      irModule = attachTypeMetadata(irModule, semanticResult.scope);
    }

    const validation = validateIRModule(irModule);
    if (!validation.valid) {
      console.error('IR validation failed:');
      for (const error of validation.errors) {
        console.error(error.toString());
      }
      throw new Error('IR validation failed');
    }

    const optimized = optimizeIR(irModule);
    js = emitJS(optimized);

    if (sourcemap) {
      console.warn('Warning: --sourcemap not yet supported with IR backend');
    }
  }

  return js;
}

/**
 * Compile and execute a Pulse file
 *
 * @param {string} filePath - Path to .pulse file
 * @param {Object} options - Compilation options (same as compileFile)
 * @returns {Promise<void>}
 */
export async function compileAndRun(filePath, options = {}) {
  const absolutePath = resolve(filePath);
  const js = await compileFile(absolutePath, options);

  // Debug output
  if (process.env.DEBUG_CODEGEN) {
    console.log('=== Generated Code ===');
    console.log(js);
    console.log('======================');
  }

  // Write to temp file in same directory as source
  const sourceDir = dirname(absolutePath);
  const tmpFile = join(sourceDir, '.tmp_pulse_exec_' + Date.now() + '.mjs');
  writeFileSync(tmpFile, js, 'utf8');

  try {
    await import(tmpFile + '?t=' + Date.now());
  } finally {
    unlinkSync(tmpFile);
  }
}
