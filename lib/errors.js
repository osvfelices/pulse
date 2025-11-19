/**
 * Pulse Compiler Error System
 *
 * Provides detailed error messages with:
 * - Error codes (PULSE001, PULSE002, etc.)
 * - Line/column locations
 * - Code snippets with error pointer
 * - Colorized output
 * - "Did you mean?" suggestions
 */

// Error codes and their descriptions
export const ErrorCodes = {
  // Parser errors (PULSE001-PULSE099)
  PULSE001: 'Unexpected token',
  PULSE002: 'Expected token',
  PULSE003: 'Unterminated string literal',
  PULSE004: 'Unknown character',
  PULSE005: 'Invalid import syntax',
  PULSE006: 'Invalid export syntax',
  PULSE007: 'Invalid function declaration',
  PULSE008: 'Invalid variable declaration',
  PULSE009: 'Invalid expression',
  PULSE010: 'Invalid statement',
  PULSE011: 'Select must have at least one case',
  PULSE012: 'Invalid select case',
  PULSE013: 'Invalid array destructuring',
  PULSE014: 'Invalid object destructuring',
  PULSE015: 'Await only valid in for-of loops',
  PULSE016: 'Invalid property name',
  PULSE017: 'Invalid parameter',
  PULSE018: 'Invalid class declaration',
  PULSE019: 'Invalid method declaration',
  PULSE020: 'Invalid switch statement',

  // Lexer errors (PULSE100-PULSE199)
  PULSE100: 'Unterminated string',
  PULSE101: 'Unterminated template literal',
  PULSE102: 'Invalid number literal',
  PULSE103: 'Invalid character in source',
};

// ANSI color codes for terminal output
const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

// Check if we're in a terminal that supports colors
function supportsColor() {
  if (typeof process === 'undefined') return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout && process.stdout.isTTY;
}

const USE_COLORS = supportsColor();

