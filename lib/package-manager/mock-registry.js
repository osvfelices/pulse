/**
 * Mock Registry for Testing
 *
 * Creates a local directory-based registry for testing package manager.
 * NOT for production use.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';

export class MockRegistry {
  constructor(registryPath) {
    this.registryPath = registryPath;
  }

  /**
   * Initialize mock registry
   */
  async init() {
    await fs.mkdir(this.registryPath, { recursive: true });
  }

  /**
   * Add a package to the registry
   */
  async addPackage(name, version, files) {
    const packagePath = path.join(this.registryPath, name);
    const versionPath = path.join(packagePath, version);

    // Create version directory
    await fs.mkdir(versionPath, { recursive: true });

    // Write files
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = path.join(versionPath, filePath);
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    }

    // Calculate integrity checksum
    const checksum = await this._calculateChecksum(versionPath);

    // Update metadata
    await this._updateMetadata(name, version, checksum);

    return { ok: true, checksum };
  }

  /**
   * Remove a package from the registry
   */
  async removePackage(name, version) {
    const versionPath = path.join(this.registryPath, name, version);
    try {
      await fs.rm(versionPath, { recursive: true, force: true });

      // Update metadata
      const metadataPath = path.join(this.registryPath, name, 'metadata.json');
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(content);
      delete metadata.versions[version];

      if (Object.keys(metadata.versions).length === 0) {
        // Remove entire package
        await fs.rm(path.join(this.registryPath, name), { recursive: true, force: true });
      } else {
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
      }

      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  /**
   * Clear registry
   */
  async clear() {
    try {
      await fs.rm(this.registryPath, { recursive: true, force: true });
      await fs.mkdir(this.registryPath, { recursive: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }

  /**
   * Get package count
   */
  async getPackageCount() {
    try {
      const entries = await fs.readdir(this.registryPath, { withFileTypes: true });
      return entries.filter(e => e.isDirectory()).length;
    } catch {
      return 0;
    }
  }

  // Private methods

  async _updateMetadata(name, version, checksum) {
    const metadataPath = path.join(this.registryPath, name, 'metadata.json');

    let metadata = {
      name,
      versions: {}
    };

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(content);
    } catch {
      // File doesn't exist, use default
    }

    metadata.versions[version] = {
      version,
      integrity: checksum,
      tarball: `./${version}`
    };

    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  async _calculateChecksum(dirPath) {
    const files = await this._getAllFiles(dirPath);
    const hash = createHash('sha256');

    files.sort();

    for (const file of files) {
      const content = await fs.readFile(file);
      const relativePath = path.relative(dirPath, file);
      hash.update(relativePath);
      hash.update(content);
    }

    return hash.digest('hex');
  }

  async _getAllFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this._getAllFiles(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
}

export function createMockRegistry(registryPath) {
  return new MockRegistry(registryPath);
}
