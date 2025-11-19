/**
 * Pulse HTTP Router (Week 5)
 *
 * High-level routing and middleware layer built on top of Week 4's channel-based server.
 * Provides Express-like routing API while maintaining Pulse's deterministic semantics.
 */

// Re-export context utilities for convenience
export { context, transaction, auth, requireAuth } from './context.js';

/**
 * Router class for HTTP request routing and middleware
 */
export class Router {
  constructor() {
    this.routes = []; // Array of {method, pattern, handler, middleware}
    this.middleware = []; // Global middleware functions
    this.staticRoutes = []; // Static file serving routes
  }

  /**
   * Register global middleware
   * @param {Function} fn - Middleware function (req, res, next) => void
   */
  use(fn) {
    if (typeof fn === 'function') {
      this.middleware.push(fn);
    } else if (fn && fn._isMiddleware) {
      // Pre-built middleware object
      this.middleware.push(fn.handler);
    }
  }

  /**
   * Register GET route
   * @param {string} pattern - URL pattern (supports :params)
   * @param {Function} handler - Route handler (req, res) => void
   */
  get(pattern, handler) {
    this.addRoute('GET', pattern, handler);
  }

  /**
   * Register POST route
   * @param {string} pattern - URL pattern
   * @param {Function} handler - Route handler
   */
  post(pattern, handler) {
    this.addRoute('POST', pattern, handler);
  }

  /**
   * Register PUT route
   * @param {string} pattern - URL pattern
   * @param {Function} handler - Route handler
   */
  put(pattern, handler) {
    this.addRoute('PUT', pattern, handler);
  }

  /**
   * Register DELETE route
   * @param {string} pattern - URL pattern
   * @param {Function} handler - Route handler
   */
  ['delete'](pattern, handler) {
    this.addRoute('DELETE', pattern, handler);
  }

  /**
   * Register PATCH route
   * @param {string} pattern - URL pattern
   * @param {Function} handler - Route handler
   */
  patch(pattern, handler) {
    this.addRoute('PATCH', pattern, handler);
  }

  /**
   * Register static file serving
   * @param {string} urlPrefix - URL prefix (e.g., '/public')
   * @param {string} directory - Local directory path
   */
  ['static'](urlPrefix, directory) {
    this.staticRoutes.push({ urlPrefix, directory });
  }

  /**
   * Internal: Add route to routing table
   */
  addRoute(method, pattern, handler) {
    const route = {
      method,
      pattern,
      regex: this.patternToRegex(pattern),
      paramNames: this.extractParamNames(pattern),
      handler
    };
    this.routes.push(route);
  }

  /**
   * Convert URL pattern to regex
   * Supports :param syntax
   */
  patternToRegex(pattern) {
    // Escape special regex characters except :param
    let regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:(\w+)/g, '([^/]+)');

