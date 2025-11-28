/**
 * IR Builder Errors
 */

export class IRBuilderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IRBuilderError';
  }
}

export class NoCurrentBlockError extends IRBuilderError {
  constructor() {
    super('No current block to emit instruction');
    this.name = 'NoCurrentBlockError';
  }
}

export class BlockNotFoundError extends IRBuilderError {
  constructor(label) {
    super(`Block with label ${label} not found`);
    this.name = 'BlockNotFoundError';
    this.label = label;
  }
}

export class NoLoopContextError extends IRBuilderError {
  constructor() {
    super('No loop to exit');
    this.name = 'NoLoopContextError';
  }
}
