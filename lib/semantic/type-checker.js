/**
 * Type Checker
 *
 * Conservative type checker for explicit type annotations.
 * Only validates annotated code - no inference, no coercion.
 * Unannotated code is never checked.
 */

import { NodeKinds } from '../ast/types.js';
import { TypeKind, getRuntimeType, formatType } from '../runtime/types.js';
import { SemanticError } from './errors.js';

export class TypeMismatchError extends SemanticError {
  constructor(message, node, expected, actual) {
    super(message);
    this.name = 'TypeMismatchError';
    this.code = 'TYPE_MISMATCH';
    this.node = node;
    this.expected = expected;
    this.actual = actual;
    this.loc = node.loc;
  }
}

export class InvalidReturnTypeError extends SemanticError {
  constructor(message, node, expected, actual) {
    super(message);
    this.name = 'InvalidReturnTypeError';
    this.code = 'INVALID_RETURN_TYPE';
    this.node = node;
    this.expected = expected;
    this.actual = actual;
    this.loc = node.loc;
  }
}

export class InvalidArgumentTypeError extends SemanticError {
  constructor(message, node, paramIndex, expected, actual) {
    super(message);
    this.name = 'InvalidArgumentTypeError';
    this.code = 'INVALID_ARG_TYPE';
    this.node = node;
    this.paramIndex = paramIndex;
    this.expected = expected;
    this.actual = actual;
    this.loc = node.loc;
  }
}

export class TypeChecker {
  constructor(scope) {
    this.globalScope = scope;
    this.currentScope = null;
    this.errors = [];
    this.currentFunctionReturnType = null;
  }

  /**
   * Check types in the program
   * @param {Object} ast - Program AST node
   * @param {Object} scope - Global scope from semantic analysis
   * @returns {Object} { valid, errors }
   */
  static check(ast, scope) {
    const checker = new TypeChecker(scope);
    checker.currentScope = scope;
    checker.visitNode(ast);
    return {
      valid: checker.errors.length === 0,
      errors: checker.errors,
    };
  }

  reportError(error) {
    this.errors.push(error);
  }

  visitNode(node) {
    if (!node || !node.kind) return;

    const visitor = this[`visit${node.kind}`];
    if (visitor) {
      visitor.call(this, node);
    }
  }

