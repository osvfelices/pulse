/**
 * Pulse Standard Library v1 - HTTP Client
 * HTTP client with structured results and error codes
 */

import { ErrorCodes, createError } from '../error-codes.js';

/**
 * HTTP fetch with structured result
 */
export async function fetch(url, options = {}) {
  const method = options.method || 'GET';
  const headers = options.headers || {};
  const body = options.body;
  const timeout = options.timeout || 30000;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await globalThis.fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    return {
      ok: true,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: await response.text()
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      return createError(ErrorCodes.FETCH_TIMEOUT, `Request timed out after ${timeout}ms`);
    }
    return createError(ErrorCodes.FETCH_FAILED, `HTTP request failed: ${error.message}`);
  }
}

/**
 * GET request
 */
export async function get(url, options = {}) {
  return fetch(url, { ...options, method: 'GET' });
}

/**
 * POST request
 */
export async function post(url, body, options = {}) {
  return fetch(url, { ...options, method: 'POST', body });
}

/**
 * PUT request
 */
export async function put(url, body, options = {}) {
  return fetch(url, { ...options, method: 'PUT', body });
}

/**
 * DELETE request
 */
export async function del(url, options = {}) {
  return fetch(url, { ...options, method: 'DELETE' });
}

/**
 * Fetch and parse JSON
 */
export async function fetchJSON(url, options = {}) {
  const result = await fetch(url, options);
  if (!result.ok) return result;

  try {
    const data = JSON.parse(result.body);
    return {
      ok: true,
      status: result.status,
      headers: result.headers,
      data
    };
  } catch (error) {
    return createError(ErrorCodes.FETCH_FAILED, `Failed to parse JSON: ${error.message}`);
  }
}
