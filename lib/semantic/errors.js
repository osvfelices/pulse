/**
 * Semantic Analysis Errors
 *
 * Error types for semantic analysis phase.
 */

export class SemanticError extends Error {
  constructor(message, node) {
    super(message);
    this.name = 'SemanticError';
    this.node = node;
    this.code = 'SEMANTIC';

    if (node && node.loc) {
      this.location = node.loc;
      this.line = node.loc.start.line;
      this.column = node.loc.start.column;
    }
  }

  toString() {
    if (this.location) {
      return `error[${this.code}]: ${this.message}\n  at line ${this.line}, column ${this.column}`;
    }
    return `error[${this.code}]: ${this.message}`;
  }
}

export class UndefinedVariableError extends SemanticError {
  constructor(name, node) {
    super(`Undefined variable '${name}'`, node);
    this.code = 'UNDEFINED_VAR';
    this.variableName = name;
  }
}

export class DuplicateDeclarationError extends SemanticError {
  constructor(name, node, previous) {
    super(`Duplicate declaration of '${name}'`, node);
    this.code = 'DUPLICATE_DECL';
    this.variableName = name;
    this.previousDeclaration = previous;
  }
}

export class AssignmentToConstError extends SemanticError {
  constructor(name, node) {
    super(`Cannot assign to const variable '${name}'`, node);
    this.code = 'ASSIGN_TO_CONST';
    this.variableName = name;
  }
}

export class TemporalDeadZoneError extends SemanticError {
  constructor(name, node) {
    super(`Variable '${name}' used before initialization (temporal dead zone)`, node);
    this.code = 'TDZ_ERROR';
    this.variableName = name;
  }
}

export class InvalidReturnError extends SemanticError {
  constructor(node) {
    super('Return statement outside function', node);
    this.code = 'INVALID_RETURN';
  }
}

export class InvalidBreakError extends SemanticError {
  constructor(node) {
    super('Break statement outside loop or switch', node);
    this.code = 'INVALID_BREAK';
  }
}

export class InvalidContinueError extends SemanticError {
  constructor(node) {
    super('Continue statement outside loop', node);
    this.code = 'INVALID_CONTINUE';
  }
}
