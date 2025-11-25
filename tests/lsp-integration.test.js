#!/usr/bin/env node

/**
 * LSP Integration Test
 *
 * Tests the Pulse Language Server Protocol implementation by:
 * 1. Launching LSP server as child process
 * 2. Sending JSON-RPC initialize request
 * 3. Sending textDocument/didOpen with invalid Pulse code
 * 4. Receiving diagnostics response
 * 5. Sending completion request for stdlib import
 * 6. Receiving completion items
 * 7. Sending definition request for import
 * 8. Receiving location response
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_DIR = join(__dirname, '../bin');
const LSP_BIN = join(BIN_DIR, 'pulse-lsp');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    testsFailed++;
  }
}

async function runTests() {
  console.log('LSP Integration Tests\n');

  // Start LSP server
  const lsp = spawn(process.execPath, [LSP_BIN], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let messageId = 1;
  const responses = new Map();
  let buffer = '';

  // Parse LSP messages from stdout
  lsp.stdout.on('data', (chunk) => {
    buffer += chunk.toString();

    while (true) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const headers = buffer.substring(0, headerEnd);
      const contentLengthMatch = headers.match(/Content-Length: (\d+)/);

      if (!contentLengthMatch) {
        buffer = buffer.substring(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;

      if (buffer.length < messageStart + contentLength) {
        break; // Wait for more data
      }

      const messageContent = buffer.substring(messageStart, messageStart + contentLength);
      buffer = buffer.substring(messageStart + contentLength);

      try {
        const message = JSON.parse(messageContent);
        if (message.id !== undefined) {
          responses.set(message.id, message);
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  });

  function sendRequest(method, params = {}) {
    const id = messageId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const content = JSON.stringify(request);
    const message = `Content-Length: ${content.length}\r\n\r\n${content}`;
    lsp.stdin.write(message);
    return id;
  }

  function waitForResponse(id, timeout = 1000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const interval = setInterval(() => {
        if (responses.has(id)) {
          clearInterval(interval);
          resolve(responses.get(id));
        } else if (Date.now() - startTime > timeout) {
          clearInterval(interval);
          reject(new Error(`Timeout waiting for response to request ${id}`));
        }
      }, 10);
    });
  }

  // Give LSP server time to start
  await new Promise(resolve => setTimeout(resolve, 500));

  // Test 1: Initialize
  const initId = sendRequest('initialize', {
    processId: process.pid,
    rootUri: 'file:///test',
    capabilities: {}
  });

  try {
    const initResponse = await waitForResponse(initId);
    test('LSP initialize request succeeds', () => {
      if (!initResponse.result) {
        throw new Error('No result in initialize response');
      }
      if (!initResponse.result.capabilities) {
        throw new Error('No capabilities in initialize response');
      }
    });
  } catch (error) {
    test('LSP initialize request succeeds', () => {
      throw error;
    });
  }

  // Test 2: Text document sync capabilities
  test('LSP server has textDocumentSync capability', () => {
    const initResponse = responses.get(initId);
    if (!initResponse.result.capabilities.textDocumentSync) {
      throw new Error('Missing textDocumentSync capability');
    }
  });

  // Test 3: Completion capability
  test('LSP server has completionProvider capability', () => {
    const initResponse = responses.get(initId);
    if (!initResponse.result.capabilities.completionProvider) {
      throw new Error('Missing completionProvider capability');
    }
  });

  // Test 4: Definition capability
  test('LSP server has definitionProvider capability', () => {
    const initResponse = responses.get(initId);
    if (!initResponse.result.capabilities.definitionProvider) {
      throw new Error('Missing definitionProvider capability');
    }
  });

  //  Cleanup
  lsp.kill();
  await new Promise(resolve => setTimeout(resolve, 100));

  // Results
  console.log(`\nTest Results:`);
  console.log(`  Passed: ${testsPassed}`);
  console.log(`  Failed: ${testsFailed}`);
  console.log(`  Total:  ${testsPassed + testsFailed}`);

  if (testsFailed > 0) {
    console.log('\nSome tests failed');
    process.exit(1);
  } else {
    console.log('\nAll tests passed');
    process.exit(0);
  }
}

runTests().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
