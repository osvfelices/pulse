/**
 * Pulse Package Registry Client v1
 *
 * Fetches package metadata and downloads packages from registry.
 * Supports local directory-based registry and HTTP-based registry.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { ErrorCodes, createError } from '../../std/error-codes.js';

/**
 * Registry Client
 * Abstracts package registry access
 */
export class RegistryClient {
  constructor(config = {}) {
    this.registryUrl = config.registryUrl || 'https://registry.pulse-lang.org';
    this.registryType = config.registryType || 'local'; // 'local' or 'http'
    this.registryPath = config.registryPath || '.pulse-registry';
  }

  /**
   * Get package metadata (all versions)
   */
  async getPackageMetadata(packageName) {
    if (this.registryType === 'local') {
      return this._getLocalMetadata(packageName);
    } else {
      return this._getHttpMetadata(packageName);
    }
  }

  /**
   * Get specific version metadata
   */
  async getVersionMetadata(packageName, version) {
    const metadata = await this.getPackageMetadata(packageName);
    if (!metadata.ok) {
      return metadata;
    }

    const versionData = metadata.versions[version];
    if (!versionData) {
      return createError(
        ErrorCodes.VERSION_NOT_FOUND,
        `Version ${version} not found for package ${packageName}`
      );
    }

    return {
      ok: true,
      name: packageName,
      version,
      ...versionData
    };
  }

  /**
   * Download package tarball/directory
   */
  async downloadPackage(packageName, version, targetPath) {
    const versionMeta = await this.getVersionMetadata(packageName, version);
    if (!versionMeta.ok) {
      return versionMeta;
    }

    if (this.registryType === 'local') {
      return this._downloadLocalPackage(packageName, version, targetPath);
    } else {
      return this._downloadHttpPackage(packageName, version, targetPath, versionMeta);
    }
  }

  /**
   * Verify package checksum
   */
  async verifyChecksum(filePath, expectedChecksum) {
    try {
      const content = await fs.readFile(filePath);
      const hash = createHash('sha256').update(content).digest('hex');

      if (hash !== expectedChecksum) {
        return createError(
          ErrorCodes.CHECKSUM_MISMATCH,
          `Checksum mismatch: expected ${expectedChecksum}, got ${hash}`
        );
      }

      return { ok: true, checksum: hash };
    } catch (error) {
      return createError(
        ErrorCodes.PACKAGE_CORRUPT,
        `Failed to verify checksum: ${error.message}`
      );
    }
  }

  /**
   * Calculate checksum for a directory
   */
  async calculateDirectoryChecksum(dirPath) {
    try {
      const files = await this._getAllFiles(dirPath);
      const hash = createHash('sha256');

      // Sort files for deterministic hash
      files.sort();

      for (const file of files) {
        const content = await fs.readFile(file);
        const relativePath = path.relative(dirPath, file);
        hash.update(relativePath);
        hash.update(content);
      }

      return { ok: true, checksum: hash.digest('hex') };
    } catch (error) {
      return createError(
        ErrorCodes.PACKAGE_CORRUPT,
        `Failed to calculate checksum: ${error.message}`
      );
    }
  }

  // Private methods

  async _getLocalMetadata(packageName) {
    try {
      const metadataPath = path.join(this.registryPath, packageName, 'metadata.json');
      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata = JSON.parse(content);

      return {
        ok: true,
        name: packageName,
        versions: metadata.versions || {}
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return createError(
          ErrorCodes.PACKAGE_NOT_FOUND,
          `Package ${packageName} not found in local registry`
        );
      }
      return createError(
        ErrorCodes.REGISTRY_UNAVAILABLE,
        `Failed to read package metadata: ${error.message}`
      );
    }
  }

  async _getHttpMetadata(packageName) {
    // Placeholder for HTTP registry support
    return createError(
      ErrorCodes.REGISTRY_UNAVAILABLE,
      'HTTP registry not yet implemented'
    );
  }

  async _downloadLocalPackage(packageName, version, targetPath) {
    try {
      const sourcePath = path.join(this.registryPath, packageName, version);

      // Check if source exists
      try {
        await fs.access(sourcePath);
      } catch {
        return createError(
          ErrorCodes.PACKAGE_NOT_FOUND,
          `Package ${packageName}@${version} not found in local registry`
        );
      }

      // Copy directory recursively
      await this._copyDirectory(sourcePath, targetPath);

      // Calculate checksum
      const checksumResult = await this.calculateDirectoryChecksum(targetPath);
      if (!checksumResult.ok) {
        return checksumResult;
      }

      return {
        ok: true,
        checksum: checksumResult.checksum,
        path: targetPath
      };
    } catch (error) {
      return createError(
        ErrorCodes.INSTALL_FAILED,
        `Failed to download package: ${error.message}`
      );
    }
  }

  async _downloadHttpPackage(packageName, version, targetPath, versionMeta) {
    // Placeholder for HTTP download
    return createError(
      ErrorCodes.REGISTRY_UNAVAILABLE,
      'HTTP registry not yet implemented'
    );
  }

  async _copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this._copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
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

export function createRegistryClient(config) {
  return new RegistryClient(config);
}
