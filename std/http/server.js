/**
 * Pulse Standard Library v1.5.0 - HTTP Server
 * Real HTTP server implementation using Node.js http module
 *
 * NOTE: In v1.5.0, HTTP handlers run on Node's event loop.
 * Handlers can use async/await and signals, but should NOT use
 * Pulse's sleep() or channels() yet. Full scheduler integration
 * is planned for Runtime 2.0.
 */

import http from 'node:http';
import { ErrorCodes, createError } from '../error-codes.js';

/**
 * Create HTTP server instance
 * Handlers are plain async functions running on Node's event loop
 */
export function createServer(handlerOrOptions) {
  let requestHandler = null;
  let options = {};

  if (typeof handlerOrOptions === 'function') {
    requestHandler = handlerOrOptions;
  } else if (typeof handlerOrOptions === 'object') {
    options = handlerOrOptions;
    requestHandler = options.handler || null;
  }

  const server = http.createServer(async (req, res) => {
    if (requestHandler) {
      try {
        await requestHandler(req, res);
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        if (!res.writableEnded) {
          res.end(JSON.stringify({
            error: 'Internal server error',
            message: error.message
          }));
        }
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  return server;
}

/**
 * Serve HTTP requests with an async handler
 * Handler receives req object and returns response object
 */
export async function serve(port, handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const response = await handler(req);
        res.writeHead(response.status || 200, response.headers || {});
        res.end(response.body || '');
      } catch (error) {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      }
    });

    server.listen(port, () => {
      resolve(server);
    });

    server.on('error', reject);
  });
}

/**
 * JSON response helper
 */
export function json(data, status = 200) {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
}

/**
 * Text response helper
 */
export function text(data, status = 200) {
  return {
    status,
    headers: { 'Content-Type': 'text/plain' },
    body: String(data)
  };
}

/**
 * Redirect response helper
 */
export function redirect(url, status = 302) {
  return {
    status,
    headers: { 'Location': url },
    body: ''
  };
}

/**
 * Send response helper
 * Writes headers and body to response object
 */
export function send(res, response) {
  res.writeHead(response.status || 200, response.headers || {});
  res.end(response.body || '');
}
