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
    this.loopStack = []; // Stack of loop contexts for break/continue
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
   * Add an existing block to function and make it current
   * @param {string} label - Block label to switch to
   */
  beginBlock(label) {
    // Find the block with this label in the function
    const block = this.currentFunction.blocks.find(b => b.label === label);
    if (!block) {
      throw new Error(`Block with label ${label} not found`);
    }
    this.currentBlock = block;
  }

  /**
   * Add a block to the current function
   * @param {Object} block
   */
  addBlock(block) {
    this.currentFunction.blocks.push(block);
  }

  /**
   * Switch to an existing block
   * @param {Object} block
   */
  switchToBlock(block) {
    this.currentBlock = block;
  }

  /**
   * Enter a loop context for break/continue tracking
   * @param {string} breakLabel - Label to jump to on break
   * @param {string} continueLabel - Label to jump to on continue
   */
  enterLoop(breakLabel, continueLabel) {
    this.loopStack.push({ breakLabel, continueLabel });
  }

  /**
   * Exit the current loop context
   */
  exitLoop() {
    if (this.loopStack.length === 0) {
      throw new Error('No loop to exit');
    }
    this.loopStack.pop();
  }

  /**
   * Get the current loop context
   * @returns {Object|null}
   */
  getCurrentLoop() {
    if (this.loopStack.length === 0) {
      return null;
    }
    return this.loopStack[this.loopStack.length - 1];
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
    this.loopStack = [];

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
      case NodeKinds.IfStmt:
        this.lowerIf(node);
        break;
      case NodeKinds.WhileStmt:
        this.lowerWhile(node);
        break;
      case NodeKinds.ForStmt:
        this.lowerFor(node);
        break;
      case NodeKinds.ForOfStmt:
        this.lowerForOf(node);
        break;
      case NodeKinds.ForInStmt:
        this.lowerForIn(node);
        break;
      case NodeKinds.BreakStmt:
        this.lowerBreak(node);
        break;
      case NodeKinds.ContinueStmt:
        this.lowerContinue(node);
        break;
      case NodeKinds.Block:
        this.lowerBlock(node);
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
   * Lower an if statement
   * @param {Object} node
   */
  lowerIf(node) {
    // Evaluate condition
    const conditionReg = this.lowerExpression(node.test);

    // Create blocks
    const thenBlock = this.createBlock('if_then');
    const elseBlock = node.alternate ? this.createBlock('if_else') : null;
    const mergeBlock = this.createBlock('if_merge');

    // Add blocks to function
    this.addBlock(thenBlock);
    if (elseBlock) this.addBlock(elseBlock);
    this.addBlock(mergeBlock);

    // Emit conditional jump
    this.emit({
      kind: InstructionKinds.CondJump,
      condition: conditionReg,
      trueTarget: thenBlock.label,
      falseTarget: elseBlock ? elseBlock.label : mergeBlock.label,
    });

    // Lower then branch
    this.beginBlock(thenBlock.label);
    this.lowerStatement(node.consequent);
    // Jump to merge if no terminator
    if (!this.hasTerminator(this.currentBlock)) {
      this.emit({
        kind: InstructionKinds.Jump,
        target: mergeBlock.label,
      });
    }

    // Lower else branch if present
    if (elseBlock) {
      this.beginBlock(elseBlock.label);
      this.lowerStatement(node.alternate);
      // Jump to merge if no terminator
      if (!this.hasTerminator(this.currentBlock)) {
        this.emit({
          kind: InstructionKinds.Jump,
          target: mergeBlock.label,
        });
      }
    }

    // Continue at merge block
    this.beginBlock(mergeBlock.label);
  }

  /**
   * Lower a while statement
   * @param {Object} node
   */
  lowerWhile(node) {
    // Create blocks
    const condBlock = this.createBlock('while_cond');
    const bodyBlock = this.createBlock('while_body');
    const exitBlock = this.createBlock('while_exit');

    // Add blocks to function
    this.addBlock(condBlock);
    this.addBlock(bodyBlock);
    this.addBlock(exitBlock);

    // Jump to condition check
    this.emit({
      kind: InstructionKinds.Jump,
      target: condBlock.label,
    });

    // Condition block
    this.beginBlock(condBlock.label);
    const conditionReg = this.lowerExpression(node.test);
    this.emit({
      kind: InstructionKinds.CondJump,
      condition: conditionReg,
      trueTarget: bodyBlock.label,
      falseTarget: exitBlock.label,
    });

    // Body block
    this.enterLoop(exitBlock.label, condBlock.label);
    this.beginBlock(bodyBlock.label);
    this.lowerStatement(node.body);
    // Jump back to condition if no terminator
    if (!this.hasTerminator(this.currentBlock)) {
      this.emit({
        kind: InstructionKinds.Jump,
        target: condBlock.label,
      });
    }
    this.exitLoop();

    // Continue at exit block
    this.beginBlock(exitBlock.label);
  }

  /**
   * Lower a for statement
   * @param {Object} node
   */
  lowerFor(node) {
    // Lower init
    if (node.init) {
      if (node.init.kind === NodeKinds.VarDecl) {
        this.lowerVarDecl(node.init);
      } else {
        this.lowerExpression(node.init);
      }
    }

    // Create blocks
    const condBlock = this.createBlock('for_cond');
    const bodyBlock = this.createBlock('for_body');
    const updateBlock = this.createBlock('for_update');
    const exitBlock = this.createBlock('for_exit');

    // Add blocks to function
    this.addBlock(condBlock);
    this.addBlock(bodyBlock);
    this.addBlock(updateBlock);
    this.addBlock(exitBlock);

    // Jump to condition
    this.emit({
      kind: InstructionKinds.Jump,
      target: condBlock.label,
    });

    // Condition block
    this.beginBlock(condBlock.label);
    if (node.test) {
      const conditionReg = this.lowerExpression(node.test);
      this.emit({
        kind: InstructionKinds.CondJump,
        condition: conditionReg,
        trueTarget: bodyBlock.label,
        falseTarget: exitBlock.label,
      });
    } else {
      // No condition means infinite loop
      this.emit({
        kind: InstructionKinds.Jump,
        target: bodyBlock.label,
      });
    }

    // Body block
    this.enterLoop(exitBlock.label, updateBlock.label);
    this.beginBlock(bodyBlock.label);
    this.lowerStatement(node.body);
    // Jump to update if no terminator
    if (!this.hasTerminator(this.currentBlock)) {
      this.emit({
        kind: InstructionKinds.Jump,
        target: updateBlock.label,
      });
    }
    this.exitLoop();

    // Update block
    this.beginBlock(updateBlock.label);
    if (node.update) {
      this.lowerExpression(node.update);
    }
    this.emit({
      kind: InstructionKinds.Jump,
      target: condBlock.label,
    });

    // Continue at exit block
    this.beginBlock(exitBlock.label);
  }

  /**
   * Lower a for-of statement
   * @param {Object} node
   */
  lowerForOf(node) {
    // Get iterator from iterable
    const iterableReg = this.lowerExpression(node.iterable);
    const iteratorReg = this.allocRegister('iterator');

    this.emit({
      kind: InstructionKinds.GetIterator,
      dest: iteratorReg,
      iterable: iterableReg,
    });

    // Create blocks
    const condBlock = this.createBlock('forof_cond');
    const bodyBlock = this.createBlock('forof_body');
    const exitBlock = this.createBlock('forof_exit');

    this.addBlock(condBlock);
    this.addBlock(bodyBlock);
    this.addBlock(exitBlock);

    // Jump to condition
    this.emit({
      kind: InstructionKinds.Jump,
      target: condBlock.label,
    });

    // Condition block: get next value
    this.beginBlock(condBlock.label);
    const resultReg = this.allocRegister('iterResult');
    this.emit({
      kind: InstructionKinds.IteratorNext,
      dest: resultReg,
      iterator: iteratorReg,
    });

    // Check if done
    const doneReg = this.allocRegister('done');
    this.emit({
      kind: InstructionKinds.IteratorDone,
      dest: doneReg,
      iteratorResult: resultReg,
    });

    // If done, exit; otherwise continue to body
    this.emit({
      kind: InstructionKinds.CondJump,
      condition: doneReg,
      trueTarget: exitBlock.label,
      falseTarget: bodyBlock.label,
    });

    // Body block
    this.enterLoop(exitBlock.label, condBlock.label);
    this.beginBlock(bodyBlock.label);

    // Extract value and assign to loop variable
    const valueReg = this.allocRegister('value');
    this.emit({
      kind: InstructionKinds.IteratorValue,
      dest: valueReg,
      iteratorResult: resultReg,
    });

    // Assign to loop variable
    if (node.variable.kind === NodeKinds.VarDecl) {
      // for (const x of arr)
      const varName = typeof node.variable.name === 'string' ? node.variable.name : null;
      if (varName) {
        const varReg = this.allocRegister(varName);
        this.symbolMap.set(varName, varReg);
        this.emit({
          kind: InstructionKinds.Assign,
          dest: varReg,
          value: valueReg,
        });
      }
    } else if (node.variable.kind === NodeKinds.Identifier) {
      // for (x of arr) - x already declared
      const varReg = this.symbolMap.get(node.variable.name);
      if (varReg) {
        this.emit({
          kind: InstructionKinds.Assign,
          dest: varReg,
          value: valueReg,
        });
      }
    }

    // Lower body
    this.lowerStatement(node.body);

    // Jump back to condition if no terminator
    if (!this.hasTerminator(this.currentBlock)) {
      this.emit({
        kind: InstructionKinds.Jump,
        target: condBlock.label,
      });
    }

    this.exitLoop();

    // Continue at exit block
    this.beginBlock(exitBlock.label);
  }

  /**
   * Lower a for-in statement
   * @param {Object} node
   */
  lowerForIn(node) {
    // For-in gets keys, similar structure to for-of but semantically different
    // Get iterator from object keys
    const objectReg = this.lowerExpression(node.object);

    // Get keys as array (Object.keys equivalent)
    const keysReg = this.allocRegister('keys');
    this.emit({
      kind: InstructionKinds.Call,
      dest: keysReg,
      callee: this.createGlobal('Object.keys'),
      args: [objectReg],
    });

    // Get iterator from keys array
    const iteratorReg = this.allocRegister('iterator');
    this.emit({
      kind: InstructionKinds.GetIterator,
      dest: iteratorReg,
      iterable: keysReg,
    });

    // Create blocks
    const condBlock = this.createBlock('forin_cond');
    const bodyBlock = this.createBlock('forin_body');
    const exitBlock = this.createBlock('forin_exit');

    this.addBlock(condBlock);
    this.addBlock(bodyBlock);
    this.addBlock(exitBlock);

    // Jump to condition
    this.emit({
      kind: InstructionKinds.Jump,
      target: condBlock.label,
    });

    // Condition block
    this.beginBlock(condBlock.label);
    const resultReg = this.allocRegister('iterResult');
    this.emit({
      kind: InstructionKinds.IteratorNext,
      dest: resultReg,
      iterator: iteratorReg,
    });

    const doneReg = this.allocRegister('done');
    this.emit({
      kind: InstructionKinds.IteratorDone,
      dest: doneReg,
      iteratorResult: resultReg,
    });

    this.emit({
      kind: InstructionKinds.CondJump,
      condition: doneReg,
      trueTarget: exitBlock.label,
      falseTarget: bodyBlock.label,
    });

    // Body block
    this.enterLoop(exitBlock.label, condBlock.label);
    this.beginBlock(bodyBlock.label);

    // Extract key and assign to loop variable
    const keyReg = this.allocRegister('key');
    this.emit({
      kind: InstructionKinds.IteratorValue,
      dest: keyReg,
      iteratorResult: resultReg,
    });

    // Assign to loop variable
    if (node.variable.kind === NodeKinds.VarDecl) {
      const varName = typeof node.variable.name === 'string' ? node.variable.name : null;
      if (varName) {
        const varReg = this.allocRegister(varName);
        this.symbolMap.set(varName, varReg);
        this.emit({
          kind: InstructionKinds.Assign,
          dest: varReg,
          value: keyReg,
        });
      }
    } else if (node.variable.kind === NodeKinds.Identifier) {
      const varReg = this.symbolMap.get(node.variable.name);
      if (varReg) {
        this.emit({
          kind: InstructionKinds.Assign,
          dest: varReg,
          value: keyReg,
        });
      }
    }

    // Lower body
    this.lowerStatement(node.body);

    // Jump back to condition if no terminator
    if (!this.hasTerminator(this.currentBlock)) {
      this.emit({
        kind: InstructionKinds.Jump,
        target: condBlock.label,
      });
    }

    this.exitLoop();

    // Continue at exit block
    this.beginBlock(exitBlock.label);
  }

  /**
   * Lower a break statement
   * @param {Object} node
   */
  lowerBreak(node) {
    const loop = this.getCurrentLoop();
    if (!loop) {
      throw new Error('Break statement outside of loop');
    }

    this.emit({
      kind: InstructionKinds.Jump,
      target: loop.breakLabel,
    });
  }

  /**
   * Lower a continue statement
   * @param {Object} node
   */
  lowerContinue(node) {
    const loop = this.getCurrentLoop();
    if (!loop) {
      throw new Error('Continue statement outside of loop');
    }

    this.emit({
      kind: InstructionKinds.Jump,
      target: loop.continueLabel,
    });
  }

  /**
   * Check if a block has a terminator instruction
   * @param {Object} block
   * @returns {boolean}
   */
  hasTerminator(block) {
    if (!block || block.instructions.length === 0) {
      return false;
    }
    const lastInstr = block.instructions[block.instructions.length - 1];
    return lastInstr.kind === InstructionKinds.Return ||
           lastInstr.kind === InstructionKinds.Jump ||
           lastInstr.kind === InstructionKinds.CondJump;
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
      case NodeKinds.UnaryExpr:
        return this.lowerUnaryExpr(node);
      case NodeKinds.CallExpr:
        return this.lowerCallExpr(node);
      case NodeKinds.MemberExpr:
        return this.lowerMemberExpr(node);
      case NodeKinds.ArrayExpr:
        return this.lowerArrayExpr(node);
      case NodeKinds.ObjectExpr:
        return this.lowerObjectExpr(node);
      case NodeKinds.SelectExpr:
        return this.lowerSelectExpr(node);
      case NodeKinds.SpawnExpr:
        return this.lowerSpawnExpr(node);
      case NodeKinds.AwaitExpr:
        return this.lowerAwaitExpr(node);
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
   * Lower a unary expression
   * @param {Object} node
   * @returns {Object}
   */
  lowerUnaryExpr(node) {
    // Special case: await is a unary operator but needs Await instruction
    if (node.op === 'await') {
      const promiseReg = this.lowerExpression(node.argument);
      const dest = this.allocRegister('awaitResult');

      this.emit({
        kind: InstructionKinds.Await,
        dest,
        promise: promiseReg,
      });

      return dest;
    }

    // Regular unary operations (!, -, +, etc.)
    const operand = this.lowerExpression(node.argument);
    const dest = this.allocRegister();

    this.emit({
      kind: InstructionKinds.UnaryOp,
      dest,
      op: node.op,
      operand,
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

  /**
   * Lower a select expression
   * @param {Object} node
   * @returns {Object}
   */
  lowerSelectExpr(node) {
    const dest = this.allocRegister('selectResult');

    // Prepare cases for Select instruction
    const irCases = [];
    for (const selectCase of node.cases) {
      const channelReg = this.lowerExpression(selectCase.channel);
      const irCase = {
        channel: channelReg,
        op: selectCase.op, // 'recv' or 'send'
      };

      if (selectCase.op === 'send' && selectCase.value) {
        irCase.value = this.lowerExpression(selectCase.value);
      }

      irCases.push(irCase);
    }

    // Emit Select instruction
    this.emit({
      kind: InstructionKinds.Select,
      dest,
      cases: irCases,
    });

    return dest;
  }

  /**
   * Lower a spawn expression
   * @param {Object} node
   * @returns {Object}
   */
  lowerSpawnExpr(node) {
    const dest = this.allocRegister('spawnResult');

    // node.argument is the call expression to spawn
    if (node.argument.kind === NodeKinds.CallExpr) {
      const callee = this.lowerExpression(node.argument.callee);
      const args = node.argument.args.map(arg => this.lowerExpression(arg));

      this.emit({
        kind: InstructionKinds.Spawn,
        dest,
        callee,
        args,
      });
    } else {
      throw new Error('SpawnExpr argument must be a CallExpr');
    }

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
