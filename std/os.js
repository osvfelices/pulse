/**
 * OS utilities for Pulse (JavaScript target)
 */

import nodeOs from 'node:os';

function homedir() {
  return nodeOs.homedir();
}

function platform() {
  return nodeOs.platform();
}

function tmpdir() {
  return nodeOs.tmpdir();
}

export default {
  homedir,
  platform,
  tmpdir
};