    return new RegExp('^' + regexPattern + '$');
  }

  /**
   * Extract parameter names from pattern
   */
  extractParamNames(pattern) {
    const matches = pattern.matchAll(/:(\w+)/g);
    return Array.from(matches, m => m[1]);
  }

  /**
   * Match request against routes
   * @returns {Object|null} - {route, params} or null
   */
  matchRoute(method, path) {
    for (const route of this.routes) {
      if (route.method !== method) continue;

      const match = path.match(route.regex);
      if (match) {
        // Extract params
        const params = {};
        route.paramNames.forEach((name, i) => {
          params[name] = match[i + 1];
        });

        return { route, params };
      }
    }

    return null;
  }

  /**
   * Serve requests from a server's request channel
   * @param {Server} server - Server instance from createServer()
   */
  async serve(server) {
    // Process requests from the channel
    for await (const req of server.requests) {
      try {
        await this.handleRequest(req);
      } catch (err) {
        // Error during request handling
        try {
          req.respond({
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Internal server error' })
          });
        } catch {
          // Failed to send error response, ignore
        }
      }
    }
  }

  /**
   * Handle individual request
   */
  async handleRequest(req) {
    // Enhance request object with helper methods
    this.enhanceRequest(req);

    // Create response helper
    const res = this.createResponseHelper(req);

    // Track middleware execution
    let middlewareIndex = 0;
    let routeExecuted = false;

    // next() function for middleware chain
    const next = async () => {
      if (middlewareIndex < this.middleware.length) {
        const middleware = this.middleware[middlewareIndex++];
        // Support both sync and async middleware
        const result = middleware(req, res, next);
        if (result && typeof result.then === 'function') {
          await result;
        }
      } else if (!routeExecuted) {
        routeExecuted = true;
        // Execute route handler after all middleware
        await this.executeRoute(req, res);
      }
    };

    // Start middleware chain
    await next();
  }

  /**
   * Enhance request with helper methods
   */
  enhanceRequest(req) {
    // Parse JSON body
    req.json = () => {
      if (!req._parsedJson) {
        try {
          req._parsedJson = req.body ? JSON.parse(req.body) : {};
        } catch {
          req._parsedJson = {};
        }
      }
      return req._parsedJson;
    };

    // Get header (case-insensitive)
    req.header = (name) => {
      return req.headers[name.toLowerCase()];
    };

    // Get route parameter (will be populated during routing)
    req.param = (name) => {
      return req.params ? req.params[name] : undefined;
    };

    // Get query parameter
    req.queryParam = (name) => {
      return req.query[name];
    };
  }

  /**
   * Create response helper object
   */
  createResponseHelper(req) {
    const res = {
      _statusCode: 200,
      _headers: {},
      _sent: false,

      // Set status code
      status(code) {
        res._statusCode = code;
        return res; // Chainable
      },

      // Set header
      header(name, value) {
        res._headers[name] = value;
        return res; // Chainable
      },

      // Send JSON response
      json(data) {
        if (res._sent) return;
        res._headers['Content-Type'] = 'application/json';
        res._sent = true;
        req.respond({
          status: res._statusCode,
          headers: res._headers,
          body: JSON.stringify(data)
        });
      },

      // Send text response
      send(text) {
        if (res._sent) return;
        res._headers['Content-Type'] = res._headers['Content-Type'] || 'text/plain';
        res._sent = true;
        req.respond({
          status: res._statusCode,
          headers: res._headers,
          body: String(text)
        });
      },

      // Send HTML response
      html(content) {
        if (res._sent) return;
        res._headers['Content-Type'] = 'text/html';
        res._sent = true;
        req.respond({
          status: res._statusCode,
          headers: res._headers,
          body: content
        });
      }
    };

    return res;
  }

  /**
   * Execute matched route handler
   */
  async executeRoute(req, res) {
    // Try route matching
    const match = this.matchRoute(req.method, req.path);

    if (match) {
      // Set params on request
      req.params = match.params;

      // Execute route handler (support both sync and async)
      const result = match.route.handler(req, res);
      if (result && typeof result.then === 'function') {
        await result;
      }
      return;
    }

    // Try static file serving
    for (const staticRoute of this.staticRoutes) {
      // Normalize prefix (remove trailing slash for comparison)
      const prefix = staticRoute.urlPrefix.endsWith('/')
        ? staticRoute.urlPrefix.slice(0, -1)
        : staticRoute.urlPrefix;

      // Match exact prefix or prefix followed by /
      if (req.path === prefix ||
          req.path === staticRoute.urlPrefix ||
          req.path.startsWith(prefix + '/')) {
        await this.serveStatic(req, res, staticRoute);
        return;
      }
    }

    // No route matched - 404
    if (!res._sent) {
      res.status(404).json({ error: 'Not found' });
    }
  }

  /**
   * Serve static file
   */
  async serveStatic(req, res, staticRoute) {
    const fs = await import('fs/promises');
    const path = await import('path');

    // Get relative path and decode URL encoding
    let relativePath = req.path.slice(staticRoute.urlPrefix.length);

    // Decode URL-encoded characters (e.g., %2e%2e for ..)
    try {
      relativePath = decodeURIComponent(relativePath);
    } catch (err) {
      // Invalid URL encoding
      res.status(400).json({ error: 'Invalid URL encoding' });
      return;
    }

    // Normalize path separators (convert backslashes to forward slashes)
    relativePath = relativePath.replace(/\\/g, '/');

    const filePath = path.join(staticRoute.directory, relativePath);

    try {
      // Security: Prevent directory traversal
      const resolvedPath = path.resolve(filePath);
      const resolvedDir = path.resolve(staticRoute.directory);

      if (!resolvedPath.startsWith(resolvedDir + path.sep) && resolvedPath !== resolvedDir) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // Determine content type
      const contentType = this.getContentType(filePath);
      const isBinary = this.isBinaryContentType(contentType);

      // Read file (binary or text)
      const content = await fs.readFile(resolvedPath, isBinary ? null : 'utf-8');

      res.header('Content-Type', contentType).send(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.status(404).json({ error: 'File not found' });
      } else if (err.code === 'EISDIR') {
        // Try serving index.html
        try {
          const indexPath = path.join(filePath, 'index.html');
          const content = await fs.readFile(indexPath, 'utf-8');
          res.header('Content-Type', 'text/html').send(content);
        } catch {
          res.status(403).json({ error: 'Directory listing forbidden' });
        }
      } else {
        res.status(500).json({ error: 'Error reading file' });
      }
    }
  }

  /**
   * Get content type from file extension
   */
  getContentType(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    const types = {
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'json': 'application/json',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'txt': 'text/plain',
      'pdf': 'application/pdf',
      'xml': 'application/xml',
      'ico': 'image/x-icon',
      'woff': 'font/woff',
      'woff2': 'font/woff2',
      'ttf': 'font/ttf',
      'eot': 'application/vnd.ms-fontobject'
    };
    return types[ext] || 'application/octet-stream';
  }

  /**
   * Check if content type is binary
   */
  isBinaryContentType(contentType) {
    // Special case: SVG is text despite being image/*
    if (contentType === 'image/svg+xml') {
      return false;
    }

    return contentType.startsWith('image/') ||
           contentType.startsWith('font/') ||
           contentType === 'application/pdf' ||
           contentType === 'application/octet-stream' ||
           contentType === 'application/vnd.ms-fontobject';
  }
}

