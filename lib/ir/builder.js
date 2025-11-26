/**
 * IR Builder
 *
 * Lowers AST to IR (three-address code).
 * This stage implements basic lowering for a safe subset of AST nodes.
 */

import { NodeKinds } from '../ast/types.js';
import { InstructionKinds, OperandKinds } from './instructions.js';

class UnsupportedNodeKindError extends Error {
  constructor(kind) {
    super(`Unsupported AST node kind for IR lowering: ${kind}`);
    this.nodeKind = kind;
  }
}

export class IRBuilder {
  constructor() {
    this.registerCounter = 0;
    this.blockCounter = 0;
    this.currentFunction = null;
    this.currentBlock = null;
    this.symbolMap = new Map(); // variable name -> Register
  }

  /**
   * Allocate a new register
   * @param {string} [debugName]
   * @returns {Object} Register operand
   */
  allocRegister(debugName) {
    const reg = {
      kind: OperandKinds.Register,
      id: this.registerCounter++,
    };
    if (debugName) {
      reg.debugName = debugName;
    }
    return reg;
  }

  /**
   * Create a constant operand
   * @param {number|string|boolean|null} value
   * @returns {Object}
   */
  createConstant(value) {
    return {
      kind: OperandKinds.Constant,
      value,
    };
  }

  /**
   * Create a global operand
   * @param {string} name
   * @returns {Object}
   */
  createGlobal(name) {
    return {
      kind: OperandKinds.Global,
      name,
    };
  }

  /**
   * Create a new basic block
   * @param {string} [label]
   * @returns {Object}
   */
  createBlock(label) {
    const id = this.blockCounter++;
    const blockLabel = label || `bb${id}`;
    return {
      id,
      label: blockLabel,
      instructions: [],
    };
  }

  /**
   * Emit an instruction to the current block
   * @param {Object} instruction
   */
  emit(instruction) {
    if (!this.currentBlock) {
      throw new Error('No current block to emit instruction');
    }
    this.currentBlock.instructions.push(instruction);
  }

  /**
   * Lower a Program node to IR module
   * @param {Object} ast - Program node
   * @returns {Object} IR module
   */
  lowerProgram(ast) {
    if (ast.kind !== NodeKinds.Program) {
      throw new Error('Expected Program node');
    }

    const functions = [];

    for (const stmt of ast.body) {
      if (stmt.kind === NodeKinds.FnDecl) {
        functions.push(this.lowerFunction(stmt));
      } else if (stmt.kind === NodeKinds.VarDecl || stmt.kind === NodeKinds.ExprStmt) {
        // Top-level statements - skip for now
        // In full implementation, these would go into module init
      } else {
        throw new UnsupportedNodeKindError(stmt.kind);
      }
    }

    return {
      kind: 'IRModule',
      functions,
    };
  }

  /**
   * Lower a function declaration
   * @param {Object} node - FnDecl node
   * @returns {Object} IRFunction
   */
  lowerFunction(node) {
    // Reset state for new function
    this.registerCounter = 0;
    this.blockCounter = 0;
    this.symbolMap = new Map();

    // Create function object
    const func = {
      name: node.name,
      params: [],
      blocks: [],
      registerCount: 0,
    };

    this.currentFunction = func;

    // Allocate registers for parameters
    for (const param of node.params) {
      const reg = this.allocRegister(param.name);
      func.params.push(reg);
      this.symbolMap.set(param.name, reg);
    }

    // Create entry block
    const entryBlock = this.createBlock('entry');
    func.blocks.push(entryBlock);
    this.currentBlock = entryBlock;

    // Lower function body
    this.lowerBlock(node.body);

    // Set final register count
    func.registerCount = this.registerCounter;

    this.currentFunction = null;
    this.currentBlock = null;

    return func;
  }

  /**
   * Lower a Block statement
   * @param {Object} node
   */
  lowerBlock(node) {
    if (node.kind !== NodeKinds.Block) {
      throw new Error('Expected Block node');
    }

    for (const stmt of node.statements) {
      this.lowerStatement(stmt);
    }
  }

  /**
   * Lower a statement
   * @param {Object} node
   */
  lowerStatement(node) {
    switch (node.kind) {
      case NodeKinds.VarDecl:
        this.lowerVarDecl(node);
        break;
      case NodeKinds.ReturnStmt:
        this.lowerReturn(node);
        break;
      case NodeKinds.ExprStmt:
        // Evaluate expression for side effects, discard result
        this.lowerExpression(node.expr);
        break;
      default:
        throw new UnsupportedNodeKindError(node.kind);
    }
  }

