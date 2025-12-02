/**
 * IR Builder
 *
 * Lowers AST to IR (three-address code).
 * This stage implements basic lowering for a safe subset of AST nodes.
 */

import { NodeKinds } from '../ast/types.js';
import { InstructionKinds, OperandKinds } from './instructions.js';
import { NoCurrentBlockError, BlockNotFoundError, NoLoopContextError } from './errors.js';

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
    this.moduleGlobals = new Map(); // Module-level globals: name -> { constant, init }
    this.globalNames = new Set(); // Set of global variable names for lookup
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
    const blockLabel = label ? `${label}_${id}` : `bb${id}`;
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
      throw new NoCurrentBlockError();
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
      throw new BlockNotFoundError(label);
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
      throw new NoLoopContextError();
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
    const topLevelStatements = [];

    // Pre-scan for module-level MUTABLE variable declarations (let, not const)
    // Only mutable variables need to be true globals for cross-function mutation
    // Const variables can be handled normally via constant propagation
    for (const stmt of ast.body) {
      if (stmt.kind === NodeKinds.VarDecl && typeof stmt.name === 'string' && !stmt.constant) {
        this.globalNames.add(stmt.name);
        this.moduleGlobals.set(stmt.name, {
          constant: false,
          init: stmt.init,
        });
      }
    }

    for (const stmt of ast.body) {
      if (stmt.kind === NodeKinds.FnDecl) {
        functions.push(this.lowerFunction(stmt));
      } else {
        // Collect all non-function statements for module init
        topLevelStatements.push(stmt);
      }
    }

    // Create module init function if there are top-level statements
    if (topLevelStatements.length > 0) {
      const initFunc = this.createModuleInit(topLevelStatements);
      functions.push(initFunc);
    }

    return {
      kind: 'IRModule',
      functions,
      globals: Array.from(this.moduleGlobals.entries()).map(([name, info]) => ({
        name,
        constant: info.constant,
      })),
    };
  }

  /**
   * Create a module initialization function from top-level statements
   * @param {Array} statements - Top-level statements
   * @returns {Object} IRFunction
   */
  createModuleInit(statements) {
    // Create a synthetic function for module initialization
    const initFunc = {
      name: '__init__',
      params: [],
      async: false,  // Will be set to true if async calls are detected
      blocks: [],
      registerCount: 0,
    };

    this.currentFunction = initFunc;
    this.registerCounter = 0;
    this.symbolMap.clear();

    // Create entry block
    const entryBlock = this.createBlock('entry');
    initFunc.blocks.push(entryBlock);
    this.currentBlock = entryBlock;

    // Lower each top-level statement
    for (const stmt of statements) {
      this.lowerStatement(stmt);
    }

    // Add implicit return
    this.emit({
      kind: InstructionKinds.Return,
      value: null,
    });

    initFunc.registerCount = this.registerCounter;

    // Check if any async functions were called - if so, make init async
    // This is determined by scanning for Await instructions
    for (const block of initFunc.blocks) {
      for (const instr of block.instructions) {
        if (instr.kind === InstructionKinds.Await) {
          initFunc.async = true;
          break;
        }
      }
      if (initFunc.async) break;
    }

    return initFunc;
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
      async: node.async || false, // Track if function is async
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

    // Add implicit return if the current block doesn't have a terminator
    if (this.currentBlock && this.currentBlock.instructions.length > 0) {
      const lastInstr = this.currentBlock.instructions[this.currentBlock.instructions.length - 1];
      const isTerminator = lastInstr && (
        lastInstr.kind === InstructionKinds.Return ||
        lastInstr.kind === InstructionKinds.Jump ||
        lastInstr.kind === InstructionKinds.CondJump
      );
      if (!isTerminator) {
        this.emit({
          kind: InstructionKinds.Return,
          value: null,
        });
      }
    } else if (this.currentBlock) {
      // Empty block needs a return
      this.emit({
        kind: InstructionKinds.Return,
        value: null,
      });
    }

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
      case NodeKinds.SwitchStmt:
        this.lowerSwitch(node);
        break;
      case NodeKinds.TryStmt:
        this.lowerTry(node);
        break;
      case NodeKinds.ThrowStmt:
        this.lowerThrow(node);
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
    if (typeof node.name === 'string') {
      // Check if this is a module-level global
      if (this.globalNames.has(node.name) && this.currentFunction?.name === '__init__') {
        // This is a module-level variable - assign directly to global
        if (node.init) {
          const valueReg = this.lowerExpression(node.init);
          const globalRef = this.createGlobal(node.name);
          this.emit({
            kind: InstructionKinds.Assign,
            dest: globalRef,
            value: valueReg,
          });
        }
        return;
      }

      // Regular local variable
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
    } else {
      // Destructuring pattern
      if (!node.init) {
        throw new Error('Destructuring requires initializer');
      }

      const valueReg = this.lowerExpression(node.init);
      this.lowerDestructuringPattern(node.name, valueReg);
    }
  }

  /**
   * Lower a destructuring pattern
   * @param {Object} pattern - ArrayPattern or ObjectPattern
   * @param {Object} valueReg - Register containing the value to destructure
   */
  lowerDestructuringPattern(pattern, valueReg) {
    if (pattern.kind === NodeKinds.ArrayPattern) {
      // Array destructuring: [a, b, c] = value
      for (let i = 0; i < pattern.elements.length; i++) {
        const elem = pattern.elements[i];
        if (!elem) continue; // Skip holes

        if (elem.kind === NodeKinds.RestElement) {
          // Rest element: ...rest
          // Parser uses elem.name for the identifier name (string), not elem.argument
          const restName = typeof elem.name === 'string'
            ? elem.name
            : (elem.argument?.name || elem.argument);

          if (!restName) {
            throw new Error('RestElement requires a name');
          }

          const startIndex = this.createConstant(i);
          const sliceResult = this.allocRegister();
          this.emit({
            kind: InstructionKinds.MethodCall,
            dest: sliceResult,
            object: valueReg,
            property: 'slice',
            args: [startIndex],
          });

          const reg = this.allocRegister(restName);
          this.symbolMap.set(restName, reg);
          this.emit({
            kind: InstructionKinds.Assign,
            dest: reg,
            value: sliceResult,
          });
          break; // Rest must be last
        }

        if (typeof elem === 'string') {
          // Simple identifier as string
          const reg = this.allocRegister(elem);
          this.symbolMap.set(elem, reg);

          const index = this.createConstant(i);
          const elemValue = this.allocRegister();
          this.emit({
            kind: InstructionKinds.GetElement,
            dest: elemValue,
            object: valueReg,
            index,
          });

          this.emit({
            kind: InstructionKinds.Assign,
            dest: reg,
            value: elemValue,
          });
        } else if (elem.kind === NodeKinds.Identifier) {
          // Simple identifier as node
          const reg = this.allocRegister(elem.name);
          this.symbolMap.set(elem.name, reg);

          const index = this.createConstant(i);
          const elemValue = this.allocRegister();
          this.emit({
            kind: InstructionKinds.GetElement,
            dest: elemValue,
            object: valueReg,
            index,
          });

          this.emit({
            kind: InstructionKinds.Assign,
            dest: reg,
            value: elemValue,
          });
        } else if (elem.kind === NodeKinds.ArrayPattern || elem.kind === NodeKinds.ObjectPattern) {
          // Nested pattern
          const index = this.createConstant(i);
          const elemValue = this.allocRegister();
          this.emit({
            kind: InstructionKinds.GetElement,
            dest: elemValue,
            object: valueReg,
            index,
          });

          this.lowerDestructuringPattern(elem, elemValue);
        }
      }
    } else if (pattern.kind === NodeKinds.ObjectPattern) {
      // Object destructuring: {a, b, c} = value
      for (const prop of pattern.properties) {
        if (prop.kind === NodeKinds.RestElement) {
          // Rest element: ...rest
          throw new UnsupportedNodeKindError('Rest in object pattern');
        }

        let key, value;
        if (typeof prop === 'string') {
          // Shorthand: {a, b} -> key and value are same
          key = prop;
          value = prop;
        } else {
          key = prop.key || prop.value.name || prop.value;
          value = prop.value;
        }

        const propValue = this.allocRegister();
        this.emit({
          kind: InstructionKinds.GetProperty,
          dest: propValue,
          object: valueReg,
          property: key,
        });

        if (typeof value === 'string') {
          const reg = this.allocRegister(value);
          this.symbolMap.set(value, reg);
          this.emit({
            kind: InstructionKinds.Assign,
            dest: reg,
            value: propValue,
          });
        } else if (value.kind === NodeKinds.Identifier) {
          const reg = this.allocRegister(value.name);
          this.symbolMap.set(value.name, reg);
          this.emit({
            kind: InstructionKinds.Assign,
            dest: reg,
            value: propValue,
          });
        } else if (value.kind === NodeKinds.ArrayPattern || value.kind === NodeKinds.ObjectPattern) {
          // Nested pattern
          this.lowerDestructuringPattern(value, propValue);
        }
      }
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
   * Lower a switch statement
   * @param {Object} node
   */
  lowerSwitch(node) {
    // Evaluate discriminant
    const discriminantReg = this.lowerExpression(node.discriminant);

    // Create exit block
    const exitBlock = this.createBlock('switch_exit');
    this.addBlock(exitBlock);

    // Create blocks for each case
    const caseBlocks = [];
    const switchCases = [];
    let defaultBlock = null;

    for (const caseNode of node.cases) {
      const caseBlock = this.createBlock(caseNode.test === null ? 'switch_default' : 'switch_case');
      this.addBlock(caseBlock);
      caseBlocks.push(caseBlock);

      if (caseNode.test === null) {
        defaultBlock = caseBlock;
      } else {
        const testReg = this.lowerExpression(caseNode.test);
        switchCases.push({ test: testReg, target: caseBlock.label });
      }
    }

    // If no default, default goes to exit
    const defaultTarget = defaultBlock ? defaultBlock.label : exitBlock.label;

    // Emit Switch instruction
    this.emit({
      kind: InstructionKinds.Switch,
      discriminant: discriminantReg,
      cases: switchCases,
      defaultTarget,
    });

    // Enter loop context for break (switch allows break)
    this.enterLoop(exitBlock.label, null);

    // Lower each case body
    for (let i = 0; i < node.cases.length; i++) {
      const caseNode = node.cases[i];
      const caseBlock = caseBlocks[i];

      this.beginBlock(caseBlock.label);

      // Lower all consequent statements
      for (const stmt of caseNode.consequent) {
        this.lowerStatement(stmt);
        // Stop if we hit a terminator
        if (this.hasTerminator(this.currentBlock)) {
          break;
        }
      }

      // Fall through to next case if no terminator
      if (!this.hasTerminator(this.currentBlock)) {
        if (i + 1 < caseBlocks.length) {
          this.emit({
            kind: InstructionKinds.Jump,
            target: caseBlocks[i + 1].label,
          });
        } else {
          this.emit({
            kind: InstructionKinds.Jump,
            target: exitBlock.label,
          });
        }
      }
    }

    this.exitLoop();

    // Continue at exit block
    this.beginBlock(exitBlock.label);
  }

  /**
   * Lower a try statement
   * @param {Object} node
   */
  lowerTry(node) {
    const exitBlock = this.createBlock('try_exit');
    this.addBlock(exitBlock);

    let catchBlock = null;
    let catchExceptionReg = null;
    if (node.handler) {
      catchBlock = this.createBlock('try_catch');
      this.addBlock(catchBlock);
      catchExceptionReg = this.allocRegister(node.handler.param);
    }

    let finallyBlock = null;
    if (node.finalizer) {
      finallyBlock = this.createBlock('try_finally');
      this.addBlock(finallyBlock);
    }

    // Emit BeginTry
    this.emit({
      kind: InstructionKinds.BeginTry,
      catchTarget: catchBlock ? catchBlock.label : null,
      finallyTarget: finallyBlock ? finallyBlock.label : null,
    });

    // Lower try body
    this.lowerBlock(node.body);

    // Emit EndTry
    if (!this.hasTerminator(this.currentBlock)) {
      this.emit({
        kind: InstructionKinds.EndTry,
      });

      // Jump to finally or exit
      if (finallyBlock) {
        this.emit({
          kind: InstructionKinds.Jump,
          target: finallyBlock.label,
        });
      } else {
        this.emit({
          kind: InstructionKinds.Jump,
          target: exitBlock.label,
        });
      }
    }

    // Lower catch block if present
    if (catchBlock) {
      this.beginBlock(catchBlock.label);

      // Emit BeginCatch
      this.emit({
        kind: InstructionKinds.BeginCatch,
        exceptionReg: catchExceptionReg,
      });

      // Map exception parameter
      this.symbolMap.set(node.handler.param, catchExceptionReg);

      // Lower catch body
      this.lowerBlock(node.handler.body);

      // Emit EndCatch
      if (!this.hasTerminator(this.currentBlock)) {
        this.emit({
          kind: InstructionKinds.EndCatch,
        });

        // Jump to finally or exit
        if (finallyBlock) {
          this.emit({
            kind: InstructionKinds.Jump,
            target: finallyBlock.label,
          });
        } else {
          this.emit({
            kind: InstructionKinds.Jump,
            target: exitBlock.label,
          });
        }
      }
    }

    // Lower finally block if present
    if (finallyBlock) {
      this.beginBlock(finallyBlock.label);

      // Emit BeginFinally
      this.emit({
        kind: InstructionKinds.BeginFinally,
      });

      // Lower finally body
      this.lowerBlock(node.finalizer);

      // Emit EndFinally
      if (!this.hasTerminator(this.currentBlock)) {
        this.emit({
          kind: InstructionKinds.EndFinally,
        });

        this.emit({
          kind: InstructionKinds.Jump,
          target: exitBlock.label,
        });
      }
    }

    // Continue at exit block
    this.beginBlock(exitBlock.label);
  }

  /**
   * Lower a throw statement
   * @param {Object} node
   */
  lowerThrow(node) {
    const valueReg = this.lowerExpression(node.expr);
    this.emit({
      kind: InstructionKinds.Throw,
      value: valueReg,
    });
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
           lastInstr.kind === InstructionKinds.CondJump ||
           lastInstr.kind === InstructionKinds.Switch ||
           lastInstr.kind === InstructionKinds.Throw;
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
      case NodeKinds.IndexExpr:
        return this.lowerIndexExpr(node);
      case NodeKinds.UpdateExpr:
        return this.lowerUpdateExpr(node);
      case NodeKinds.TernaryExpr:
        return this.lowerTernaryExpr(node);
      case NodeKinds.AssignExpr:
        return this.lowerAssignExpr(node);
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
    // Handle assignment operator
    if (node.op === '=') {
      const valueReg = this.lowerExpression(node.right);
      this.lowerAssignment(node.left, valueReg);
      return valueReg;
    }

    // Handle logical operators with short-circuit evaluation
    if (node.op === '&&' || node.op === '||') {
      return this.lowerLogicalExpr(node);
    }

    // Regular binary operators
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
   * Lower a logical expression with short-circuit evaluation
   * @param {Object} node
   * @returns {Object}
   */
  lowerLogicalExpr(node) {
    const dest = this.allocRegister('logicalResult');

    if (node.op === '&&') {
      // AND: if left is false, result is left; otherwise result is right
      const rightBlock = this.createBlock('and_right');
      const mergeBlock = this.createBlock('and_merge');

      this.addBlock(rightBlock);
      this.addBlock(mergeBlock);

      // Evaluate left and assign to dest
      const left = this.lowerExpression(node.left);
      this.emit({
        kind: InstructionKinds.Assign,
        dest,
        value: left,
      });

      // Short-circuit: if left is false, skip right evaluation
      this.emit({
        kind: InstructionKinds.CondJump,
        condition: left,
        trueTarget: rightBlock.label,
        falseTarget: mergeBlock.label,
      });

      // Evaluate right and assign to dest
      this.beginBlock(rightBlock.label);
      const right = this.lowerExpression(node.right);
      this.emit({
        kind: InstructionKinds.Assign,
        dest,
        value: right,
      });
      this.emit({
        kind: InstructionKinds.Jump,
        target: mergeBlock.label,
      });

      // Merge: dest contains left if short-circuited, right otherwise
      this.beginBlock(mergeBlock.label);
    } else if (node.op === '||') {
      // OR: if left is true, result is left; otherwise result is right
      const rightBlock = this.createBlock('or_right');
      const mergeBlock = this.createBlock('or_merge');

      this.addBlock(rightBlock);
      this.addBlock(mergeBlock);

      // Evaluate left and assign to dest
      const left = this.lowerExpression(node.left);
      this.emit({
        kind: InstructionKinds.Assign,
        dest,
        value: left,
      });

      // Short-circuit: if left is true, skip right evaluation
      this.emit({
        kind: InstructionKinds.CondJump,
        condition: left,
        trueTarget: mergeBlock.label,
        falseTarget: rightBlock.label,
      });

      // Evaluate right and assign to dest
      this.beginBlock(rightBlock.label);
      const right = this.lowerExpression(node.right);
      this.emit({
        kind: InstructionKinds.Assign,
        dest,
        value: right,
      });
      this.emit({
        kind: InstructionKinds.Jump,
        target: mergeBlock.label,
      });

      // Merge: dest contains left if short-circuited, right otherwise
      this.beginBlock(mergeBlock.label);
    }

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
    const dest = this.allocRegister();

    // Check if this is a method call (callee is MemberExpr)
    if (node.callee.kind === NodeKinds.MemberExpr) {
      const obj = this.lowerExpression(node.callee.object);
      const args = node.args.map(arg => this.lowerExpression(arg));

      // Use MethodCall instruction for proper 'this' binding
      this.emit({
        kind: InstructionKinds.MethodCall,
        dest,
        object: obj,
        property: node.callee.property,
        args,
      });
    } else {
      // Regular function call
      const callee = this.lowerExpression(node.callee);
      const args = node.args.map(arg => this.lowerExpression(arg));

      this.emit({
        kind: InstructionKinds.Call,
        dest,
        callee,
        args,
      });
    }

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
    // Check if we have spread elements
    const hasSpread = node.elements.some(elem => elem && elem.kind === NodeKinds.SpreadElement);

    if (!hasSpread) {
      // Simple case: no spread
      const elements = node.elements.map(elem => this.lowerExpression(elem));
      const dest = this.allocRegister();

      this.emit({
        kind: InstructionKinds.CreateArray,
        dest,
        elements,
      });

      return dest;
    }

    // Complex case: has spread elements
    // Create empty array and push elements
    const dest = this.allocRegister();
    this.emit({
      kind: InstructionKinds.CreateArray,
      dest,
      elements: [],
    });

    // Process each element
    for (const elem of node.elements) {
      if (elem && elem.kind === NodeKinds.SpreadElement) {
        // Spread: iterate and push each element
        const spreadValue = this.lowerExpression(elem.argument);

        // Get iterator
        const iterator = this.allocRegister('iterator');
        this.emit({
          kind: InstructionKinds.GetIterator,
          dest: iterator,
          iterable: spreadValue,
        });

        // Create loop blocks
        const loopStart = this.createBlock('spread_loop');
        const loopBody = this.createBlock('spread_body');
        const loopEnd = this.createBlock('spread_end');

        this.addBlock(loopStart);
        this.addBlock(loopBody);
        this.addBlock(loopEnd);

        // Jump to loop
        this.emit({
          kind: InstructionKinds.Jump,
          target: loopStart.label,
        });

        // Loop start: call next()
        this.beginBlock(loopStart.label);
        const iterResult = this.allocRegister('iterResult');
        this.emit({
          kind: InstructionKinds.IteratorNext,
          dest: iterResult,
          iterator,
        });

        // Check if done
        const isDone = this.allocRegister('isDone');
        this.emit({
          kind: InstructionKinds.IteratorDone,
          dest: isDone,
          iteratorResult: iterResult,
        });

        this.emit({
          kind: InstructionKinds.CondJump,
          condition: isDone,
          trueTarget: loopEnd.label,
          falseTarget: loopBody.label,
        });

        // Loop body: get value and push
        this.beginBlock(loopBody.label);
        const value = this.allocRegister('spreadValue');
        this.emit({
          kind: InstructionKinds.IteratorValue,
          dest: value,
          iteratorResult: iterResult,
        });

        // Push to array using .push method
        const pushResult = this.allocRegister();
        this.emit({
          kind: InstructionKinds.MethodCall,
          dest: pushResult,
          object: dest,
          property: 'push',
          args: [value],
        });

        this.emit({
          kind: InstructionKinds.Jump,
          target: loopStart.label,
        });

        // Loop end
        this.beginBlock(loopEnd.label);
      } else {
        // Regular element: push directly
        const elemValue = this.lowerExpression(elem);
        const pushResult = this.allocRegister();
        this.emit({
          kind: InstructionKinds.MethodCall,
          dest: pushResult,
          object: dest,
          property: 'push',
          args: [elemValue],
        });
      }
    }

    return dest;
  }

  /**
   * Lower an object expression
   * @param {Object} node
   * @returns {Object}
   */
  lowerObjectExpr(node) {
    // Check if we have spread properties
    const hasSpread = node.properties.some(prop =>
      prop.kind === 'SpreadProperty' || prop.kind === NodeKinds.SpreadElement
    );

    if (!hasSpread) {
      // Simple case: no spread
      const properties = [];
      for (const prop of node.properties) {
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

    // Complex case: has spread properties
    // Create object and assign properties one by one
    const dest = this.allocRegister();
    this.emit({
      kind: InstructionKinds.CreateObject,
      dest,
      properties: [],
    });

    for (const prop of node.properties) {
      if (prop.kind === 'SpreadProperty' || prop.kind === NodeKinds.SpreadElement) {
        // Spread: use Object.assign
        const spreadValue = this.lowerExpression(prop.argument);

        // Call Object.assign(dest, spreadValue)
        const objectGlobal = this.createGlobal('Object');
        const assignMethod = this.allocRegister();
        this.emit({
          kind: InstructionKinds.GetProperty,
          dest: assignMethod,
          object: objectGlobal,
          property: 'assign',
        });

        const assignResult = this.allocRegister();
        this.emit({
          kind: InstructionKinds.Call,
          dest: assignResult,
          callee: assignMethod,
          args: [dest, spreadValue],
        });
      } else {
        // Regular property: assign directly
        const value = this.lowerExpression(prop.value);
        this.emit({
          kind: InstructionKinds.SetProperty,
          object: dest,
          property: prop.key,
          value,
        });
      }
    }

    return dest;
  }

  /**
   * Lower a select expression
   *
   * Select with case bodies is lowered as a control flow construct:
   * 1. Execute select operation, get {caseIndex, value}
   * 2. Dispatch to the winning case body block based on caseIndex
   * 3. Each case body binds its variable (if any) and executes statements
   * 4. All case bodies jump to a common merge point
   *
   * @param {Object} node
   * @returns {Object}
   */
  lowerSelectExpr(node) {
    // Check if any case has a body - if not, this is a pure expression select
    const hasCaseBodies = node.cases.some(c => c.body && c.body.length > 0);

    if (!hasCaseBodies) {
      // Simple expression-style select with no case bodies
      // Lower as before: just the Select instruction
      return this.lowerSimpleSelectExpr(node);
    }

    // Complex select with case bodies requires control flow dispatch
    const selectResultReg = this.allocRegister('selectResult');

    // Create merge block where all case bodies reunite
    const mergeBlock = this.createBlock('select_merge');
    this.addBlock(mergeBlock);

    // First pass: lower channel operations and collect case metadata
    const irCases = [];
    const caseBlocks = []; // Will store {block, varName, varReg, body}

    for (let i = 0; i < node.cases.length; i++) {
      const selectCase = node.cases[i];
      const caseBlock = this.createBlock(`select_case${i}`);
      this.addBlock(caseBlock);

      // Lower the channel operation part
      if (selectCase.op === 'await') {
        const promiseReg = this.lowerExpression(selectCase.awaitExpr);
        const channelReg = this.allocRegister('awaitChannel');
        this.emit({
          kind: InstructionKinds.GetProperty,
          dest: channelReg,
          object: promiseReg,
          property: '__result_ch',
        });

        irCases.push({
          channel: channelReg,
          op: 'recv',
          isAwaitCase: true,
        });
      } else {
        const channelReg = this.lowerExpression(selectCase.channel);
        const irCase = {
          channel: channelReg,
          op: selectCase.op,
        };

        if (selectCase.op === 'send' && selectCase.value) {
          irCase.value = this.lowerExpression(selectCase.value);
        }

        irCases.push(irCase);
      }

      // Prepare case body block metadata
      let varReg = null;
      if (selectCase.varName) {
        varReg = this.allocRegister(selectCase.varName);
        this.symbolMap.set(selectCase.varName, varReg);
      }

      caseBlocks.push({
        block: caseBlock,
        varName: selectCase.varName,
        varReg: varReg,
        body: selectCase.body || [],
        isAwaitCase: selectCase.op === 'await',
      });
    }

    // Emit Select instruction
    this.emit({
      kind: InstructionKinds.Select,
      dest: selectResultReg,
      cases: irCases,
      caseLabels: caseBlocks.map(cb => cb.block.label), // Tell backend where to dispatch
      mergeLabel: mergeBlock.label,
    });

    // The backend will handle the dispatch via the caseLabels metadata
    // But IR validation requires a terminator, so emit a dummy Switch (backend will merge this into the Select emission)
    const caseIndexReg = this.allocRegister('caseIndex');
    this.emit({
      kind: InstructionKinds.Switch,
      discriminant: caseIndexReg,
      cases: caseBlocks.map((cb, i) => ({
        test: this.createConstant(i),
        target: cb.block.label,
      })),
      defaultTarget: mergeBlock.label,
    });

    // Second pass: emit case body blocks
    for (let i = 0; i < caseBlocks.length; i++) {
      const caseMeta = caseBlocks[i];

      this.beginBlock(caseMeta.block.label);

      // Bind case variable to the select result value if this case was chosen
      if (caseMeta.varReg) {
        // The backend will have extracted and unwrapped the value into a temp register
        // We emit an assignment from the magic register that backend will populate
        // For now, emit a placeholder Copy that backend will replace
        const valueReg = this.allocRegister(`case${i}_value`);
        this.emit({
          kind: InstructionKinds.Copy,
          dest: caseMeta.varReg,
          source: valueReg,
          // Special marker for backend to know this needs the select result value
          _selectCaseValueBinding: true,
          _selectCaseIndex: i,
          _isAwaitCase: caseMeta.isAwaitCase,
        });
      }

      // Lower case body statements
      for (const stmt of caseMeta.body) {
        this.lowerStatement(stmt);
      }

      // Jump to merge
      this.emit({
        kind: InstructionKinds.Jump,
        target: mergeBlock.label,
      });
    }

    // Create merge block
    this.beginBlock(mergeBlock.label);

    return selectResultReg;
  }

  /**
   * Lower a simple select expression without case bodies
   * Used when select is purely for its value, not for control flow
   */
  lowerSimpleSelectExpr(node) {
    const dest = this.allocRegister('selectResult');

    const irCases = [];
    for (const selectCase of node.cases) {
      if (selectCase.op === 'await') {
        const promiseReg = this.lowerExpression(selectCase.awaitExpr);
        const channelReg = this.allocRegister('awaitChannel');
        this.emit({
          kind: InstructionKinds.GetProperty,
          dest: channelReg,
          object: promiseReg,
          property: '__result_ch',
        });

        irCases.push({
          channel: channelReg,
          op: 'recv',
          isAwaitCase: true,
        });
      } else {
        const channelReg = this.lowerExpression(selectCase.channel);
        const irCase = {
          channel: channelReg,
          op: selectCase.op,
        };

        if (selectCase.op === 'send' && selectCase.value) {
          irCase.value = this.lowerExpression(selectCase.value);
        }

        irCases.push(irCase);
      }
    }

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

  /**
   * Lower an await expression
   * @param {Object} node
   * @returns {Object}
   */
  lowerAwaitExpr(node) {
    const dest = this.allocRegister('awaitResult');
    const promise = this.lowerExpression(node.argument);

    this.emit({
      kind: InstructionKinds.Await,
      dest,
      promise,
    });

    return dest;
  }

  /**
   * Lower an index expression (array[index] or obj[key])
   * @param {Object} node
   * @returns {Object}
   */
  lowerIndexExpr(node) {
    const dest = this.allocRegister('indexResult');
    const object = this.lowerExpression(node.object);
    const index = this.lowerExpression(node.index);

    this.emit({
      kind: InstructionKinds.GetElement,
      dest,
      object,
      index,
    });

    return dest;
  }

  /**
   * Lower an update expression (++i, i++, --i, i--)
   * @param {Object} node
   * @returns {Object}
   */
  lowerUpdateExpr(node) {
    // Get the current value
    const operandReg = this.lowerExpression(node.argument);

    // Calculate new value
    const one = this.createConstant(1);
    const newValueReg = this.allocRegister('updateResult');

    const op = node.op === '++' ? '+' : '-';
    this.emit({
      kind: InstructionKinds.BinaryOp,
      dest: newValueReg,
      left: operandReg,
      right: one,
      op,
    });

    // Store the new value back
    this.lowerAssignment(node.argument, newValueReg);

    // Return appropriate value based on prefix/postfix
    if (node.prefix) {
      return newValueReg; // ++i returns new value
    } else {
      return operandReg; // i++ returns old value
    }
  }

  /**
   * Lower a ternary expression (condition ? trueExpr : falseExpr)
   * @param {Object} node
   * @returns {Object}
   */
  lowerTernaryExpr(node) {
    const dest = this.allocRegister('ternaryResult');

    // Create blocks
    const trueBlock = this.createBlock('ternary_true');
    const falseBlock = this.createBlock('ternary_false');
    const mergeBlock = this.createBlock('ternary_merge');

    this.addBlock(trueBlock);
    this.addBlock(falseBlock);
    this.addBlock(mergeBlock);

    // Evaluate condition and branch
    const condition = this.lowerExpression(node.test);
    this.emit({
      kind: InstructionKinds.CondJump,
      condition,
      trueTarget: trueBlock.label,
      falseTarget: falseBlock.label,
    });

    // True branch
    this.beginBlock(trueBlock.label);
    const trueValue = this.lowerExpression(node.consequent);
    this.emit({
      kind: InstructionKinds.Assign,
      dest,
      value: trueValue,
    });
    this.emit({
      kind: InstructionKinds.Jump,
      target: mergeBlock.label,
    });

    // False branch
    this.beginBlock(falseBlock.label);
    const falseValue = this.lowerExpression(node.alternate);
    this.emit({
      kind: InstructionKinds.Assign,
      dest,
      value: falseValue,
    });
    this.emit({
      kind: InstructionKinds.Jump,
      target: mergeBlock.label,
    });

    // Continue at merge
    this.beginBlock(mergeBlock.label);

    return dest;
  }

  /**
   * Lower an assignment expression (a = b, a.x = b, a[i] = b)
   * @param {Object} node
   * @returns {Object}
   */
  lowerAssignExpr(node) {
    const valueReg = this.lowerExpression(node.right);
    this.lowerAssignment(node.left, valueReg);
    return valueReg;
  }

  /**
   * Lower the left-hand side of an assignment
   * @param {Object} lhs - Left-hand side node (Identifier, MemberExpr, or IndexExpr)
   * @param {Object} valueReg - Register containing the value to assign
   */
  lowerAssignment(lhs, valueReg) {
    if (lhs.kind === NodeKinds.Identifier) {
      // Check if this is a global variable
      if (this.globalNames.has(lhs.name) && !this.symbolMap.has(lhs.name)) {
        // Assign to global
        const globalRef = this.createGlobal(lhs.name);
        this.emit({
          kind: InstructionKinds.Assign,
          dest: globalRef,
          value: valueReg,
        });
        return;
      }

      // Simple local variable assignment
      if (!this.symbolMap.has(lhs.name)) {
        // Create new variable if it doesn't exist
        const reg = this.allocRegister(lhs.name);
        this.symbolMap.set(lhs.name, reg);
      }
      const targetReg = this.symbolMap.get(lhs.name);
      this.emit({
        kind: InstructionKinds.Assign,
        dest: targetReg,
        value: valueReg,
      });
    } else if (lhs.kind === NodeKinds.MemberExpr) {
      // Property assignment: obj.prop = value
      const object = this.lowerExpression(lhs.object);
      this.emit({
        kind: InstructionKinds.SetProperty,
        object,
        property: lhs.property,
        value: valueReg,
      });
    } else if (lhs.kind === NodeKinds.IndexExpr) {
      // Element assignment: obj[index] = value
      const object = this.lowerExpression(lhs.object);
      const index = this.lowerExpression(lhs.index);
      this.emit({
        kind: InstructionKinds.SetElement,
        object,
        index,
        value: valueReg,
      });
    } else {
      throw new Error(`Unsupported assignment target: ${lhs.kind}`);
    }
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
