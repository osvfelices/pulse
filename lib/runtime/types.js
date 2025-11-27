/**
 * Pulse Runtime Type System
 *
 * Lightweight type metadata and reflection for runtime values.
 * Foundation for gradual typing and optional runtime type checks.
 *
 * Design principles:
 * - Non-intrusive: minimal overhead, opt-in metadata
 * - Compact: simple type descriptors
 * - Inspectable: clear reflection API
 * - Conservative: no behavior changes to existing code
 */

import { Channel } from './channel-deterministic.js';

/**
 * Runtime type kinds
 */
export const TypeKind = {
  // Primitives
  Int: 'int',
  Float: 'float',
  Bool: 'bool',
  String: 'string',
  Null: 'null',
  Undefined: 'undefined',

  // Composites
  Array: 'array',
  Object: 'object',
  Function: 'function',

  // Pulse-specific
  Channel: 'channel',
  Task: 'task',

  // Special
  Unknown: 'unknown',
};

/**
 * Type descriptor structure
 *
 * Base: { kind: TypeKind }
 * With element type: { kind: TypeKind, elementType?: TypeDescriptor }
 * With properties: { kind: TypeKind, properties?: Map<string, TypeDescriptor> }
 */

/**
 * Create a primitive type descriptor
 * @param {string} kind - TypeKind value
 * @returns {Object} Type descriptor
 */
export function primitiveType(kind) {
  return { kind };
}

/**
 * Create an array type descriptor
 * @param {Object} elementType - Optional element type descriptor
 * @returns {Object} Type descriptor
 */
export function arrayType(elementType = null) {
  return elementType
    ? { kind: TypeKind.Array, elementType }
    : { kind: TypeKind.Array };
}

/**
 * Create an object type descriptor
 * @param {Map<string, Object>} properties - Optional property types
 * @returns {Object} Type descriptor
 */
export function objectType(properties = null) {
  return properties
    ? { kind: TypeKind.Object, properties }
    : { kind: TypeKind.Object };
}

/**
 * Create a function type descriptor
 * @param {Array<Object>} paramTypes - Optional parameter types
 * @param {Object} returnType - Optional return type
 * @returns {Object} Type descriptor
 */
export function functionType(paramTypes = null, returnType = null) {
  const desc = { kind: TypeKind.Function };
  if (paramTypes) desc.paramTypes = paramTypes;
  if (returnType) desc.returnType = returnType;
  return desc;
}

/**
 * Create a channel type descriptor
 * @param {Object} elementType - Optional element type
 * @returns {Object} Type descriptor
 */
export function channelType(elementType = null) {
  return elementType
    ? { kind: TypeKind.Channel, elementType }
    : { kind: TypeKind.Channel };
}

/**
 * Create a task type descriptor
 * @param {Object} resultType - Optional result type
 * @returns {Object} Type descriptor
 */
export function taskType(resultType = null) {
  return resultType
    ? { kind: TypeKind.Task, resultType }
    : { kind: TypeKind.Task };
}

/**
 * Get runtime type of a value
 * @param {*} value - Value to inspect
 * @returns {Object} Type descriptor
 */
export function getRuntimeType(value) {
  // Check null/undefined first
  if (value === null) {
    return primitiveType(TypeKind.Null);
  }
  if (value === undefined) {
    return primitiveType(TypeKind.Undefined);
  }

  // Check Pulse-specific types
  if (value instanceof Channel) {
    // Check for element type metadata
    if (value._elementType) {
      return channelType(value._elementType);
    }
    return channelType();
  }

  // Check if it's a task (Promise-like with Pulse metadata)
  if (value && typeof value.then === 'function' && value._isPulseTask) {
    if (value._resultType) {
      return taskType(value._resultType);
    }
    return taskType();
  }

  // JavaScript built-in types
  const jsType = typeof value;

  switch (jsType) {
    case 'boolean':
      return primitiveType(TypeKind.Bool);

    case 'string':
      return primitiveType(TypeKind.String);

    case 'number':
      // Distinguish int from float
      if (Number.isInteger(value)) {
        return primitiveType(TypeKind.Int);
      }
      return primitiveType(TypeKind.Float);

    case 'function':
      // Check for type metadata on function
      if (value._paramTypes || value._returnType) {
        return functionType(value._paramTypes, value._returnType);
      }
      return functionType();

    case 'object':
      // Array check
      if (Array.isArray(value)) {
        // Check for element type metadata
        if (value._elementType) {
          return arrayType(value._elementType);
        }
        return arrayType();
      }

      // Plain object
      // Check for property type metadata
      if (value._propertyTypes) {
        return objectType(value._propertyTypes);
      }
      return objectType();

    default:
      return primitiveType(TypeKind.Unknown);
  }
}

