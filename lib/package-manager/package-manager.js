/**
 * Pulse Package Manager v1
 *
 * Core package management: install, add, remove dependencies.
 * Ensures deterministic resolution and atomic operations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ErrorCodes, createError } from '../../std/error-codes.js';
import { createRegistryClient } from './registry-client.js';
import { createLockfileManager } from './lockfile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PULSE_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_REGISTRY_PATH = path.join(PULSE_ROOT, 'pulse-registry');

export class PackageManager {
  constructor(projectRoot, config = {}) {
    this.projectRoot = projectRoot;
    this.manifestPath = path.join(projectRoot, 'pulse.json');
    this.packagesDir = path.join(projectRoot, '.pulse', 'packages');

    // Default to local registry in Pulse repo
    const registryConfig = config.registry || {};
    if (!registryConfig.registryPath) {
      registryConfig.registryPath = DEFAULT_REGISTRY_PATH;
      registryConfig.registryType = 'local';
    }

    this.registryClient = createRegistryClient(registryConfig);
    this.lockfileManager = createLockfileManager(projectRoot);
  }

  /**
   * Read project manifest (pulse.json)
   */
  async readManifest() {
    try {
      const content = await fs.readFile(this.manifestPath, 'utf-8');
      const manifest = JSON.parse(content);

      if (!manifest.name) {
        return createError(
          ErrorCodes.INVALID_MANIFEST,
          'Manifest must have a name field'
        );
      }

      return {
        ok: true,
        manifest
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return createError(
          ErrorCodes.INVALID_MANIFEST,
          'No pulse.json found in project root'
        );
      }

      return createError(
        ErrorCodes.INVALID_MANIFEST,
        `Failed to read manifest: ${error.message}`
      );
    }
  }

  /**
   * Write project manifest atomically
   */
  async writeManifest(manifest) {
    try {
      // Sort dependencies for deterministic output
      if (manifest.dependencies) {
        const sorted = {};
        const keys = Object.keys(manifest.dependencies).sort();
        for (const key of keys) {
          sorted[key] = manifest.dependencies[key];
        }
        manifest.dependencies = sorted;
      }

      const tempPath = this.manifestPath + '.tmp';
      const content = JSON.stringify(manifest, null, 2) + '\n';
      await fs.writeFile(tempPath, content, 'utf-8');
      await fs.rename(tempPath, this.manifestPath);

      return { ok: true };
    } catch (error) {
      // Clean up temp file
      try {
        await fs.unlink(this.manifestPath + '.tmp');
      } catch {}

      return createError(
        ErrorCodes.INVALID_MANIFEST,
        `Failed to write manifest: ${error.message}`
      );
    }
  }

  /**
   * Install all dependencies from manifest
   */
  async install() {
    // Read manifest
    const manifestResult = await this.readManifest();
    if (!manifestResult.ok) {
      return manifestResult;
    }

    const manifest = manifestResult.manifest;
    const dependencies = manifest.dependencies || {};

    // Read existing lockfile
    const lockfileResult = await this.lockfileManager.read();
    if (!lockfileResult.ok) {
      return lockfileResult;
    }

    const lockfile = lockfileResult.lockfile;

    // Ensure packages directory exists
    await fs.mkdir(this.packagesDir, { recursive: true });

    // Track installed packages
    const installed = [];
    const errors = [];

    try {
      // Install each dependency
      for (const [name, versionSpec] of Object.entries(dependencies)) {
        const result = await this._installPackage(name, versionSpec, lockfile);

        if (!result.ok) {
          errors.push({ name, error: result.error });
          // Continue with other packages
        } else {
          installed.push({ name, version: result.version, integrity: result.integrity });
        }
      }

      if (errors.length > 0) {
        return createError(
          ErrorCodes.INSTALL_FAILED,
          `Failed to install ${errors.length} package(s): ${errors.map(e => e.name).join(', ')}`
        );
      }

      // Update lockfile with all installed packages
      for (const pkg of installed) {
        await this.lockfileManager.addDependency(pkg.name, {
          version: pkg.version,
          integrity: pkg.integrity,
          source: 'registry',
          resolved: pkg.name
        });
      }

      return {
        ok: true,
        installed
      };
    } catch (error) {
      return createError(
        ErrorCodes.INSTALL_FAILED,
        `Installation failed: ${error.message}`
      );
    }
  }

  /**
   * Add a new dependency
   */
  async add(packageName, versionSpec) {
    // Read manifest
    const manifestResult = await this.readManifest();
    if (!manifestResult.ok) {
      return manifestResult;
    }

    const manifest = manifestResult.manifest;

    // Read lockfile
    const lockfileResult = await this.lockfileManager.read();
    if (!lockfileResult.ok) {
      return lockfileResult;
    }

    const lockfile = lockfileResult.lockfile;

    // Resolve version
    const resolveResult = await this._resolveVersion(packageName, versionSpec);
    if (!resolveResult.ok) {
      return resolveResult;
    }

    const version = resolveResult.version;

    // Install package
    await fs.mkdir(this.packagesDir, { recursive: true });
    const installResult = await this._installPackage(packageName, version, lockfile);
    if (!installResult.ok) {
      return installResult;
    }

    // Update manifest
    if (!manifest.dependencies) {
      manifest.dependencies = {};
    }
    manifest.dependencies[packageName] = versionSpec;

    const writeResult = await this.writeManifest(manifest);
    if (!writeResult.ok) {
      return writeResult;
    }

    // Update lockfile
    await this.lockfileManager.addDependency(packageName, {
      version: installResult.version,
      integrity: installResult.integrity,
      source: 'registry',
      resolved: packageName
    });

    return {
      ok: true,
      package: packageName,
      version: installResult.version
    };
  }

  /**
   * Remove a dependency
   */
  async remove(packageName) {
    // Read manifest
    const manifestResult = await this.readManifest();
    if (!manifestResult.ok) {
      return manifestResult;
    }

    const manifest = manifestResult.manifest;

    if (!manifest.dependencies || !manifest.dependencies[packageName]) {
      return createError(
        ErrorCodes.PACKAGE_NOT_FOUND,
        `Package ${packageName} not found in dependencies`
      );
    }

    // Remove from manifest
    delete manifest.dependencies[packageName];

    const writeResult = await this.writeManifest(manifest);
    if (!writeResult.ok) {
      return writeResult;
    }

    // Remove from lockfile
    await this.lockfileManager.removeDependency(packageName);

    // Remove package directory
    const packagePath = path.join(this.packagesDir, packageName);
    try {
      await fs.rm(packagePath, { recursive: true, force: true });
    } catch {
      // Ignore errors - package might not be installed
    }

    return {
      ok: true,
      package: packageName
    };
  }

  /**
   * List installed packages
   */
  async list() {
    const lockfileResult = await this.lockfileManager.read();
    if (!lockfileResult.ok) {
      return lockfileResult;
    }

    const packages = Object.entries(lockfileResult.lockfile.dependencies).map(
      ([name, entry]) => ({
        name,
        version: entry.version,
        integrity: entry.integrity
      })
    );

    return {
      ok: true,
      packages
    };
  }

  // Private methods

  async _installPackage(name, versionSpec, lockfile) {
    // Check if already installed with matching version
    const existingEntry = lockfile.dependencies[name];
    if (existingEntry && this._versionMatches(existingEntry.version, versionSpec)) {
      // Check if package directory exists
      const packagePath = path.join(this.packagesDir, name);
      try {
        await fs.access(packagePath);
        // Already installed, verify integrity
        const checksumResult = await this.registryClient.calculateDirectoryChecksum(packagePath);
        if (checksumResult.ok && checksumResult.checksum === existingEntry.integrity) {
          return {
            ok: true,
            version: existingEntry.version,
            integrity: existingEntry.integrity
          };
        }
      } catch {
        // Package directory missing, reinstall
      }
    }

    // Resolve version
    const resolveResult = await this._resolveVersion(name, versionSpec);
    if (!resolveResult.ok) {
      return resolveResult;
    }

    const version = resolveResult.version;

    // Download package
    const packagePath = path.join(this.packagesDir, name);

    // Clean up existing installation
    try {
      await fs.rm(packagePath, { recursive: true, force: true });
    } catch {}

    const downloadResult = await this.registryClient.downloadPackage(name, version, packagePath);
    if (!downloadResult.ok) {
      // Clean up on failure
      try {
        await fs.rm(packagePath, { recursive: true, force: true });
      } catch {}
      return downloadResult;
    }

    return {
      ok: true,
      version,
      integrity: downloadResult.checksum,
      path: packagePath
    };
  }

  async _resolveVersion(packageName, versionSpec) {
    // For M17, use exact version matching
    // Future: implement semver range resolution

    // If version is exact (e.g., "1.0.0"), use it
    // If version is a range (e.g., "^1.0.0"), resolve to latest matching

    // For now, treat version as exact
    const metadata = await this.registryClient.getPackageMetadata(packageName);
    if (!metadata.ok) {
      return metadata;
    }

    // Check if exact version exists
    if (metadata.versions[versionSpec]) {
      return {
        ok: true,
        version: versionSpec
      };
    }

    // Try to find latest version matching spec
    const versions = Object.keys(metadata.versions).sort().reverse();
    if (versions.length === 0) {
      return createError(
        ErrorCodes.VERSION_NOT_FOUND,
        `No versions found for package ${packageName}`
      );
    }

    // For simple case, use latest version if spec is "*" or missing
    if (versionSpec === '*' || versionSpec === 'latest') {
      return {
        ok: true,
        version: versions[0]
      };
    }

    // Version not found
    return createError(
      ErrorCodes.VERSION_NOT_FOUND,
      `Version ${versionSpec} not found for package ${packageName}. Available: ${versions.join(', ')}`
    );
  }

  _versionMatches(installedVersion, spec) {
    // Simple exact match for M17
    // Future: implement semver matching
    return installedVersion === spec || spec === '*' || spec === 'latest';
  }
}

export function createPackageManager(projectRoot, config) {
  return new PackageManager(projectRoot, config);
}
