/**
 * Pulse HTTP Server
 * Specification: docs/WEEK4-HTTP-SPECIFICATION.md
 * Phase 2: createServer() implementation
 *
 * IMPORTANT: Uses Pulse's deterministic Channel for FIFO ordering and backpressure.
 * Compatible with Pulse's scheduler and async runtime.
 */

import http from 'http';
import { URL } from 'url';
import { Channel } from '../runtime/channel-deterministic.js';
import { ErrorCodes } from '../../std/error-codes.js';

const DEFAULT_BUFFER_SIZE = 100;
const DEFAULT_MAX_CONNECTIONS = 511;
const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Create a channel-based HTTP server
 *
 * @param {Object} options - Server options
 * @param {string} options.host - Host to bind to
 * @param {number} options.port - Port to bind to
 * @param {number} options.bufferSize - Request channel buffer size (default: 100)
 * @param {number} options.maxConnections - Kernel backlog limit (default: 511)
 * @param {number} options.maxBodySize - Max request body size (default: 10MB)
 * @param {boolean} options.testMode - If true, don't create sockets (for deterministic testing)
 * @returns {Server} Server object with requests/errors channels
 */
export function createServer(options) {
  if (!options || !options.host || options.port === undefined) {
    throw new Error('createServer requires {host, port}');
  }

  const host = options.host;
  const port = options.port;
  const bufferSize = options.bufferSize !== undefined ? options.bufferSize : DEFAULT_BUFFER_SIZE;
  const maxConnections = options.maxConnections !== undefined ? options.maxConnections : DEFAULT_MAX_CONNECTIONS;
  const maxBodySize = options.maxBodySize !== undefined ? options.maxBodySize : DEFAULT_MAX_BODY_SIZE;
  const testMode = options.testMode || false;

  // PULSE DETERMINISM BOUNDARY:
  //  DETERMINISTIC (Pulse controls): Channel ordering, handler scheduling, backpressure
  //   NON-DETERMINISTIC (OS controls): Network packet arrival order, TCP buffering
  //
  // Use Pulse's deterministic Channel for FIFO ordering and backpressure
  const requestsChannel = new Channel(bufferSize);
  const errorsChannel = new Channel(100); // Error channel also buffered

  let httpServer = null;
  let listening = false;

  const server = {
    requests: requestsChannel,
    errors: errorsChannel,
    get listening() { return listening; },
    get port() {
      return httpServer && httpServer.listening ? httpServer.address().port : port;
    },
    bufferSize,
    host,

    listen() {
      if (listening) {
        throw new Error('Server already listening');
      }

      // TEST MODE: Skip socket creation for deterministic testing
      if (testMode) {
        listening = true;
        return;
      }

      // PRODUCTION MODE: Create real TCP server
      //   DETERMINISM BOUNDARY: From here on, network packet arrival order is controlled by OS
      httpServer = http.createServer(async (req, res) => {
        try {
          // Parse request
          const parsedUrl = new URL(req.url, `http://${host}:${port}`);
          const query = Object.fromEntries(parsedUrl.searchParams);

          // Collect body
          let body = '';
          let bodySize = 0;

          req.on('data', (chunk) => {
            bodySize += chunk.length;
            if (bodySize > maxBodySize) {
              res.writeHead(413, { 'Content-Type': 'text/plain' });
              res.end('Request body too large');
              req.destroy();
              return;
            }
            body += chunk.toString();
          });

          req.on('end', async () => {
            // Normalize headers to lowercase
            const headers = {};
            for (const [key, value] of Object.entries(req.headers)) {
              headers[key.toLowerCase()] = value;
            }

            // Create request object
            const request = {
              method: req.method,
              url: req.url,
              path: parsedUrl.pathname,
              query,
              headers,
              body,
              remoteAddr: req.socket.remoteAddress || 'unknown',

              // respond() function
              respond(response) {
                try {
                  const status = response.status || 200;
                  const responseHeaders = response.headers || {};
                  const responseBody = response.body || '';

                  res.writeHead(status, responseHeaders);
                  res.end(responseBody);

                  return { ok: true, error: null };
                } catch (err) {
                  return { ok: false, error: err.message, code: ErrorCodes.REQUEST_HANDLER_ERROR };
                }
              }
            };

            // Enqueue to requests channel (blocks if buffer full - backpressure)
            try {
              await requestsChannel.send(request);
            } catch (err) {
              // Channel closed, server shutting down
              res.writeHead(503, { 'Content-Type': 'text/plain' });
              res.end('Server shutting down');
            }
          });

          req.on('error', (err) => {
            errorsChannel.send({
              type: 'parse',
              message: err.message,
              timestamp: Date.now(),
              request: null
            }).catch(() => {}); // Ignore if errors channel closed
          });

        } catch (err) {
          errorsChannel.send({
            type: 'connection',
            message: err.message,
            timestamp: Date.now(),
            request: null
          }).catch(() => {});

          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal server error');
        }
      });

      // Listen with backlog (maxConnections)
      httpServer.listen(port, host, maxConnections, () => {
        listening = true;
      });

      httpServer.on('error', (err) => {
        errorsChannel.send({
          type: 'connection',
          message: err.message,
          timestamp: Date.now(),
          request: null
        }).catch(() => {});
      });
    },

    /**
     * TEST MODE ONLY: Inject a request directly into the channel (bypasses network)
     *
     *  FULLY DETERMINISTIC: Requests arrive in exact order injected, no OS scheduling
     *
     * @param {Object} req - Request object
     * @param {string} req.method - HTTP method (GET, POST, etc.)
     * @param {string} req.path - URL path
     * @param {Object} req.query - Query parameters (default: {})
     * @param {Object} req.headers - Request headers (default: {})
     * @param {string} req.body - Request body (default: '')
     * @returns {Promise<Object>} Response promise
     */
    async injectRequest(req) {
      if (!testMode) {
        throw new Error('injectRequest() only available in test mode');
      }

      return new Promise(async (resolve, reject) => {
        const request = {
          method: req.method || 'GET',
          url: req.path + (req.query ? '?' + new URLSearchParams(req.query).toString() : ''),
          path: req.path || '/',
          query: req.query || {},
          headers: req.headers || {},
          body: req.body || '',
          remoteAddr: 'test-injected',

          // Mock respond() that captures response
          respond(response) {
            const result = {
              ok: true,
              status: response.status || 200,
              headers: response.headers || {},
              body: response.body || '',
              error: null
            };
            resolve(result);
            return result;
          }
        };

        // Inject directly into requests channel (deterministic FIFO)
        try {
          await requestsChannel.send(request);
        } catch (err) {
          reject(err);
        }
      });
    },

    async close() {
      if (testMode) {
        // TEST MODE: Just close channels
        listening = false;
        requestsChannel.close();
        errorsChannel.close();
        return;
      }

      // PRODUCTION MODE: Close HTTP server
      if (!httpServer) return;

      return new Promise((resolve) => {
        listening = false;
        requestsChannel.close();
        errorsChannel.close();

        httpServer.close(() => {
          httpServer = null;
          resolve();
        });
      });
    }
  };

  return server;
}
