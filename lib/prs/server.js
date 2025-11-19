/**
 * PRS HTTP Server
 *
 * Production-grade HTTP server for Pulse Runtime Server.
 * Exposes REST API for project loading, execution, and introspection.
 */

import http from 'http';
import { resolve, isAbsolute, normalize } from 'path';
import { existsSync, statSync, realpathSync } from 'fs';
import { PRSRuntimeInstance } from './runtime-instance.js';
import { ErrorCodes } from '../../std/error-codes.js';

/**
 * PRSServer - HTTP server for Pulse Runtime Server
 */
export class PRSServer {
  constructor(options = {}) {
    this.port = options.port || 3000;
    this.host = options.host || 'localhost';
    this.runtime = new PRSRuntimeInstance(options.runtime || {});
    this.server = null;
    this.logger = this.runtime.logger;

    // Rate limiting: requests per IP per minute
    this.rateLimit = options.rateLimit || 100;
    this.rateLimitWindow = options.rateLimitWindow || 60000; // 1 minute
    this.requestCounts = new Map(); // ip -> {count, resetTime}

    // Request timeout (30 seconds default)
    this.requestTimeout = options.requestTimeout || 30000;
  }

  /**
   * Start the HTTP server
   * @returns {Promise<Object>} Start result
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        this.logger.error('Server error', { error: error.message });
        reject(error);
      });

      this.server.listen(this.port, this.host, () => {
        this.logger.info('PRS server started', {
          host: this.host,
          port: this.port
        });

        // Cleanup expired rate limit entries every minute
        this.rateLimitCleanup = setInterval(() => {
          const now = Date.now();
          for (const [ip, record] of this.requestCounts.entries()) {
            if (now >= record.resetTime) {
              this.requestCounts.delete(ip);
            }
          }
        }, 60000);

        resolve({
          ok: true,
          host: this.host,
          port: this.port
        });
      });
    });
  }

  /**
   * Stop the HTTP server
   * @returns {Promise<Object>} Stop result
   */
  async stop() {
    if (!this.server) {
      return { ok: true };
    }

    // Clear rate limit cleanup interval
    if (this.rateLimitCleanup) {
      clearInterval(this.rateLimitCleanup);
      this.rateLimitCleanup = null;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('PRS server stopped');
        this.server = null;
        resolve({ ok: true });
      });
    });
  }

  /**
   * Check rate limit for IP
   */
  checkRateLimit(ip) {
    const now = Date.now();
    const record = this.requestCounts.get(ip);

    if (!record || now >= record.resetTime) {
      this.requestCounts.set(ip, { count: 1, resetTime: now + this.rateLimitWindow });
      return true;
    }

    if (record.count >= this.rateLimit) {
      return false;
    }

    record.count++;
    return true;
  }

  /**
   * Handle HTTP request
   */
  async handleRequest(req, res) {
    // Set request timeout
    req.setTimeout(this.requestTimeout, () => {
      if (!res.headersSent) {
        res.writeHead(408, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: false,
          error: 'Request timeout',
          code: 'REQUEST_TIMEOUT'
        }));
      }
    });

    // Set socket timeout
    req.socket.setTimeout(this.requestTimeout);

    // Extract client IP
    const ip = req.socket.remoteAddress || 'unknown';

    // Rate limiting
    if (!this.checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED'
      }));
      return;
    }

    // Log request
    this.logger.debug('HTTP request', {
      method: req.method,
      url: req.url,
      ip
    });

    // Parse URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    // CORS headers (for development/testing)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS for CORS
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Route request
      let result;

      if (path === '/load' && req.method === 'POST') {
        result = await this.handleLoad(req);
      } else if (path === '/reload' && req.method === 'POST') {
        result = await this.handleReload(req);
      } else if (path === '/run' && req.method === 'POST') {
        result = await this.handleRun(req);
      } else if (path === '/status' && req.method === 'GET') {
        result = await this.handleStatus(req);
      } else if (path === '/snapshot' && req.method === 'GET') {
        result = await this.handleSnapshot(req);
      } else if (path === '/logs' && req.method === 'GET') {
        result = await this.handleLogs(req, url);
      } else {
        result = {
          ok: false,
          code: ErrorCodes.PRS_INVALID_REQUEST,
          error: `Unknown endpoint: ${req.method} ${path}`
        };
      }

      // Send response
      this.sendJSON(res, result.ok ? 200 : 400, result);
    } catch (error) {
      this.logger.error('Request handler error', {
        error: error.message,
        stack: error.stack
      });
      this.sendJSON(res, 500, {
        ok: false,
        error: error.message
      });
    }
  }

  /**
   * Handle POST /load
   */
  async handleLoad(req) {
    const body = await this.readBody(req);

    if (!body.path) {
      return {
        ok: false,
        code: ErrorCodes.PRS_INVALID_REQUEST,
        error: 'Missing required field: path'
      };
    }

    // Validate and sanitize path
    let projectPath;
    try {
      // Resolve to absolute path
      projectPath = resolve(body.path);

      // Verify path exists
      if (!existsSync(projectPath)) {
        return {
          ok: false,
          code: ErrorCodes.PRS_INVALID_REQUEST,
          error: 'Project path does not exist'
        };
      }

      // Verify it's a directory
      const stats = statSync(projectPath);
      if (!stats.isDirectory()) {
        return {
          ok: false,
          code: ErrorCodes.PRS_INVALID_REQUEST,
          error: 'Project path must be a directory'
        };
      }

      // Resolve symbolic links to prevent symlink attacks
      projectPath = realpathSync(projectPath);

    } catch (error) {
      return {
        ok: false,
        code: ErrorCodes.PRS_INVALID_REQUEST,
        error: `Invalid project path: ${error.message}`
      };
    }

    return await this.runtime.loadProject(projectPath, body.options || {});
  }

  /**
   * Handle POST /reload
   */
  async handleReload(req) {
    return await this.runtime.reloadProject();
  }

  /**
   * Handle POST /run
   */
  async handleRun(req) {
    const body = await this.readBody(req);
    const entryName = body.entry || null;
    const args = body.args || [];

    return await this.runtime.runEntry(entryName, args);
  }

  /**
   * Handle GET /status
   */
  async handleStatus(req) {
    return this.runtime.getStatus();
  }

  /**
   * Handle GET /snapshot
   */
  async handleSnapshot(req) {
    return this.runtime.getSnapshot();
  }

  /**
   * Handle GET /logs
   */
  async handleLogs(req, url) {
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    return this.runtime.getLogs(limit, offset);
  }

  /**
   * Read request body as JSON
   */
  async readBody(req, maxSize = 1048576) {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;

      req.on('data', (chunk) => {
        size += chunk.length;

        // Enforce maximum body size to prevent DoS
        if (size > maxSize) {
          req.destroy();
          reject(new Error('Request body too large'));
          return;
        }

        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          if (body.length === 0) {
            resolve({});
          } else {
            resolve(JSON.parse(body));
          }
        } catch (error) {
          reject(new Error('Invalid JSON in request body'));
        }
      });

      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  sendJSON(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Get runtime instance (for testing)
   */
  getRuntime() {
    return this.runtime;
  }
}

/**
 * Create and start a PRS server
 * @param {Object} options - Server options
 * @returns {Promise<PRSServer>} Started server instance
 */
export async function createPRSServer(options = {}) {
  const server = new PRSServer(options);
  await server.start();
  return server;
}
