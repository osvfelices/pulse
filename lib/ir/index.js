/**
 * IR Module
 *
 * Intermediate representation for Pulse programs.
 * Default backend in Pulse 3.0. Use --legacy-backend for fallback.
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
