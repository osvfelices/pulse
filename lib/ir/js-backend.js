/**
 * JavaScript Backend for IR
 *
 * Emits JavaScript code from optimized IR.
 * Produces semantically equivalent output to the legacy codegen.
 *
 * Exception handling implements ECMAScript Completion Record semantics:
 * - Cleanup Frame Stack for nested try/finally unwinding
 * - Proper exception suppression when finally throws/returns
 * - Correct handling of return, throw, break, continue through finally chains
 *
 * Key data structures:
 * - __completion: { type: 'normal'|'return'|'throw'|'break'|'continue', value, target }
 * - __finallyStack: Array of { finallyLabel, depth } for tracking nested finally blocks
 */

import { InstructionKinds, OperandKinds } from './instructions.js';

/**
 * Scan IR module to determine required runtime primitive imports
 *
 * Analyzes all functions and instructions to identify which Pulse runtime
 * primitives (async, spawn, channel, select) are referenced and must be
 * imported in the emitted JavaScript module.
 *
 * @param {Object} irModule - IR module to scan
 * @returns {Object} Flags indicating which runtime primitive categories are used
 */
function scanRequiredRuntimePrimitives(irModule) {
  const required = {
    usesAsyncAwait: false,
    usesSpawnPrimitive: false,
    usesChannelPrimitive: false,
    usesSelectPrimitive: false
  };

  for (const func of irModule.functions) {
    // Async functions require async runtime (__async_spawn wrapper)
    if (func.async) {
      required.usesAsyncAwait = true;
    }

    // Scan all instructions for runtime primitive references
    for (const block of func.blocks) {
      for (const instr of block.instructions) {
        if (instr.kind === InstructionKinds.Await) {
          required.usesAsyncAwait = true;
        }
        if (instr.kind === InstructionKinds.Spawn) {
          required.usesSpawnPrimitive = true;
        }
        if (instr.kind === InstructionKinds.Select) {
          required.usesSelectPrimitive = true;
        }
        // Channel creation and operations
        if (instr.kind === InstructionKinds.Call) {
          const calleeName = instr.callee?.name;
          if (calleeName === 'channel' || calleeName === 'send' || calleeName === 'recv') {
            required.usesChannelPrimitive = true;
          }
        }
      }
    }
  }

  return required;
}

/**
 * Emit JavaScript code from IR module
 *
 * Generates executable JavaScript from validated and optimized IR.
 * Emits runtime imports, global declarations, functions, and module initialization.
 *
 * @param {Object} irModule - Validated IR module
 * @param {Object} options - Code generation options
 * @param {string} options.runtimeImportPath - Import specifier for Pulse runtime (default: 'pulselang/runtime')
 * @returns {string} Generated JavaScript module code
 */
export function emitJS(irModule, options = {}) {
  const { runtimeImportPath = 'pulselang/runtime' } = options;
  const lines = [];

  // Scan IR to determine which runtime primitives are used
  const primitives = scanRequiredRuntimePrimitives(irModule);

  // Emit import statement for required runtime primitives
  if (primitives.usesAsyncAwait || primitives.usesSpawnPrimitive || primitives.usesChannelPrimitive || primitives.usesSelectPrimitive) {
    const importedSymbols = [];

    // Async/await requires wrapper and await bridge
    if (primitives.usesAsyncAwait) {
      importedSymbols.push('__async_spawn', '__await_deterministic');
    }

    // Spawn instruction requires spawn primitive
    if (primitives.usesSpawnPrimitive) {
      importedSymbols.push('spawn');
    }

    // Channel operations and async/await both require channel primitive
    if (primitives.usesChannelPrimitive || primitives.usesAsyncAwait) {
      importedSymbols.push('channel');
    }

    // Select instruction requires select and selectCase
    if (primitives.usesSelectPrimitive) {
      importedSymbols.push('select', 'selectCase');
    }

    // Async primitives require scheduler for drain functionality and spawn for init wrapper
    if (primitives.usesAsyncAwait || primitives.usesSpawnPrimitive) {
      importedSymbols.push('getScheduler', 'spawn');
    }

    // Deduplicate and emit import statement
    const uniqueImports = [...new Set(importedSymbols)];
    lines.push(`import { ${uniqueImports.join(', ')} } from '${runtimeImportPath}';`);
    lines.push('');
  }

  // Emit module-level global declarations
  if (irModule.globals && irModule.globals.length > 0) {
    for (const g of irModule.globals) {
      const keyword = g.constant ? 'const' : 'let';
      // For let, declare without value - init happens in __init__
      // For const, we need a value at declaration time which is tricky
      // We'll emit 'let' for mutable globals only
      if (!g.constant) {
        lines.push(`${keyword} ${g.name};`);
      }
    }
    if (lines.length > 0) {
      lines.push('');
    }
  }

  for (const func of irModule.functions) {
    lines.push(emitFunction(func));
    lines.push('');
  }

  // Call module init function if it exists
  const hasInit = irModule.functions.some(f => f.name === '__init__');
  if (hasInit) {
    // If module uses async primitives, call init and drain scheduler to await spawned tasks
    if (primitives.usesAsyncAwait || primitives.usesSpawnPrimitive) {
      lines.push('// Execute module initialization and drain scheduler to await spawned tasks');
      lines.push('await (async () => {');
      lines.push('  __init__();');
      lines.push('  await getScheduler().drain();');
      lines.push('})();');
    } else {
      // Synchronous module - direct call
      lines.push('__init__();');
    }
  }

  return lines.join('\n');
}

