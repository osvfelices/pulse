/**
 * AST Factory Functions
 *
 * This module provides factory functions for creating AST nodes with basic
 * structural validation. Factories enforce required fields and basic type
 * invariants without semantic analysis.
 *
 * Design principles:
 * - Fail fast on structural errors (missing required fields)
 * - Accept null/undefined for optional fields
 * - Arrays are never null (empty array for no elements)
 * - Location is always propagated from input or explicitly passed
 */

import { NodeKinds, isValidNodeKind } from './types.js';

/**
 * Validate that a value is a non-null object
 * @param {any} value
 * @param {string} fieldName
 * @throws {Error} if value is not an object
 */
function requireObject(value, fieldName) {
  if (!value || typeof value !== 'object') {
    throw new Error(`${fieldName} must be a non-null object`);
  }
}

/**
 * Validate that a value is an array
 * @param {any} value
 * @param {string} fieldName
 * @throws {Error} if value is not an array
 */
function requireArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }
}

/**
 * Validate that a value is a string
 * @param {any} value
 * @param {string} fieldName
 * @throws {Error} if value is not a string
 */
function requireString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
}

/**
 * Validate that a value is a boolean
 * @param {any} value
 * @param {string} fieldName
 * @throws {Error} if value is not a boolean
 */
function requireBoolean(value, fieldName) {
  if (typeof value !== 'boolean') {
    throw new Error(`${fieldName} must be a boolean`);
  }
}

/**
 * Create a Program node (root of AST)
 * @param {Array<Object>} body - array of top-level statements
 * @param {Object|null} loc - source location
 * @returns {Object}
 */
export function createProgram(body, loc) {
  requireArray(body, 'Program.body');
  return {
    kind: NodeKinds.Program,
    body,
    loc: loc || null,
  };
}

