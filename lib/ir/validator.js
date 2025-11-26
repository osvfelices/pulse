/**
 * IR Validator
 *
 * Validates IR module structure and catches common errors:
 * - Register operands within valid range
 * - Jump targets exist
 * - Functions have at least one block
 * - Instructions are valid
 * - Blocks have terminators
 */

import { isInstruction, isRegister, InstructionKinds } from './instructions.js';

export class IRValidationError extends Error {
  constructor(message, functionName = null, blockLabel = null, instructionIndex = null) {
    super(message);
    this.name = 'IRValidationError';
    this.functionName = functionName;
    this.blockLabel = blockLabel;
    this.instructionIndex = instructionIndex;
  }

  toString() {
    let location = '';
    if (this.functionName) {
      location += `function ${this.functionName}`;
    }
    if (this.blockLabel) {
      location += location ? `, block ${this.blockLabel}` : `block ${this.blockLabel}`;
    }
    if (this.instructionIndex !== null) {
      location += `, instruction ${this.instructionIndex}`;
    }
    return location ? `${this.message} (${location})` : this.message;
  }
}

/**
 * Check if an instruction is a terminator
 * @param {Object} instruction
 * @returns {boolean}
 */
function isTerminator(instruction) {
  return instruction.kind === InstructionKinds.Return ||
         instruction.kind === InstructionKinds.Jump ||
         instruction.kind === InstructionKinds.CondJump;
}

/**
 * Validate a register operand
 * @param {Object} operand
 * @param {number} registerCount
 * @param {string} functionName
 * @param {string} blockLabel
 * @param {number} instructionIndex
 * @returns {IRValidationError|null}
 */
function validateRegister(operand, registerCount, functionName, blockLabel, instructionIndex) {
  if (!isRegister(operand)) {
    return null;
  }

  if (typeof operand.id !== 'number') {
    return new IRValidationError(
      `Register has non-numeric id: ${JSON.stringify(operand)}`,
      functionName,
      blockLabel,
      instructionIndex
    );
  }

  if (operand.id < 0 || operand.id >= registerCount) {
    return new IRValidationError(
      `Register r${operand.id} out of range [0, ${registerCount})`,
      functionName,
      blockLabel,
      instructionIndex
    );
  }

  return null;
}

/**
 * Collect all register operands from an instruction
 * @param {Object} instruction
 * @returns {Object[]}
 */
function collectRegisterOperands(instruction) {
  const registers = [];

  // Collect from common fields
  if (instruction.dest && isRegister(instruction.dest)) {
    registers.push(instruction.dest);
  }
  if (instruction.value && isRegister(instruction.value)) {
    registers.push(instruction.value);
  }
  if (instruction.left && isRegister(instruction.left)) {
    registers.push(instruction.left);
  }
  if (instruction.right && isRegister(instruction.right)) {
    registers.push(instruction.right);
  }
  if (instruction.object && isRegister(instruction.object)) {
    registers.push(instruction.object);
  }
  if (instruction.callee && isRegister(instruction.callee)) {
    registers.push(instruction.callee);
  }
  if (instruction.condition && isRegister(instruction.condition)) {
    registers.push(instruction.condition);
  }

  // Collect from arrays
  if (instruction.args && Array.isArray(instruction.args)) {
    for (const arg of instruction.args) {
      if (isRegister(arg)) {
        registers.push(arg);
      }
    }
  }
  if (instruction.elements && Array.isArray(instruction.elements)) {
    for (const elem of instruction.elements) {
      if (isRegister(elem)) {
        registers.push(elem);
      }
    }
  }
  if (instruction.properties && Array.isArray(instruction.properties)) {
    for (const prop of instruction.properties) {
      if (prop.value && isRegister(prop.value)) {
        registers.push(prop.value);
      }
    }
  }

  return registers;
}

/**
 * Validate an IR module
 * @param {Object} irModule - IR module to validate
 * @returns {Object} { valid: boolean, errors: IRValidationError[] }
 */