/**
 * Check if a function contains exception handling instructions
 */
function hasTryBlocks(func) {
  for (const block of func.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.BeginTry) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Analyze try/catch/finally structure in a function.
 * Returns information about exception handling regions including which blocks
 * are protected by each try, with proper nesting tracking.
 */
function analyzeTryStructure(func) {
  const tryInfos = [];
  const blockMap = new Map();

  // Build block map
  for (const block of func.blocks) {
    blockMap.set(block.label, block);
  }

  // Find all BeginTry instructions and their associated catch/finally targets
  // Track order for nesting analysis
  let tryIndex = 0;
  for (const block of func.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.BeginTry) {
        const tryInfo = {
          index: tryIndex++,
          startBlock: block.label,
          catchTarget: instr.catchTarget,
          finallyTarget: instr.finallyTarget,
          catchExceptionReg: null,
          protectedBlocks: new Set(),
          // Track the block where EndTry is found (for determining scope)
          endTryBlock: null,
        };
        tryInfos.push(tryInfo);
      }
    }
  }

  // Find catch exception registers and EndTry locations
  for (const block of func.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.BeginCatch) {
        // Find the try that has this catch target
        for (const info of tryInfos) {
          if (info.catchTarget === block.label) {
            info.catchExceptionReg = instr.exceptionReg;
          }
        }
      }
      if (instr.kind === InstructionKinds.EndTry) {
        // Mark which try this EndTry belongs to (simplified: first try whose protected blocks contain this)
        // This will be refined in computeProtectedBlocks
      }
    }
  }

  // Compute protected blocks: blocks reachable from try start before hitting catch/finally/exit
  for (const info of tryInfos) {
    computeProtectedBlocks(func, info, blockMap, tryInfos);
  }

  return tryInfos;
}

/**
 * Compute which blocks are protected by a try region.
 * @param {Object} func - IR function
 * @param {Object} tryInfo - Try info for this specific try block
 * @param {Map} blockMap - Map of block labels to blocks
 * @param {Array} allTryInfos - All try infos for finding nested try indices
 */
function computeProtectedBlocks(func, tryInfo, blockMap, allTryInfos) {
  const visited = new Set();
  const queue = [tryInfo.startBlock];

  // Only exclude THIS try's own catch/finally - not inner ones
  const ownCatchFinally = new Set();
  if (tryInfo.catchTarget) ownCatchFinally.add(tryInfo.catchTarget);
  if (tryInfo.finallyTarget) ownCatchFinally.add(tryInfo.finallyTarget);

  // Build a set of catch/finally targets that belong to OUTER (enclosing) try blocks
  // These should NOT be followed when computing protected blocks
  const outerCatchFinally = new Set();
  for (const other of allTryInfos) {
    if (other.index < tryInfo.index) {
      // This is an enclosing (outer) try - don't follow its catch/finally
      if (other.catchTarget) outerCatchFinally.add(other.catchTarget);
      if (other.finallyTarget) outerCatchFinally.add(other.finallyTarget);
    }
  }

  while (queue.length > 0) {
    const label = queue.shift();
    if (visited.has(label)) continue;
    if (ownCatchFinally.has(label)) continue;

    visited.add(label);
    const block = blockMap.get(label);
    if (!block) continue;

    // Check if this block has EndTry
    let hasOurEndTry = false;
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.EndTry) {
        hasOurEndTry = true;
        tryInfo.endTryBlock = label;
      }
    }

    // This block is protected
    tryInfo.protectedBlocks.add(label);

    // Don't follow successors after EndTry - those are outside the try
    if (hasOurEndTry) continue;

    // Find successor blocks
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.Jump) {
        const target = instr.target;
        if (!isLoopControlBlock(target)) {
          queue.push(target);
        }
      } else if (instr.kind === InstructionKinds.CondJump) {
        if (!isLoopControlBlock(instr.trueTarget)) {
          queue.push(instr.trueTarget);
        }
        if (!isLoopControlBlock(instr.falseTarget)) {
          queue.push(instr.falseTarget);
        }
      } else if (instr.kind === InstructionKinds.Switch) {
        for (const c of instr.cases) {
          if (!isLoopControlBlock(c.target)) {
            queue.push(c.target);
          }
        }
        if (!isLoopControlBlock(instr.defaultTarget)) {
          queue.push(instr.defaultTarget);
        }
      }
      // For nested BeginTry (inner try blocks), include its catch AND finally blocks
      // because exceptions thrown from nested catch/finally are caught by outer try
      // BUT: don't follow catch/finally of ENCLOSING (outer) try blocks
      if (instr.kind === InstructionKinds.BeginTry) {
        if (instr.catchTarget && !ownCatchFinally.has(instr.catchTarget) && !outerCatchFinally.has(instr.catchTarget)) {
          queue.push(instr.catchTarget);
        }
        // Also include nested finally blocks - exceptions thrown from
        // a nested finally should be caught by the outer try's catch handler
        if (instr.finallyTarget && !ownCatchFinally.has(instr.finallyTarget) && !outerCatchFinally.has(instr.finallyTarget)) {
          queue.push(instr.finallyTarget);
        }
      }
    }
  }
}

