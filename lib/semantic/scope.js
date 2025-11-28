/**
 * Lexical Scope Management
 *
 * Implements nested scope tracking for semantic analysis.
 * Scopes form a tree structure matching the lexical nesting of code.
 */

export class Scope {
  constructor(type, parent = null) {
    this.type = type; // 'module' | 'function' | 'block' | 'class'
    this.parent = parent;
    this.symbols = new Map(); // name -> Symbol
    this.children = [];
    this.allowReturn = type === 'function';
    this.allowBreak = false;
    this.allowContinue = false;
  }

  /**
   * Define a new symbol in this scope
   * @param {string} name
   * @param {Object} symbol
   * @returns {boolean} true if successful, false if duplicate
   */
  define(name, symbol) {
    if (this.symbols.has(name)) {
      return false;
    }
    this.symbols.set(name, symbol);
    return true;
  }

  /**
   * Look up a symbol in this scope and parent scopes
   * @param {string} name
   * @returns {Object|null} symbol or null if not found
   */
  resolve(name) {
    if (this.symbols.has(name)) {
      return this.symbols.get(name);
    }
    if (this.parent) {
      return this.parent.resolve(name);
    }
    return null;
  }

  /**
   * Check if a name exists in this scope only (not parents)
   * @param {string} name
   * @returns {boolean}
   */
  hasLocal(name) {
    return this.symbols.has(name);
  }

  /**
   * Create a child scope
   * @param {string} type
   * @returns {Scope}
   */
  createChild(type) {
    const child = new Scope(type, this);
    this.children.push(child);
    return child;
  }

  /**
   * Check if return is allowed in current scope
   * @returns {boolean}
   */
  canReturn() {
    return this.allowReturn || (this.parent && this.parent.canReturn());
  }

  /**
   * Check if break is allowed in current scope
   * @returns {boolean}
   */
  canBreak() {
    return this.allowBreak || (this.parent && this.parent.canBreak());
  }

  /**
   * Check if continue is allowed in current scope
   * @returns {boolean}
   */
  canContinue() {
    return this.allowContinue || (this.parent && this.parent.canContinue());
  }
}
