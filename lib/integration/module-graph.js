/**
 * Pulse Module Graph
 * Unified in-memory dependency graph + AST cache
 * Shared by CLI, Runtime, and LSP
 */

export class ModuleGraph {
  constructor() {
    this.modules = new Map(); // uri -> Module
    this.astCache = new Map(); // uri -> AST
    this.dependencies = new Map(); // uri -> Set<uri>
    this.reverseDependencies = new Map(); // uri -> Set<uri>
  }

  /**
   * Add module to graph
   */
  addModule(uri, source, ast) {
    this.modules.set(uri, { uri, source, ast, timestamp: Date.now() });
    this.astCache.set(uri, ast);

    if (!this.dependencies.has(uri)) {
      this.dependencies.set(uri, new Set());
    }
    if (!this.reverseDependencies.has(uri)) {
      this.reverseDependencies.set(uri, new Set());
    }
  }

  /**
   * Add dependency edge
   */
  addDependency(from, to) {
    if (!this.dependencies.has(from)) {
      this.dependencies.set(from, new Set());
    }
    if (!this.reverseDependencies.has(to)) {
      this.reverseDependencies.set(to, new Set());
    }

    this.dependencies.get(from).add(to);
    this.reverseDependencies.get(to).add(from);
  }

  /**
   * Get module by URI
   */
  getModule(uri) {
    return this.modules.get(uri);
  }

  /**
   * Get AST from cache
   */
  getAST(uri) {
    return this.astCache.get(uri);
  }

  /**
   * Get dependencies of a module
   */
  getDependencies(uri) {
    return Array.from(this.dependencies.get(uri) || []);
  }

  /**
   * Get modules that depend on this module
   */
  getDependents(uri) {
    return Array.from(this.reverseDependencies.get(uri) || []);
  }

  /**
   * Get all modules in deterministic order (topological sort)
   */
  getOrderedModules() {
    const visited = new Set();
    const result = [];
    const visiting = new Set();

    const visit = (uri) => {
      if (visited.has(uri)) return;
      if (visiting.has(uri)) {
        throw new Error(`Circular dependency detected: ${uri}`);
      }

      visiting.add(uri);

      const deps = this.dependencies.get(uri) || new Set();
      for (const dep of deps) {
        visit(dep);
      }

      visiting.delete(uri);
      visited.add(uri);
      result.push(uri);
    };

    // Visit all modules in sorted order for determinism
    const allUris = Array.from(this.modules.keys()).sort();
    for (const uri of allUris) {
      visit(uri);
    }

    return result;
  }

  /**
   * Invalidate module (remove from cache)
   */
  invalidate(uri) {
    this.modules.delete(uri);
    this.astCache.delete(uri);

    // Clear dependencies
    const deps = this.dependencies.get(uri);
    if (deps) {
      for (const dep of deps) {
        const revDeps = this.reverseDependencies.get(dep);
        if (revDeps) {
          revDeps.delete(uri);
        }
      }
    }
    this.dependencies.delete(uri);

    // Clear reverse dependencies
    const revDeps = this.reverseDependencies.get(uri);
    if (revDeps) {
      for (const parent of revDeps) {
        const parentDeps = this.dependencies.get(parent);
        if (parentDeps) {
          parentDeps.delete(uri);
        }
      }
    }
    this.reverseDependencies.delete(uri);
  }

  /**
   * Clear entire graph
   */
  clear() {
    this.modules.clear();
    this.astCache.clear();
    this.dependencies.clear();
    this.reverseDependencies.clear();
  }

  /**
   * Get graph statistics
   */
  getStats() {
    return {
      modules: this.modules.size,
      cachedASTs: this.astCache.size,
      edges: Array.from(this.dependencies.values()).reduce((sum, set) => sum + set.size, 0)
    };
  }
}
