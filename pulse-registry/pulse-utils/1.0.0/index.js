/**
 * pulse-utils v1.0.0
 * Utility functions for Pulse applications
 */

export function formatDate(timestamp) {
  return new Date(timestamp).toISOString();
}

export function randomId() {
  return Math.random().toString(36).substring(2, 11);
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