/**
 * Check if a block label is a loop control block (exit or update).
 */
function isLoopControlBlock(label) {
  return label.startsWith('for_exit_') ||
         label.startsWith('for_update_') ||
         label.startsWith('while_exit_') ||
         label.startsWith('loop_exit_') ||
         label.startsWith('forof_exit_') ||
         label.startsWith('forin_exit_');
}

/**
 * Emit a function
 */
function emitFunction(func) {
  if (hasTryBlocks(func)) {
    return emitFunctionWithExceptions(func);
  }
  return emitFunctionSimple(func);
}

/**
 * Emit a function using switch-based control flow (no exceptions)
 */
function emitFunctionSimple(func) {
  const lines = [];
  const params = func.params.map(p => emitOperand(p)).join(', ');

  // For async functions, emit wrapper that returns __async_spawn
  if (func.async) {
    lines.push(`function ${func.name}(${params}) {`);
    lines.push(`  return __async_spawn(async () => {`);
  } else {
    lines.push(`function ${func.name}(${params}) {`);
  }

  const indent = func.async ? '    ' : '  ';
  const paramRegIds = new Set(func.params.map(p => p.id));
  const regsToDecl = [];
  for (let i = 0; i < func.registerCount; i++) {
    if (!paramRegIds.has(i)) {
      regsToDecl.push(`r${i}`);
    }
  }
  if (regsToDecl.length > 0) {
    lines.push(`${indent}let ${regsToDecl.join(', ')};`);
  }

  const entryLabel = func.blocks[0]?.label || 'entry';
  lines.push(`${indent}let __label = '${entryLabel}';`);
  lines.push(`${indent}while (true) {`);
  lines.push(`${indent}  switch (__label) {`);

  for (const block of func.blocks) {
    lines.push(`${indent}    case '${block.label}':`);
    let prevInstr = null;
    for (const instr of block.instructions) {
      // Skip Switch instruction that immediately follows a Select with caseLabels
      // (the Select emission already handles the dispatch)
      if (instr.kind === InstructionKinds.Switch && prevInstr &&
          prevInstr.kind === InstructionKinds.Select && prevInstr.caseLabels) {
        prevInstr = instr;
        continue;
      }

      prevInstr = instr;

      const code = emitInstruction(instr, func.async);
      if (code) {
        lines.push(`${indent}      ${code}`);
      }
    }
  }

  lines.push(`${indent}  }`);
  lines.push(`${indent}}`);

  if (func.async) {
    lines.push(`  });`); // Close __async_spawn
  }
  lines.push('}');
  lines.push(`export { ${func.name} };`);

  return lines.join('\n');
}

/**
 * Build a map from block labels to ALL enclosing try-with-finally regions.
 * Returns a Map where each block maps to an array of tryInfos, ordered from
 * innermost to outermost.
 */
function buildBlockToFinallyChain(tryInfos) {
  const blockToChain = new Map();

  // For each block, find all try-with-finally regions that contain it
  // Order by index (higher index = more nested = should be processed first)
  for (const info of tryInfos) {
    if (!info.finallyTarget) continue;

    // All protected blocks (try body) need to route through finally
    for (const blockLabel of info.protectedBlocks) {
      if (!blockToChain.has(blockLabel)) {
        blockToChain.set(blockLabel, []);
      }
      blockToChain.get(blockLabel).push(info);
    }

    // Catch block also needs to route through finally
    if (info.catchTarget) {
      if (!blockToChain.has(info.catchTarget)) {
        blockToChain.set(info.catchTarget, []);
      }
      blockToChain.get(info.catchTarget).push(info);
    }
  }

  // Sort each chain by index (descending) so innermost is first
  for (const [label, chain] of blockToChain) {
    chain.sort((a, b) => b.index - a.index);
    if (process.env.DEBUG_FINALLY) {
      console.error(`Chain for ${label}:`, chain.map(i => `index=${i.index} finally=${i.finallyTarget}`));
    }
  }

  return blockToChain;
}

/**
 * Build a map from finally block labels to their tryInfo
 */
function buildFinallyToTryInfo(tryInfos) {
  const map = new Map();
  for (const info of tryInfos) {
    if (info.finallyTarget) {
      map.set(info.finallyTarget, info);
    }
  }
  return map;
}

/**
 * Emit a function with exception handling.
 *
 * Uses ECMAScript Completion Record semantics:
 * - __completion: { type: 'normal'|'return'|'throw'|'break'|'continue', value, target }
 * - __finallyDepth: tracks how deep in finally chain we are
 * - __finallyChain: array of finally labels to unwind through
 *
 * When abrupt completion occurs:
 * 1. Set __completion with the abrupt type
 * 2. Build __finallyChain from current block's enclosing finally blocks
 * 3. Jump to first finally in chain
 * 4. At EndFinally: if chain has more entries, continue unwinding; else execute completion
 *
 * Exception suppression:
 * - If finally throws, that exception replaces any pending completion
 * - If finally returns, that return replaces any pending completion
 */
