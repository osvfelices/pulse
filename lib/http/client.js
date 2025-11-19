/**
 * Pulse HTTP Client
 * Production-ready HTTP client with connection pooling, retries, and timeouts
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_SOCKETS = 50; // Per host
const DEFAULT_MAX_FREE_SOCKETS = 10; // Keep-alive pool size
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

/**
 * HTTP Client with connection pooling
 */
export class HttpClient {
  constructor(options = {}) {
    this.timeout = options.timeout || DEFAULT_TIMEOUT;
    this.maxBodySize = options.maxBodySize || DEFAULT_MAX_BODY_SIZE;
    this.retryAttempts = options.retryAttempts || 0;
    this.retryDelay = options.retryDelay || DEFAULT_RETRY_DELAY;

    // Create HTTP agents with connection pooling
    this.httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: options.maxSockets || DEFAULT_MAX_SOCKETS,
      maxFreeSockets: options.maxFreeSockets || DEFAULT_MAX_FREE_SOCKETS,
      timeout: this.timeout
    });

    this.httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: options.maxSockets || DEFAULT_MAX_SOCKETS,
      maxFreeSockets: options.maxFreeSockets || DEFAULT_MAX_FREE_SOCKETS,
      timeout: this.timeout
    });
  }

  /**
   * Fetch URL with connection pooling and retries
   */
  async fetch(url, options = {}) {
    const method = options.method || 'GET';
    const headers = options.headers || {};
    const body = options.body || '';
    const timeout = options.timeout !== undefined ? options.timeout : this.timeout;
    const maxBodySize = options.maxBodySize !== undefined ? options.maxBodySize : this.maxBodySize;
    const retryAttempts = options.retryAttempts !== undefined ? options.retryAttempts : this.retryAttempts;

    let lastError = null;
    const attempts = retryAttempts + 1;

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt));
      }

      try {
        const result = await this._doFetch(url, { method, headers, body, timeout, maxBodySize });

        // Retry on 5xx errors if retries enabled
        if (retryAttempts > 0 && result.status >= 500 && result.status < 600 && attempt < attempts - 1) {
          lastError = result;
          continue;
        }

        return result;
      } catch (err) {
        lastError = {
          ok: false,
          status: 0,
          statusText: '',
          headers: {},
          body: '',
          error: err.message
        };

        // Retry on network errors
        if (attempt < attempts - 1) {
          continue;
        }
      }
    }

    return lastError;
  }

  async _doFetch(url, options) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      throw new Error(`Invalid URL: ${url}`);
    }

    const { method, headers, body, timeout, maxBodySize } = options;

    if (timeout < 0) {
      throw new Error(`Invalid timeout: ${timeout} (must be >= 0)`);
    }

    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const agent = parsedUrl.protocol === 'https:' ? this.httpsAgent : this.httpAgent;

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body)
      },
      agent // Use pooled agent
    };

    return new Promise((resolve) => {
      let timedOut = false;
      let responseData = '';
      let responseHeaders = {};
      let statusCode = 0;
      let statusMessage = '';

      const req = protocol.request(requestOptions, (res) => {
        statusCode = res.statusCode;
        statusMessage = res.statusMessage || '';

        responseHeaders = {};
        for (const [key, value] of Object.entries(res.headers)) {
          responseHeaders[key.toLowerCase()] = value;
        }

        res.on('data', (chunk) => {
          if (timedOut) return;

          responseData += chunk.toString();

          if (responseData.length > maxBodySize) {
            req.destroy();
            resolve({
              ok: false,
              status: 0,
              statusText: '',
              headers: {},
              body: '',
              error: `Response body exceeds maximum size (${maxBodySize} bytes)`
            });
          }
        });

        res.on('end', () => {
          if (timedOut) return;

          const ok = statusCode >= 200 && statusCode < 300;
          resolve({
            ok,
            status: statusCode,
            statusText: statusMessage,
            headers: responseHeaders,
            body: responseData,
            error: null
          });
        });

        res.on('error', (err) => {
          if (timedOut) return;

          resolve({
            ok: false,
            status: 0,
            statusText: '',
            headers: {},
            body: '',
            error: `Response error: ${err.message}`
          });
        });
      });

      if (timeout > 0) {
        req.setTimeout(timeout, () => {
          timedOut = true;
          req.destroy();
          resolve({
            ok: false,
            status: 0,
            statusText: '',
            headers: {},
            body: '',
            error: 'Request timeout'
          });
        });
      }

      req.on('error', (err) => {
        if (timedOut) return;

        resolve({
          ok: false,
          status: 0,
          statusText: '',
          headers: {},
          body: '',
          error: `Request error: ${err.message}`
        });
      });

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  /**
   * Close all pooled connections
   */
  close() {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
  }

  /**
   * Get connection pool stats
   */
  getStats() {
    return {
      http: {
        sockets: Object.keys(this.httpAgent.sockets).length,
        freeSockets: Object.keys(this.httpAgent.freeSockets).length,
        requests: Object.keys(this.httpAgent.requests).length
      },
      https: {
        sockets: Object.keys(this.httpsAgent.sockets).length,
        freeSockets: Object.keys(this.httpsAgent.freeSockets).length,
        requests: Object.keys(this.httpsAgent.requests).length
      }
    };
  }
}

/**
 * Standalone fetch (no pooling, single request)
 */
export async function fetch(url, options = {}) {
  const client = new HttpClient({
    maxSockets: 1,
    maxFreeSockets: 0,
    retryAttempts: options.retryAttempts || 0
  });

  try {
    return await client.fetch(url, options);
  } finally {
    client.close();
  }
}
