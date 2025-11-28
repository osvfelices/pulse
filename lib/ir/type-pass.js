/**
 * IR Type Attachment Pass
 *
 * Attaches optional type metadata to IR nodes without modifying semantics.
 * Does not alter control flow, instructions, or optimization behavior.
 */

import { InstructionKinds, OperandKinds } from './instructions.js';

/**
 * Attach type metadata from semantic analysis to IR module
 * @param {Object} irModule - IR module
 * @param {Object} scope - Global scope from semantic analysis
 * @returns {Object} Same IR module with type metadata attached
 */
export function attachTypeMetadata(irModule, scope) {
  if (!irModule || !scope) {
    return irModule;
  }

  const pass = new TypeAttachmentPass(scope);
  return pass.process(irModule);
}

class TypeAttachmentPass {
  constructor(scope) {
    this.globalScope = scope;
    this.currentFunctionSymbol = null;
    this.registerTypes = new Map(); // Register id -> type descriptor
  }

  /**
   * Process the entire IR module
   * @param {Object} irModule
   * @returns {Object} Same module with metadata attached
   */
  process(irModule) {
    if (irModule.kind !== 'IRModule') {
      return irModule;
    }

    // Process each function
    for (const func of irModule.functions) {
      this.processFunction(func);
    }

    return irModule;
  }

  /**
   * Process a single function
   * @param {Object} func - IRFunction
   */
  processFunction(func) {
    // Skip module init
    if (func.name === '__init__') {
      return;
    }

    // Find function symbol in global scope
    const fnSymbol = this.globalScope.resolve(func.name);
    if (!fnSymbol) {
      return;
    }

    this.currentFunctionSymbol = fnSymbol;

    // Attach return type to function metadata if available
    if (fnSymbol.typeDescriptor && fnSymbol.typeDescriptor.returnType) {
      if (!func.metadata) {
        func.metadata = {};
      }
      func.metadata.returnType = fnSymbol.typeDescriptor.returnType;
    }

    // Attach parameter types to function metadata if available
    if (fnSymbol.typeDescriptor && fnSymbol.typeDescriptor.paramTypes && func.params.length > 0) {
      if (!func.metadata) {
        func.metadata = {};
      }
      func.metadata.paramTypes = [];

      for (let i = 0; i < func.params.length; i++) {
        const paramType = fnSymbol.typeDescriptor.paramTypes[i];
        func.metadata.paramTypes.push(paramType || null);

        // Track parameter register types
        const param = func.params[i];
        if (param && paramType) {
          this.registerTypes.set(param.id, paramType);

          // Attach type to parameter register itself
          if (!param.type) {
            param.type = paramType;
          }
        }
      }
    }

    // Process all blocks
    for (const block of func.blocks) {
      this.processBlock(block);
    }

    // Clear state for next function
    this.currentFunctionSymbol = null;
    this.registerTypes.clear();
  }

  /**
   * Process a basic block
   * @param {Object} block
   */
  processBlock(block) {
    for (const instr of block.instructions) {
      this.processInstruction(instr);
    }
  }

  /**
   * Process a single instruction
   * @param {Object} instr
   */
  processInstruction(instr) {
    switch (instr.kind) {
      case InstructionKinds.Assign:
        this.processAssign(instr);
        break;

      case InstructionKinds.Call:
        this.processCall(instr);
        break;

      case InstructionKinds.Spawn:
        this.processSpawn(instr);
        break;

      case InstructionKinds.Await:
        this.processAwait(instr);
        break;

      case InstructionKinds.MethodCall:
        this.processMethodCall(instr);
        break;

      default:
        // Other instructions don't carry meaningful type metadata
        break;
    }
  }

  /**
   * Process Assign instruction
   * Propagate type from source to destination register
   */
  processAssign(instr) {
    if (!instr.dest || instr.dest.kind !== OperandKinds.Register) {
      return;
    }

    // If value is a register with known type, propagate it
    if (instr.value && instr.value.kind === OperandKinds.Register) {
      const sourceType = this.registerTypes.get(instr.value.id);
      if (sourceType) {
        this.registerTypes.set(instr.dest.id, sourceType);
        if (!instr.dest.type) {
          instr.dest.type = sourceType;
        }
      }
    }
  }

  /**
   * Process Call instruction
   * Attach function signature metadata if available
   */
  processCall(instr) {
    if (!instr.callee || instr.callee.kind !== OperandKinds.Global) {
      return;
    }

    // Look up callee symbol
    const calleeSymbol = this.globalScope.resolve(instr.callee.name);
    if (!calleeSymbol || !calleeSymbol.typeDescriptor) {
      return;
    }

    // Attach metadata to call instruction
    if (!instr.metadata) {
      instr.metadata = {};
    }

    if (calleeSymbol.typeDescriptor.paramTypes) {
      instr.metadata.paramTypes = calleeSymbol.typeDescriptor.paramTypes;
    }

    if (calleeSymbol.typeDescriptor.returnType) {
      instr.metadata.returnType = calleeSymbol.typeDescriptor.returnType;

      // Track destination register type
      if (instr.dest && instr.dest.kind === OperandKinds.Register) {
        this.registerTypes.set(instr.dest.id, calleeSymbol.typeDescriptor.returnType);
        if (!instr.dest.type) {
          instr.dest.type = calleeSymbol.typeDescriptor.returnType;
        }
      }
    }
  }

  /**
   * Process Spawn instruction
   * Attach task result type if available
   */
  processSpawn(instr) {
    if (!instr.dest || instr.dest.kind !== OperandKinds.Register) {
      return;
    }

    // If spawning a call to a known function, attach its return type as task result type
    if (instr.callee && instr.callee.kind === OperandKinds.Global) {
      const calleeSymbol = this.globalScope.resolve(instr.callee.name);
      if (calleeSymbol && calleeSymbol.typeDescriptor && calleeSymbol.typeDescriptor.returnType) {
        if (!instr.metadata) {
          instr.metadata = {};
        }
        instr.metadata.resultType = calleeSymbol.typeDescriptor.returnType;

        // Track task type in register
        const taskType = {
          kind: 'task',
          resultType: calleeSymbol.typeDescriptor.returnType,
        };
        this.registerTypes.set(instr.dest.id, taskType);
        if (!instr.dest.type) {
          instr.dest.type = taskType;
        }
      }
    }
  }

  /**
   * Process Await instruction
   * Extract result type from task
   */
  processAwait(instr) {
    if (!instr.dest || instr.dest.kind !== OperandKinds.Register) {
      return;
    }

    // If awaiting a register with known task type, extract result type
    if (instr.value && instr.value.kind === OperandKinds.Register) {
      const taskType = this.registerTypes.get(instr.value.id);
      if (taskType && taskType.kind === 'task' && taskType.resultType) {
        this.registerTypes.set(instr.dest.id, taskType.resultType);
        if (!instr.dest.type) {
          instr.dest.type = taskType.resultType;
        }
      }
    }
  }

  /**
   * Process MethodCall instruction
   */
  processMethodCall(instr) {
    // Method call type metadata requires class/prototype tracking.
  }
}
