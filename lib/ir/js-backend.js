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
 * Generate JavaScript code from an IR module
 * @param {Object} irModule - IR module to compile
 * @returns {string} - JavaScript code
 */
export function emitJS(irModule) {
  const lines = [];

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
    lines.push('__init__();');
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
  const isAsync = func.async ? 'async ' : '';

  lines.push(`${isAsync}function ${func.name}(${params}) {`);

  const paramRegIds = new Set(func.params.map(p => p.id));
  const regsToDecl = [];
  for (let i = 0; i < func.registerCount; i++) {
    if (!paramRegIds.has(i)) {
      regsToDecl.push(`r${i}`);
    }
  }
  if (regsToDecl.length > 0) {
    lines.push(`  let ${regsToDecl.join(', ')};`);
  }

  const entryLabel = func.blocks[0]?.label || 'entry';
  lines.push(`  let __label = '${entryLabel}';`);
  lines.push(`  while (true) {`);
  lines.push(`    switch (__label) {`);

  for (const block of func.blocks) {
    lines.push(`      case '${block.label}':`);
    for (const instr of block.instructions) {
      const code = emitInstruction(instr);
      if (code) {
        lines.push(`        ${code}`);
      }
    }
  }

  lines.push(`    }`);
  lines.push(`  }`);
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
  const isAsync = func.async ? 'async ' : '';

  lines.push(`${isAsync}function ${func.name}(${params}) {`);

  // Declare registers
  const paramRegIds = new Set(func.params.map(p => p.id));
  const regsToDecl = [];
  for (let i = 0; i < func.registerCount; i++) {
    if (!paramRegIds.has(i)) {
      regsToDecl.push(`r${i}`);
    }
  }
  if (regsToDecl.length > 0) {
    lines.push(`  let ${regsToDecl.join(', ')};`);
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
  lines.push(`  let __label = '${entryLabel}';`);

  // Completion record: tracks pending abrupt completion during finally unwinding
  lines.push(`  let __completion = { type: 'normal', value: undefined, target: null };`);

  // Finally chain: array of finally labels to unwind through
  lines.push(`  let __finallyChain = [];`);
  lines.push(`  let __finallyIndex = 0;`);

  // Exception caught during finally execution (for suppression)
  lines.push(`  let __finallyException = null;`);

  // Exception to be passed to catch handler (avoids eval)
  lines.push(`  let __caughtException = null;`);

  lines.push(`  __dispatch: while (true) {`);

  // Determine current try context for exception routing
  lines.push(`    let __inTry = false;`);
  lines.push(`    let __catchLabel = null;`);
  lines.push(`    let __finallyLabel = null;`);

  // Generate try region checks - order matters, more nested should win
  // Process in reverse order so more nested (higher index) checks come last and override
  const sortedTryInfos = [...tryInfos].sort((a, b) => a.index - b.index);
  for (const info of sortedTryInfos) {
    if (info.protectedBlocks.size > 0) {
      const blockList = Array.from(info.protectedBlocks).map(b => `'${b}'`).join(', ');
      const catchPart = info.catchTarget ? `__catchLabel = '${info.catchTarget}';` : '';
      const finallyPart = info.finallyTarget ? `__finallyLabel = '${info.finallyTarget}';` : '';
      lines.push(`    if ([${blockList}].includes(__label)) { __inTry = true; ${catchPart} ${finallyPart} }`);
    }
  }

  lines.push(`    try {`);
  lines.push(`      __finallyException = null;`);
  lines.push(`      switch (__label) {`);

  // Emit all blocks as switch cases
  for (const block of func.blocks) {
    lines.push(`        case '${block.label}':`);

    const isFinally = finallyBlocks.has(block.label);
    const isCatch = catchBlocks.has(block.label);

    // Get the finally chain for this block
    const chain = blockToChain.get(block.label) || [];

    // Get the innermost finally info for this block
    const innermostFinally = chain.length > 0 ? chain[0] : null;

    for (const instr of block.instructions) {
      // Skip structural markers (except BeginCatch which needs to assign the exception)
      if (instr.kind === InstructionKinds.BeginTry ||
          instr.kind === InstructionKinds.EndTry ||
          instr.kind === InstructionKinds.EndCatch ||
          instr.kind === InstructionKinds.BeginFinally) {
        continue;
      }

      // BeginCatch: assign the caught exception to the register
      if (instr.kind === InstructionKinds.BeginCatch) {
        if (instr.exceptionReg) {
          lines.push(`          r${instr.exceptionReg.id} = __caughtException;`);
        }
        continue;
      }

      // EndFinally: decide whether to continue unwinding or execute completion
      if (instr.kind === InstructionKinds.EndFinally) {
        lines.push(`          // EndFinally: check for suppression and continue unwinding`);
        lines.push(`          if (__finallyException !== null) {`);
        lines.push(`            // Exception in finally suppresses pending completion`);
        lines.push(`            throw __finallyException;`);
        lines.push(`          }`);
        lines.push(`          __finallyIndex++;`);
        lines.push(`          if (__finallyIndex < __finallyChain.length) {`);
        lines.push(`            // More finally blocks to unwind through`);
        lines.push(`            __label = __finallyChain[__finallyIndex];`);
        lines.push(`            break;`);
        lines.push(`          }`);
        lines.push(`          // Unwinding complete, execute pending completion`);
        lines.push(`          if (__completion.type === 'return') { return __completion.value; }`);
        lines.push(`          if (__completion.type === 'throw') { throw __completion.value; }`);
        lines.push(`          if (__completion.type === 'break' || __completion.type === 'continue') {`);
        lines.push(`            __label = __completion.target;`);
        lines.push(`            __completion = { type: 'normal', value: undefined, target: null };`);
        lines.push(`            break;`);
        lines.push(`          }`);
        lines.push(`          // Normal completion - fall through`);
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
          lines.push(`          __completion = { type: 'return', value: ${valueCode}, target: null };`);
          lines.push(`          __finallyChain = [${chainLabels}];`);
          lines.push(`          __finallyIndex = 0;`);
          lines.push(`          __label = __finallyChain[0];`);
          lines.push(`          break;`);
          continue;
        }

        // Throw in catch: route through finally chain
        if (instr.kind === InstructionKinds.Throw && inCatchBlock) {
          const chainLabels = chain.map(info => `'${info.finallyTarget}'`).join(', ');
          lines.push(`          __completion = { type: 'throw', value: ${emitOperand(instr.value)}, target: null };`);
          lines.push(`          __finallyChain = [${chainLabels}];`);
          lines.push(`          __finallyIndex = 0;`);
          lines.push(`          __label = __finallyChain[0];`);
          lines.push(`          break;`);
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
            lines.push(`          __completion = { type: 'normal', value: undefined, target: null };`);
            lines.push(`          __finallyChain = ['${target}'];`);
            lines.push(`          __finallyIndex = 0;`);
            lines.push(`          __label = '${target}';`);
            lines.push(`          break;`);
            continue;
          }

          // Jump to try_exit block is normal control flow continuation, not a break
          // try_exit blocks are where execution continues after try-finally completes
          if (target.startsWith('try_exit_')) {
            lines.push(`          __label = '${target}'; break;`);
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
            lines.push(`          __completion = { type: '${completionType}', value: undefined, target: '${target}' };`);
            lines.push(`          __finallyChain = [${chainLabels}];`);
            lines.push(`          __finallyIndex = 0;`);
            lines.push(`          __label = __finallyChain[0];`);
            lines.push(`          break;`);
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
            lines.push(`          __completion = { type: 'throw', value: ${emitOperand(instr.value)}, target: null };`);
            lines.push(`          __finallyChain = [${chainLabels}];`);
            lines.push(`          __finallyIndex = 0;`);
            lines.push(`          __label = __finallyChain[0];`);
            lines.push(`          break;`);
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
          lines.push(`          __completion = { type: 'throw', value: ${emitOperand(instr.value)}, target: null };`);
          lines.push(`          __finallyChain = [${chainLabels}];`);
          lines.push(`          __finallyIndex = 0;`);
          lines.push(`          __label = __finallyChain[0];`);
          lines.push(`          break;`);
          continue;
        }
        // Else: catch is innermost or only catch exists - let normal JS exception handling route it
      }

      // Inside a finally block, return/throw cause suppression
      if (isFinally) {
        if (instr.kind === InstructionKinds.Return) {
          // Return in finally suppresses pending completion
          const valueCode = instr.value ? emitOperand(instr.value) : 'undefined';
          lines.push(`          // Return in finally: suppresses pending completion`);
          lines.push(`          __completion = { type: 'return', value: ${valueCode}, target: null };`);
          lines.push(`          __finallyIndex++;`);
          lines.push(`          if (__finallyIndex < __finallyChain.length) {`);
          lines.push(`            __label = __finallyChain[__finallyIndex];`);
          lines.push(`            break;`);
          lines.push(`          }`);
          lines.push(`          return ${valueCode};`);
          continue;
        }

        if (instr.kind === InstructionKinds.Throw) {
          // Throw in finally suppresses pending completion
          lines.push(`          // Throw in finally: suppresses pending completion`);
          lines.push(`          throw ${emitOperand(instr.value)};`);
          continue;
        }
      }

      // Normal instruction emission
      const code = emitInstruction(instr);
      if (code) {
        lines.push(`          ${code}`);
      }
    }
  }

  lines.push(`      }`);
  lines.push(`    } catch (__ex) {`);

  // Exception handling: route to catch or finally, or propagate
  lines.push(`      // If exception occurs while in a finally chain, clear the chain state`);
  lines.push(`      // The new exception suppresses any pending completion`);
  lines.push(`      if (__finallyChain.length > 0 && __finallyIndex < __finallyChain.length) {`);
  lines.push(`        // Clear finally chain - we're no longer unwinding, we have a new exception`);
  lines.push(`        __finallyChain = [];`);
  lines.push(`        __finallyIndex = 0;`);
  lines.push(`        __completion = { type: 'normal', value: undefined, target: null };`);
  lines.push(`        // Fall through to normal exception routing - outer try blocks can still catch this`);
  lines.push(`      }`);

  lines.push(`      if (__inTry) {`);
  lines.push(`        if (__catchLabel) {`);
  lines.push(`          // Route to catch handler - store exception for catch block to read`);
  lines.push(`          __caughtException = __ex;`);
  lines.push(`          __label = __catchLabel;`);
  lines.push(`          continue __dispatch;`);
  lines.push(`        } else if (__finallyLabel) {`);
  lines.push(`          // No catch, but has finally - run finally then rethrow`);
  lines.push(`          __completion = { type: 'throw', value: __ex, target: null };`);
  lines.push(`          __finallyChain = [__finallyLabel];`);
  lines.push(`          __finallyIndex = 0;`);
  lines.push(`          __label = __finallyLabel;`);
  lines.push(`          continue __dispatch;`);
  lines.push(`        }`);
  lines.push(`      }`);
  lines.push(`      throw __ex;`);
  lines.push(`    }`);
  lines.push(`  }`);
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

    case InstructionKinds.Spawn:
      return `${emitOperand(instr.dest)} = spawn(${emitOperand(instr.callee)}, [${instr.args.map(emitOperand).join(', ')}]);`;

    case InstructionKinds.Select: {
      const cases = instr.cases.map(c => {
        if (c.op === 'recv') {
          return `selectCase({ recv: ${emitOperand(c.channel)} })`;
        } else {
          return `selectCase({ send: ${emitOperand(c.channel)}, value: ${emitOperand(c.value)} })`;
        }
      }).join(', ');
      return `${emitOperand(instr.dest)} = await select([${cases}]);`;
    }

    case InstructionKinds.Await:
      return `${emitOperand(instr.dest)} = await ${emitOperand(instr.promise)};`;

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