  visitProgram(node) {
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }
  }

  visitBlock(node) {
    const parentScope = this.currentScope;
    const childScopes = parentScope.children.filter(s => s.type === 'block');
    if (childScopes.length > 0) {
      this.currentScope = childScopes.shift();
    }

    for (const stmt of node.statements) {
      this.visitNode(stmt);
    }

    this.currentScope = parentScope;
  }

  /**
   * Check variable declaration with type annotation
   */
  visitVarDecl(node) {
    // Only check if both annotation and init exist
    if (!node.typeAnnotation || !node.init) {
      if (node.init) {
        this.visitNode(node.init);
      }
      return;
    }

    // Get symbol to retrieve converted type descriptor
    const name = typeof node.name === 'string' ? node.name : null;
    if (!name) {
      if (node.init) {
        this.visitNode(node.init);
      }
      return;
    }

    const symbol = this.currentScope.resolve(name);
    if (!symbol || !symbol.typeDescriptor) {
      if (node.init) {
        this.visitNode(node.init);
      }
      return;
    }

    // Infer type from init expression
    const initType = this.inferType(node.init);
    if (!initType) {
      this.visitNode(node.init);
      return;
    }

    // Check if types match
    if (!this.typesMatch(initType, symbol.typeDescriptor)) {
      this.reportError(new TypeMismatchError(
        `Type mismatch: cannot assign ${formatType(initType)} to ${formatType(symbol.typeDescriptor)}`,
        node,
        symbol.typeDescriptor,
        initType
      ));
    }

    this.visitNode(node.init);
  }

  /**
   * Check function declaration
   */
  visitFnDecl(node) {
    const parentScope = this.currentScope;
    const parentReturnType = this.currentFunctionReturnType;

    // Find function scope
    const fnScopes = parentScope.children.filter(s => s.type === 'function');
    if (fnScopes.length > 0) {
      this.currentScope = fnScopes.shift();
    }

    // Set expected return type if annotated
    if (node.returnType && this.currentScope.returnType) {
      this.currentFunctionReturnType = this.currentScope.returnType;
    }

    // Visit function body
    this.visitNode(node.body);

    this.currentScope = parentScope;
    this.currentFunctionReturnType = parentReturnType;
  }

  /**
   * Check arrow function
   */
  visitArrowFn(node) {
    const parentScope = this.currentScope;
    const fnScopes = parentScope.children.filter(s => s.type === 'function');
    if (fnScopes.length > 0) {
      this.currentScope = fnScopes.shift();
    }

    this.visitNode(node.body);

    this.currentScope = parentScope;
  }

  /**
   * Check return statement
   */
  visitReturnStmt(node) {
    if (!this.currentFunctionReturnType) {
      if (node.expr) {
        this.visitNode(node.expr);
      }
      return;
    }

    if (!node.expr) {
      // Return without value - check if function expects void/no return
      return;
    }

    const returnType = this.inferType(node.expr);
    if (!returnType) {
      this.visitNode(node.expr);
      return;
    }

    if (!this.typesMatch(returnType, this.currentFunctionReturnType)) {
      this.reportError(new InvalidReturnTypeError(
        `Return type mismatch: expected ${formatType(this.currentFunctionReturnType)}, got ${formatType(returnType)}`,
        node,
        this.currentFunctionReturnType,
        returnType
      ));
    }

    this.visitNode(node.expr);
  }

  /**
   * Check function call
   */
  visitCallExpr(node) {
    this.visitNode(node.callee);

    // Only check if callee is an identifier with type info
    if (node.callee.kind !== NodeKinds.Identifier) {
      for (const arg of node.args) {
        this.visitNode(arg);
      }
      return;
    }

    const fnSymbol = this.currentScope.resolve(node.callee.name);
    if (!fnSymbol || !fnSymbol.typeDescriptor || fnSymbol.typeDescriptor.kind !== TypeKind.Function) {
      for (const arg of node.args) {
        this.visitNode(arg);
      }
      return;
    }

    const paramTypes = fnSymbol.typeDescriptor.paramTypes;
    if (!paramTypes) {
      for (const arg of node.args) {
        this.visitNode(arg);
      }
      return;
    }

    // Check each argument against parameter type
    for (let i = 0; i < Math.min(node.args.length, paramTypes.length); i++) {
      const arg = node.args[i];
      const paramType = paramTypes[i];

      if (!paramType) {
        this.visitNode(arg);
        continue;
      }

      const argType = this.inferType(arg);
      if (!argType) {
        this.visitNode(arg);
        continue;
      }

      if (!this.typesMatch(argType, paramType)) {
        this.reportError(new InvalidArgumentTypeError(
          `Argument type mismatch at position ${i}: expected ${formatType(paramType)}, got ${formatType(argType)}`,
          arg,
          i,
          paramType,
          argType
        ));
      }

      this.visitNode(arg);
    }
  }

  /**
   * Infer type from an expression
   * Returns null if type cannot be inferred (conservative approach)
   */
  inferType(node) {
    if (!node || !node.kind) return null;

    switch (node.kind) {
      case NodeKinds.NumberLiteral:
        // Check if it's an integer or float
        if (Number.isInteger(node.value)) {
          return { kind: TypeKind.Int };
        }
        return { kind: TypeKind.Float };

      case NodeKinds.StringLiteral:
        return { kind: TypeKind.String };

      case NodeKinds.BooleanLiteral:
        return { kind: TypeKind.Bool };

      case NodeKinds.NullLiteral:
        return { kind: TypeKind.Null };

      case NodeKinds.Identifier: {
        const symbol = this.currentScope.resolve(node.name);
        if (symbol && symbol.typeDescriptor) {
          return symbol.typeDescriptor;
        }
        return null;
      }

      case NodeKinds.ArrayExpr:
        // Conservative: don't infer array element types
        return { kind: TypeKind.Array };

      case NodeKinds.ObjectExpr:
        return { kind: TypeKind.Object };

      case NodeKinds.ArrowFn:
      case NodeKinds.FnDecl:
        return { kind: TypeKind.Function };

      default:
        // For complex expressions, return null (conservative)
        return null;
    }
  }

  /**
   * Check if two types match
   */
  typesMatch(actual, expected) {
    if (!actual || !expected) return false;

    // Kind must match
    if (actual.kind !== expected.kind) {
      return false;
    }

    // For generic types, check element/result types
    switch (expected.kind) {
      case TypeKind.Channel:
        if (expected.elementType) {
          if (!actual.elementType) return false;
          return this.typesMatch(actual.elementType, expected.elementType);
        }
        return true;

      case TypeKind.Array:
        if (expected.elementType) {
          if (!actual.elementType) return false;
          return this.typesMatch(actual.elementType, expected.elementType);
        }
        return true;

      case TypeKind.Task:
        if (expected.resultType) {
          if (!actual.resultType) return false;
          return this.typesMatch(actual.resultType, expected.resultType);
        }
        return true;

      default:
        return true;
    }
  }

  // Visit pass-through nodes
  visitIfStmt(node) {
    this.visitNode(node.test);
    this.visitNode(node.consequent);
    if (node.alternate) this.visitNode(node.alternate);
  }

  visitWhileStmt(node) {
    const parentScope = this.currentScope;
    const childScopes = parentScope.children.filter(s => s.type === 'block');
    if (childScopes.length > 0) {
      this.currentScope = childScopes.shift();
    }

    this.visitNode(node.test);
    this.visitNode(node.body);

    this.currentScope = parentScope;
  }

  visitForStmt(node) {
    const parentScope = this.currentScope;
    const childScopes = parentScope.children.filter(s => s.type === 'block');
    if (childScopes.length > 0) {
      this.currentScope = childScopes.shift();
    }

    if (node.init) this.visitNode(node.init);
    if (node.test) this.visitNode(node.test);
    if (node.update) this.visitNode(node.update);
    this.visitNode(node.body);

    this.currentScope = parentScope;
  }

  visitForOfStmt(node) {
    const parentScope = this.currentScope;
    const childScopes = parentScope.children.filter(s => s.type === 'block');
    if (childScopes.length > 0) {
      this.currentScope = childScopes.shift();
    }

    this.visitNode(node.variable);
    this.visitNode(node.iterable);
    this.visitNode(node.body);

    this.currentScope = parentScope;
  }

  visitForAwaitStmt(node) {
    this.visitForOfStmt(node);
  }

  visitForInStmt(node) {
    this.visitForOfStmt(node);
  }

  visitSwitchStmt(node) {
    this.visitNode(node.discriminant);

    const parentScope = this.currentScope;
    const childScopes = parentScope.children.filter(s => s.type === 'block');
    if (childScopes.length > 0) {
      this.currentScope = childScopes.shift();
    }

    for (const caseNode of node.cases) {
      if (caseNode.test) this.visitNode(caseNode.test);
      for (const stmt of caseNode.consequent) {
        this.visitNode(stmt);
      }
    }

    this.currentScope = parentScope;
  }

  visitTryStmt(node) {
    this.visitNode(node.body);

    if (node.handler) {
      const parentScope = this.currentScope;
      const childScopes = parentScope.children.filter(s => s.type === 'block');
      if (childScopes.length > 0) {
        this.currentScope = childScopes.shift();
      }

      this.visitNode(node.handler.body);
      this.currentScope = parentScope;
    }

    if (node.finalizer) {
      this.visitNode(node.finalizer);
    }
  }

  visitExprStmt(node) {
    this.visitNode(node.expr);
  }

  visitBinaryExpr(node) {
    this.visitNode(node.left);
    this.visitNode(node.right);
  }

  visitUnaryExpr(node) {
    this.visitNode(node.argument);
  }

  visitUpdateExpr(node) {
    this.visitNode(node.argument);
  }

  visitTernaryExpr(node) {
    this.visitNode(node.test);
    this.visitNode(node.consequent);
    this.visitNode(node.alternate);
  }

  visitNewExpr(node) {
    this.visitNode(node.callee);
    for (const arg of node.args) {
      this.visitNode(arg);
    }
  }

  visitMemberExpr(node) {
    this.visitNode(node.object);
  }

  visitOptionalMemberExpr(node) {
    this.visitNode(node.object);
  }

  visitIndexExpr(node) {
    this.visitNode(node.object);
    this.visitNode(node.index);
  }

  visitArrayExpr(node) {
    for (const elem of node.elements) {
      this.visitNode(elem);
    }
  }

  visitObjectExpr(node) {
    for (const prop of node.properties) {
      if (prop && prop.kind) {
        this.visitNode(prop);
      } else if (prop && prop.value) {
        this.visitNode(prop.value);
        if (prop.computed && prop.key) {
          this.visitNode(prop.key);
        }
      }
    }
  }

  visitSpreadElement(node) {
    this.visitNode(node.argument);
  }

  visitSpreadProperty(node) {
    this.visitNode(node.argument);
  }

  visitYieldExpr(node) {
    if (node.argument) this.visitNode(node.argument);
  }

  visitSpawnExpr(node) {
    this.visitNode(node.argument);
  }

  visitSelectExpr(node) {
    for (const caseNode of node.cases) {
      if (caseNode.channel) this.visitNode(caseNode.channel);
      if (caseNode.value) this.visitNode(caseNode.value);
      if (caseNode.body) {
        for (const stmt of caseNode.body) {
          this.visitNode(stmt);
        }
      }
    }
    if (node.defaultCase && node.defaultCase.body) {
      for (const stmt of node.defaultCase.body) {
        this.visitNode(stmt);
      }
    }
  }

  visitImportExpr(node) {
    this.visitNode(node.source);
  }

  visitClassDecl(node) {
    const parentScope = this.currentScope;
    for (const method of node.methods) {
      const fnScopes = parentScope.children.filter(s => s.type === 'function');
      if (fnScopes.length > 0) {
        this.currentScope = fnScopes.shift();
      }
      this.visitNode(method.body);
      this.currentScope = parentScope;
    }
  }

  visitExportDefault(node) {
    if (node.expr) this.visitNode(node.expr);
  }

  visitExportDecl(node) {
    if (node.declaration) this.visitNode(node.declaration);
  }

  visitThrowStmt(node) {
    this.visitNode(node.expr);
  }

  visitViewDecl(node) {
    const parentScope = this.currentScope;
    const fnScopes = parentScope.children.filter(s => s.type === 'function');
    if (fnScopes.length > 0) {
      this.currentScope = fnScopes.shift();
    }
    this.visitNode(node.body);
    this.currentScope = parentScope;
  }

  // No-op visitors for leaf nodes
  visitIdentifier() {}
  visitNumberLiteral() {}
  visitStringLiteral() {}
  visitBooleanLiteral() {}
  visitNullLiteral() {}
  visitTemplateLiteral() {}
  visitBreakStmt() {}
  visitContinueStmt() {}
  visitImportDecl() {}
  visitExportAll() {}
  visitExportNamed() {}
  visitContractDecl() {}
}