/**
 * Middleware: Body parser (JSON and form data)
 */
export function bodyParser() {
  const handler = async (req, res, next) => {
    const contentType = req.header('content-type') || '';

    if (contentType.includes('application/json')) {
      // JSON already handled by req.json()
      req._parsedBody = req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      // Parse form data
      req._parsedBody = parseFormData(req.body);
    }

    // Add body() helper
    req.body = () => req._parsedBody || {};

    await next();
  };

  handler._isMiddleware = true;
  return { handler, _isMiddleware: true };
}

/**
 * Parse URL-encoded form data
 */
function parseFormData(body) {
  const params = new URLSearchParams(body);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

/**
 * Middleware: CORS support
 */
export function cors(options = {}) {
  const defaultOptions = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type,Authorization',
    credentials: false,
    maxAge: 86400
  };

  const config = { ...defaultOptions, ...options };

  const handler = async (req, res, next) => {
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', config.origin);
    res.header('Access-Control-Allow-Methods', config.methods);
    res.header('Access-Control-Allow-Headers', config.allowedHeaders);

    if (config.credentials) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    if (config.maxAge) {
      res.header('Access-Control-Max-Age', String(config.maxAge));
    }

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    await next();
  };

  handler._isMiddleware = true;
  return { handler, _isMiddleware: true };
}

/**
 * Middleware: Request logging
 */
export function logger() {
  const handler = async (req, res, next) => {
    const start = Date.now();

    // Execute next middleware/route
    await next();

    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res._statusCode} (${duration}ms)`);
  };

  handler._isMiddleware = true;
  return { handler, _isMiddleware: true };
}
