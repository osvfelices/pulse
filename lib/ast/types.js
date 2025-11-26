/**
 * AST Type Definitions for Pulse Compiler
 *
 * This module defines the canonical AST node types used by the Pulse compiler.
 * All nodes follow a discriminated union pattern with a 'kind' field.
 *
 * Node structure principles:
 * - Every node has a 'kind' field (string discriminant)
 * - Every node has a 'loc' field (SourceLocation or null for synthetic nodes)
 * - Fields are required unless explicitly documented as optional
 * - Arrays are never null (use empty array instead)
 */

/**
 * @typedef {Object} SourceLocation
 * @property {{ line: number, column: number }} start
 * @property {{ line: number, column: number }} end
 */

/**
 * @typedef {Object} Node
 * @property {string} kind
 * @property {SourceLocation|null} loc
 */

/**
 * Program node (root of AST)
 * @typedef {Object} Program
 * @property {'Program'} kind
 * @property {Array<Statement>} body
 * @property {SourceLocation|null} loc
 */

/**
 * Block statement
 * @typedef {Object} Block
 * @property {'Block'} kind
 * @property {Array<Statement>} statements
 * @property {SourceLocation|null} loc
 */

/**
 * Import declaration
 * @typedef {Object} ImportDecl
 * @property {'ImportDecl'} kind
 * @property {string} source
 * @property {boolean} [sideEffect] - true if import has no specifiers
 * @property {Array<Object>} [specifiers] - import specifiers (optional)
 * @property {SourceLocation|null} loc
 */

/**
 * Export declarations
 * @typedef {Object} ExportDefault
 * @property {'ExportDefault'} kind
 * @property {Expression} expr
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ExportAll
 * @property {'ExportAll'} kind
 * @property {string} source
 * @property {string} [as] - optional alias
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ExportNamed
 * @property {'ExportNamed'} kind
 * @property {Array<Object>} specifiers
 * @property {string} [source] - optional re-export source
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ExportDecl
 * @property {'ExportDecl'} kind
 * @property {FnDecl|ClassDecl|VarDecl|null} declaration
 * @property {SourceLocation|null} loc
 */

/**
 * Function declaration
 * @typedef {Object} FnDecl
 * @property {'FnDecl'} kind
 * @property {string} name
 * @property {Array<Object>} params - parameter patterns
 * @property {Block} body
 * @property {boolean} async
 * @property {SourceLocation|null} loc
 */

/**
 * Variable declaration
 * @typedef {Object} VarDecl
 * @property {'VarDecl'} kind
 * @property {boolean} constant - true for const, false for let
 * @property {string|Object} name - identifier or pattern
 * @property {Object} [pattern] - destructuring pattern (alternative to name)
 * @property {Expression|null} init - initializer expression
 * @property {SourceLocation|null} loc
 */

/**
 * Class declaration
 * @typedef {Object} ClassDecl
 * @property {'ClassDecl'} kind
 * @property {string} name
 * @property {Object|null} superClass
 * @property {Array<Object>} methods
 * @property {SourceLocation|null} loc
 */

/**
 * Contract declaration (Pulse-specific)
 * @typedef {Object} ContractDecl
 * @property {'ContractDecl'} kind
 * @property {string} name
 * @property {Array<Object>} fields
 * @property {SourceLocation|null} loc
 */

/**
 * View declaration (Pulse-specific)
 * @typedef {Object} ViewDecl
 * @property {'ViewDecl'} kind
 * @property {string} name
 * @property {Array<Object>} params
 * @property {Block} body
 * @property {SourceLocation|null} loc
 */

/**
 * Statement nodes
 * @typedef {Object} ReturnStmt
 * @property {'ReturnStmt'} kind
 * @property {Expression|null} expr
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ThrowStmt
 * @property {'ThrowStmt'} kind
 * @property {Expression} expr
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} BreakStmt
 * @property {'BreakStmt'} kind
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ContinueStmt
 * @property {'ContinueStmt'} kind
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ExprStmt
 * @property {'ExprStmt'} kind
 * @property {Expression} expr
 * @property {SourceLocation|null} loc
 */

