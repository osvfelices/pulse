/**
 * Semantic Analyzer
 *
 * Performs semantic analysis on validated AST:
 * - Builds symbol tables
 * - Checks variable declarations and references
 * - Validates scope rules (return, break, continue)
 * - Detects temporal dead zone violations
 * - Validates const assignments
 */

import { Scope } from './scope.js';
import { Symbol, SymbolTable } from './symbol-table.js';
import {
  UndefinedVariableError,
  DuplicateDeclarationError,
  AssignmentToConstError,
  TemporalDeadZoneError,
  InvalidReturnError,
  InvalidBreakError,
  InvalidContinueError,
} from './errors.js';
import { NodeKinds } from '../ast/types.js';

export class SemanticAnalyzer {
  constructor(options = {}) {
    this.strict = options.strict || false;
    this.errors = [];
    this.warnings = [];
    this.globalScope = null;
    this.currentScope = null;
  }

  /**
   * Analyze an AST
   * @param {Object} ast - Program node
   * @returns {Object} { valid, errors, warnings }
   */
  analyze(ast) {
    this.errors = [];
    this.warnings = [];
    this.globalScope = new Scope('module', null);
    this.currentScope = this.globalScope;

    try {
      this.visitNode(ast);
    } catch (err) {
      if (err.code && err.code.startsWith('SEMANTIC')) {
        this.errors.push(err);
      } else {
        throw err;
      }
    }

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      scope: this.globalScope,
    };
  }

  /**
   * Report an error
   * @param {Error} error
   */
  reportError(error) {
    this.errors.push(error);
    if (this.strict) {
      throw error;
    }
  }

  /**
   * Visit a node
   * @param {Object} node
   */
  visitNode(node) {
    if (!node || !node.kind) return;

    const visitor = this[`visit${node.kind}`];
    if (visitor) {
      visitor.call(this, node);
    }
  }

  /**
   * Visit Program
   */
  visitProgram(node) {
    for (const stmt of node.body) {
      this.visitNode(stmt);
    }
  }

  /**
   * Visit Block
   */
  visitBlock(node) {
    const parentScope = this.currentScope;
    this.currentScope = parentScope.createChild('block');

    for (const stmt of node.statements) {
      this.visitNode(stmt);
    }

    this.currentScope = parentScope;
  }

  /**
   * Visit FnDecl
   */
  visitFnDecl(node) {
    // Declare function in current scope
    if (node.name) {
      const symbol = new Symbol(node.name, 'function', node, this.currentScope);
      if (!this.currentScope.define(node.name, symbol)) {
        const existing = this.currentScope.resolve(node.name);
        this.reportError(new DuplicateDeclarationError(node.name, node, existing));
      }
    }

    // Create function scope
    const parentScope = this.currentScope;
    this.currentScope = parentScope.createChild('function');

    // Add parameters to function scope
    for (const param of node.params) {
      if (param.name) {
        const paramSymbol = new Symbol(param.name, 'param', param, this.currentScope);
        if (!this.currentScope.define(param.name, paramSymbol)) {
          const existing = this.currentScope.resolve(param.name);
          this.reportError(new DuplicateDeclarationError(param.name, param, existing));
        }
      }
    }

    // Visit function body
    this.visitNode(node.body);

    this.currentScope = parentScope;
  }

  /**
   * Visit VarDecl
   */
  visitVarDecl(node) {
    const kind = node.constant ? 'const' : 'var';
    const name = typeof node.name === 'string' ? node.name : null;

    if (name) {
      // Define symbol first (uninitialized for TDZ detection)
      const symbol = new Symbol(name, kind, node, this.currentScope);
      symbol.initialized = false; // Explicitly mark as uninitialized for let/const

      if (!this.currentScope.define(name, symbol)) {
        const existing = this.currentScope.resolve(name);
        this.reportError(new DuplicateDeclarationError(name, node, existing));
      }

      // Visit init expression (this may reference the uninitialized variable)
      if (node.init) {
        this.visitNode(node.init);
      }

      // Now mark as initialized
      symbol.markInitialized();
    } else if (node.name && node.name.kind) {
      // Pattern destructuring - define all variables first, then visit init
      const symbols = this.definePatternSymbols(node.name, kind);

      if (node.init) {
        this.visitNode(node.init);
      }

      // Mark all pattern variables as initialized
      for (const sym of symbols) {
        sym.markInitialized();
      }
    }
  }

  /**
   * Define symbols for destructuring pattern (without initializing)
   */
  definePatternSymbols(pattern, kind) {
    const symbols = [];

    if (pattern.kind === NodeKinds.ArrayPattern) {
      for (const elem of pattern.elements) {
        if (typeof elem === 'string') {
          const symbol = new Symbol(elem, kind, pattern, this.currentScope);
          symbol.initialized = false;
          if (!this.currentScope.define(elem, symbol)) {
            const existing = this.currentScope.resolve(elem);
            this.reportError(new DuplicateDeclarationError(elem, pattern, existing));
          }
          symbols.push(symbol);
        } else if (elem && elem.kind === NodeKinds.RestElement) {
          const symbol = new Symbol(elem.name, kind, elem, this.currentScope);
          symbol.initialized = false;
          if (!this.currentScope.define(elem.name, symbol)) {
            const existing = this.currentScope.resolve(elem.name);
            this.reportError(new DuplicateDeclarationError(elem.name, elem, existing));
          }
          symbols.push(symbol);
        }
      }
    } else if (pattern.kind === NodeKinds.ObjectPattern) {
      for (const prop of pattern.properties) {
        const localName = typeof prop.value === 'string' ? prop.value : prop.key;
        const symbol = new Symbol(localName, kind, pattern, this.currentScope);
        symbol.initialized = false;
        if (!this.currentScope.define(localName, symbol)) {
          const existing = this.currentScope.resolve(localName);
          this.reportError(new DuplicateDeclarationError(localName, pattern, existing));
        }
        symbols.push(symbol);
      }
    }

    return symbols;
  }


  /**
   * Visit ClassDecl
   */
  visitClassDecl(node) {
    const symbol = new Symbol(node.name, 'class', node, this.currentScope);
    if (!this.currentScope.define(node.name, symbol)) {
      const existing = this.currentScope.resolve(node.name);
      this.reportError(new DuplicateDeclarationError(node.name, node, existing));
    }

    // Visit methods
    const parentScope = this.currentScope;
    for (const method of node.methods) {
      this.currentScope = parentScope.createChild('function');

      // Add parameters
      for (const param of method.params) {
        if (param.name) {
          const paramSymbol = new Symbol(param.name, 'param', param, this.currentScope);
          this.currentScope.define(param.name, paramSymbol);
        }
      }

      this.visitNode(method.body);
      this.currentScope = parentScope;
    }
  }

  /**
   * Visit ReturnStmt
   */
  visitReturnStmt(node) {
    if (!this.currentScope.canReturn()) {
      this.reportError(new InvalidReturnError(node));
    }
    if (node.expr) {
      this.visitNode(node.expr);
    }
  }

  /**
   * Visit BreakStmt
   */
  visitBreakStmt(node) {
    if (!this.currentScope.canBreak()) {
      this.reportError(new InvalidBreakError(node));
    }
  }

  /**
   * Visit ContinueStmt
   */
  visitContinueStmt(node) {
    if (!this.currentScope.canContinue()) {
      this.reportError(new InvalidContinueError(node));
    }
  }

  /**
   * Visit IfStmt
   */
  visitIfStmt(node) {
    this.visitNode(node.test);
    this.visitNode(node.consequent);
    if (node.alternate) {
      this.visitNode(node.alternate);
    }
  }

  /**
   * Visit WhileStmt
   */
  visitWhileStmt(node) {
    const parentScope = this.currentScope;
    this.currentScope = parentScope.createChild('block');
    this.currentScope.allowBreak = true;
    this.currentScope.allowContinue = true;

    this.visitNode(node.test);
    this.visitNode(node.body);

    this.currentScope = parentScope;
  }

  /**
   * Visit ForStmt
   */
  visitForStmt(node) {
    const parentScope = this.currentScope;
    this.currentScope = parentScope.createChild('block');
    this.currentScope.allowBreak = true;
    this.currentScope.allowContinue = true;

    if (node.init) this.visitNode(node.init);
    if (node.test) this.visitNode(node.test);
    if (node.update) this.visitNode(node.update);
    this.visitNode(node.body);

    this.currentScope = parentScope;
  }

  /**
   * Visit ForOfStmt
   */
  visitForOfStmt(node) {
    const parentScope = this.currentScope;
    this.currentScope = parentScope.createChild('block');
    this.currentScope.allowBreak = true;
    this.currentScope.allowContinue = true;

    this.visitNode(node.variable);
    this.visitNode(node.iterable);
    this.visitNode(node.body);

    this.currentScope = parentScope;
  }

  /**
   * Visit ForAwaitStmt
   */
  visitForAwaitStmt(node) {
    this.visitForOfStmt(node);
  }

  /**
   * Visit ForInStmt
   */
  visitForInStmt(node) {
    this.visitForOfStmt(node);
  }

  /**
   * Visit SwitchStmt
   */
  visitSwitchStmt(node) {
    this.visitNode(node.discriminant);

    const parentScope = this.currentScope;
    this.currentScope = parentScope.createChild('block');
    this.currentScope.allowBreak = true;

    for (const caseNode of node.cases) {
      if (caseNode.test) {
        this.visitNode(caseNode.test);
      }
      for (const stmt of caseNode.consequent) {
        this.visitNode(stmt);
      }
    }

    this.currentScope = parentScope;
  }

  /**
   * Visit TryStmt
   */
  visitTryStmt(node) {
    this.visitNode(node.body);

    if (node.handler) {
      const parentScope = this.currentScope;
      this.currentScope = parentScope.createChild('block');

      // Define catch parameter
      if (node.handler.param) {
        const symbol = new Symbol(node.handler.param, 'param', node.handler, this.currentScope);
        this.currentScope.define(node.handler.param, symbol);
      }

      this.visitNode(node.handler.body);
      this.currentScope = parentScope;
    }

    if (node.finalizer) {
      this.visitNode(node.finalizer);
    }
  }

  /**
   * Visit ExprStmt
   */
  visitExprStmt(node) {
    this.visitNode(node.expr);
  }

  /**
   * Visit BinaryExpr
   */
  visitBinaryExpr(node) {
    // Check for assignment to const
    if (node.op === '=' && node.left.kind === NodeKinds.Identifier) {
      const symbol = this.currentScope.resolve(node.left.name);
      if (symbol) {
        if (symbol.isConst()) {
          this.reportError(new AssignmentToConstError(node.left.name, node));
        }
        symbol.addReference(node.left);
      } else {
        this.reportError(new UndefinedVariableError(node.left.name, node.left));
      }
    }

    this.visitNode(node.left);
    this.visitNode(node.right);
  }

  /**
   * Visit UnaryExpr
   */
  visitUnaryExpr(node) {
    this.visitNode(node.argument);
  }

  /**
   * Visit UpdateExpr
   */
  visitUpdateExpr(node) {
    if (node.argument.kind === NodeKinds.Identifier) {
      const symbol = this.currentScope.resolve(node.argument.name);
      if (symbol) {
        if (symbol.isConst()) {
          this.reportError(new AssignmentToConstError(node.argument.name, node));
        }
        symbol.addReference(node.argument);
      } else {
        this.reportError(new UndefinedVariableError(node.argument.name, node.argument));
      }
    }
    this.visitNode(node.argument);
  }

  /**
   * Visit TernaryExpr
   */
  visitTernaryExpr(node) {
    this.visitNode(node.test);
    this.visitNode(node.consequent);
    this.visitNode(node.alternate);
  }

  /**
   * Visit CallExpr
   */
  visitCallExpr(node) {
    this.visitNode(node.callee);
    for (const arg of node.args) {
      this.visitNode(arg);
    }
  }

  /**
   * Visit NewExpr
   */
  visitNewExpr(node) {
    this.visitNode(node.callee);
    for (const arg of node.args) {
      this.visitNode(arg);
    }
  }

  /**
   * Visit MemberExpr
   */
  visitMemberExpr(node) {
    this.visitNode(node.object);
  }

  /**
   * Visit OptionalMemberExpr
   */
  visitOptionalMemberExpr(node) {
    this.visitNode(node.object);
  }

  /**
   * Visit IndexExpr
   */
  visitIndexExpr(node) {
    this.visitNode(node.object);
    this.visitNode(node.index);
  }

  /**
   * Visit ArrayExpr
   */
  visitArrayExpr(node) {
    for (const elem of node.elements) {
      this.visitNode(elem);
    }
  }

  /**
   * Visit ObjectExpr
   */
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

  /**
   * Visit ArrowFn
   */
  visitArrowFn(node) {
    const parentScope = this.currentScope;
    this.currentScope = parentScope.createChild('function');

    // Add parameters
    for (const param of node.params) {
      if (typeof param === 'string') {
        const symbol = new Symbol(param, 'param', node, this.currentScope);
        this.currentScope.define(param, symbol);
      } else if (param.name) {
        const symbol = new Symbol(param.name, 'param', param, this.currentScope);
        this.currentScope.define(param.name, symbol);
      }
    }

    // Visit body (expression or block)
    this.visitNode(node.body);

    this.currentScope = parentScope;
  }

  /**
   * Visit Identifier
   */
  visitIdentifier(node) {
    const symbol = this.currentScope.resolve(node.name);
    if (!symbol) {
      // Check if it's a known global
      if (!this.isKnownGlobal(node.name)) {
        this.reportError(new UndefinedVariableError(node.name, node));
      }
    } else {
      // Check TDZ
      if (!symbol.initialized) {
        this.reportError(new TemporalDeadZoneError(node.name, node));
      }
      symbol.addReference(node);
    }
  }

  /**
   * Visit SpreadElement
   */
  visitSpreadElement(node) {
    this.visitNode(node.argument);
  }

  /**
   * Visit SpreadProperty
   */
  visitSpreadProperty(node) {
    this.visitNode(node.argument);
  }

  /**
   * Visit YieldExpr
   */
  visitYieldExpr(node) {
    if (node.argument) {
      this.visitNode(node.argument);
    }
  }

  /**
   * Visit SpawnExpr
   */
  visitSpawnExpr(node) {
    this.visitNode(node.argument);
  }

  /**
   * Visit SelectExpr
   */
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

  /**
   * Visit ImportExpr
   */
  visitImportExpr(node) {
    this.visitNode(node.source);
  }

  /**
   * Visit TemplateLiteral
   */
  visitTemplateLiteral(node) {
    // Template literals are just strings, no semantic analysis needed
  }

  /**
   * Check if a name is a known global
   * @param {string} name
   * @returns {boolean}
   */
  isKnownGlobal(name) {
    const knownGlobals = [
      'console', 'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number',
      'Boolean', 'RegExp', 'Error', 'TypeError', 'Promise', 'Set', 'Map',
      'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'setTimeout', 'setInterval',
      'clearTimeout', 'clearInterval', 'undefined', 'null', 'globalThis',
      'process', 'Buffer', 'global', '__dirname', '__filename', 'require',
      'module', 'exports', 'import', 'export', 'print',
    ];
    return knownGlobals.includes(name);
  }

  // Visit no-op nodes
  visitNumberLiteral() {}
  visitStringLiteral() {}
  visitBooleanLiteral() {}
  visitNullLiteral() {}

  /**
   * Visit ImportDecl - register imported names
   */
  visitImportDecl(node) {
    // Register default import
    if (node.default) {
      const symbol = new Symbol(node.default, 'var', node, this.currentScope);
      this.currentScope.define(node.default, symbol);
    }

    // Register namespace import
    if (node.namespace) {
      const symbol = new Symbol(node.namespace, 'var', node, this.currentScope);
      this.currentScope.define(node.namespace, symbol);
    }

    // Register named imports
    if (node.named) {
      for (const spec of node.named) {
        const localName = spec.local || spec.imported;
        const symbol = new Symbol(localName, 'var', node, this.currentScope);
        this.currentScope.define(localName, symbol);
      }
    }
  }

  visitExportDefault(node) { if (node.expr) this.visitNode(node.expr); }
  visitExportAll() {}
  visitExportNamed() {}
  visitExportDecl(node) { if (node.declaration) this.visitNode(node.declaration); }
  visitThrowStmt(node) { this.visitNode(node.expr); }
  visitContractDecl() {}
  visitViewDecl(node) {
    const parentScope = this.currentScope;
    this.currentScope = parentScope.createChild('function');
    for (const param of node.params) {
      if (param.name) {
        const symbol = new Symbol(param.name, 'param', param, this.currentScope);
        this.currentScope.define(param.name, symbol);
      }
    }
    this.visitNode(node.body);
    this.currentScope = parentScope;
  }
}
