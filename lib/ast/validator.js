/**
 * AST Structural Validator
 *
 * This module provides structural validation for Pulse AST nodes.
 * It checks basic invariants without performing semantic analysis:
 * - Node kinds are known
 * - Required fields exist
 * - Field types match expectations (array vs object vs scalar)
 * - Nested nodes are structurally valid
 *
 * This is NOT semantic validation. Symbol tables, type checking, and
 * scope analysis are separate concerns handled by later compiler phases.
 */

import { NodeKinds, isValidNodeKind } from './types.js';

/**
 * Validation error
 */
export class ASTValidationError extends Error {
  constructor(message, node) {
    super(message);
    this.name = 'ASTValidationError';
    this.node = node;
    if (node && node.loc) {
      this.location = node.loc;
    }
  }
}

/**
 * Validator context
 */
class ValidationContext {
  constructor() {
    this.errors = [];
  }

  addError(message, node) {
    this.errors.push(new ASTValidationError(message, node));
  }

  hasErrors() {
    return this.errors.length > 0;
  }

  getErrors() {
    return this.errors;
  }
}

/**
 * Check if value is a non-null object
 * @param {any} value
 * @returns {boolean}
 */
function isObject(value) {
  return value !== null && typeof value === 'object';
}

/**
 * Check if value is an array
 * @param {any} value
 * @returns {boolean}
 */
function isArray(value) {
  return Array.isArray(value);
}

/**
 * Validate a node has required field
 * @param {Object} node
 * @param {string} field
 * @param {ValidationContext} ctx
 * @returns {boolean} true if field exists
 */
function requireField(node, field, ctx) {
  if (!(field in node)) {
    ctx.addError(`Node ${node.kind} missing required field: ${field}`, node);
    return false;
  }
  return true;
}

/**
 * Validate a field is a non-null object
 * @param {Object} node
 * @param {string} field
 * @param {ValidationContext} ctx
 * @returns {boolean} true if valid
 */
function requireObjectField(node, field, ctx) {
  if (!requireField(node, field, ctx)) return false;
  if (!isObject(node[field])) {
    ctx.addError(`Node ${node.kind}.${field} must be an object`, node);
    return false;
  }
  return true;
}

/**
 * Validate a field is an array
 * @param {Object} node
 * @param {string} field
 * @param {ValidationContext} ctx
 * @returns {boolean} true if valid
 */
function requireArrayField(node, field, ctx) {
  if (!requireField(node, field, ctx)) return false;
  if (!isArray(node[field])) {
    ctx.addError(`Node ${node.kind}.${field} must be an array`, node);
    return false;
  }
  return true;
}

/**
 * Validate a field is a string
 * @param {Object} node
 * @param {string} field
 * @param {ValidationContext} ctx
 * @returns {boolean} true if valid
 */
function requireStringField(node, field, ctx) {
  if (!requireField(node, field, ctx)) return false;
  if (typeof node[field] !== 'string') {
    ctx.addError(`Node ${node.kind}.${field} must be a string`, node);
    return false;
  }
  return true;
}

/**
 * Validate a field is a boolean
 * @param {Object} node
 * @param {string} field
 * @param {ValidationContext} ctx
 * @returns {boolean} true if valid
 */
function requireBooleanField(node, field, ctx) {
  if (!requireField(node, field, ctx)) return false;
  if (typeof node[field] !== 'boolean') {
    ctx.addError(`Node ${node.kind}.${field} must be a boolean`, node);
    return false;
  }
  return true;
}

/**
 * Validate a single node
 * @param {Object} node
 * @param {ValidationContext} ctx
 */
