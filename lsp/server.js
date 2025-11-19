#!/usr/bin/env node
/**
 * Pulse Language Server
 * Provides IDE support: autocomplete, go-to-definition, diagnostics
 */

import lsp from 'vscode-languageserver/node.js';
const {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  DefinitionParams,
  Location
} = lsp;

import * as textDoc from 'vscode-languageserver-textdocument';
const { TextDocument } = textDoc;
import { Parser } from '../lib/parser.js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs';

// Create LSP connection using stdio
const connection = createConnection(ProposedFeatures.all, process.stdin, process.stdout);

// Create document manager
const documents = new TextDocuments(TextDocument);

// Document cache: stores parsed AST for each document
const documentCache = new Map();

// Stdlib symbols for autocomplete
const stdlibModules = {
  'std/error': ['withTimeout', 'retry', 'ErrorCodes', 'createError', 'isError'],
  'std/http/server': ['HttpServer', 'Router', 'context', 'transaction', 'auth', 'requireAuth'],
  'std/http/client': ['fetch'],
  'std/db/postgres': ['createPool'],
  'std/db/mysql': ['createPool'],
  'std/db/redis': ['createClient'],
  'std/channel': ['channel', 'select', 'SelectCase'],
  'std/signal': ['signal', 'computed', 'effect', 'batch', 'untrack'],
  'std/async': ['sleep', 'timeout', 'race', 'all'],
  'std/json': ['parse', 'stringify'],
  'std/math': ['abs', 'floor', 'ceil', 'round', 'min', 'max', 'sqrt', 'pow'],
  'std/fs': ['readFile', 'writeFile', 'exists', 'mkdir']
};

// Language keywords
const keywords = [
  'fn', 'async', 'await', 'const', 'let', 'if', 'else', 'while', 'for',
  'return', 'break', 'continue', 'import', 'export', 'from', 'as',
  'class', 'new', 'this', 'true', 'false', 'null', 'undefined',
  'typeof', 'instanceof', 'in', 'of'
];

connection.onInitialize((params) => {
  const result = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ['.', '/']
      },
      definitionProvider: true
    }
  };
  return result;
});

connection.onInitialized(() => {
  connection.console.log('Pulse Language Server initialized');
});

// Parse document and cache result
function parseDocument(document) {
  try {
    const parser = new Parser(document.getText());
    const ast = parser.parseProgram();
    documentCache.set(document.uri, { ast, errors: [] });
    return { ast, errors: [] };
  } catch (err) {
    if (err.pulseErrors) {
      documentCache.set(document.uri, { ast: err.ast, errors: err.pulseErrors });
      return { ast: err.ast, errors: err.pulseErrors };
    }
    if (err.code && err.code.startsWith('PULSE')) {
      const errors = [err];
      documentCache.set(document.uri, { ast: null, errors });
      return { ast: null, errors };
    }
    // Unknown error
    const errors = [{ message: err.message, line: 1, column: 0 }];
    documentCache.set(document.uri, { ast: null, errors });
    return { ast: null, errors };
  }
}

// Send diagnostics (errors) to client
function sendDiagnostics(document) {
  const cached = documentCache.get(document.uri);
  if (!cached) return;

  const diagnostics = cached.errors.map(err => ({
    severity: 1, // Error
    range: {
      start: { line: (err.line || 1) - 1, character: (err.column || 0) },
      end: { line: (err.line || 1) - 1, character: (err.column || 0) + (err.length || 1) }
    },
    message: err.message || err.error || 'Parse error',
    source: 'pulse'
  }));

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// Document opened
documents.onDidOpen(e => {
  const parsed = parseDocument(e.document);
  sendDiagnostics(e.document);
});

// Document changed
documents.onDidChangeContent(e => {
  const parsed = parseDocument(e.document);
  sendDiagnostics(e.document);
});

// Document closed
documents.onDidClose(e => {
  documentCache.delete(e.document.uri);
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] });
});

// Autocomplete
connection.onCompletion((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const text = document.getText();
  const offset = document.offsetAt(params.position);
  const linePrefix = text.substring(text.lastIndexOf('\n', offset - 1) + 1, offset);

  const completions = [];

  // Import completion: "import { | } from 'std/..."
  if (linePrefix.match(/import\s+\{\s*\w*$/)) {
    // Detect module from later in the line
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const lineEnd = text.indexOf('\n', offset);
    const fullLine = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
    const fromMatch = fullLine.match(/from\s+['"]([^'"]+)['"]/);

    if (fromMatch) {
      const moduleName = fromMatch[1];
      const symbols = stdlibModules[moduleName] || [];

      for (const symbol of symbols) {
        completions.push({
          label: symbol,
          kind: CompletionItemKind.Function,
          detail: `from ${moduleName}`
        });
      }
    }
    return completions;
  }

  // Module path completion: "from 'std/|"
  if (linePrefix.match(/from\s+['"]std\/\w*$/)) {
    for (const module of Object.keys(stdlibModules)) {
      completions.push({
        label: module,
        kind: CompletionItemKind.Module,
        insertText: module
      });
    }
    return completions;
  }

  // Keyword completion
  for (const keyword of keywords) {
    completions.push({
      label: keyword,
      kind: CompletionItemKind.Keyword
    });
  }

  // Stdlib module names
  for (const module of Object.keys(stdlibModules)) {
    completions.push({
      label: module,
      kind: CompletionItemKind.Module,
      detail: 'stdlib module'
    });
  }

  return completions;
});

// Go-to-definition
connection.onDefinition((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const offset = document.offsetAt(params.position);

  // Find the word under cursor
  let start = offset;
  let end = offset;

  while (start > 0 && /[a-zA-Z0-9_/]/.test(text[start - 1])) start--;
  while (end < text.length && /[a-zA-Z0-9_/]/.test(text[end])) end++;

  const word = text.substring(start, end);

  // Check if it's an import path
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  const lineEnd = text.indexOf('\n', offset);
  const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);

  if (line.includes('import') && line.includes('from')) {
    const match = line.match(/from\s+['"]([^'"]+)['"]/);
    if (match) {
      const modulePath = match[1];

      // Resolve stdlib path
      if (modulePath.startsWith('std/')) {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const stdlibPath = resolve(__dirname, '..', modulePath + '.js');

        if (fs.existsSync(stdlibPath)) {
          return {
            uri: 'file://' + stdlibPath,
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 }
            }
          };
        }
      }
    }
  }

  return null;
});

