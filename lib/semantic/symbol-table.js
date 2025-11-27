/**
 * Symbol Table
 *
 * Tracks variable, function, and class declarations with metadata
 * for semantic analysis.
 */

export class Symbol {
  constructor(name, kind, node, scope) {
    this.name = name;
    this.kind = kind; // 'var' | 'const' | 'function' | 'class' | 'param'
    this.node = node; // AST node where declared
    this.scope = scope;
    this.initialized = kind === 'function' || kind === 'class' || kind === 'param';
    this.references = []; // Array of nodes that reference this symbol
    this.typeDescriptor = null; // Runtime type descriptor (optional)
  }

  /**
   * Mark symbol as initialized (for TDZ tracking)
   */
  markInitialized() {
    this.initialized = true;
  }

  /**
   * Add a reference to this symbol
   * @param {Object} node - AST node referencing the symbol
   */
  addReference(node) {
    this.references.push(node);
  }

  /**
   * Check if symbol is const
   * @returns {boolean}
   */
  isConst() {
    return this.kind === 'const';
  }

  /**
   * Check if symbol is mutable
   * @returns {boolean}
   */
  isMutable() {
    return this.kind === 'var' || this.kind === 'param';
  }
}

export class SymbolTable {
  constructor() {
    this.symbols = new Map(); // name -> Symbol
  }

  /**
   * Add a symbol to the table
   * @param {Symbol} symbol
   * @returns {boolean} true if successful, false if duplicate
   */
  add(symbol) {
    if (this.symbols.has(symbol.name)) {
      return false;
    }
    this.symbols.set(symbol.name, symbol);
    return true;
  }

  /**
   * Look up a symbol by name
   * @param {string} name
   * @returns {Symbol|null}
   */
  lookup(name) {
    return this.symbols.get(name) || null;
  }

  /**
   * Check if a symbol exists
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.symbols.has(name);
  }

  /**
   * Get all symbols
   * @returns {Array<Symbol>}
   */
  all() {
    return Array.from(this.symbols.values());
  }
}