function emitFunctionWithExceptions(func) {
  const lines = [];
  const params = func.params.map(p => emitOperand(p)).join(', ');
  const indent = func.async ? '    ' : '  ';

  // For async functions, emit wrapper that returns __async_spawn
  if (func.async) {
    lines.push(`function ${func.name}(${params}) {`);
    lines.push(`  return __async_spawn(async () => {`);
  } else {
    lines.push(`function ${func.name}(${params}) {`);
  }

  // Declare registers
  const paramRegIds = new Set(func.params.map(p => p.id));
  const regsToDecl = [];
  for (let i = 0; i < func.registerCount; i++) {
    if (!paramRegIds.has(i)) {
      regsToDecl.push(`r${i}`);
    }
  }
  if (regsToDecl.length > 0) {
    lines.push(`${indent}let ${regsToDecl.join(', ')};`);
  }

  // Analyze try structure
  const tryInfos = analyzeTryStructure(func);

  if (process.env.DEBUG_FINALLY) {
    for (const info of tryInfos) {
      console.error('TryInfo:', {
        index: info.index,
        startBlock: info.startBlock,
        catchTarget: info.catchTarget,
        finallyTarget: info.finallyTarget,
        protectedBlocks: Array.from(info.protectedBlocks)
      });
    }
  }

  // Build mapping from blocks to their finally chain (innermost first)
  const blockToChain = buildBlockToFinallyChain(tryInfos);
  const finallyToTryInfo = buildFinallyToTryInfo(tryInfos);

  // Identify catch and finally blocks
  const catchBlocks = new Map();
  const finallyBlocks = new Set();
  for (const info of tryInfos) {
    if (info.catchTarget) catchBlocks.set(info.catchTarget, info);
    if (info.finallyTarget) finallyBlocks.add(info.finallyTarget);
  }

  // State machine setup
  const entryLabel = func.blocks[0]?.label || 'entry';
  lines.push(`${indent}let __label = '${entryLabel}';`);

  // Completion record: tracks pending abrupt completion during finally unwinding
  lines.push(`${indent}let __completion = { type: 'normal', value: undefined, target: null };`);

  // Finally chain: array of finally labels to unwind through
  lines.push(`${indent}let __finallyChain = [];`);
  lines.push(`${indent}let __finallyIndex = 0;`);

  // Exception caught during finally execution (for suppression)
  lines.push(`${indent}let __finallyException = null;`);

  // Exception to be passed to catch handler (avoids eval)
  lines.push(`${indent}let __caughtException = null;`);

  lines.push(`${indent}__dispatch: while (true) {`);

  // Determine current try context for exception routing
  lines.push(`${indent}  let __inTry = false;`);
  lines.push(`${indent}  let __catchLabel = null;`);
  lines.push(`${indent}  let __finallyLabel = null;`);

  // Generate try region checks - order matters, more nested should win
  // Process in reverse order so more nested (higher index) checks come last and override
  const sortedTryInfos = [...tryInfos].sort((a, b) => a.index - b.index);
  for (const info of sortedTryInfos) {
    if (info.protectedBlocks.size > 0) {
      const blockList = Array.from(info.protectedBlocks).map(b => `'${b}'`).join(', ');
      const catchPart = info.catchTarget ? `__catchLabel = '${info.catchTarget}';` : '';
      const finallyPart = info.finallyTarget ? `__finallyLabel = '${info.finallyTarget}';` : '';
      lines.push(`${indent}  if ([${blockList}].includes(__label)) { __inTry = true; ${catchPart} ${finallyPart} }`);
    }
  }

  lines.push(`${indent}  try {`);
  lines.push(`${indent}    __finallyException = null;`);
  lines.push(`${indent}    switch (__label) {`);

  // Emit all blocks as switch cases
  for (const block of func.blocks) {
    lines.push(`${indent}      case '${block.label}':`);

    const isFinally = finallyBlocks.has(block.label);
    const isCatch = catchBlocks.has(block.label);

    // Get the finally chain for this block
    const chain = blockToChain.get(block.label) || [];

    // Get the innermost finally info for this block
    const innermostFinally = chain.length > 0 ? chain[0] : null;

    let prevInstr = null;
    for (const instr of block.instructions) {
      // Skip structural markers (except BeginCatch which needs to assign the exception)
      if (instr.kind === InstructionKinds.BeginTry ||
          instr.kind === InstructionKinds.EndTry ||
          instr.kind === InstructionKinds.EndCatch ||
          instr.kind === InstructionKinds.BeginFinally) {
        continue;
      }

      // Skip Switch instruction that immediately follows a Select with caseLabels
      // (the Select emission already handles the dispatch)
      if (instr.kind === InstructionKinds.Switch && prevInstr &&
          prevInstr.kind === InstructionKinds.Select && prevInstr.caseLabels) {
        prevInstr = instr;
        continue;
      }

      prevInstr = instr;

      // BeginCatch: assign the caught exception to the register
      if (instr.kind === InstructionKinds.BeginCatch) {
        if (instr.exceptionReg) {
          lines.push(`${indent}        r${instr.exceptionReg.id} = __caughtException;`);
        }
        continue;
      }

      // EndFinally: decide whether to continue unwinding or execute completion
      if (instr.kind === InstructionKinds.EndFinally) {
        lines.push(`${indent}        // EndFinally: check for suppression and continue unwinding`);
        lines.push(`${indent}        if (__finallyException !== null) {`);
        lines.push(`${indent}          // Exception in finally suppresses pending completion`);
        lines.push(`${indent}          throw __finallyException;`);
        lines.push(`${indent}        }`);
        lines.push(`${indent}        __finallyIndex++;`);
        lines.push(`${indent}        if (__finallyIndex < __finallyChain.length) {`);
        lines.push(`${indent}          // More finally blocks to unwind through`);
        lines.push(`${indent}          __label = __finallyChain[__finallyIndex];`);
        lines.push(`${indent}          break;`);
        lines.push(`${indent}        }`);
        lines.push(`${indent}        // Unwinding complete, execute pending completion`);
        lines.push(`${indent}        if (__completion.type === 'return') { return __completion.value; }`);
        lines.push(`${indent}        if (__completion.type === 'throw') { throw __completion.value; }`);
        lines.push(`${indent}        if (__completion.type === 'break' || __completion.type === 'continue') {`);
        lines.push(`${indent}          __label = __completion.target;`);
        lines.push(`${indent}          __completion = { type: 'normal', value: undefined, target: null };`);
        lines.push(`${indent}          break;`);
        lines.push(`${indent}        }`);
        lines.push(`${indent}        // Normal completion - fall through`);
        continue;
      }

      // Handle abrupt control flow
      if (innermostFinally) {
        const inCatchBlock = isCatch && catchBlocks.get(block.label) === innermostFinally;

        // Return: always route through finally chain
        if (instr.kind === InstructionKinds.Return) {
          const valueCode = instr.value ? emitOperand(instr.value) : 'undefined';
          // Build the chain of finally blocks from innermost to outermost
          const chainLabels = chain.map(info => `'${info.finallyTarget}'`).join(', ');
          lines.push(`${indent}        __completion = { type: 'return', value: ${valueCode}, target: null };`);
          lines.push(`${indent}        __finallyChain = [${chainLabels}];`);
          lines.push(`${indent}        __finallyIndex = 0;`);
          lines.push(`${indent}        __label = __finallyChain[0];`);
          lines.push(`${indent}        break;`);
          continue;
        }

        // Throw in catch: route through finally chain
        if (instr.kind === InstructionKinds.Throw && inCatchBlock) {
          const chainLabels = chain.map(info => `'${info.finallyTarget}'`).join(', ');
          lines.push(`${indent}        __completion = { type: 'throw', value: ${emitOperand(instr.value)}, target: null };`);
          lines.push(`${indent}        __finallyChain = [${chainLabels}];`);
          lines.push(`${indent}        __finallyIndex = 0;`);
          lines.push(`${indent}        __label = __finallyChain[0];`);
          lines.push(`${indent}        break;`);
          continue;
        }

        // Throw in try body (not in catch): let it go to catch handler normally
        // The outer try/catch in the state machine will route it to __catchLabel

        // Jump that leaves the try region (break/continue)
        if (instr.kind === InstructionKinds.Jump) {
          const target = instr.target;

          // If jumping to a finally block, this is normal flow through finally - not an abrupt completion
          // For NORMAL completion, we only run the single finally block and then continue normally
          // (Unlike abrupt completions which must unwind through ALL enclosing finally blocks)
          const targetFinallyInfo = finallyToTryInfo.get(target);
          if (targetFinallyInfo) {
            // This is a normal exit jumping to a finally block
            // For normal completion, we should ONLY run THIS finally block
            // The finally's EndFinally will then fall through to the try_exit block
            // which may continue execution (e.g., reach `return "outer"`)

            // Set up chain with ONLY this single finally block (not all enclosing ones)
            lines.push(`${indent}        __completion = { type: 'normal', value: undefined, target: null };`);
            lines.push(`${indent}        __finallyChain = ['${target}'];`);
            lines.push(`${indent}        __finallyIndex = 0;`);
            lines.push(`${indent}        __label = '${target}';`);
            lines.push(`${indent}        break;`);
            continue;
          }

          // Jump to try_exit block is normal control flow continuation, not a break
          // try_exit blocks are where execution continues after try-finally completes
          if (target.startsWith('try_exit_')) {
            lines.push(`${indent}        __label = '${target}'; break;`);
            continue;
          }

          // Check if this jump leaves ANY of the enclosing try regions (break/continue)
          const leavingChain = chain.filter(info =>
            !info.protectedBlocks.has(target) &&
            target !== info.catchTarget &&
            target !== info.finallyTarget
          );

          if (leavingChain.length > 0) {
            const chainLabels = leavingChain.map(info => `'${info.finallyTarget}'`).join(', ');
            // Determine if this is break or continue based on target (but not try_exit)
            const completionType = isLoopControlBlock(target) && target.includes('exit') ? 'break' : 'continue';
            lines.push(`${indent}        __completion = { type: '${completionType}', value: undefined, target: '${target}' };`);
            lines.push(`${indent}        __finallyChain = [${chainLabels}];`);
            lines.push(`${indent}        __finallyIndex = 0;`);
            lines.push(`${indent}        __label = __finallyChain[0];`);
            lines.push(`${indent}        break;`);
            continue;
          }
        }
      }

      // Handle throw in try body when there's a finally without a catch between here and the handler
      // This case: try { throw } finally { } - finally must run before propagation
      // BUT: If there's a catch handler more nested than the finally, let normal JS catch handle it
      if (instr.kind === InstructionKinds.Throw && chain.length > 0) {
        // Check ALL enclosing tries (not just finally chain) for catch handlers
        // The chain only contains tries with finally - there might be catch-only tries more nested
        const allEnclosingTries = tryInfos.filter(info => info.protectedBlocks.has(block.label));
        allEnclosingTries.sort((a, b) => b.index - a.index); // innermost first

        // Find the innermost try with a catch handler
        const innermostWithCatch = allEnclosingTries.find(info => info.catchTarget);

        // Find the innermost try with a finally handler (from chain)
        const innermostWithFinally = chain.length > 0 ? chain[0] : null;

        // If there's a catch that's more nested than (or same as) the finally, let JS handle it
        if (innermostWithCatch && innermostWithFinally) {
          if (innermostWithCatch.index >= innermostWithFinally.index) {
            // Catch is more nested or same level - let normal exception routing handle it
            // (fall through to normal emit)
          } else {
            // Finally is more nested - we must route through finally first
            // Build chain of finally blocks until we hit one with a catch
            const relevantChain = [];
            for (const info of chain) {
              if (info.finallyTarget) {
                relevantChain.push(info);
              }
              // Stop if this try has a catch - the exception will be caught there after finally
              if (info.catchTarget) break;
            }
            const chainLabels = relevantChain.map(info => `'${info.finallyTarget}'`).join(', ');
            lines.push(`${indent}        __completion = { type: 'throw', value: ${emitOperand(instr.value)}, target: null };`);
            lines.push(`${indent}        __finallyChain = [${chainLabels}];`);
            lines.push(`${indent}        __finallyIndex = 0;`);
            lines.push(`${indent}        __label = __finallyChain[0];`);
            lines.push(`${indent}        break;`);
            continue;
          }
        } else if (innermostWithFinally && !innermostWithCatch) {
          // Only finally, no catch anywhere - route through finally
          const relevantChain = [];
          for (const info of chain) {
            if (info.finallyTarget) {
              relevantChain.push(info);
            }
            if (info.catchTarget) break;
          }
          const chainLabels = relevantChain.map(info => `'${info.finallyTarget}'`).join(', ');
          lines.push(`${indent}        __completion = { type: 'throw', value: ${emitOperand(instr.value)}, target: null };`);
          lines.push(`${indent}        __finallyChain = [${chainLabels}];`);
          lines.push(`${indent}        __finallyIndex = 0;`);
          lines.push(`${indent}        __label = __finallyChain[0];`);
          lines.push(`${indent}        break;`);
          continue;
        }
        // Else: catch is innermost or only catch exists - let normal JS exception handling route it
      }

      // Inside a finally block, return/throw cause suppression
      if (isFinally) {
        if (instr.kind === InstructionKinds.Return) {
          // Return in finally suppresses pending completion
          const valueCode = instr.value ? emitOperand(instr.value) : 'undefined';
          lines.push(`${indent}        // Return in finally: suppresses pending completion`);
          lines.push(`${indent}        __completion = { type: 'return', value: ${valueCode}, target: null };`);
          lines.push(`${indent}        __finallyIndex++;`);
          lines.push(`${indent}        if (__finallyIndex < __finallyChain.length) {`);
          lines.push(`${indent}          __label = __finallyChain[__finallyIndex];`);
          lines.push(`${indent}          break;`);
          lines.push(`${indent}        }`);
          lines.push(`${indent}        return ${valueCode};`);
          continue;
        }

        if (instr.kind === InstructionKinds.Throw) {
          // Throw in finally suppresses pending completion
          lines.push(`${indent}        // Throw in finally: suppresses pending completion`);
          lines.push(`${indent}        throw ${emitOperand(instr.value)};`);
          continue;
        }
      }

      // Normal instruction emission
      const code = emitInstruction(instr);
      if (code) {
        lines.push(`${indent}        ${code}`);
      }
    }
  }

  lines.push(`${indent}    }`);
  lines.push(`${indent}  } catch (__ex) {`);

  // Exception handling: route to catch or finally, or propagate
  lines.push(`${indent}    // If exception occurs while in a finally chain, clear the chain state`);
  lines.push(`${indent}    // The new exception suppresses any pending completion`);
  lines.push(`${indent}    if (__finallyChain.length > 0 && __finallyIndex < __finallyChain.length) {`);
  lines.push(`${indent}      // Clear finally chain - we're no longer unwinding, we have a new exception`);
  lines.push(`${indent}      __finallyChain = [];`);
  lines.push(`${indent}      __finallyIndex = 0;`);
  lines.push(`${indent}      __completion = { type: 'normal', value: undefined, target: null };`);
  lines.push(`${indent}      // Fall through to normal exception routing - outer try blocks can still catch this`);
  lines.push(`${indent}    }`);

  lines.push(`${indent}    if (__inTry) {`);
  lines.push(`${indent}      if (__catchLabel) {`);
  lines.push(`${indent}        // Route to catch handler - store exception for catch block to read`);
  lines.push(`${indent}        __caughtException = __ex;`);
  lines.push(`${indent}        __label = __catchLabel;`);
  lines.push(`${indent}        continue __dispatch;`);
  lines.push(`${indent}      } else if (__finallyLabel) {`);
  lines.push(`${indent}        // No catch, but has finally - run finally then rethrow`);
  lines.push(`${indent}        __completion = { type: 'throw', value: __ex, target: null };`);
  lines.push(`${indent}        __finallyChain = [__finallyLabel];`);
  lines.push(`${indent}        __finallyIndex = 0;`);
  lines.push(`${indent}        __label = __finallyLabel;`);
  lines.push(`${indent}        continue __dispatch;`);
  lines.push(`${indent}      }`);
  lines.push(`${indent}    }`);
  lines.push(`${indent}    throw __ex;`);
  lines.push(`${indent}  }`);
  lines.push(`${indent}}`);

  if (func.async) {
    lines.push(`  });`); // Close __async_spawn
  }
  lines.push('}');

  lines.push(`export { ${func.name} };`);

  return lines.join('\n');
}

