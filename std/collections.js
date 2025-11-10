/**
 * Collections helpers for Pulse
 * Polyfills for array/object methods (for native compatibility)
 */

// Array methods are already built into JavaScript
// This module provides a consistent API for both JS and native targets

export const ArrayHelpers = {
  map(arr, fn) {
    return arr.map(fn);
  },

  filter(arr, fn) {
    return arr.filter(fn);
  },

  reduce(arr, fn, initial) {
    return arr.reduce(fn, initial);
  },

  find(arr, fn) {
    return arr.find(fn);
  },

  includes(arr, value) {
    return arr.includes(value);
  },

  some(arr, fn) {
    return arr.some(fn);
  },

  every(arr, fn) {
    return arr.every(fn);
  },

  forEach(arr, fn) {
    arr.forEach(fn);
  },

  slice(arr, start, end) {
    return arr.slice(start, end);
  },

  concat(...arrays) {
    return Array.prototype.concat.apply([], arrays);
  },

  flat(arr, depth = 1) {
    return arr.flat(depth);
  },

  flatMap(arr, fn) {
    return arr.flatMap(fn);
  },

  sort(arr, compareFn) {
    return [...arr].sort(compareFn);
  },

  reverse(arr) {
    return [...arr].reverse();
  },

  join(arr, separator = ',') {
    return arr.join(separator);
  },

  length(arr) {
    return arr.length;
  },

  push(arr, ...items) {
    arr.push(...items);
    return arr;
  },

  pop(arr) {
    return arr.pop();
  },

  shift(arr) {
    return arr.shift();
  },

  unshift(arr, ...items) {
    arr.unshift(...items);
    return arr;
  },
};

export const ObjectHelpers = {
  keys(obj) {
    return Object.keys(obj);
  },

  values(obj) {
    return Object.values(obj);
  },

  entries(obj) {
    return Object.entries(obj);
  },

  assign(target, ...sources) {
    return Object.assign(target, ...sources);
  },

  has(obj, key) {
    return key in obj;
  },

  get(obj, key, defaultValue = undefined) {
    return obj[key] !== undefined ? obj[key] : defaultValue;
  },

  set(obj, key, value) {
    obj[key] = value;
    return obj;
  },

  delete(obj, key) {
    delete obj[key];
    return obj;
  },

  freeze(obj) {
    return Object.freeze(obj);
  },

  seal(obj) {
    return Object.seal(obj);
  },
};

export default {
  Array: ArrayHelpers,
  Object: ObjectHelpers,
};
