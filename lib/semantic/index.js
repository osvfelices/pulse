/**
 * Semantic Analysis Module
 *
 * Entry point for semantic analysis functionality.
 */

export { Scope } from './scope.js';
export { Symbol, SymbolTable } from './symbol-table.js';
export { SemanticAnalyzer } from './semantic-analyzer.js';
export {
  SemanticError,
  UndefinedVariableError,
  DuplicateDeclarationError,
  AssignmentToConstError,
  TemporalDeadZoneError,
  InvalidReturnError,
  InvalidBreakError,
  InvalidContinueError,
} from './errors.js';