  /**
   * Lower a variable declaration
   * @param {Object} node
   */
  lowerVarDecl(node) {
    // Only support simple identifiers, not patterns
    if (typeof node.name !== 'string') {
      throw new UnsupportedNodeKindError('VarDecl with pattern');
    }

    const reg = this.allocRegister(node.name);
    this.symbolMap.set(node.name, reg);

    if (node.init) {
      const valueReg = this.lowerExpression(node.init);
      this.emit({
        kind: InstructionKinds.Assign,
        dest: reg,
        value: valueReg,
      });
    }
  }

  /**
   * Lower a return statement
   * @param {Object} node
   */
  lowerReturn(node) {
    let value = null;
    if (node.expr) {
      value = this.lowerExpression(node.expr);
    }

    this.emit({
      kind: InstructionKinds.Return,
      value,
    });
  }

  /**
   * Lower an expression
   * @param {Object} node
   * @returns {Object} Operand (Register or Constant)
   */
  lowerExpression(node) {
    switch (node.kind) {
      case NodeKinds.Identifier:
        return this.lowerIdentifier(node);
      case NodeKinds.NumberLiteral:
        return this.createConstant(node.value);
      case NodeKinds.StringLiteral:
        return this.createConstant(node.value);
      case NodeKinds.BooleanLiteral:
        return this.createConstant(node.value);
      case NodeKinds.NullLiteral:
        return this.createConstant(null);
      case NodeKinds.BinaryExpr:
        return this.lowerBinaryExpr(node);
      case NodeKinds.CallExpr:
        return this.lowerCallExpr(node);
      case NodeKinds.MemberExpr:
        return this.lowerMemberExpr(node);
      case NodeKinds.ArrayExpr:
        return this.lowerArrayExpr(node);
      case NodeKinds.ObjectExpr:
        return this.lowerObjectExpr(node);
      default:
        throw new UnsupportedNodeKindError(node.kind);
    }
  }

  /**
   * Lower an identifier
   * @param {Object} node
   * @returns {Object}
   */
  lowerIdentifier(node) {
    if (this.symbolMap.has(node.name)) {
      return this.symbolMap.get(node.name);
    }
    // Unknown identifier - treat as global
    return this.createGlobal(node.name);
  }

  /**
   * Lower a binary expression
   * @param {Object} node
   * @returns {Object}
   */
  lowerBinaryExpr(node) {
    const left = this.lowerExpression(node.left);
    const right = this.lowerExpression(node.right);
    const dest = this.allocRegister();

    this.emit({
      kind: InstructionKinds.BinaryOp,
      dest,
      op: node.op,
      left,
      right,
    });

    return dest;
  }

  /**
   * Lower a call expression
   * @param {Object} node
   * @returns {Object}
   */
  lowerCallExpr(node) {
    const callee = this.lowerExpression(node.callee);
    const args = node.args.map(arg => this.lowerExpression(arg));
    const dest = this.allocRegister();

    this.emit({
      kind: InstructionKinds.Call,
      dest,
      callee,
      args,
    });

    return dest;
  }

  /**
   * Lower a member expression
   * @param {Object} node
   * @returns {Object}
   */
  lowerMemberExpr(node) {
    const obj = this.lowerExpression(node.object);
    const dest = this.allocRegister();

    this.emit({
      kind: InstructionKinds.GetProperty,
      dest,
      object: obj,
      property: node.property,
    });

    return dest;
  }

  /**
   * Lower an array expression
   * @param {Object} node
   * @returns {Object}
   */
  lowerArrayExpr(node) {
    const elements = node.elements.map(elem => this.lowerExpression(elem));
    const dest = this.allocRegister();

    this.emit({
      kind: InstructionKinds.CreateArray,
      dest,
      elements,
    });

    return dest;
  }

  /**
   * Lower an object expression
   * @param {Object} node
   * @returns {Object}
   */
  lowerObjectExpr(node) {
    const properties = [];

    for (const prop of node.properties) {
      // Only support simple key-value properties for now
      if (prop.kind) {
        // SpreadProperty - not supported yet
        throw new UnsupportedNodeKindError('SpreadProperty');
      }

      const value = this.lowerExpression(prop.value);
      properties.push({
        key: prop.key,
        value,
      });
    }

    const dest = this.allocRegister();

    this.emit({
      kind: InstructionKinds.CreateObject,
      dest,
      properties,
    });

    return dest;
  }
}

/**
 * Lower an AST program to IR module
 * @param {Object} ast - Program node
 * @returns {Object} IR module
 */
export function lowerProgram(ast) {
  const builder = new IRBuilder();
  return builder.lowerProgram(ast);
}
