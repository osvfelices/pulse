/**
 * Pulse Lockfile Manager v1
 *
 * Manages pulse-lock.json for deterministic dependency resolution.
 * Atomic writes ensure consistency.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ErrorCodes, createError } from '../../std/error-codes.js';

/**
 * Lockfile structure:
 * {
 *   "version": "1.0",
 *   "dependencies": {
 *     "package-name": {
 *       "version": "1.0.0",
 *       "integrity": "sha256-...",
 *       "source": "registry" | "local",
 *       "resolved": "registry-url-or-path"
 *     }
 *   }
 * }
 */

export class LockfileManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.lockfilePath = path.join(projectRoot, 'pulse-lock.json');
  }

  /**
   * Read lockfile
   */
  async read() {
    try {
      const content = await fs.readFile(this.lockfilePath, 'utf-8');
      const lockfile = JSON.parse(content);

      if (!lockfile.version || !lockfile.dependencies) {
        return createError(
          ErrorCodes.LOCKFILE_CONFLICT,
          'Invalid lockfile format'
        );
      }

      return {
        ok: true,
        lockfile
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        // No lockfile exists - return empty
        return {
          ok: true,
          lockfile: {
            version: '1.0',
            dependencies: {}
          }
        };
      }

      return createError(
        ErrorCodes.LOCKFILE_CONFLICT,
        `Failed to read lockfile: ${error.message}`
      );
    }
  }

  /**
   * Write lockfile atomically
   */
  async write(lockfile) {
    try {
      // Ensure lockfile has correct structure
      if (!lockfile.version) {
        lockfile.version = '1.0';
      }
      if (!lockfile.dependencies) {
        lockfile.dependencies = {};
      }

      // Sort dependencies for deterministic output
      const sorted = {
        version: lockfile.version,
        dependencies: {}
      };

      const keys = Object.keys(lockfile.dependencies).sort();
      for (const key of keys) {
        sorted.dependencies[key] = lockfile.dependencies[key];
      }

      // Write to temp file first
      const tempPath = this.lockfilePath + '.tmp';
      const content = JSON.stringify(sorted, null, 2) + '\n';
      await fs.writeFile(tempPath, content, 'utf-8');

      // Atomic rename
      await fs.rename(tempPath, this.lockfilePath);

      return { ok: true };
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(this.lockfilePath + '.tmp');
      } catch {}

      return createError(
        ErrorCodes.LOCKFILE_CONFLICT,
        `Failed to write lockfile: ${error.message}`
      );
    }
  }

  /**
   * Add dependency to lockfile
   */
  async addDependency(name, entry) {
    const result = await this.read();
    if (!result.ok) {
      return result;
    }

    const lockfile = result.lockfile;
    lockfile.dependencies[name] = {
      version: entry.version,
      integrity: entry.integrity,
      source: entry.source || 'registry',
      resolved: entry.resolved || name
    };

    return this.write(lockfile);
  }

  /**
   * Remove dependency from lockfile
   */
  async removeDependency(name) {
    const result = await this.read();
    if (!result.ok) {
      return result;
    }

    const lockfile = result.lockfile;
    delete lockfile.dependencies[name];

    return this.write(lockfile);
  }

  /**
   * Get dependency entry
   */
  async getDependency(name) {
    const result = await this.read();
    if (!result.ok) {
      return result;
    }

    const entry = result.lockfile.dependencies[name];
    if (!entry) {
      return createError(
        ErrorCodes.PACKAGE_NOT_FOUND,
        `Dependency ${name} not found in lockfile`
      );
    }

    return {
      ok: true,
      entry
    };
  }

  /**
   * Check if lockfile exists
   */
  async exists() {
    try {
      await fs.access(this.lockfilePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate lockfile integrity
   */
  async validate(manifest) {
    const result = await this.read();
    if (!result.ok) {
      return result;
    }

    const lockfile = result.lockfile;
    const errors = [];

    // Check if all manifest dependencies are in lockfile
    for (const [name, version] of Object.entries(manifest.dependencies || {})) {
      if (!lockfile.dependencies[name]) {
        errors.push(`Missing dependency ${name} in lockfile`);
      }
    }

    // Check if lockfile has extra dependencies
    for (const name of Object.keys(lockfile.dependencies)) {
      if (!manifest.dependencies || !manifest.dependencies[name]) {
        errors.push(`Extra dependency ${name} in lockfile`);
      }
    }

    if (errors.length > 0) {
      return createError(
        ErrorCodes.LOCKFILE_CONFLICT,
        `Lockfile validation failed: ${errors.join(', ')}`
      );
    }

    return { ok: true };
  }
}

export function createLockfileManager(projectRoot) {
  return new LockfileManager(projectRoot);
}