/**
 * Emit an instruction
 */
function emitInstruction(instr) {
  switch (instr.kind) {
    case InstructionKinds.Assign:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.value)};`;

    case InstructionKinds.Copy: {
      // Check if this is a select case value binding (special marker from IR builder)
      if (instr._selectCaseValueBinding) {
        const caseIndex = instr._selectCaseIndex;
        const valueReg = `__selectCaseValue_${caseIndex}`;
        return `${emitOperand(instr.dest)} = ${valueReg};`;
      }
      // Regular copy
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.source)};`;
    }

    case InstructionKinds.BinaryOp:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.left)} ${instr.op} ${emitOperand(instr.right)};`;

    case InstructionKinds.UnaryOp:
      return `${emitOperand(instr.dest)} = ${instr.op}${emitOperand(instr.operand)};`;

    case InstructionKinds.Call:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.callee)}(${instr.args.map(emitOperand).join(', ')});`;

    case InstructionKinds.MethodCall:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.object)}.${instr.property}(${instr.args.map(emitOperand).join(', ')});`;

    case InstructionKinds.Return:
      return instr.value ? `return ${emitOperand(instr.value)};` : 'return;';

    case InstructionKinds.Jump:
      return `__label = '${instr.target}'; break;`;

    case InstructionKinds.CondJump:
      return `if (${emitOperand(instr.condition)}) { __label = '${instr.trueTarget}'; } else { __label = '${instr.falseTarget}'; } break;`;

    case InstructionKinds.CreateArray:
      return `${emitOperand(instr.dest)} = [${instr.elements.map(emitOperand).join(', ')}];`;

    case InstructionKinds.CreateObject: {
      const props = instr.properties.map(p => `${p.key}: ${emitOperand(p.value)}`).join(', ');
      return `${emitOperand(instr.dest)} = {${props}};`;
    }

    case InstructionKinds.GetProperty:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.object)}.${instr.property};`;

    case InstructionKinds.SetProperty:
      return `${emitOperand(instr.object)}.${instr.property} = ${emitOperand(instr.value)};`;

    case InstructionKinds.GetElement:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.object)}[${emitOperand(instr.index)}];`;

    case InstructionKinds.SetElement:
      return `${emitOperand(instr.object)}[${emitOperand(instr.index)}] = ${emitOperand(instr.value)};`;

    case InstructionKinds.Spawn: {
      // Use closure-capturing semantics to match runtime spawn(fn) signature
      // The IR Spawn instruction stores callee (function) and args separately
      // We always wrap in arrow function to capture arguments at spawn time
      const args = instr.args.map(emitOperand).join(', ');
      const callExpr = args.length > 0
        ? `${emitOperand(instr.callee)}(${args})`
        : `${emitOperand(instr.callee)}()`;
      return `${emitOperand(instr.dest)} = spawn(() => ${callExpr});`;
    }

    case InstructionKinds.Select: {
      const cases = instr.cases.map((c, idx) => {
        if (c.op === 'recv') {
          return `selectCase({ recv: ${emitOperand(c.channel)} })`;
        } else {
          return `selectCase({ send: ${emitOperand(c.channel)}, value: ${emitOperand(c.value)} })`;
        }
      }).join(', ');

      // Check if any cases are await cases that need unwrapping
      const hasAwaitCase = instr.cases.some(c => c.isAwaitCase);

      // Check if this select has case bodies (control flow dispatch)
      if (instr.caseLabels && instr.caseLabels.length > 0) {
        // Select with case bodies - emit select call, extract values, dispatch to case label
        const selectResult = `__select_result_${emitOperand(instr.dest)}`;
        let code = `var ${selectResult} = await select([${cases}]);`;

        // Store extracted values in case-specific temp registers
        // These will be referenced by Copy instructions with _selectCaseValueBinding marker
        code += ` var __selectCaseIndex = ${selectResult}.caseIndex;`;

        for (let i = 0; i < instr.cases.length; i++) {
          const c = instr.cases[i];
          const valueReg = `__selectCaseValue_${i}`;

          if (c.isAwaitCase) {
            // Await case: unwrap AsyncResult from PulsePromise result channel
            // The channel recv returns the AsyncResult directly in value field
            code += ` var ${valueReg} = (${selectResult}.caseIndex === ${i}) ? ${selectResult}.value.unwrap() : undefined;`;
          } else if (c.op === 'recv') {
            // Regular recv case: extract value directly
            code += ` var ${valueReg} = (${selectResult}.caseIndex === ${i}) ? ${selectResult}.value : undefined;`;
          } else {
            // Send case: no value
            code += ` var ${valueReg} = undefined;`;
          }
        }

        // Emit dispatch to case label based on caseIndex
        const dispatchCases = instr.caseLabels.map((label, i) => {
          return `if (__selectCaseIndex === ${i}) { __label = '${label}'; }`;
        }).join(' else ');

        code += ` ${dispatchCases}`;
        code += ` break;`;
        return code;
      } else if (hasAwaitCase) {
        // Simple select with await cases (no case bodies) - unwrap and assign to dest
        const selectResult = `__select_result_${emitOperand(instr.dest)}`;
        let code = `const ${selectResult} = await select([${cases}]);`;

        // Generate unwrapping for each case
        code += ` if (${selectResult}.caseIndex !== undefined) {`;
        for (let i = 0; i < instr.cases.length; i++) {
          const c = instr.cases[i];
          if (c.isAwaitCase) {
            // Await case: unwrap AsyncResult
            code += ` if (${selectResult}.caseIndex === ${i}) {`;
            code += ` ${emitOperand(instr.dest)} = ${selectResult}.value[0].unwrap();`;
            code += ` }`;
          } else if (c.op === 'recv') {
            // Regular recv case
            code += ` if (${selectResult}.caseIndex === ${i}) {`;
            code += ` ${emitOperand(instr.dest)} = ${selectResult}.value;`;
            code += ` }`;
          } else {
            // Send case (no value)
            code += ` if (${selectResult}.caseIndex === ${i}) {`;
            code += ` ${emitOperand(instr.dest)} = undefined;`;
            code += ` }`;
          }
        }
        code += ` }`;
        return code;
      } else {
        // No await cases - simple select
        return `${emitOperand(instr.dest)} = await select([${cases}]);`;
      }
    }

    case InstructionKinds.Await: {
      // Generate unique channel name for this await site
      const channelName = `__resumeCh_${emitOperand(instr.dest)}`;
      // Emit deterministic await using __await_deterministic with local channel
      return `{ const ${channelName} = channel(); ${emitOperand(instr.dest)} = await __await_deterministic(${emitOperand(instr.promise)}, ${channelName}); }`;
    }

    case InstructionKinds.GetIterator:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.iterable)}[Symbol.iterator]();`;

    case InstructionKinds.IteratorNext:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.iterator)}.next();`;

    case InstructionKinds.IteratorDone:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.iteratorResult)}.done;`;

    case InstructionKinds.IteratorValue:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.iteratorResult)}.value;`;

    case InstructionKinds.Throw:
      return `throw ${emitOperand(instr.value)};`;

    case InstructionKinds.BeginTry:
    case InstructionKinds.EndTry:
    case InstructionKinds.BeginCatch:
    case InstructionKinds.EndCatch:
    case InstructionKinds.BeginFinally:
    case InstructionKinds.EndFinally:
      return null;

    case InstructionKinds.Switch: {
      const cases = instr.cases.map(c => {
        return `if (${emitOperand(instr.discriminant)} === ${emitOperand(c.test)}) { __label = '${c.target}'; }`;
      }).join(' else ');
      return `${cases} else { __label = '${instr.defaultTarget}'; } break;`;
    }

    case InstructionKinds.ChannelSend:
      return `await ${emitOperand(instr.channel)}.send(${emitOperand(instr.value)});`;

    case InstructionKinds.ChannelRecv:
      return `${emitOperand(instr.dest)} = await ${emitOperand(instr.channel)}.recv();`;

    default:
      throw new Error(`Unknown instruction kind: ${instr.kind}`);
  }
}

/**
 * Emit an operand
 */
function emitOperand(operand) {
  switch (operand.kind) {
    case OperandKinds.Register:
      return `r${operand.id}`;

    case OperandKinds.Constant:
      if (typeof operand.value === 'string') {
        return JSON.stringify(operand.value);
      } else if (operand.value === null) {
        return 'null';
      } else if (typeof operand.value === 'boolean') {
        return operand.value ? 'true' : 'false';
      } else {
        return String(operand.value);
      }

    case OperandKinds.Global:
      return operand.name;

    default:
      throw new Error(`Unknown operand kind: ${operand.kind}`);
  }
}