/**
 * Control flow statements
 * @typedef {Object} IfStmt
 * @property {'IfStmt'} kind
 * @property {Expression} test
 * @property {Statement} consequent
 * @property {Statement|null} alternate
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} WhileStmt
 * @property {'WhileStmt'} kind
 * @property {Expression} test
 * @property {Statement} body
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} TryStmt
 * @property {'TryStmt'} kind
 * @property {Block} body
 * @property {Object|null} handler
 * @property {Block|null} finalizer
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} SwitchStmt
 * @property {'SwitchStmt'} kind
 * @property {Expression} discriminant
 * @property {Array<Object>} cases
 * @property {SourceLocation|null} loc
 */

/**
 * Loop statements
 * @typedef {Object} ForStmt
 * @property {'ForStmt'} kind
 * @property {Statement|null} init
 * @property {Expression|null} test
 * @property {Expression|null} update
 * @property {Statement} body
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ForOfStmt
 * @property {'ForOfStmt'} kind
 * @property {Object} variable
 * @property {Expression} iterable
 * @property {Statement} body
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ForAwaitStmt
 * @property {'ForAwaitStmt'} kind
 * @property {Object} variable
 * @property {Expression} iterable
 * @property {Statement} body
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ForInStmt
 * @property {'ForInStmt'} kind
 * @property {Object} variable
 * @property {Expression} object
 * @property {Statement} body
 * @property {SourceLocation|null} loc
 */

/**
 * Expression nodes
 * @typedef {Object} Identifier
 * @property {'Identifier'} kind
 * @property {string} name
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} NumberLiteral
 * @property {'NumberLiteral'} kind
 * @property {number} value
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} StringLiteral
 * @property {'StringLiteral'} kind
 * @property {string} value
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} BooleanLiteral
 * @property {'BooleanLiteral'} kind
 * @property {boolean} value
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} NullLiteral
 * @property {'NullLiteral'} kind
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} TemplateLiteral
 * @property {'TemplateLiteral'} kind
 * @property {string} value
 * @property {SourceLocation|null} loc
 */

/**
 * Binary and unary expressions
 * @typedef {Object} BinaryExpr
 * @property {'BinaryExpr'} kind
 * @property {string} op
 * @property {Expression} left
 * @property {Expression} right
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} UnaryExpr
 * @property {'UnaryExpr'} kind
 * @property {string} op
 * @property {Expression} argument
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} UpdateExpr
 * @property {'UpdateExpr'} kind
 * @property {string} op
 * @property {Expression} argument
 * @property {boolean} prefix
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} TernaryExpr
 * @property {'TernaryExpr'} kind
 * @property {Expression} test
 * @property {Expression} consequent
 * @property {Expression} alternate
 * @property {SourceLocation|null} loc
 */

/**
 * Call and member expressions
 * @typedef {Object} CallExpr
 * @property {'CallExpr'} kind
 * @property {Expression} callee
 * @property {Array<Expression>} args
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} NewExpr
 * @property {'NewExpr'} kind
 * @property {Expression} callee
 * @property {Array<Expression>} args
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} MemberExpr
 * @property {'MemberExpr'} kind
 * @property {Expression} object
 * @property {string} property
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} OptionalMemberExpr
 * @property {'OptionalMemberExpr'} kind
 * @property {Expression} object
 * @property {string} property
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} IndexExpr
 * @property {'IndexExpr'} kind
 * @property {Expression} object
 * @property {Expression} index
 * @property {SourceLocation|null} loc
 */

/**
 * Composite expressions
 * @typedef {Object} ArrayExpr
 * @property {'ArrayExpr'} kind
 * @property {Array<Expression|SpreadElement>} elements
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ObjectExpr
 * @property {'ObjectExpr'} kind
 * @property {Array<Object>} properties
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ArrowFn
 * @property {'ArrowFn'} kind
 * @property {Array<Object>} params
 * @property {Expression|Block} body
 * @property {boolean} async
 * @property {SourceLocation|null} loc
 */

/**
 * Pulse-specific expressions
 * @typedef {Object} SpawnExpr
 * @property {'SpawnExpr'} kind
 * @property {Expression} argument
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} YieldExpr
 * @property {'YieldExpr'} kind
 * @property {Expression|null} argument
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} SelectExpr
 * @property {'SelectExpr'} kind
 * @property {Array<Object>} cases
 * @property {Object|null} defaultCase
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ImportExpr
 * @property {'ImportExpr'} kind
 * @property {Expression} source
 * @property {SourceLocation|null} loc
 */

