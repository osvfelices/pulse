/**
 * IR Optimizer
 *
 * Conservative optimizations on IR modules without changing semantics.
 * All optimizations are safe, deterministic, and maintain structural validity.
 */

import { InstructionKinds, OperandKinds, isRegister, isConstant } from './instructions.js';
import { validateIRModule } from './validator.js';

/**
 * Check if an instruction has side effects and must be preserved
 * @param {Object} instruction
 * @returns {boolean}
 */
function hasSideEffects(instruction) {
  return instruction.kind === InstructionKinds.Call ||
         instruction.kind === InstructionKinds.MethodCall ||
         instruction.kind === InstructionKinds.Spawn ||
         instruction.kind === InstructionKinds.Throw ||
         instruction.kind === InstructionKinds.Select ||
         instruction.kind === InstructionKinds.Await ||
         instruction.kind === InstructionKinds.SetProperty ||
         instruction.kind === InstructionKinds.SetElement ||
         instruction.kind === InstructionKinds.ChannelSend ||
         instruction.kind === InstructionKinds.ChannelRecv ||
         instruction.kind === InstructionKinds.Return ||
         instruction.kind === InstructionKinds.Jump ||
         instruction.kind === InstructionKinds.CondJump ||
         instruction.kind === InstructionKinds.Switch ||
         instruction.kind === InstructionKinds.BeginTry ||
         instruction.kind === InstructionKinds.EndTry ||
         instruction.kind === InstructionKinds.BeginCatch ||
         instruction.kind === InstructionKinds.EndCatch ||
         instruction.kind === InstructionKinds.BeginFinally ||
         instruction.kind === InstructionKinds.EndFinally;
}

/**
 * Check if an instruction is a terminator
 * @param {Object} instruction
 * @returns {boolean}
 */
function isTerminator(instruction) {
  return instruction.kind === InstructionKinds.Return ||
         instruction.kind === InstructionKinds.Jump ||
         instruction.kind === InstructionKinds.CondJump ||
         instruction.kind === InstructionKinds.Switch ||
         instruction.kind === InstructionKinds.Throw;
}

/**
 * Collect all registers used by an instruction
 * @param {Object} instruction
 * @returns {Set<number>}
 */
function collectUsedRegisters(instruction) {
  const used = new Set();

  function addIfRegister(operand) {
    if (operand && isRegister(operand)) {
      used.add(operand.id);
    }
  }

  // Common fields
  addIfRegister(instruction.value);
  addIfRegister(instruction.left);
  addIfRegister(instruction.right);
  addIfRegister(instruction.operand);
  addIfRegister(instruction.object);
  addIfRegister(instruction.callee);
  addIfRegister(instruction.condition);
  addIfRegister(instruction.iterable);
  addIfRegister(instruction.iterator);
  addIfRegister(instruction.iteratorResult);
  addIfRegister(instruction.promise);
  addIfRegister(instruction.channel);
  addIfRegister(instruction.discriminant);
  addIfRegister(instruction.property);
  addIfRegister(instruction.exceptionReg);
  addIfRegister(instruction.index); // For GetElement/SetElement

  // Arrays
  if (instruction.args) {
    for (const arg of instruction.args) {
      addIfRegister(arg);
    }
  }
  if (instruction.elements) {
    for (const elem of instruction.elements) {
      addIfRegister(elem);
    }
  }
  if (instruction.properties) {
    for (const prop of instruction.properties) {
      addIfRegister(prop.value);
    }
  }
  if (instruction.cases) {
    for (const c of instruction.cases) {
      addIfRegister(c.channel);
      addIfRegister(c.value);
      addIfRegister(c.test);
    }
  }

  return used;
}

/**
 * Dead Code Elimination
 * Remove instructions that produce unused registers
 * @param {Object} func - IR function
 * @returns {boolean} - True if changes were made
 */
function eliminateDeadCode(func) {
  let changed = false;

  // Collect all used registers across all blocks
  const usedRegisters = new Set();
  for (const block of func.blocks) {
    for (const instr of block.instructions) {
      const used = collectUsedRegisters(instr);
      for (const regId of used) {
        usedRegisters.add(regId);
      }
    }
  }

  // Remove instructions with unused dest registers
  for (const block of func.blocks) {
    const newInstructions = [];
    for (const instr of block.instructions) {
      // Always keep instructions with side effects
      if (hasSideEffects(instr)) {
        newInstructions.push(instr);
        continue;
      }

      // Keep if dest register is used
      if (instr.dest && isRegister(instr.dest)) {
        if (usedRegisters.has(instr.dest.id)) {
          newInstructions.push(instr);
        } else {
          changed = true;
        }
      } else {
        // No dest register, keep it
        newInstructions.push(instr);
      }
    }
    block.instructions = newInstructions;
  }

  return changed;
}

