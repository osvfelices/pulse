/**
 * IR Module
 *
 * Internal IR representation (not integrated into compilation pipeline yet).
 * Provides three-address code intermediate representation for Pulse programs.
 */

export {
  InstructionKinds,
  OperandKinds,
  isInstruction,
  isRegister,
  isConstant,
  isGlobal,
  isOperand,
} from './instructions.js';

export {
  IRBuilder,
  lowerProgram,
} from './builder.js';

export {
  validateIRModule,
  validateIRModuleOrThrow,
  IRValidationError,
} from './validator.js';
