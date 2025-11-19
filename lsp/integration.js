/**
 * LSP Integration with Unified Loader
 * Connects LSP server to ProjectLoader via LSPBridge
 */

import { LSPBridge } from '../lib/integration/bridge.js';

export class LSPIntegration {
  constructor() {
    this.bridge = new LSPBridge();
    this.workspaceRoot = null;
  }

  /**
   * Set workspace root
   */
  setWorkspace(rootUri) {
    if (rootUri && rootUri.startsWith('file://')) {
      this.workspaceRoot = rootUri.replace('file://', '');
    }
  }

  /**
   * Get diagnostics for document using unified loader
   */
  async getDiagnostics(documentUri) {
    if (!this.workspaceRoot) {
      return [];
    }

    const diagnostics = await this.bridge.getDiagnostics(this.workspaceRoot, documentUri);
    return diagnostics;
  }

  /**
   * Get completion items using unified graph
   */
  async getCompletions(documentUri, position) {
    // For now, return empty - full implementation would use graph
    // to provide context-aware completions
    return [];
  }

  /**
   * Get definition using unified graph
   */
  async getDefinition(documentUri, position) {
    if (!this.workspaceRoot) {
      return null;
    }

    const result = await this.bridge.getDefinition(this.workspaceRoot, documentUri, position);
    return result.ok ? result.location : null;
  }

  /**
   * Invalidate document (on change)
   */
  invalidateDocument(documentUri) {
    if (this.workspaceRoot) {
      this.bridge.invalidateDocument(this.workspaceRoot, documentUri);
    }
  }

  /**
   * Get project tree
   */
  async getProjectTree() {
    if (!this.workspaceRoot) {
      return null;
    }

    const result = await this.bridge.getProjectTree(this.workspaceRoot);
    return result.ok ? result : null;
  }
}