function validateNode(node, ctx) {
  if (!isObject(node)) {
    ctx.addError('AST node must be an object', node);
    return;
  }

  if (!requireField(node, 'kind', ctx)) return;

  const kind = node.kind;
  if (!isValidNodeKind(kind)) {
    ctx.addError(`Unknown node kind: ${kind}`, node);
    return;
  }

  // Validate based on node kind
  switch (kind) {
    case NodeKinds.Program:
      requireArrayField(node, 'body', ctx);
      if (isArray(node.body)) {
        node.body.forEach((child) => validateNode(child, ctx));
      }
      break;

    case NodeKinds.Block:
      requireArrayField(node, 'statements', ctx);
      if (isArray(node.statements)) {
        node.statements.forEach((stmt) => validateNode(stmt, ctx));
      }
      break;

    case NodeKinds.ImportDecl:
      requireStringField(node, 'source', ctx);
      if ('specifiers' in node && node.specifiers) {
        requireArrayField(node, 'specifiers', ctx);
      }
      break;

    case NodeKinds.ExportDefault:
      if (requireObjectField(node, 'expr', ctx)) {
        validateNode(node.expr, ctx);
      }
      break;

    case NodeKinds.ExportAll:
      requireStringField(node, 'source', ctx);
      break;

    case NodeKinds.ExportNamed:
      requireArrayField(node, 'specifiers', ctx);
      break;

    case NodeKinds.ExportDecl:
      if (node.declaration) {
        requireObjectField(node, 'declaration', ctx);
        validateNode(node.declaration, ctx);
      }
      break;

    case NodeKinds.FnDecl:
      requireStringField(node, 'name', ctx);
      requireArrayField(node, 'params', ctx);
      requireBooleanField(node, 'async', ctx);
      if (requireObjectField(node, 'body', ctx)) {
        if (node.body.kind !== NodeKinds.Block) {
          ctx.addError('FnDecl.body must be a Block node', node);
        } else {
          validateNode(node.body, ctx);
        }
      }
      break;

    case NodeKinds.VarDecl:
      requireBooleanField(node, 'constant', ctx);
      if (!('name' in node) && !('pattern' in node)) {
        ctx.addError('VarDecl must have either name or pattern field', node);
      }
      if (node.init) {
        validateNode(node.init, ctx);
      }
      break;

    case NodeKinds.ClassDecl:
      requireStringField(node, 'name', ctx);
      requireArrayField(node, 'methods', ctx);
      if (node.superClass) {
        validateNode(node.superClass, ctx);
      }
      break;

    case NodeKinds.ReturnStmt:
      if (node.expr) {
        validateNode(node.expr, ctx);
      }
      break;

    case NodeKinds.ThrowStmt:
      if (requireObjectField(node, 'expr', ctx)) {
        validateNode(node.expr, ctx);
      }
      break;

    case NodeKinds.BreakStmt:
    case NodeKinds.ContinueStmt:
      // No additional validation needed
      break;

    case NodeKinds.ExprStmt:
      if (requireObjectField(node, 'expr', ctx)) {
        validateNode(node.expr, ctx);
      }
      break;

    case NodeKinds.IfStmt:
      if (requireObjectField(node, 'test', ctx)) {
        validateNode(node.test, ctx);
      }
      if (requireObjectField(node, 'consequent', ctx)) {
        validateNode(node.consequent, ctx);
      }
      if (node.alternate) {
        validateNode(node.alternate, ctx);
      }
      break;

    case NodeKinds.WhileStmt:
      if (requireObjectField(node, 'test', ctx)) {
        validateNode(node.test, ctx);
      }
      if (requireObjectField(node, 'body', ctx)) {
        validateNode(node.body, ctx);
      }
      break;

    case NodeKinds.ForStmt:
      if (node.init) validateNode(node.init, ctx);
      if (node.test) validateNode(node.test, ctx);
      if (node.update) validateNode(node.update, ctx);
      if (requireObjectField(node, 'body', ctx)) {
        validateNode(node.body, ctx);
      }
      break;

    case NodeKinds.ForOfStmt:
    case NodeKinds.ForAwaitStmt:
      if (requireObjectField(node, 'variable', ctx)) {
        validateNode(node.variable, ctx);
      }
      if (requireObjectField(node, 'iterable', ctx)) {
        validateNode(node.iterable, ctx);
      }
      if (requireObjectField(node, 'body', ctx)) {
        validateNode(node.body, ctx);
      }
      break;

    case NodeKinds.ForInStmt:
      if (requireObjectField(node, 'variable', ctx)) {
        validateNode(node.variable, ctx);
      }
      if (requireObjectField(node, 'object', ctx)) {
        validateNode(node.object, ctx);
      }
      if (requireObjectField(node, 'body', ctx)) {
        validateNode(node.body, ctx);
      }
      break;

    case NodeKinds.TryStmt:
      if (requireObjectField(node, 'body', ctx)) {
        validateNode(node.body, ctx);
      }
      if (node.handler) {
        validateNode(node.handler, ctx);
      }
      if (node.finalizer) {
        validateNode(node.finalizer, ctx);
      }
      break;

    case NodeKinds.SwitchStmt:
      if (requireObjectField(node, 'discriminant', ctx)) {
        validateNode(node.discriminant, ctx);
      }
      requireArrayField(node, 'cases', ctx);
      break;

    case NodeKinds.Identifier:
      requireStringField(node, 'name', ctx);
      break;

    case NodeKinds.NumberLiteral:
      requireField(node, 'value', ctx);
      if (typeof node.value !== 'number') {
        ctx.addError('NumberLiteral.value must be a number', node);
      }
      break;

    case NodeKinds.StringLiteral:
    case NodeKinds.TemplateLiteral:
      requireStringField(node, 'value', ctx);
      break;

    case NodeKinds.BooleanLiteral:
      requireField(node, 'value', ctx);
      if (typeof node.value !== 'boolean') {
        ctx.addError('BooleanLiteral.value must be a boolean', node);
      }
      break;

    case NodeKinds.NullLiteral:
      // No additional validation needed
      break;

    case NodeKinds.BinaryExpr:
      requireStringField(node, 'op', ctx);
      if (requireObjectField(node, 'left', ctx)) {
        validateNode(node.left, ctx);
      }
      if (requireObjectField(node, 'right', ctx)) {
        validateNode(node.right, ctx);
      }
      break;

    case NodeKinds.UnaryExpr:
      requireStringField(node, 'op', ctx);
      if (requireObjectField(node, 'argument', ctx)) {
        validateNode(node.argument, ctx);
      }
      break;

    case NodeKinds.UpdateExpr:
      requireStringField(node, 'op', ctx);
      requireBooleanField(node, 'prefix', ctx);
      if (requireObjectField(node, 'argument', ctx)) {
        validateNode(node.argument, ctx);
      }
      break;

    case NodeKinds.TernaryExpr:
      if (requireObjectField(node, 'test', ctx)) {
        validateNode(node.test, ctx);
      }
      if (requireObjectField(node, 'consequent', ctx)) {
        validateNode(node.consequent, ctx);
      }
      if (requireObjectField(node, 'alternate', ctx)) {
        validateNode(node.alternate, ctx);
      }
      break;

    case NodeKinds.CallExpr:
    case NodeKinds.NewExpr:
      if (requireObjectField(node, 'callee', ctx)) {
        validateNode(node.callee, ctx);
      }
      if (requireArrayField(node, 'args', ctx)) {
        node.args.forEach((arg) => validateNode(arg, ctx));
      }
      break;

    case NodeKinds.MemberExpr:
    case NodeKinds.OptionalMemberExpr:
      if (requireObjectField(node, 'object', ctx)) {
        validateNode(node.object, ctx);
      }
      requireStringField(node, 'property', ctx);
      break;

    case NodeKinds.IndexExpr:
      if (requireObjectField(node, 'object', ctx)) {
        validateNode(node.object, ctx);
      }
      if (requireObjectField(node, 'index', ctx)) {
        validateNode(node.index, ctx);
      }
      break;

    case NodeKinds.ArrayExpr:
      if (requireArrayField(node, 'elements', ctx)) {
        node.elements.forEach((elem) => {
          if (elem) validateNode(elem, ctx);
        });
      }
      break;

    case NodeKinds.ObjectExpr:
      if (requireArrayField(node, 'properties', ctx)) {
        node.properties.forEach((prop) => {
          if (prop) validateNode(prop, ctx);
        });
      }
      break;

    case NodeKinds.ArrowFn:
      requireArrayField(node, 'params', ctx);
      requireBooleanField(node, 'async', ctx);
      if (requireObjectField(node, 'body', ctx)) {
        validateNode(node.body, ctx);
      }
      break;

    case NodeKinds.SpawnExpr:
      if (requireObjectField(node, 'argument', ctx)) {
        validateNode(node.argument, ctx);
      }
      break;

    case NodeKinds.YieldExpr:
      if (node.argument) {
        validateNode(node.argument, ctx);
      }
      break;

    case NodeKinds.SelectExpr:
      requireArrayField(node, 'cases', ctx);
      if (node.defaultCase) {
        validateNode(node.defaultCase, ctx);
      }
      break;

    case NodeKinds.ImportExpr:
      if (requireObjectField(node, 'source', ctx)) {
        validateNode(node.source, ctx);
      }
      break;

    case NodeKinds.RestElement:
      requireStringField(node, 'name', ctx);
      break;

    case NodeKinds.SpreadElement:
    case NodeKinds.SpreadProperty:
      if (requireObjectField(node, 'argument', ctx)) {
        validateNode(node.argument, ctx);
      }
      break;

    case NodeKinds.ArrayPattern:
      requireArrayField(node, 'elements', ctx);
      break;

    case NodeKinds.ObjectPattern:
      requireArrayField(node, 'properties', ctx);
      break;

    case NodeKinds.ContractDecl:
      requireStringField(node, 'name', ctx);
      requireArrayField(node, 'fields', ctx);
      break;

    case NodeKinds.ViewDecl:
      requireStringField(node, 'name', ctx);
      requireArrayField(node, 'params', ctx);
      if (requireObjectField(node, 'body', ctx)) {
        validateNode(node.body, ctx);
      }
      break;

    default:
      // Unknown node kind (already caught above)
      break;
  }
}

/**
 * Validate an AST tree
 * @param {Object} ast - root node (typically Program)
 * @param {Object} options - validation options
 * @returns {{ valid: boolean, errors: Array<ASTValidationError> }}
 */
export function validateAST(ast, options = {}) {
  const ctx = new ValidationContext();

  if (!isObject(ast)) {
    ctx.addError('AST root must be an object', null);
    return {
      valid: false,
      errors: ctx.getErrors(),
    };
  }

  validateNode(ast, ctx);

  return {
    valid: !ctx.hasErrors(),
    errors: ctx.getErrors(),
  };
}

/**
 * Validate and throw on first error
 * @param {Object} ast
 * @param {Object} options
 * @throws {ASTValidationError} if validation fails
 */
export function validateASTOrThrow(ast, options = {}) {
  const result = validateAST(ast, options);
  if (!result.valid) {
    throw result.errors[0];
  }
}