/**
 * Create a Block statement
 * @param {Array<Object>} statements
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createBlock(statements, loc) {
  requireArray(statements, 'Block.statements');
  return {
    kind: NodeKinds.Block,
    statements,
    loc: loc || null,
  };
}

/**
 * Create an ImportDecl node
 * @param {string} source - module path
 * @param {Array<Object>} specifiers - import specifiers (empty for side-effect)
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createImportDecl(source, specifiers, loc) {
  requireString(source, 'ImportDecl.source');
  requireArray(specifiers, 'ImportDecl.specifiers');
  return {
    kind: NodeKinds.ImportDecl,
    source,
    specifiers,
    sideEffect: specifiers.length === 0,
    loc: loc || null,
  };
}

/**
 * Create an ExportDefault node
 * @param {Object} expr
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createExportDefault(expr, loc) {
  requireObject(expr, 'ExportDefault.expr');
  return {
    kind: NodeKinds.ExportDefault,
    expr,
    loc: loc || null,
  };
}

/**
 * Create an ExportAll node
 * @param {string} source
 * @param {string|null} as - optional alias
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createExportAll(source, as, loc) {
  requireString(source, 'ExportAll.source');
  return {
    kind: NodeKinds.ExportAll,
    source,
    as: as || undefined,
    loc: loc || null,
  };
}

/**
 * Create an ExportNamed node
 * @param {Array<Object>} specifiers
 * @param {string|null} source - optional re-export source
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createExportNamed(specifiers, source, loc) {
  requireArray(specifiers, 'ExportNamed.specifiers');
  return {
    kind: NodeKinds.ExportNamed,
    specifiers,
    source: source || undefined,
    loc: loc || null,
  };
}

/**
 * Create an ExportDecl node
 * @param {Object|null} declaration
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createExportDecl(declaration, loc) {
  return {
    kind: NodeKinds.ExportDecl,
    declaration,
    loc: loc || null,
  };
}

/**
 * Create a FnDecl node
 * @param {string} name
 * @param {Array<Object>} params
 * @param {Object} body - must be Block
 * @param {boolean} async
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createFnDecl(name, params, body, async, loc) {
  requireString(name, 'FnDecl.name');
  requireArray(params, 'FnDecl.params');
  requireObject(body, 'FnDecl.body');
  requireBoolean(async, 'FnDecl.async');
  if (body.kind !== NodeKinds.Block) {
    throw new Error('FnDecl.body must be a Block node');
  }
  return {
    kind: NodeKinds.FnDecl,
    name,
    params,
    body,
    async,
    loc: loc || null,
  };
}

/**
 * Create a VarDecl node
 * @param {boolean} constant - true for const, false for let
 * @param {string|Object} name - identifier or pattern
 * @param {Object|null} init - initializer expression
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createVarDecl(constant, name, init, loc) {
  requireBoolean(constant, 'VarDecl.constant');
  if (typeof name !== 'string' && (!name || typeof name !== 'object')) {
    throw new Error('VarDecl.name must be a string or pattern object');
  }
  return {
    kind: NodeKinds.VarDecl,
    constant,
    name,
    init,
    loc: loc || null,
  };
}

/**
 * Create a ClassDecl node
 * @param {string} name
 * @param {Object|null} superClass
 * @param {Array<Object>} methods
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createClassDecl(name, superClass, methods, loc) {
  requireString(name, 'ClassDecl.name');
  requireArray(methods, 'ClassDecl.methods');
  return {
    kind: NodeKinds.ClassDecl,
    name,
    superClass,
    methods,
    loc: loc || null,
  };
}

/**
 * Create a ReturnStmt node
 * @param {Object|null} expr
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createReturnStmt(expr, loc) {
  return {
    kind: NodeKinds.ReturnStmt,
    expr,
    loc: loc || null,
  };
}

/**
 * Create a ThrowStmt node
 * @param {Object} expr
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createThrowStmt(expr, loc) {
  requireObject(expr, 'ThrowStmt.expr');
  return {
    kind: NodeKinds.ThrowStmt,
    expr,
    loc: loc || null,
  };
}

/**
 * Create a BreakStmt node
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createBreakStmt(loc) {
  return {
    kind: NodeKinds.BreakStmt,
    loc: loc || null,
  };
}

/**
 * Create a ContinueStmt node
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createContinueStmt(loc) {
  return {
    kind: NodeKinds.ContinueStmt,
    loc: loc || null,
  };
}

/**
 * Create an ExprStmt node
 * @param {Object} expr
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createExprStmt(expr, loc) {
  requireObject(expr, 'ExprStmt.expr');
  return {
    kind: NodeKinds.ExprStmt,
    expr,
    loc: loc || null,
  };
}

/**
 * Create an IfStmt node
 * @param {Object} test
 * @param {Object} consequent
 * @param {Object|null} alternate
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createIfStmt(test, consequent, alternate, loc) {
  requireObject(test, 'IfStmt.test');
  requireObject(consequent, 'IfStmt.consequent');
  return {
    kind: NodeKinds.IfStmt,
    test,
    consequent,
    alternate,
    loc: loc || null,
  };
}

/**
 * Create a WhileStmt node
 * @param {Object} test
 * @param {Object} body
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createWhileStmt(test, body, loc) {
  requireObject(test, 'WhileStmt.test');
  requireObject(body, 'WhileStmt.body');
  return {
    kind: NodeKinds.WhileStmt,
    test,
    body,
    loc: loc || null,
  };
}

/**
 * Create a ForStmt node
 * @param {Object|null} init
 * @param {Object|null} test
 * @param {Object|null} update
 * @param {Object} body
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createForStmt(init, test, update, body, loc) {
  requireObject(body, 'ForStmt.body');
  return {
    kind: NodeKinds.ForStmt,
    init,
    test,
    update,
    body,
    loc: loc || null,
  };
}

/**
 * Create an Identifier node
 * @param {string} name
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createIdentifier(name, loc) {
  requireString(name, 'Identifier.name');
  return {
    kind: NodeKinds.Identifier,
    name,
    loc: loc || null,
  };
}

/**
 * Create a NumberLiteral node
 * @param {number} value
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createNumberLiteral(value, loc) {
  if (typeof value !== 'number') {
    throw new Error('NumberLiteral.value must be a number');
  }
  return {
    kind: NodeKinds.NumberLiteral,
    value,
    loc: loc || null,
  };
}

/**
 * Create a StringLiteral node
 * @param {string} value
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createStringLiteral(value, loc) {
  requireString(value, 'StringLiteral.value');
  return {
    kind: NodeKinds.StringLiteral,
    value,
    loc: loc || null,
  };
}

/**
 * Create a BooleanLiteral node
 * @param {boolean} value
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createBooleanLiteral(value, loc) {
  requireBoolean(value, 'BooleanLiteral.value');
  return {
    kind: NodeKinds.BooleanLiteral,
    value,
    loc: loc || null,
  };
}

/**
 * Create a NullLiteral node
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createNullLiteral(loc) {
  return {
    kind: NodeKinds.NullLiteral,
    loc: loc || null,
  };
}

/**
 * Create a BinaryExpr node
 * @param {string} op
 * @param {Object} left
 * @param {Object} right
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createBinaryExpr(op, left, right, loc) {
  requireString(op, 'BinaryExpr.op');
  requireObject(left, 'BinaryExpr.left');
  requireObject(right, 'BinaryExpr.right');
  return {
    kind: NodeKinds.BinaryExpr,
    op,
    left,
    right,
    loc: loc || null,
  };
}

/**
 * Create a UnaryExpr node
 * @param {string} op
 * @param {Object} argument
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createUnaryExpr(op, argument, loc) {
  requireString(op, 'UnaryExpr.op');
  requireObject(argument, 'UnaryExpr.argument');
  return {
    kind: NodeKinds.UnaryExpr,
    op,
    argument,
    loc: loc || null,
  };
}

/**
 * Create a CallExpr node
 * @param {Object} callee
 * @param {Array<Object>} args
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createCallExpr(callee, args, loc) {
  requireObject(callee, 'CallExpr.callee');
  requireArray(args, 'CallExpr.args');
  return {
    kind: NodeKinds.CallExpr,
    callee,
    args,
    loc: loc || null,
  };
}

/**
 * Create a MemberExpr node
 * @param {Object} object
 * @param {string} property
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createMemberExpr(object, property, loc) {
  requireObject(object, 'MemberExpr.object');
  requireString(property, 'MemberExpr.property');
  return {
    kind: NodeKinds.MemberExpr,
    object,
    property,
    loc: loc || null,
  };
}

/**
 * Create an ArrayExpr node
 * @param {Array<Object>} elements
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createArrayExpr(elements, loc) {
  requireArray(elements, 'ArrayExpr.elements');
  return {
    kind: NodeKinds.ArrayExpr,
    elements,
    loc: loc || null,
  };
}

/**
 * Create an ObjectExpr node
 * @param {Array<Object>} properties
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createObjectExpr(properties, loc) {
  requireArray(properties, 'ObjectExpr.properties');
  return {
    kind: NodeKinds.ObjectExpr,
    properties,
    loc: loc || null,
  };
}

/**
 * Create a SpawnExpr node (Pulse-specific)
 * @param {Object} argument
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createSpawnExpr(argument, loc) {
  requireObject(argument, 'SpawnExpr.argument');
  return {
    kind: NodeKinds.SpawnExpr,
    argument,
    loc: loc || null,
  };
}

/**
 * Create a SelectExpr node (Pulse-specific)
 * @param {Array<Object>} cases
 * @param {Object|null} defaultCase
 * @param {Object|null} loc
 * @returns {Object}
 */
export function createSelectExpr(cases, defaultCase, loc) {
  requireArray(cases, 'SelectExpr.cases');
  return {
    kind: NodeKinds.SelectExpr,
    cases,
    defaultCase,
    loc: loc || null,
  };
}
