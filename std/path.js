/**
 * Path utilities for Pulse (JavaScript target)
 */

import nodePath from 'node:path';

function join(...paths) {
  return nodePath.join(...paths);
}

function dirname(p) {
  return nodePath.dirname(p);
}

function basename(p) {
  return nodePath.basename(p);
}

function resolve(...paths) {
  return nodePath.resolve(...paths);
}

export default {
  join,
  dirname,
  basename,
  resolve
};