// Debug request handlers - integrate with DebugLSPAPI
// These are stubbed for now and will connect to the runtime when a debug session is active

const debugStubs = {
  breakpoints: new Map(), // file -> Set<line>
  debuggerEnabled: false,
  inspectorEnabled: false
};

// Debug initialize
connection.onRequest('pulse/debug/initialize', () => {
  debugStubs.debuggerEnabled = true;
  debugStubs.inspectorEnabled = true;
  return {
    ok: true,
    capabilities: {
      breakpoints: true,
      stepping: true,
      stackFrames: true,
      localVariables: true,
      expressionEvaluation: false,
      inspector: true,
      timeline: true
    }
  };
});

// Debug shutdown
connection.onRequest('pulse/debug/shutdown', () => {
  debugStubs.debuggerEnabled = false;
  debugStubs.inspectorEnabled = false;
  debugStubs.breakpoints.clear();
  return { ok: true };
});

// Set breakpoint
connection.onRequest('pulse/debug/setBreakpoint', (params) => {
  if (!params || !params.file || typeof params.line !== 'number') {
    return {
      ok: false,
      error: 'Missing file or line parameter'
    };
  }

  const { file, line } = params;
  if (!debugStubs.breakpoints.has(file)) {
    debugStubs.breakpoints.set(file, new Set());
  }
  debugStubs.breakpoints.get(file).add(line);

  return {
    ok: true,
    id: `${file}:${line}`,
    file,
    line,
    verified: true
  };
});

// Clear breakpoint
connection.onRequest('pulse/debug/clearBreakpoint', (params) => {
  if (!params || !params.file || typeof params.line !== 'number') {
    return {
      ok: false,
      error: 'Missing file or line parameter'
    };
  }

  const { file, line } = params;
  if (debugStubs.breakpoints.has(file)) {
    debugStubs.breakpoints.get(file).delete(line);
  }

  return { ok: true };
});

// Clear all breakpoints
connection.onRequest('pulse/debug/clearAllBreakpoints', () => {
  debugStubs.breakpoints.clear();
  return { ok: true };
});

// Get breakpoints
connection.onRequest('pulse/debug/getBreakpoints', () => {
  const result = [];
  for (const [file, lines] of debugStubs.breakpoints) {
    for (const line of lines) {
      result.push({ file, line });
    }
  }
  return { ok: true, breakpoints: result };
});

// Pause execution
connection.onRequest('pulse/debug/pause', () => {
  return { ok: true };
});

// Resume execution
connection.onRequest('pulse/debug/resume', () => {
  return { ok: true };
});

// Step over
connection.onRequest('pulse/debug/stepOver', () => {
  return { ok: true };
});

// Step into
connection.onRequest('pulse/debug/stepInto', () => {
  return { ok: true };
});

// Step out
connection.onRequest('pulse/debug/stepOut', () => {
  return { ok: true };
});

// Get stack frames
connection.onRequest('pulse/debug/getFrames', () => {
  return {
    ok: true,
    frames: []
  };
});

// Get local variables
connection.onRequest('pulse/debug/getLocals', (params) => {
  return {
    ok: true,
    locals: {}
  };
});

// Get debugger state
connection.onRequest('pulse/debug/getState', () => {
  return {
    ok: true,
    state: {
      enabled: debugStubs.debuggerEnabled,
      paused: false
    }
  };
});

// Inspector: Get snapshot
connection.onRequest('pulse/debug/getSnapshot', () => {
  return {
    ok: true,
    snapshot: {
      logicalTime: 0,
      tasks: [],
      channels: [],
      timestamp: Date.now()
    }
  };
});

// Inspector: Get tasks
connection.onRequest('pulse/debug/getTasks', () => {
  return {
    ok: true,
    tasks: []
  };
});

// Inspector: Get channels
connection.onRequest('pulse/debug/getChannels', () => {
  return {
    ok: true,
    channels: []
  };
});

// Inspector: Get scheduler state
connection.onRequest('pulse/debug/getSchedulerState', () => {
  return {
    ok: true,
    state: {
      logicalTime: 0,
      activeTasks: 0,
      readyQueue: 0,
      waitingTasks: 0
    }
  };
});

// Inspector: Get task by ID
connection.onRequest('pulse/debug/getTask', (params) => {
  return {
    ok: false,
    error: 'Task not found'
  };
});

// Inspector: Get channel by ID
connection.onRequest('pulse/debug/getChannel', (params) => {
  return {
    ok: false,
    error: 'Channel not found'
  };
});

// Inspector: Get supervisors
connection.onRequest('pulse/debug/getSupervisors', () => {
  return {
    ok: true,
    supervisors: []
  };
});

// Inspector: Get statistics
connection.onRequest('pulse/debug/getStatistics', () => {
  return {
    ok: true,
    statistics: {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      totalChannels: 0,
      messagesSent: 0,
      messagesReceived: 0
    }
  };
});

// Listen to documents
documents.listen(connection);

// Start listening
connection.listen();