/**
 * Check if a value matches a type descriptor
 * @param {*} value - Value to check
 * @param {Object} typeDesc - Type descriptor
 * @returns {boolean} True if value matches type
 */
export function isType(value, typeDesc) {
  const actualType = getRuntimeType(value);
  return typesMatch(actualType, typeDesc);
}

/**
 * Check if two type descriptors match
 * @param {Object} actual - Actual type descriptor
 * @param {Object} expected - Expected type descriptor
 * @returns {boolean} True if types match
 */
function typesMatch(actual, expected) {
  // Kind must match
  if (actual.kind !== expected.kind) {
    return false;
  }

  // For generic types, check element/result types if specified
  switch (expected.kind) {
    case TypeKind.Channel:
      if (expected.elementType) {
        if (!actual.elementType) return false;
        return typesMatch(actual.elementType, expected.elementType);
      }
      return true;

    case TypeKind.Task:
      if (expected.resultType) {
        if (!actual.resultType) return false;
        return typesMatch(actual.resultType, expected.resultType);
      }
      return true;

    case TypeKind.Array:
      if (expected.elementType) {
        if (!actual.elementType) return false;
        return typesMatch(actual.elementType, expected.elementType);
      }
      return true;

    case TypeKind.Function:
      // For now, just check kind match
      // Full signature matching can be added later
      return true;

    case TypeKind.Object:
      // For now, just check kind match
      // Property-level matching can be added later
      return true;

    default:
      return true;
  }
}

/**
 * Attach type metadata to a channel
 * @param {Channel} channel - Channel instance
 * @param {Object} elementType - Element type descriptor
 * @returns {Channel} Same channel (for chaining)
 */
export function annotateChannel(channel, elementType) {
  channel._elementType = elementType;
  return channel;
}

/**
 * Attach type metadata to a task
 * @param {Promise} task - Task promise
 * @param {Object} resultType - Result type descriptor
 * @returns {Promise} Same task (for chaining)
 */
export function annotateTask(task, resultType) {
  task._isPulseTask = true;
  task._resultType = resultType;
  return task;
}

/**
 * Attach type metadata to an array
 * @param {Array} array - Array instance
 * @param {Object} elementType - Element type descriptor
 * @returns {Array} Same array (for chaining)
 */
export function annotateArray(array, elementType) {
  array._elementType = elementType;
  return array;
}

/**
 * Attach type metadata to a function
 * @param {Function} func - Function instance
 * @param {Array<Object>} paramTypes - Parameter type descriptors
 * @param {Object} returnType - Return type descriptor
 * @returns {Function} Same function (for chaining)
 */
export function annotateFunction(func, paramTypes, returnType) {
  func._paramTypes = paramTypes;
  func._returnType = returnType;
  return func;
}

/**
 * Format a type descriptor as a string
 * @param {Object} typeDesc - Type descriptor
 * @returns {string} Formatted type string
 */
export function formatType(typeDesc) {
  if (!typeDesc || !typeDesc.kind) {
    return 'unknown';
  }

  switch (typeDesc.kind) {
    case TypeKind.Channel:
      if (typeDesc.elementType) {
        return `Channel<${formatType(typeDesc.elementType)}>`;
      }
      return 'Channel';

    case TypeKind.Task:
      if (typeDesc.resultType) {
        return `Task<${formatType(typeDesc.resultType)}>`;
      }
      return 'Task';

    case TypeKind.Array:
      if (typeDesc.elementType) {
        return `Array<${formatType(typeDesc.elementType)}>`;
      }
      return 'Array';

    case TypeKind.Function:
      if (typeDesc.paramTypes && typeDesc.returnType) {
        const params = typeDesc.paramTypes.map(formatType).join(', ');
        const ret = formatType(typeDesc.returnType);
        return `(${params}) => ${ret}`;
      }
      return 'Function';

    default:
      return typeDesc.kind;
  }
}