function colorize(color, text) {
  if (!USE_COLORS) return text;
  return Colors[color] + text + Colors.reset;
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for "Did you mean?" suggestions
 */
function levenshteinDistance(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find the best match from a list of candidates
 * Returns null if no good match is found
 */
export function findBestMatch(input, candidates, maxDistance = 2) {
  let bestMatch = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance && distance <= maxDistance) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

/**
 * Get a specific line from source code
 */
function getLine(source, lineNumber) {
  const lines = source.split('\n');
  return lines[lineNumber - 1] || '';
}

/**
 * Get line count for a string
 */
function getLineCount(str) {
  return (str.match(/\n/g) || []).length + 1;
}

/**
 * Format a code snippet with error pointer
 *
 * Example output:
 *   12 | const x = y +
 *   13 | fn main() {
 *      |    ^^^^ PULSE002: Expected expression, got 'fn'
 *   14 |   print("hello")
 */
export function formatCodeSnippet(source, line, column, length = 1) {
  const lines = source.split('\n');
  const lineNumber = line;

  // Show context: 1 line before and after
  const startLine = Math.max(1, lineNumber - 1);
  const endLine = Math.min(lines.length, lineNumber + 1);

  let output = '';
  const lineNumberWidth = String(endLine).length;

  for (let i = startLine; i <= endLine; i++) {
    const lineContent = lines[i - 1] || '';
    const lineNumStr = String(i).padStart(lineNumberWidth, ' ');

    if (i === lineNumber) {
      // The error line
      output += colorize('cyan', lineNumStr) + ' | ' + lineContent + '\n';

      // Error pointer
      const padding = ' '.repeat(lineNumberWidth) + ' | ' + ' '.repeat(column - 1);
      const pointer = colorize('red', '^'.repeat(Math.max(1, length)));
      output += padding + pointer;
    } else {
      // Context lines
      output += colorize('gray', lineNumStr + ' | ' + lineContent) + '\n';
    }
  }

  return output;
}

/**
 * Format a complete error message with code snippet
 */
export function formatError(error) {
  const { code, message, line, column, length, source, suggestion } = error;

  let output = '\n';

  // Error header with code
  const errorHeader = `${colorize('red', colorize('bright', 'error'))}[${colorize('bright', code)}]: ${message}`;
  output += errorHeader + '\n';

  // Location
  if (line && column) {
    output += colorize('gray', `  at line ${line}, column ${column}`) + '\n\n';
  }

  // Code snippet
  if (source && line && column) {
    output += formatCodeSnippet(source, line, column, length || 1) + '\n';
  }

  // Suggestion ("Did you mean?")
  if (suggestion) {
    output += '\n' + colorize('cyan', `  Did you mean '${colorize('bright', suggestion)}'?`) + '\n';
  }

  return output;
}

/**
 * Pulse Compiler Error class
 */
export class PulseError extends Error {
  constructor({ code, message, line, column, length, source, suggestion }) {
    super(message);
    this.name = 'PulseError';
    this.code = code;
    this.line = line;
    this.column = column;
    this.length = length;
    this.source = source;
    this.suggestion = suggestion;

    // Format the full error message
    this.formattedMessage = formatError(this);
  }

  toString() {
    return this.formattedMessage;
  }
}

/**
 * Create a parser error with context
 */
export function createParserError({
  code,
  message,
  parser,
  length,
  suggestion
}) {
  const line = parser.t ? parser.t.loc.start.line : (parser.lastToken ? parser.lastToken.loc.end.line : 1);
  const column = parser.t ? parser.t.loc.start.column : (parser.lastToken ? parser.lastToken.loc.end.column : 1);
  const source = parser.lex.s;

  return new PulseError({
    code,
    message,
    line,
    column,
    length: length || (parser.t ? parser.t.text.length : 1),
    source,
    suggestion
  });
}

/**
 * Create a lexer error with context
 */
export function createLexerError({
  code,
  message,
  lexer,
  line,
  column,
  length,
  suggestion
}) {
  return new PulseError({
    code,
    message,
    line: line || lexer.line,
    column: column || lexer.column,
    length: length || 1,
    source: lexer.s,
    suggestion
  });
}

/**
 * Common error creators for parser
 */
export const ParserErrors = {
  unexpectedToken(parser, expected = null) {
    const got = parser.t ? `'${parser.t.text}'` : 'end of file';
    const message = expected
      ? `Expected ${expected}, got ${got}`
      : `Unexpected token ${got}`;

    return createParserError({
      code: 'PULSE001',
      message,
      parser
    });
  },

  expectedToken(parser, expected) {
    const got = parser.t ? `'${parser.t.kind}'` : 'end of file';
    const message = `Expected '${expected}', got ${got}`;

    // Try to suggest common typos
    let suggestion = null;
    if (parser.t && parser.t.kind === 'ident') {
      const keywords = ['fn', 'let', 'const', 'if', 'else', 'for', 'while', 'return', 'import', 'export'];
      suggestion = findBestMatch(parser.t.text, keywords);
    }

    return createParserError({
      code: 'PULSE002',
      message,
      parser,
      suggestion
    });
  },

  invalidImportSyntax(parser, message) {
    return createParserError({
      code: 'PULSE005',
      message: `Invalid import syntax: ${message}`,
      parser
    });
  },

  invalidExportSyntax(parser, message) {
    return createParserError({
      code: 'PULSE006',
      message: `Invalid export syntax: ${message}`,
      parser
    });
  },

  selectMustHaveCases(parser) {
    return createParserError({
      code: 'PULSE011',
      message: 'Select expression must have at least one case',
      parser
    });
  },

  invalidSelectCase(parser, message) {
    return createParserError({
      code: 'PULSE012',
      message: `Invalid select case: ${message}`,
      parser
    });
  },

  awaitOnlyInForOf(parser) {
    return createParserError({
      code: 'PULSE015',
      message: 'await is only valid in for-of loops, not regular for loops',
      parser
    });
  },

  expectedPropertyName(parser) {
    const got = parser.t ? `'${parser.t.kind}'` : 'end of file';
    return createParserError({
      code: 'PULSE016',
      message: `Expected property name, got ${got}`,
      parser
    });
  },

  expectedImportName(parser) {
    const got = parser.t ? `'${parser.t.kind}'` : 'end of file';
    return createParserError({
      code: 'PULSE005',
      message: `Expected import name, got ${got}`,
      parser
    });
  },

  invalidSwitchCase(parser) {
    return createParserError({
      code: 'PULSE020',
      message: 'Expected case or default in switch statement',
      parser
    });
  }
};

/**
 * Common error creators for lexer
 */
export const LexerErrors = {
  unterminatedString(lexer, line, column) {
    return createLexerError({
      code: 'PULSE100',
      message: 'Unterminated string literal',
      lexer,
      line,
      column
    });
  },

  unterminatedTemplate(lexer, line, column) {
    return createLexerError({
      code: 'PULSE101',
      message: 'Unterminated template literal',
      lexer,
      line,
      column
    });
  },

  unknownCharacter(lexer, char, line, column) {
    return createLexerError({
      code: 'PULSE103',
      message: `Unknown character '${char}' in source code`,
      lexer,
      line,
      column,
      length: 1
    });
  }
};