/**
 * Build reachability graph from entry block
 * @param {Object} func - IR function
 * @returns {Set<string>} - Set of reachable block labels
 */
function findReachableBlocks(func) {
  const reachable = new Set();
  const queue = [];

  if (func.blocks.length === 0) {
    return reachable;
  }

  // Start from entry block
  queue.push(func.blocks[0].label);
  reachable.add(func.blocks[0].label);

  while (queue.length > 0) {
    const label = queue.shift();
    const blockIndex = func.blocks.findIndex(b => b.label === label);
    if (blockIndex === -1) continue;

    const block = func.blocks[blockIndex];
    const targets = [];

    // Find terminator and add successors
    const lastInstr = block.instructions.length > 0 ? block.instructions[block.instructions.length - 1] : null;

    if (lastInstr && isTerminator(lastInstr)) {
      if (lastInstr.kind === InstructionKinds.Jump) {
        targets.push(lastInstr.target);
      } else if (lastInstr.kind === InstructionKinds.CondJump) {
        targets.push(lastInstr.trueTarget);
        targets.push(lastInstr.falseTarget);
      } else if (lastInstr.kind === InstructionKinds.Switch) {
        for (const c of lastInstr.cases) {
          targets.push(c.target);
        }
        targets.push(lastInstr.defaultTarget);
      }
      // Return and Throw don't have successors
    } else {
      // No terminator means fall-through to next block
      if (blockIndex + 1 < func.blocks.length) {
        targets.push(func.blocks[blockIndex + 1].label);
      }
    }

    // Add BeginTry targets
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.BeginTry) {
        if (instr.catchTarget) targets.push(instr.catchTarget);
        if (instr.finallyTarget) targets.push(instr.finallyTarget);
      }
    }

    for (const target of targets) {
      if (!reachable.has(target)) {
        reachable.add(target);
        queue.push(target);
      }
    }
  }

  return reachable;
}

/**
 * Remove unreachable blocks
 * @param {Object} func - IR function
 * @returns {boolean} - True if changes were made
 */
function removeUnreachableBlocks(func) {
  const reachable = findReachableBlocks(func);
  const originalCount = func.blocks.length;
  func.blocks = func.blocks.filter(b => reachable.has(b.label));
  return func.blocks.length < originalCount;
}

/**
 * Evaluate constant binary operation
 * @param {string} op
 * @param {*} left
 * @param {*} right
 * @returns {*}
 */
function evalConstantBinaryOp(op, left, right) {
  switch (op) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return left / right;
    case '%': return left % right;
    case '==': return left === right;
    case '!=': return left !== right;
    case '<': return left < right;
    case '<=': return left <= right;
    case '>': return left > right;
    case '>=': return left >= right;
    case '&&': return left && right;
    case '||': return left || right;
    default: return null;
  }
}

/**
 * Constant folding
 * Evaluate constant expressions at compile time
 * @param {Object} func - IR function
 * @returns {boolean} - True if changes were made
 */
function foldConstants(func) {
  let changed = false;

  for (const block of func.blocks) {
    for (let i = 0; i < block.instructions.length; i++) {
      const instr = block.instructions[i];

      if (instr.kind === InstructionKinds.BinaryOp) {
        if (isConstant(instr.left) && isConstant(instr.right)) {
          const result = evalConstantBinaryOp(instr.op, instr.left.value, instr.right.value);
          if (result !== null) {
            block.instructions[i] = {
              kind: InstructionKinds.Assign,
              dest: instr.dest,
              value: { kind: OperandKinds.Constant, value: result },
            };
            changed = true;
          }
        }
      } else if (instr.kind === InstructionKinds.UnaryOp) {
        if (isConstant(instr.operand)) {
          let result = null;
          switch (instr.op) {
            case '-': result = -instr.operand.value; break;
            case '!': result = !instr.operand.value; break;
            case '+': result = +instr.operand.value; break;
          }
          if (result !== null) {
            block.instructions[i] = {
              kind: InstructionKinds.Assign,
              dest: instr.dest,
              value: { kind: OperandKinds.Constant, value: result },
            };
            changed = true;
          }
        }
      }
    }
  }

  return changed;
}

/**
 * Constant propagation
 * Replace register uses with their constant values
 * @param {Object} func - IR function
 * @returns {boolean} - True if changes were made
 */
