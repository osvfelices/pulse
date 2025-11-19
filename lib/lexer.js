import { LexerErrors } from './errors.js';

export class Lexer {
  constructor(src) {
    this.s = src;
    this.i = 0;
    this.line = 1;
    this.column = 1;
  }

  // Save current lexer state for backtracking
  saveState() {
    return { i: this.i, line: this.line, column: this.column };
  }

  // Restore lexer state
  restoreState(state) {
    this.i = state.i;
    this.line = state.line;
    this.column = state.column;
  }

  // Advance position and update line/column
  advance(count = 1) {
    for (let i = 0; i < count; i++) {
      if (this.s[this.i] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.i++;
    }
  }

  // Create token with location info
  makeToken(kind, text, startLine, startColumn) {
    return {
      kind,
      text,
      loc: {
        start: { line: startLine, column: startColumn },
        end: { line: this.line, column: this.column }
      }
    };
  }

  next() {
    const s = this.s, n = s.length;

    while (this.i < n) {
      const startLine = this.line;
      const startColumn = this.column;
      const c = s[this.i];

      // Skip whitespace
      if (/\s/.test(c)) {
        this.advance();
        continue;
      }

      // Skip single-line comments
      if (c === '/' && s[this.i + 1] === '/') {
        this.advance(2);
        while (this.i < n && s[this.i] !== '\n') {
          this.advance();
        }
        continue;
      }

      // String literals (double and single quotes)
      if (c === '"' || c === '\'') {
        const q = c;
        let j = this.i + 1;
        while (j < n) {
          const ch = s[j];
          if (ch === '\\') {
            j += 2;
            continue;
          }
          if (ch === q) {
            const text = s.slice(this.i, j + 1);
            const endPos = j + 1 - this.i;
            this.advance(endPos);
            return this.makeToken('string', text, startLine, startColumn);
          }
          j++;
        }
        throw LexerErrors.unterminatedString(this, startLine, startColumn);
      }

      // Template literals
      if (c === '`') {
        let j = this.i + 1;
        while (j < n) {
          const ch = s[j];
          if (ch === '\\') {
            j += 2;
            continue;
          }
          if (ch === '`') {
            const text = s.slice(this.i, j + 1);
            const endPos = j + 1 - this.i;
            this.advance(endPos);
            return this.makeToken('string', text, startLine, startColumn);
          }
          j++;
        }
        throw LexerErrors.unterminatedTemplate(this, startLine, startColumn);
      }

      // Numbers
      if (/[0-9]/.test(c)) {
        let j = this.i + 1;
        while (j < n && /[0-9_.]/.test(s[j])) j++;
        const text = s.slice(this.i, j);
        const len = j - this.i;
        this.advance(len);
        return this.makeToken('number', text, startLine, startColumn);
      }

      // Identifiers and keywords
      if (/[A-Za-z_]/.test(c)) {
        let j = this.i + 1;
        while (j < n && /[A-Za-z0-9_]/.test(s[j])) j++;
        const text = s.slice(this.i, j);
        const kw = new Set([
          'import', 'from', 'as', 'fn', 'let', 'const', 'return', 'if', 'else',
          'for', 'while', 'contract', 'export', 'view', 'true', 'false', 'null',
          'in', 'of', 'try', 'catch', 'finally', 'throw', 'break', 'continue',
          'switch', 'case', 'default', 'typeof', 'instanceof', 'delete', 'async',
          'await', 'class', 'extends', 'new', 'spawn', 'yield', 'select', 'go'
        ]);
        const kind = kw.has(text) ? text : 'ident';
        const len = j - this.i;
        this.advance(len);
        return this.makeToken(kind, text, startLine, startColumn);
      }

      // Multi-char operators (check 3-char first)
      if (c === '.' && s[this.i + 1] === '.' && s[this.i + 2] === '.') {
        this.advance(3);
        return this.makeToken('...', '...', startLine, startColumn);
      }

      // Two-char operators
      const twoChar = [
        ['==', '=='], ['!=', '!='], ['<=', '<='], ['>=', '>='],
        ['&&', '&&'], ['||', '||'], ['+=', '+='], ['-=', '-='],
        ['*=', '*='], ['/=', '/='], ['%=', '%='], ['++', '++'],
        ['--', '--'], ['=>', '=>'], ['?.', '?.'], ['??', '??']
      ];

      for (const [op, kind] of twoChar) {
        if (c === op[0] && s[this.i + 1] === op[1]) {
          this.advance(2);
          return this.makeToken(kind, op, startLine, startColumn);
        }
      }

      // Single char operators
      const single = '{}()[]=,:;.+-*/<>!%&|?'.split('');
      if (single.includes(c)) {
        this.advance();
        return this.makeToken(c, c, startLine, startColumn);
      }

      throw LexerErrors.unknownCharacter(this, c, startLine, startColumn);
    }

    return null;
  }
}