export function validateIRModule(irModule) {
  const errors = [];

  if (!irModule || typeof irModule !== 'object') {
    errors.push(new IRValidationError('IR module must be an object'));
    return { valid: false, errors };
  }

  if (irModule.kind !== 'IRModule') {
    errors.push(new IRValidationError(`Expected IRModule, got ${irModule.kind}`));
    return { valid: false, errors };
  }

  if (!Array.isArray(irModule.functions)) {
    errors.push(new IRValidationError('IR module must have functions array'));
    return { valid: false, errors };
  }

  // Validate each function
  for (const func of irModule.functions) {
    if (!func || typeof func !== 'object') {
      errors.push(new IRValidationError('Function must be an object'));
      continue;
    }

    const functionName = func.name || '<anonymous>';

    // Check function has at least one block
    if (!Array.isArray(func.blocks)) {
      errors.push(new IRValidationError('Function must have blocks array', functionName));
      continue;
    }

    if (func.blocks.length === 0) {
      errors.push(new IRValidationError('Function must have at least one basic block', functionName));
      continue;
    }

    // Check registerCount
    if (typeof func.registerCount !== 'number' || func.registerCount < 0) {
      errors.push(new IRValidationError(
        `Invalid registerCount: ${func.registerCount}`,
        functionName
      ));
    }

    // Build block label map
    const blockLabels = new Set();
    for (const block of func.blocks) {
      if (block.label) {
        blockLabels.add(block.label);
      }
    }

    // Validate each block
    for (const block of func.blocks) {
      const blockLabel = block.label || '<unlabeled>';

      if (!Array.isArray(block.instructions)) {
        errors.push(new IRValidationError(
          'Block must have instructions array',
          functionName,
          blockLabel
        ));
        continue;
      }

      // Check each instruction
      let hasTerminator = false;
      for (let i = 0; i < block.instructions.length; i++) {
        const instr = block.instructions[i];

        // Validate instruction kind
        if (!isInstruction(instr)) {
          errors.push(new IRValidationError(
            `Invalid instruction: ${JSON.stringify(instr)}`,
            functionName,
            blockLabel,
            i
          ));
          continue;
        }

        // Check if terminator
        if (isTerminator(instr)) {
          hasTerminator = true;

          // Validate jump targets
          if (instr.kind === InstructionKinds.Jump) {
            if (!blockLabels.has(instr.target)) {
              errors.push(new IRValidationError(
                `Jump to undefined block: ${instr.target}`,
                functionName,
                blockLabel,
                i
              ));
            }
          }

          if (instr.kind === InstructionKinds.CondJump) {
            if (!blockLabels.has(instr.trueTarget)) {
              errors.push(new IRValidationError(
                `CondJump to undefined true target: ${instr.trueTarget}`,
                functionName,
                blockLabel,
                i
              ));
            }
            if (!blockLabels.has(instr.falseTarget)) {
              errors.push(new IRValidationError(
                `CondJump to undefined false target: ${instr.falseTarget}`,
                functionName,
                blockLabel,
                i
              ));
            }
          }
        }

        // Validate all register operands
        const registers = collectRegisterOperands(instr);
        for (const reg of registers) {
          const error = validateRegister(reg, func.registerCount, functionName, blockLabel, i);
          if (error) {
            errors.push(error);
          }
        }
      }

      // Warn if block has no terminator
      if (block.instructions.length > 0 && !hasTerminator) {
        errors.push(new IRValidationError(
          'Block has no terminator (Return, Jump, or CondJump)',
          functionName,
          blockLabel
        ));
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate an IR module and throw on error
 * @param {Object} irModule - IR module to validate
 * @throws {IRValidationError}
 */
export function validateIRModuleOrThrow(irModule) {
  const result = validateIRModule(irModule);
  if (!result.valid) {
    const firstError = result.errors[0];
    throw firstError;
  }
}