function propagateConstants(func) {
  let changed = false;

  for (const block of func.blocks) {
    // Track constant assignments within this block
    const constants = new Map();

    for (let i = 0; i < block.instructions.length; i++) {
      const instr = block.instructions[i];

      // IMPORTANT: Check if dest is being reassigned BEFORE propagation
      // This is crucial for correctness - we must invalidate based on original value
      const originalValue = instr.value;
      const originalValueIsConstant = originalValue && isConstant(originalValue);

      // Replace register operands with constants
      function replaceOperand(operand) {
        if (isRegister(operand) && constants.has(operand.id)) {
          changed = true;
          return constants.get(operand.id);
        }
        return operand;
      }

      // For Assign instructions, only propagate the value if it's NOT the dest (to avoid self-reference issues)
      // and only if the original was NOT a constant (constants don't need propagation)
      if (instr.kind === InstructionKinds.Assign) {
        // Propagate value unless it's a constant already
        if (!originalValueIsConstant) {
          instr.value = replaceOperand(instr.value);
        }
      } else {
        // For other instructions, propagate all operands
        if (instr.value) instr.value = replaceOperand(instr.value);
      }

      if (instr.left) instr.left = replaceOperand(instr.left);
      if (instr.right) instr.right = replaceOperand(instr.right);
      if (instr.operand) instr.operand = replaceOperand(instr.operand);
      if (instr.condition) instr.condition = replaceOperand(instr.condition);
      if (instr.discriminant) instr.discriminant = replaceOperand(instr.discriminant);

      if (instr.args) {
        instr.args = instr.args.map(replaceOperand);
      }
      if (instr.elements) {
        instr.elements = instr.elements.map(replaceOperand);
      }

      // Invalidate constants if register is reassigned
      // CRITICAL: Use originalValueIsConstant, not the propagated value!
      if (instr.dest && isRegister(instr.dest)) {
        if (instr.kind !== InstructionKinds.Assign || !originalValueIsConstant) {
          constants.delete(instr.dest.id);
        }
      }

      // Track constant assignments AFTER invalidation check
      if (instr.kind === InstructionKinds.Assign && isRegister(instr.dest) && isConstant(instr.value)) {
        constants.set(instr.dest.id, instr.value);
      }
    }
  }

  return changed;
}

/**
 * Peephole optimizations
 * @param {Object} func - IR function
 * @returns {boolean} - True if changes were made
 */
function peepholeOptimizations(func) {
  let changed = false;

  // Jump-to-jump elimination
  for (const block of func.blocks) {
    const lastInstr = block.instructions[block.instructions.length - 1];
    if (lastInstr && lastInstr.kind === InstructionKinds.Jump) {
      const targetBlock = func.blocks.find(b => b.label === lastInstr.target);
      if (targetBlock && targetBlock.instructions.length > 0) {
        const targetFirst = targetBlock.instructions[0];
        if (targetFirst.kind === InstructionKinds.Jump) {
          lastInstr.target = targetFirst.target;
          changed = true;
        }
      }
    }
  }

  // CondJump with same targets
  for (const block of func.blocks) {
    const lastInstr = block.instructions[block.instructions.length - 1];
    if (lastInstr && lastInstr.kind === InstructionKinds.CondJump) {
      if (lastInstr.trueTarget === lastInstr.falseTarget) {
        block.instructions[block.instructions.length - 1] = {
          kind: InstructionKinds.Jump,
          target: lastInstr.trueTarget,
        };
        changed = true;
      }
    }
  }

  // Redundant jumps (jump to next block)
  // NOTE: This is conservative - only remove if absolutely safe
  // Disabled for now to preserve explicit control flow
  /*
  for (let i = 0; i < func.blocks.length - 1; i++) {
    const block = func.blocks[i];
    const nextBlock = func.blocks[i + 1];
    const lastInstr = block.instructions[block.instructions.length - 1];

    if (lastInstr && lastInstr.kind === InstructionKinds.Jump) {
      if (lastInstr.target === nextBlock.label) {
        block.instructions.pop();
        changed = true;
      }
    }
  }
  */

  return changed;
}

/**
 * Optimize an IR module
 * @param {Object} irModule - IR module to optimize
 * @param {Object} options - Optimization options
 * @returns {Object} - Optimized IR module
 */
export function optimizeIR(irModule, options = {}) {
  const {
    deadCodeElimination = true,
    removeUnreachable = true,
    constantFolding = true,
    constantPropagation = true,
    peephole = true,
    maxPasses = 10,
  } = options;

  // Clone module to avoid mutating input
  const optimized = JSON.parse(JSON.stringify(irModule));

  for (const func of optimized.functions) {
    let pass = 0;
    let changed = true;

    while (changed && pass < maxPasses) {
      changed = false;
      pass++;

      if (deadCodeElimination) {
        changed = eliminateDeadCode(func) || changed;
      }

      if (constantFolding) {
        changed = foldConstants(func) || changed;
      }

      if (constantPropagation) {
        changed = propagateConstants(func) || changed;
      }

      if (peephole) {
        changed = peepholeOptimizations(func) || changed;
      }

      if (removeUnreachable) {
        changed = removeUnreachableBlocks(func) || changed;
      }
    }
  }

  return optimized;
}