/**
 * Pattern and utility nodes
 * @typedef {Object} RestElement
 * @property {'RestElement'} kind
 * @property {string} name
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} SpreadElement
 * @property {'SpreadElement'} kind
 * @property {Expression} argument
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} SpreadProperty
 * @property {'SpreadProperty'} kind
 * @property {Expression} argument
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ArrayPattern
 * @property {'ArrayPattern'} kind
 * @property {Array<Object>} elements
 * @property {SourceLocation|null} loc
 *
 * @typedef {Object} ObjectPattern
 * @property {'ObjectPattern'} kind
 * @property {Array<Object>} properties
 * @property {SourceLocation|null} loc
 */

/**
 * Union types for type checking
 * @typedef {Program|FnDecl|ClassDecl|VarDecl|ImportDecl|ExportDefault|ExportAll|ExportNamed|ExportDecl|ContractDecl|ViewDecl} Declaration
 * @typedef {Block|ReturnStmt|ThrowStmt|BreakStmt|ContinueStmt|ExprStmt|IfStmt|WhileStmt|ForStmt|ForOfStmt|ForAwaitStmt|ForInStmt|TryStmt|SwitchStmt} Statement
 * @typedef {Identifier|NumberLiteral|StringLiteral|BooleanLiteral|NullLiteral|TemplateLiteral|BinaryExpr|UnaryExpr|UpdateExpr|TernaryExpr|CallExpr|NewExpr|MemberExpr|OptionalMemberExpr|IndexExpr|ArrayExpr|ObjectExpr|ArrowFn|SpawnExpr|YieldExpr|SelectExpr|ImportExpr} Expression
 */

/**
 * Known AST node kinds
 */
export const NodeKinds = {
  // Program
  Program: 'Program',

  // Declarations
  ImportDecl: 'ImportDecl',
  ExportDefault: 'ExportDefault',
  ExportAll: 'ExportAll',
  ExportNamed: 'ExportNamed',
  ExportDecl: 'ExportDecl',
  FnDecl: 'FnDecl',
  VarDecl: 'VarDecl',
  ClassDecl: 'ClassDecl',
  ContractDecl: 'ContractDecl',
  ViewDecl: 'ViewDecl',

  // Statements
  Block: 'Block',
  ReturnStmt: 'ReturnStmt',
  ThrowStmt: 'ThrowStmt',
  BreakStmt: 'BreakStmt',
  ContinueStmt: 'ContinueStmt',
  ExprStmt: 'ExprStmt',
  IfStmt: 'IfStmt',
  WhileStmt: 'WhileStmt',
  ForStmt: 'ForStmt',
  ForOfStmt: 'ForOfStmt',
  ForAwaitStmt: 'ForAwaitStmt',
  ForInStmt: 'ForInStmt',
  TryStmt: 'TryStmt',
  SwitchStmt: 'SwitchStmt',

  // Expressions
  Identifier: 'Identifier',
  NumberLiteral: 'NumberLiteral',
  StringLiteral: 'StringLiteral',
  BooleanLiteral: 'BooleanLiteral',
  NullLiteral: 'NullLiteral',
  TemplateLiteral: 'TemplateLiteral',
  BinaryExpr: 'BinaryExpr',
  UnaryExpr: 'UnaryExpr',
  UpdateExpr: 'UpdateExpr',
  TernaryExpr: 'TernaryExpr',
  CallExpr: 'CallExpr',
  NewExpr: 'NewExpr',
  MemberExpr: 'MemberExpr',
  OptionalMemberExpr: 'OptionalMemberExpr',
  IndexExpr: 'IndexExpr',
  ArrayExpr: 'ArrayExpr',
  ObjectExpr: 'ObjectExpr',
  ArrowFn: 'ArrowFn',
  SpawnExpr: 'SpawnExpr',
  YieldExpr: 'YieldExpr',
  SelectExpr: 'SelectExpr',
  ImportExpr: 'ImportExpr',

  // Patterns and utilities
  RestElement: 'RestElement',
  SpreadElement: 'SpreadElement',
  SpreadProperty: 'SpreadProperty',
  ArrayPattern: 'ArrayPattern',
  ObjectPattern: 'ObjectPattern',
};

/**
 * Check if a node kind is valid
 * @param {string} kind
 * @returns {boolean}
 */
export function isValidNodeKind(kind) {
  return Object.values(NodeKinds).includes(kind);
}
