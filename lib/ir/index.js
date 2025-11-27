/**
 * IR Module
 *
 * Intermediate representation for Pulse programs.
 * Used by compilation pipeline via --experimental-ir flag.
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

export {
  optimizeIR,
} from './optimizer.js';

export {
  emitJS,
} from './js-backend.js';
