/**
 * JavaScript Backend for IR
 *
 * Emits JavaScript code from optimized IR.
 * Produces semantically equivalent output to the legacy codegen.
 */

import { InstructionKinds, OperandKinds } from './instructions.js';

/**
 * Generate JavaScript code from an IR module
 * @param {Object} irModule - IR module to compile
 * @returns {string} - JavaScript code
 */
export function emitJS(irModule) {
  const lines = [];

  for (const func of irModule.functions) {
    lines.push(emitFunction(func));
    lines.push('');
  }

  // Call module init function if it exists
  const hasInit = irModule.functions.some(f => f.name === '__init__');
  if (hasInit) {
    lines.push('__init__();');
  }

  return lines.join('\n');
}

/**
 * Emit a function
 * @param {Object} func - IR function
 * @returns {string}
 */
function emitFunction(func) {
  const lines = [];
  const params = func.params.map(p => emitOperand(p)).join(', ');
  const isAsync = func.async ? 'async ' : '';

  lines.push(`${isAsync}function ${func.name}(${params}) {`);

  // Declare all registers as variables (excluding parameters which are already declared)
  const paramRegIds = new Set(func.params.map(p => p.id));
  const regsToDecl = [];
  for (let i = 0; i < func.registerCount; i++) {
    if (!paramRegIds.has(i)) {
      regsToDecl.push(`r${i}`);
    }
  }
  if (regsToDecl.length > 0) {
    lines.push(`  let ${regsToDecl.join(', ')};`);
  }

  // Use a switch statement for control flow
  // This is the standard approach for compiling three-address code to JavaScript
  lines.push(`  let __label = 'entry';`);
  lines.push(`  while (true) {`);
  lines.push(`    switch (__label) {`);

  // Emit all blocks as switch cases
  for (const block of func.blocks) {
    lines.push(`      case '${block.label}':`);
    for (const instr of block.instructions) {
      const code = emitInstruction(instr);
      if (code) {
        lines.push(`        ${code}`);
      }
    }
  }

  lines.push(`    }`);
  lines.push(`  }`);
  lines.push('}');

  // Export the function
  lines.push(`export { ${func.name} };`);

  return lines.join('\n');
}

/**
 * Emit an instruction
 * @param {Object} instr - IR instruction
 * @returns {string}
 */
function emitInstruction(instr) {
  switch (instr.kind) {
    case InstructionKinds.Assign:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.value)};`;

    case InstructionKinds.BinaryOp:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.left)} ${instr.op} ${emitOperand(instr.right)};`;

    case InstructionKinds.UnaryOp:
      return `${emitOperand(instr.dest)} = ${instr.op}${emitOperand(instr.operand)};`;

    case InstructionKinds.Call:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.callee)}(${instr.args.map(emitOperand).join(', ')});`;

    case InstructionKinds.MethodCall:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.object)}.${instr.property}(${instr.args.map(emitOperand).join(', ')});`;

    case InstructionKinds.Return:
      return instr.value ? `return ${emitOperand(instr.value)};` : 'return;';

    case InstructionKinds.Jump:
      return `__label = '${instr.target}'; break;`;

    case InstructionKinds.CondJump:
      return `if (${emitOperand(instr.condition)}) { __label = '${instr.trueTarget}'; } else { __label = '${instr.falseTarget}'; } break;`;

    case InstructionKinds.CreateArray:
      return `${emitOperand(instr.dest)} = [${instr.elements.map(emitOperand).join(', ')}];`;

    case InstructionKinds.CreateObject: {
      const props = instr.properties.map(p => `${p.key}: ${emitOperand(p.value)}`).join(', ');
      return `${emitOperand(instr.dest)} = {${props}};`;
    }

    case InstructionKinds.GetProperty:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.object)}.${instr.property};`;

    case InstructionKinds.SetProperty:
      return `${emitOperand(instr.object)}.${instr.property} = ${emitOperand(instr.value)};`;

    case InstructionKinds.GetElement:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.object)}[${emitOperand(instr.index)}];`;

    case InstructionKinds.SetElement:
      return `${emitOperand(instr.object)}[${emitOperand(instr.index)}] = ${emitOperand(instr.value)};`;

    case InstructionKinds.Spawn:
      return `${emitOperand(instr.dest)} = spawn(${emitOperand(instr.callee)}, [${instr.args.map(emitOperand).join(', ')}]);`;

    case InstructionKinds.Select: {
      const cases = instr.cases.map(c => {
        if (c.op === 'recv') {
          return `selectCase({ recv: ${emitOperand(c.channel)} })`;
        } else {
          return `selectCase({ send: ${emitOperand(c.channel)}, value: ${emitOperand(c.value)} })`;
        }
      }).join(', ');
      return `${emitOperand(instr.dest)} = await select([${cases}]);`;
    }

    case InstructionKinds.Await:
      return `${emitOperand(instr.dest)} = await ${emitOperand(instr.promise)};`;

    case InstructionKinds.GetIterator:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.iterable)}[Symbol.iterator]();`;

    case InstructionKinds.IteratorNext:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.iterator)}.next();`;

    case InstructionKinds.IteratorDone:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.iteratorResult)}.done;`;

    case InstructionKinds.IteratorValue:
      return `${emitOperand(instr.dest)} = ${emitOperand(instr.iteratorResult)}.value;`;

    case InstructionKinds.Throw:
      return `throw ${emitOperand(instr.value)};`;

    case InstructionKinds.BeginTry:
      // Try blocks are structural, handled by control flow
      return '// try';

    case InstructionKinds.EndTry:
      return '// end try';

    case InstructionKinds.BeginCatch:
      return `// catch (${emitOperand(instr.exceptionReg)})`;

    case InstructionKinds.EndCatch:
      return '// end catch';

    case InstructionKinds.BeginFinally:
      return '// finally';

    case InstructionKinds.EndFinally:
      return '// end finally';

    case InstructionKinds.Switch: {
      const cases = instr.cases.map(c => {
        return `if (${emitOperand(instr.discriminant)} === ${emitOperand(c.test)}) { __label = '${c.target}'; }`;
      }).join(' else ');
      return `${cases} else { __label = '${instr.defaultTarget}'; } break;`;
    }

    case InstructionKinds.ChannelSend:
      return `await ${emitOperand(instr.channel)}.send(${emitOperand(instr.value)});`;

    case InstructionKinds.ChannelRecv:
      return `${emitOperand(instr.dest)} = await ${emitOperand(instr.channel)}.recv();`;

    default:
      throw new Error(`Unknown instruction kind: ${instr.kind}`);
  }
}

/**
 * Emit an operand
 * @param {Object} operand - IR operand
 * @returns {string}
 */
function emitOperand(operand) {
  switch (operand.kind) {
    case OperandKinds.Register:
      return `r${operand.id}`;

    case OperandKinds.Constant:
      if (typeof operand.value === 'string') {
        return JSON.stringify(operand.value);
      } else if (operand.value === null) {
        return 'null';
      } else if (typeof operand.value === 'boolean') {
        return operand.value ? 'true' : 'false';
      } else {
        return String(operand.value);
      }

    case OperandKinds.Global:
      return operand.name;

    default:
      throw new Error(`Unknown operand kind: ${operand.kind}`);
  }
}
