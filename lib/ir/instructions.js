/**
 * IR Instruction Types
 *
 * Three-address code (TAC) instruction model for Pulse IR.
 * All instructions are plain objects with a 'kind' discriminant.
 */

/**
 * Operand types
 */

/**
 * @typedef {Object} Register
 * @property {'Register'} kind
 * @property {number} id
 * @property {string} [debugName]
 */

/**
 * @typedef {Object} Constant
 * @property {'Constant'} kind
 * @property {number|string|boolean|null} value
 */

/**
 * @typedef {Object} Global
 * @property {'Global'} kind
 * @property {string} name
 */

/**
 * @typedef {Register|Constant|Global} Operand
 */

/**
 * Core instructions
 */

/**
 * @typedef {Object} Assign
 * @property {'Assign'} kind
 * @property {Register} dest
 * @property {Operand} value
 */

/**
 * @typedef {Object} BinaryOp
 * @property {'BinaryOp'} kind
 * @property {Register} dest
 * @property {string} op
 * @property {Operand} left
 * @property {Operand} right
 */

/**
 * @typedef {Object} UnaryOp
 * @property {'UnaryOp'} kind
 * @property {Register} dest
 * @property {string} op
 * @property {Operand} operand
 */

/**
 * @typedef {Object} Call
 * @property {'Call'} kind
 * @property {Register} dest
 * @property {Operand} callee
 * @property {Operand[]} args
 */

/**
 * @typedef {Object} Return
 * @property {'Return'} kind
 * @property {Operand|null} value
 */

/**
 * @typedef {Object} Jump
 * @property {'Jump'} kind
 * @property {string} target
 */

/**
 * @typedef {Object} CondJump
 * @property {'CondJump'} kind
 * @property {Operand} condition
 * @property {string} trueTarget
 * @property {string} falseTarget
 */

/**
 * @typedef {Object} Label
 * @property {'Label'} kind
 * @property {string} name
 */

/**
 * Data operations
 */

/**
 * @typedef {Object} CreateArray
 * @property {'CreateArray'} kind
 * @property {Register} dest
 * @property {Operand[]} elements
 */

/**
 * @typedef {Object} CreateObject
 * @property {'CreateObject'} kind
 * @property {Register} dest
 * @property {Array<{key: string, value: Operand}>} properties
 */

/**
 * @typedef {Object} GetProperty
 * @property {'GetProperty'} kind
 * @property {Register} dest
 * @property {Operand} object
 * @property {string} property
 */

/**
 * @typedef {Object} SetProperty
 * @property {'SetProperty'} kind
 * @property {Operand} object
 * @property {string} property
 * @property {Operand} value
 */

/**
 * @typedef {Object} GetElement
 * @property {'GetElement'} kind
 * @property {Register} dest
 * @property {Operand} object
 * @property {Operand} index
 */

/**
 * @typedef {Object} SetElement
 * @property {'SetElement'} kind
 * @property {Operand} object
 * @property {Operand} index
 * @property {Operand} value
 */

/**
 * Pulse-specific instructions
 */

/**
 * @typedef {Object} Spawn
 * @property {'Spawn'} kind
 * @property {Register} dest
 * @property {Operand} callee
 * @property {Operand[]} args
 */

/**
 * @typedef {Object} ChannelSend
 * @property {'ChannelSend'} kind
 * @property {Operand} channel
 * @property {Operand} value
 */

/**
 * @typedef {Object} ChannelRecv
 * @property {'ChannelRecv'} kind
 * @property {Register} dest
 * @property {Operand} channel
 */

/**
 * @typedef {Object} Select
 * @property {'Select'} kind
 * @property {Register} dest
 * @property {Array<{channel: Operand, op: 'send'|'recv', value?: Operand}>} cases
 */

/**
 * @typedef {Object} GetIterator
 * @property {'GetIterator'} kind
 * @property {Register} dest
 * @property {Operand} iterable
 */

/**
 * @typedef {Object} IteratorNext
 * @property {'IteratorNext'} kind
 * @property {Register} dest
 * @property {Operand} iterator
 */

/**
 * @typedef {Object} IteratorDone
 * @property {'IteratorDone'} kind
 * @property {Register} dest
 * @property {Operand} iteratorResult
 */

/**
 * @typedef {Object} IteratorValue
 * @property {'IteratorValue'} kind
 * @property {Register} dest
 * @property {Operand} iteratorResult
 */

/**
 * @typedef {Object} Await
 * @property {'Await'} kind
 * @property {Register} dest
 * @property {Operand} promise
 */

/**
 * Instruction union type
 */
export const InstructionKinds = {
  // Core
  Assign: 'Assign',
  BinaryOp: 'BinaryOp',
  UnaryOp: 'UnaryOp',
  Call: 'Call',
  Return: 'Return',
  Jump: 'Jump',
  CondJump: 'CondJump',
  Label: 'Label',
  // Data
  CreateArray: 'CreateArray',
  CreateObject: 'CreateObject',
  GetProperty: 'GetProperty',
  SetProperty: 'SetProperty',
  GetElement: 'GetElement',
  SetElement: 'SetElement',
  // Pulse
  Spawn: 'Spawn',
  ChannelSend: 'ChannelSend',
  ChannelRecv: 'ChannelRecv',
  Select: 'Select',
  // Iteration
  GetIterator: 'GetIterator',
  IteratorNext: 'IteratorNext',
  IteratorDone: 'IteratorDone',
  IteratorValue: 'IteratorValue',
  // Async
  Await: 'Await',
};

export const OperandKinds = {
  Register: 'Register',
  Constant: 'Constant',
  Global: 'Global',
};

/**
 * Check if value is an instruction
 * @param {any} value
 * @returns {boolean}
 */
export function isInstruction(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.values(InstructionKinds).includes(value.kind);
}

/**
 * Check if value is a register operand
 * @param {any} value
 * @returns {boolean}
 */
export function isRegister(value) {
  return value && value.kind === OperandKinds.Register;
}

/**
 * Check if value is a constant operand
 * @param {any} value
 * @returns {boolean}
 */
export function isConstant(value) {
  return value && value.kind === OperandKinds.Constant;
}

/**
 * Check if value is a global operand
 * @param {any} value
 * @returns {boolean}
 */
export function isGlobal(value) {
  return value && value.kind === OperandKinds.Global;
}

/**
 * Check if value is any valid operand
 * @param {any} value
 * @returns {boolean}
 */
export function isOperand(value) {
  return isRegister(value) || isConstant(value) || isGlobal(value);
}
