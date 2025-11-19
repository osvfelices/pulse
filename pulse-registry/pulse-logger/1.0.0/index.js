/**
 * pulse-logger v1.0.0
 * Simple logging for Pulse applications
 */

export function log(level, message, metadata = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    ...metadata
  };
  console.log(JSON.stringify(entry));
}

export function info(message, metadata) {
  log('INFO', message, metadata);
}

export function error(message, metadata) {
  log('ERROR', message, metadata);
}

export function warn(message, metadata) {
  log('WARN', message, metadata);
}
