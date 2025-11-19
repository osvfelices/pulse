/**
 * Pulse Standard Library - Console Module
 * Thin wrapper over console for structured logging
 */

export function log(...args) {
  console.log(...args);
}

export function error(...args) {
  console.error(...args);
}

export function warn(...args) {
  console.warn(...args);
}

export function info(...args) {
  console.info(...args);
}

export function debug(...args) {
  console.debug(...args);
}

export function trace(...args) {
  console.trace(...args);
}

export function table(data) {
  console.table(data);
}

export function time(label) {
  console.time(label);
}

export function timeEnd(label) {
  console.timeEnd(label);
}

export function clear() {
  console.clear();
}
