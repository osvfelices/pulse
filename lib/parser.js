import { Lexer } from './lexer.js';
import { ParserErrors, findBestMatch } from './errors.js';

export class Parser {
  constructor(src) {
    this.lex = new Lexer(src);
    this.t = this.lex.next();
    this.lastToken = null; // Track the last consumed token for end locations
    this.errors = []; // Collect errors for error recovery
    this.hasError = false; // Track if we've encountered any errors
    this.MAX_ERRORS = 100; // Maximum errors before bailing out
  }

  at(k) {
    return this.t && this.t.kind === k;
  }

  /**
   * Report an error and optionally recover
   */
  reportError(error) {
    this.errors.push(error);
    this.hasError = true;

    // Bail out if too many errors to prevent memory exhaustion
    if (this.errors.length >= this.MAX_ERRORS) {
      const bailError = new Error(`Too many errors (${this.MAX_ERRORS}+) - stopping parse`);
      bailError.pulseErrors = this.errors;
      throw bailError;
    }
  }

  /**
   * Throw all accumulated errors or a single error
   */
  throwErrors() {
    if (this.errors.length === 0) return;

    if (this.errors.length === 1) {
      throw this.errors[0];
    }

    // Multiple errors: format them all
    const errorMessages = this.errors.map(err => err.toString()).join('\n');
    const error = new Error(`Multiple errors found:\n${errorMessages}`);
    error.pulseErrors = this.errors;
    throw error;
  }

  /**
   * Try to recover from an error by skipping to a safe synchronization point
   * Safe points: semicolons, closing braces, statement keywords
   */
  recover() {
    const syncTokens = new Set([';', '}', 'fn', 'let', 'const', 'return', 'if', 'for', 'while', 'import', 'export', 'class']);

    // Skip tokens until we hit a synchronization point or EOF
    while (this.t && !syncTokens.has(this.t.kind)) {
      this.lastToken = this.t;
      this.t = this.lex.next();
    }

    // CRITICAL FIX: Consume the sync token to make progress
    // Otherwise we get stuck in infinite loop on the same token
    if (this.t && (this.at(';') || this.at('}'))) {
      this.lastToken = this.t;
      this.t = this.lex.next();
    }
  }

  eat(k) {
    if (!this.at(k)) {
      const error = ParserErrors.expectedToken(this, k);
      this.reportError(error);
      this.recover();
      // Return a placeholder token to allow parsing to continue
      const loc = { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
      return { kind: k, text: '', loc };
    }
    const v = this.t;
    this.lastToken = v; // Save the last token before advancing
    this.t = this.lex.next();
    return v;
  }

  // Location tracking helpers
  startLoc() {
    // Returns current token's start location
    if (this.t && this.t.loc) {
      return this.t.loc.start;
    }
    // If no token, use last token's end or default
    if (this.lastToken && this.lastToken.loc) {
      return this.lastToken.loc.end;
    }
    return { line: 1, column: 1 };
  }

  loc(start, end) {
    // Creates a location object from two positions
    return { start, end };
  }

  locFromToken(token) {
    // Extracts location from a token
    if (token && token.loc) {
      return token.loc;
    }
    return { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } };
  }

  endLoc() {
    // Returns the end location (current token's start or last token's end)
    if (this.t && this.t.loc) {
      return this.t.loc.start;
    }
    if (this.lastToken && this.lastToken.loc) {
      return this.lastToken.loc.end;
    }
    return { line: 1, column: 1 };
  }

  // Checkpoint/restore for backtracking
  checkpoint() {
    return { token: this.t, lexerState: this.lex.saveState(), lastToken: this.lastToken };
  }

  restore(cp) {
    this.t = cp.token;
    this.lex.restoreState(cp.lexerState);
    this.lastToken = cp.lastToken;
  }

  eatPropertyName() {
    // Property names can be identifiers or keywords
    if (this.at('ident')) {
      const token = this.eat('ident');
      return token.text || '';
    }
    // Allow keywords as property names (e.g. obj.catch())
    if (this.t && this.t.text) {
      const prop = this.t.text;
      this.lastToken = this.t;
      this.t = this.lex.next();
      return prop;
    }
    const error = ParserErrors.expectedPropertyName(this);
    this.reportError(error);
    this.recover();
    return '__error__';
  }

  eatImportName() {
    // Import names can be identifiers or keywords (e.g. import { select })
    if (this.at('ident')) {
      const token = this.eat('ident');
      return token.text || '';
    }
    // Allow keywords as import names
    if (this.t && this.t.text) {
      const name = this.t.text;
      this.lastToken = this.t;
      this.t = this.lex.next();
      return name;
    }
    const error = ParserErrors.expectedImportName(this);
    this.reportError(error);
    this.recover();
    return '__error__';
  }

  parseProgram() {
    const start = this.startLoc();
    const body = [];
    while (this.t) {
      try {
        const stmt = this.parseStmt();
        if (stmt) body.push(stmt);
      } catch (err) {
        // If a parse method throws, it's a fatal error
        // Report it and try to recover
        if (err.code) {
          this.reportError(err);
          this.recover();
        } else {
          throw err;
        }
      }
    }
    const end = this.endLoc();

    // Throw accumulated errors if any
    this.throwErrors();

    return { kind: 'Program', body, loc: this.loc(start, end) };
  }

  // Optional semicolon helper
  optionalSemicolon() {
    if (this.at(';')) this.eat(';');
  }

  // Parse either a block or a single statement
  parseBlockOrStatement() {
    if (this.at('{')) {
      return this.parseBlock();
    } else {
      // Single statement - wrap it in a block
      const start = this.startLoc();
      const stmt = this.parseStmt();
      const end = this.endLoc();
      return { kind: 'Block', statements: [stmt], loc: this.loc(start, end) };
    }
  }

  parseStmt() {
    if (this.at('import')) return this.parseImport();
    if (this.at('export')) return this.parseExport();
    if (this.at('view')) return this.parseView();
    if (this.at('async')) return this.parseFn(); // async fn
    if (this.at('fn')) return this.parseFn();
    if (this.at('let') || this.at('const')) {
      const v = this.parseVar();
      this.optionalSemicolon();
      return v;
    }
    if (this.at('return')) {
      const start = this.startLoc();
      this.eat('return');
      let e = null;
      if (!this.at(';') && !this.at('}') && this.t) e = this.parseExpr();
      this.optionalSemicolon();
      const end = this.endLoc();
      return { kind: 'ReturnStmt', expr: e, loc: this.loc(start, end) };
    }
    if (this.at('if')) return this.parseIf();
    if (this.at('for')) return this.parseFor();
    if (this.at('while')) return this.parseWhile();
    if (this.at('contract')) return this.parseContract();
    if (this.at('try')) return this.parseTry();
    if (this.at('throw')) {
      const start = this.startLoc();
      this.eat('throw');
      const e = this.parseExpr();
      this.optionalSemicolon();
      const end = this.endLoc();
      return { kind: 'ThrowStmt', expr: e, loc: this.loc(start, end) };
    }
    if (this.at('break')) {
      const start = this.startLoc();
      this.eat('break');
      this.optionalSemicolon();
      const end = this.endLoc();
      return { kind: 'BreakStmt', loc: this.loc(start, end) };
    }
    if (this.at('continue')) {
      const start = this.startLoc();
      this.eat('continue');
      this.optionalSemicolon();
      const end = this.endLoc();
      return { kind: 'ContinueStmt', loc: this.loc(start, end) };
    }
    if (this.at('switch')) return this.parseSwitch();
    if (this.at('class')) return this.parseClass();

    // Standalone block statement (creates new scope)
    if (this.at('{')) return this.parseBlock();

    const start = this.startLoc();
    const stmt = { kind: 'ExprStmt', expr: this.parseExpr(), loc: null };
    this.optionalSemicolon();
    const end = this.endLoc();
    stmt.loc = this.loc(start, end);
    return stmt;
  }

  parseImport() {
    const start = this.startLoc();
    this.eat('import');

    // Side-effect import: import 'mod'
    if (this.at('string')) {
      const src = this.eat('string').text.slice(1, -1);
      this.optionalSemicolon();
      const end = this.endLoc();
      return { kind: 'ImportDecl', source: src, sideEffect: true, loc: this.loc(start, end) };
    }

    let defaultImport = null;
    let namespace = null;
    const named = [];

    // Namespace import: import * as ns from 'mod'
    if (this.at('*')) {
      this.eat('*');
      this.eat('as');
      namespace = this.eat('ident').text;
    }
    // Named or default import
    else if (this.at('{')) {
      // Named imports: import { a, b as c } from 'mod'
      this.eat('{');
      while (!this.at('}')) {
        const imported = this.eatImportName();
        let local = imported;
        if (this.at('as')) {
          this.eat('as');
          local = this.eatImportName();
        }
        named.push({ imported, local });
        if (this.at(',')) this.eat(',');
        else break;
      }
      this.eat('}');
    }
    // Default import (possibly with named): import def from 'mod' or import def, { a } from 'mod'
    else if (this.at('ident')) {
      defaultImport = this.eat('ident').text;

      // Combo: import def, { a, b } from 'mod'
      if (this.at(',')) {
        this.eat(',');
        this.eat('{');
        while (!this.at('}')) {
          const imported = this.eatImportName();
          let local = imported;
          if (this.at('as')) {
            this.eat('as');
            local = this.eatImportName();
          }
          named.push({ imported, local });
          if (this.at(',')) this.eat(',');
          else break;
        }
        this.eat('}');
      }
    }

    this.eat('from');
    const src = this.eat('string').text.slice(1, -1);

    this.optionalSemicolon();
    const end = this.endLoc();
    return {
      kind: 'ImportDecl',
      source: src,
      default: defaultImport || undefined,
      namespace: namespace || undefined,
      named: named.length > 0 ? named : undefined,
      sideEffect: false,
      loc: this.loc(start, end)
    };
  }

  parseExport() {
    const start = this.startLoc();
    this.eat('export');

    // export default expr
    if (this.at('default')) {
      this.eat('default');
      const expr = this.parseAssignment();
      this.optionalSemicolon();
      const end = this.endLoc();
      return { kind: 'ExportDefault', expr, loc: this.loc(start, end) };
    }

    // export * from 'mod' or export * as ns from 'mod'
    if (this.at('*')) {
      this.eat('*');
      let asName = null;
      if (this.at('as')) {
        this.eat('as');
        asName = this.eat('ident').text;
      }
      this.eat('from');
      const src = this.eat('string').text.slice(1, -1);
      this.optionalSemicolon();
      const end = this.endLoc();
      return { kind: 'ExportAll', source: src, as: asName || undefined, loc: this.loc(start, end) };
    }

    // export { a, b as c } or export { a, b as c } from 'mod'
    if (this.at('{')) {
      this.eat('{');
      const specifiers = [];
      while (!this.at('}')) {
        const local = this.eat('ident').text;
        let exported = local;
        if (this.at('as')) {
          this.eat('as');
          exported = this.eat('ident').text;
        }
        specifiers.push({ local, exported });
        if (this.at(',')) this.eat(',');
        else break;
      }
      this.eat('}');

      // Re-export: export { a } from 'mod'
      if (this.at('from')) {
        this.eat('from');
        const src = this.eat('string').text.slice(1, -1);
        this.optionalSemicolon();
        const end = this.endLoc();
        return { kind: 'ExportNamed', specifiers, source: src, loc: this.loc(start, end) };
      }

      // Local export: export { a }
      this.optionalSemicolon();
      const end = this.endLoc();
      return { kind: 'ExportNamed', specifiers, loc: this.loc(start, end) };
    }

    // export fn, export class, export const/let
    if (this.at('fn') || this.at('async')) {
      const fn = this.parseFn();
      const end = this.endLoc();
      return { kind: 'ExportDecl', declaration: fn, loc: this.loc(start, end) };
    }
    if (this.at('class')) {
      const cls = this.parseClass();
      const end = this.endLoc();
      return { kind: 'ExportDecl', declaration: cls, loc: this.loc(start, end) };
    }
    if (this.at('const') || this.at('let')) {
      const varDecl = this.parseVar();
      this.optionalSemicolon();
      const end = this.endLoc();
      return { kind: 'ExportDecl', declaration: varDecl, loc: this.loc(start, end) };
    }

    const error = ParserErrors.invalidExportSyntax(this, 'expected default, *, {...}, fn, class, const, or let');
    this.reportError(error);
    this.recover();
    return { kind: 'ExportDecl', declaration: null, loc: this.loc(start, this.endLoc()) };
  }

  parseFn() {
    const start = this.startLoc();
    const isAsync = this.at('async');
    if (isAsync) this.eat('async');

    this.eat('fn');
    const name = this.at('ident') ? this.eat('ident').text : null;
    this.eat('(');
    const params = [];
    while (!this.at(')')) {
      // Rest parameter
      if (this.at('...')) {
        this.eat('...');
        const id = this.eat('ident').text;
        params.push({ name: id, rest: true });
        break; // Rest must be last
      }

      const id = this.eat('ident').text;
      let defaultValue = null;

      // Default parameter
      if (this.at('=')) {
        this.eat('=');
        defaultValue = this.parseAssignment();
      }

      params.push({ name: id, default: defaultValue });
      if (this.at(',')) this.eat(',');
      else break;
    }
    this.eat(')');
    const body = this.parseBlock();
    const end = this.endLoc();
    return { kind: 'FnDecl', name, params, body, async: isAsync, loc: this.loc(start, end) };
  }

  parseVar() {
    const start = this.startLoc();
    const c = this.eat(this.t.kind).kind === 'const';

    // Check for destructuring
    if (this.at('[')) {
      // Array destructuring
      const patternStart = this.startLoc();
      this.eat('[');
      const elements = [];
      while (!this.at(']')) {
        if (this.at('...')) {
          const elemStart = this.startLoc();
          this.eat('...');
          const name = this.eat('ident').text;
          const elemEnd = this.endLoc();
          elements.push({ kind: 'RestElement', name, loc: this.loc(elemStart, elemEnd) });
          break;
        }
        elements.push(this.eat('ident').text);
        if (this.at(',')) this.eat(',');
        else break;
      }
      this.eat(']');
      const patternEnd = this.endLoc();
      this.eat('=');
      const init = this.parseExpr();
      const end = this.endLoc();
      return { kind: 'VarDecl', constant: c, pattern: { kind: 'ArrayPattern', elements, loc: this.loc(patternStart, patternEnd) }, init, loc: this.loc(start, end) };
    }

    if (this.at('{')) {
      // Object destructuring
      const patternStart = this.startLoc();
      this.eat('{');
      const properties = [];
      while (!this.at('}')) {
        const key = this.eat('ident').text;
        let localName = key;
        if (this.at(':')) {
          this.eat(':');
          localName = this.eat('ident').text;
        }
        properties.push({ key, value: localName });
        if (this.at(',')) this.eat(',');
        else break;
      }
      this.eat('}');
      const patternEnd = this.endLoc();
      this.eat('=');
      const init = this.parseExpr();
      const end = this.endLoc();
      return { kind: 'VarDecl', constant: c, pattern: { kind: 'ObjectPattern', properties, loc: this.loc(patternStart, patternEnd) }, init, loc: this.loc(start, end) };
    }

    // Normal variable
    const name = this.eat('ident').text;
    let init = null;
    if (this.at('=')) {
      this.eat('=');
      init = this.parseExpr();
    }
    const end = this.endLoc();
    return { kind: 'VarDecl', constant: c, name, init, loc: this.loc(start, end) };
  }

  parseIf() {
    const start = this.startLoc();
    this.eat('if');
    this.eat('(');
    const test = this.parseExpr();
    this.eat(')');
    const consequent = this.parseBlockOrStatement();
    let alternate = null;
    if (this.at('else')) {
      this.eat('else');
      if (this.at('if')) {
        alternate = this.parseIf(); // else if - returns IfStmt directly
      } else {
        alternate = this.parseBlockOrStatement();
      }
    }
    const end = this.endLoc();
    return { kind: 'IfStmt', test, consequent, alternate, loc: this.loc(start, end) };
  }

  parseFor() {
    const start = this.startLoc();
    this.eat('for');

    // Check for for await
    const isAwait = this.at('await');
    if (isAwait) this.eat('await');

    this.eat('(');
    const init = this.at('let') || this.at('const') ? this.parseVar() : { kind: 'ExprStmt', expr: this.parseExpr(), loc: null };

    // Check for for-of loop (or for await...of)
    if (this.at('of')) {
      this.eat('of');
      const iterable = this.parseExpr();
      this.eat(')');
      const body = this.parseBlockOrStatement();
      const end = this.endLoc();
      if (isAwait) {
        return { kind: 'ForAwaitStmt', variable: init, iterable, body, loc: this.loc(start, end) };
      }
      return { kind: 'ForOfStmt', variable: init, iterable, body, loc: this.loc(start, end) };
    }

    // Check for for-in loop
    if (this.at('in')) {
      this.eat('in');
      const object = this.parseExpr();
      this.eat(')');
      const body = this.parseBlockOrStatement();
      const end = this.endLoc();
      return { kind: 'ForInStmt', variable: init, object, body, loc: this.loc(start, end) };
    }

    // Regular for loop (await not valid here)
    if (isAwait) {
      const error = ParserErrors.awaitOnlyInForOf(this);
      this.reportError(error);
      // Continue parsing, treating as regular for loop
    }
    this.eat(';');
    const test = this.parseExpr();
    this.eat(';');
    const update = this.parseExpr();
    this.eat(')');
    const body = this.parseBlockOrStatement();
    const end = this.endLoc();
    return { kind: 'ForStmt', init, test, update, body, loc: this.loc(start, end) };
  }

  parseWhile() {
    const start = this.startLoc();
    this.eat('while');
    this.eat('(');
    const test = this.parseExpr();
    this.eat(')');
    const body = this.parseBlockOrStatement();
    const end = this.endLoc();
    return { kind: 'WhileStmt', test, body, loc: this.loc(start, end) };
  }

  parseTry() {
    const start = this.startLoc();
    this.eat('try');
    const body = this.parseBlock();
    let handler = null;
    let finalizer = null;
    if (this.at('catch')) {
      this.eat('catch');
      this.eat('(');
      const param = this.eat('ident').text;
      this.eat(')');
      const catchBody = this.parseBlock();
      handler = { param, body: catchBody };
    }
    if (this.at('finally')) {
      this.eat('finally');
      finalizer = this.parseBlock();
    }
    const end = this.endLoc();
    return { kind: 'TryStmt', body, handler, finalizer, loc: this.loc(start, end) };
  }

  parseSwitch() {
    const start = this.startLoc();
    this.eat('switch');
    this.eat('(');
    const discriminant = this.parseExpr();
    this.eat(')');
    this.eat('{');
    const cases = [];
    while (!this.at('}')) {
      if (this.at('case')) {
        this.eat('case');
        const test = this.parseExpr();
        this.eat(':');
        const consequent = [];
        while (!this.at('case') && !this.at('default') && !this.at('}')) {
          consequent.push(this.parseStmt());
        }
        cases.push({ test, consequent });
      } else if (this.at('default')) {
        this.eat('default');
        this.eat(':');
        const consequent = [];
        while (!this.at('case') && !this.at('default') && !this.at('}')) {
          consequent.push(this.parseStmt());
        }
        cases.push({ test: null, consequent });
      } else {
        const error = ParserErrors.invalidSwitchCase(this);
        this.reportError(error);
        this.recover();
        break;
      }
    }
    this.eat('}');
    const end = this.endLoc();
    return { kind: 'SwitchStmt', discriminant, cases, loc: this.loc(start, end) };
  }

  parseClass() {
    const start = this.startLoc();
    this.eat('class');
    const name = this.eat('ident').text;
    let superClass = null;
    if (this.at('extends')) {
      this.eat('extends');
      superClass = this.eat('ident').text;
    }
    this.eat('{');
    const methods = [];
    while (!this.at('}')) {
      // Check for async keyword before method name
      const isAsync = this.at('async');
      if (isAsync) this.eat('async');

      const methodName = this.eat('ident').text;
      this.eat('(');
      const params = [];
      while (!this.at(')')) {
        params.push({ name: this.eat('ident').text });
        if (this.at(',')) this.eat(',');
        else break;
      }
      this.eat(')');
      const body = this.parseBlock();
      methods.push({ name: methodName, params, body, async: isAsync });
    }
    this.eat('}');
    const end = this.endLoc();
    return { kind: 'ClassDecl', name, superClass, methods, loc: this.loc(start, end) };
  }

  parseContract() {
    const start = this.startLoc();
    this.eat('contract');
    const name = this.eat('ident').text;
    this.eat('{');
    const fields = [];
    while (!this.at('}')) {
      const fieldName = this.eat('ident').text;
      this.eat(':');
      const fieldType = this.eat('ident').text;
      fields.push({ name: fieldName, type: fieldType });
      if (this.at(',')) this.eat(',');
    }
    this.eat('}');
    const end = this.endLoc();
    return { kind: 'ContractDecl', name, fields, loc: this.loc(start, end) };
  }

  parseView() {
    const start = this.startLoc();
    this.eat('view');
    const name = this.eat('ident').text;
    this.eat('(');
    const params = [];
    while (!this.at(')')) {
      const id = this.eat('ident').text;
      params.push({ name: id });
      if (this.at(',')) this.eat(',');
      else break;
    }
    this.eat(')');
    const body = this.parseBlock();
    const end = this.endLoc();
    return { kind: 'ViewDecl', name, params, body, loc: this.loc(start, end) };
  }

  parseBlock() {
    const start = this.startLoc();
    this.eat('{');
    const st = [];
    while (!this.at('}') && this.t) {
      try {
        const stmt = this.parseStmt();
        if (stmt) st.push(stmt);
      } catch (err) {
        // If a parse method throws, report error and recover
        if (err.code) {
          this.reportError(err);
          this.recover();
        } else {
          throw err;
        }
      }
    }
    this.eat('}');
    const end = this.endLoc();
    return { kind: 'Block', statements: st, loc: this.loc(start, end) };
  }

  parseExpr() {
    return this.parseAssignment();
  }

  parseAssignment() {
    const start = this.startLoc();
    let l = this.parseArrow();
    if (this.at('=')) {
      this.eat('=');
      const r = this.parseAssignment(); // Right-associative
      const end = this.endLoc();
      return { kind: 'BinaryExpr', op: '=', left: l, right: r, loc: this.loc(start, end) };
    }
    if (this.at('+=') || this.at('-=') || this.at('*=') || this.at('/=') || this.at('%=')) {
      const op = this.eat(this.t.kind).text;
      const r = this.parseAssignment();
      const end = this.endLoc();
      return { kind: 'BinaryExpr', op, left: l, right: r, loc: this.loc(start, end) };
    }
    return l;
  }

  parseArrow() {
    // Arrow function parsing with proper backtracking
    // Patterns: x => expr, (x) => expr, () => expr, (a, b) => expr, async x => expr

    // Save checkpoint for potential backtracking
    const startCheckpoint = this.checkpoint();
    const start = this.startLoc();

    // Check for async arrow
    const isAsync = this.at('async');
    if (isAsync) {
      this.eat('async');
      // After async, must have ident or (
      if (!this.at('ident') && !this.at('(')) {
        this.restore(startCheckpoint);
        return this.parseNullish();
      }
    }

    // Try to detect arrow function patterns
    // Pattern 1: ident => ... (single param, no parens)
    if (this.at('ident')) {
      const cp = this.checkpoint();
      const param = this.eat('ident').text;

      if (this.at('=>')) {
        // It's an arrow function!
        this.eat('=>');
        const body = this.parseArrowBody();
        const end = this.endLoc();
        return {
          kind: 'ArrowFn',
          params: [param],
          body: body,
          async: isAsync,
          loc: this.loc(start, end)
        };
      }

      // Not an arrow, backtrack
      this.restore(cp);
      if (isAsync) this.restore(startCheckpoint);
      return this.parseNullish();
    }

    // Pattern 2: ( params ) => ...
    if (this.at('(')) {
      const cp = this.checkpoint();
      this.eat('(');

      // Parse parameter list
      const params = [];
      let isArrowFn = false;

      if (this.at(')')) {
        // Empty params: () => ...
        this.eat(')');
        if (this.at('=>')) {
          isArrowFn = true;
        }
      } else {
        // Try to parse as arrow params
        let couldBeArrow = true;

        while (!this.at(')') && couldBeArrow) {
          // Rest parameter
          if (this.at('...')) {
            this.eat('...');
            if (this.at('ident')) {
              params.push({ name: this.eat('ident').text, rest: true });
              if (this.at(')')) break;
              if (this.at(',')) {
                this.eat(',');
                if (this.at(')')) break;
              }
            } else {
              couldBeArrow = false;
            }
          }
          // Normal param or default param
          else if (this.at('ident')) {
            const paramName = this.eat('ident').text;
            let defaultValue = null;

            // Default parameter
            if (this.at('=')) {
              this.eat('=');
              // Use parseTernary to avoid arrow recursion in defaults
              defaultValue = this.parseTernary();
            }

            params.push({ name: paramName, default: defaultValue });

            if (this.at(',')) {
              this.eat(',');
              if (this.at(')')) break;
            } else if (!this.at(')')) {
              couldBeArrow = false;
            }
          } else {
            // Not a valid param pattern
            couldBeArrow = false;
          }
        }

        if (couldBeArrow && this.at(')')) {
          this.eat(')');
          if (this.at('=>')) {
            isArrowFn = true;
          }
        }
      }

      if (isArrowFn) {
        this.eat('=>');
        const body = this.parseArrowBody();
        const end = this.endLoc();
        return {
          kind: 'ArrowFn',
          params: params,
          body: body,
          async: isAsync,
          loc: this.loc(start, end)
        };
      }

      // Not an arrow function, backtrack and parse as grouped expression
      this.restore(cp);
      if (isAsync) this.restore(startCheckpoint);
      return this.parseNullish();
    }

    // Not an arrow function pattern
    if (isAsync) this.restore(startCheckpoint);
    return this.parseNullish();
  }

  parseArrowBody() {
    // Arrow body can be: expression or { block }
    if (this.at('{')) {
      // Block body
      return this.parseBlock();
    } else {
      // Expression body (implicit return)
      // Parse full assignment expressions to allow nested arrows
      // Example: a => b => a + b
      return this.parseAssignment();
    }
  }

  parseNullish() {
    const start = this.startLoc();
    let l = this.parseTernary();
    while (this.at('??')) {
      const op = this.eat('??').text;
      const r = this.parseTernary();
      const end = this.endLoc();
      l = { kind: 'BinaryExpr', op, left: l, right: r, loc: this.loc(start, end) };
    }
    return l;
  }

  parseTernary() {
    const start = this.startLoc();
    let l = this.parseOr();
    if (this.at('?')) {
      this.eat('?');
      const consequent = this.parseOr();
      this.eat(':');
      const alternate = this.parseTernary(); // Right-associative
      const end = this.endLoc();
      return { kind: 'TernaryExpr', test: l, consequent, alternate, loc: this.loc(start, end) };
    }
    return l;
  }

  parseOr() {
    const start = this.startLoc();
    let l = this.parseAnd();
    while (this.at('||')) {
      this.eat('||');
      const r = this.parseAnd();
      const end = this.endLoc();
      l = { kind: 'BinaryExpr', op: '||', left: l, right: r, loc: this.loc(start, end) };
    }
    return l;
  }

  parseAnd() {
    const start = this.startLoc();
    let l = this.parseEquality();
    while (this.at('&&')) {
      this.eat('&&');
      const r = this.parseEquality();
      const end = this.endLoc();
      l = { kind: 'BinaryExpr', op: '&&', left: l, right: r, loc: this.loc(start, end) };
    }
    return l;
  }

  parseEquality() {
    const start = this.startLoc();
    let l = this.parseComparison();
    while (this.at('==') || this.at('!=')) {
      const op = this.t.text;
      this.eat(op);
      const r = this.parseComparison();
      const end = this.endLoc();
      l = { kind: 'BinaryExpr', op, left: l, right: r, loc: this.loc(start, end) };
    }
    return l;
  }

  parseComparison() {
    const start = this.startLoc();
    let l = this.parseAdd();
    while (this.at('<') || this.at('>') || this.at('<=') || this.at('>=') || this.at('instanceof') || this.at('in')) {
      const op = this.t.text;
      this.eat(this.t.kind);
      const r = this.parseAdd();
      const end = this.endLoc();
      l = { kind: 'BinaryExpr', op, left: l, right: r, loc: this.loc(start, end) };
    }
    return l;
  }

  parseAdd() {
    const start = this.startLoc();
    let l = this.parseMul();
    while (this.at('+') || this.at('-')) {
      const op = this.t.text;
      this.eat(op);
      const r = this.parseMul();
      const end = this.endLoc();
      l = { kind: 'BinaryExpr', op, left: l, right: r, loc: this.loc(start, end) };
    }
    return l;
  }

  parseMul() {
    const start = this.startLoc();
    let l = this.parseUnary();
    while (this.at('*') || this.at('/') || this.at('%')) {
      const op = this.t.text;
      this.eat(op);
      const r = this.parseUnary();
      const end = this.endLoc();
      l = { kind: 'BinaryExpr', op, left: l, right: r, loc: this.loc(start, end) };
    }
    return l;
  }

  parseUnary() {
    const start = this.startLoc();
    if (this.at('!') || this.at('-')) {
      const op = this.t.text;
      this.eat(op);
      const arg = this.parseUnary();
      const end = this.endLoc();
      return { kind: 'UnaryExpr', op, argument: arg, loc: this.loc(start, end) };
    }
    if (this.at('++') || this.at('--')) {
      const op = this.eat(this.t.kind).text;
      const arg = this.parseUnary();
      const end = this.endLoc();
      return { kind: 'UpdateExpr', op, argument: arg, prefix: true, loc: this.loc(start, end) };
    }
    if (this.at('typeof') || this.at('delete') || this.at('await')) {
      const op = this.eat(this.t.kind).text;
      const arg = this.parseUnary();
      const end = this.endLoc();
      return { kind: 'UnaryExpr', op, argument: arg, loc: this.loc(start, end) };
    }
    if (this.at('spawn') || this.at('go')) {
      this.eat(this.t.kind); // spawn or go
      const arg = this.parseArrow();
      const end = this.endLoc();
      return { kind: 'SpawnExpr', argument: arg, loc: this.loc(start, end) };
    }
    if (this.at('yield')) {
      this.eat('yield');
      // yield can optionally have an argument
      // Check if followed by statement terminators or statement keywords
      if (this.at(';') || this.at('}') || this.at(')') || this.at(',') || this.at(']') ||
        this.at('return') || this.at('if') || this.at('for') || this.at('while') ||
        this.at('break') || this.at('continue') || this.at('throw') || this.at('const') ||
        this.at('let') || this.at('var') || this.at('fn') || this.at('class') || !this.t) {
        const end = this.endLoc();
        return { kind: 'YieldExpr', argument: null, loc: this.loc(start, end) };
      }
      const arg = this.parseArrow();
      const end = this.endLoc();
      return { kind: 'YieldExpr', argument: arg, loc: this.loc(start, end) };
    }
    if (this.at('new')) {
      this.eat('new');
      const callee = this.parsePrim();
      let args = [];
      if (this.at('(')) {
        this.eat('(');
        if (!this.at(')')) {
          args.push(this.parseExpr());
          while (this.at(',')) {
            this.eat(',');
            if (!this.at(')')) args.push(this.parseExpr());
          }
        }
        this.eat(')');
      }

      // Allow postfix chains after new expression (method calls, property access, etc.)
      const end = this.endLoc();
      let expr = { kind: 'NewExpr', callee, args, loc: this.loc(start, end) };
      return this.applyPostfixChains(expr);
    }
    return this.parsePostfix();
  }

  // Apply postfix operations (., [], (), etc.) to an expression
  applyPostfixChains(expr) {
    while (true) {
      const start = expr.loc ? expr.loc.start : this.startLoc();
      if (this.at('?.')) {
        this.eat('?.');
        const prop = this.eatPropertyName();
        const end = this.endLoc();
        expr = { kind: 'OptionalMemberExpr', object: expr, property: prop, loc: this.loc(start, end) };
      } else if (this.at('.')) {
        this.eat('.');
        const prop = this.eatPropertyName();
        const end = this.endLoc();
        expr = { kind: 'MemberExpr', object: expr, property: prop, loc: this.loc(start, end) };
      } else if (this.at('[')) {
        this.eat('[');
        const index = this.parseExpr();
        this.eat(']');
        const end = this.endLoc();
        expr = { kind: 'IndexExpr', object: expr, index, loc: this.loc(start, end) };
      } else if (this.at('(')) {
        this.eat('(');
        const args = [];
        if (!this.at(')')) {
          args.push(this.parseExpr());
          while (!this.at(')')) {
            if (this.at(',')) {
              this.eat(',');
              if (this.at(')')) break;
              args.push(this.parseExpr());
            }
            else break;
          }
        }
        this.eat(')');
        const end = this.endLoc();
        expr = { kind: 'CallExpr', callee: expr, args, loc: this.loc(start, end) };
      } else if (this.at('++') || this.at('--')) {
        const op = this.eat(this.t.kind).text;
        const end = this.endLoc();
        expr = { kind: 'UpdateExpr', op, argument: expr, prefix: false, loc: this.loc(start, end) };
      } else {
        break;
      }
    }
    return expr;
  }

  parsePostfix() {
    let expr = this.parsePrim();
    return this.applyPostfixChains(expr);
  }

  parsePrim() {
    // Handle select expression: select { case recv ch1 ... }
    if (this.at('select')) {
      return this.parseSelect();
    }
    if (this.at('ident')) {
      const start = this.startLoc();
      const id = { kind: 'Identifier', name: this.eat('ident').text, loc: null };
      const end = this.endLoc();
      id.loc = this.loc(start, end);
      return id;
    }
    if (this.at('number')) {
      const start = this.startLoc();
      const n = Number(this.eat('number').text.replaceAll('_', ''));
      const end = this.endLoc();
      return { kind: 'NumberLiteral', value: n, loc: this.loc(start, end) };
    }
    if (this.at('string')) {
      const start = this.startLoc();
      const s = this.eat('string').text;
      const end = this.endLoc();
      if (s[0] === '`') {
        // Template string - keep original including backticks
        return { kind: 'TemplateLiteral', value: s, loc: this.loc(start, end) };
      }
      return { kind: 'StringLiteral', value: s.slice(1, -1), loc: this.loc(start, end) };
    }
    if (this.at('true')) {
      const start = this.startLoc();
      this.eat('true');
      const end = this.endLoc();
      return { kind: 'BooleanLiteral', value: true, loc: this.loc(start, end) };
    }
    if (this.at('false')) {
      const start = this.startLoc();
      this.eat('false');
      const end = this.endLoc();
      return { kind: 'BooleanLiteral', value: false, loc: this.loc(start, end) };
    }
    if (this.at('null')) {
      const start = this.startLoc();
      this.eat('null');
      const end = this.endLoc();
      return { kind: 'NullLiteral', loc: this.loc(start, end) };
    }
    if (this.at('[')) {
      const start = this.startLoc();
      this.eat('[');
      const elements = [];
      if (!this.at(']')) {
        // Spread or normal element
        if (this.at('...')) {
          const spreadStart = this.startLoc();
          this.eat('...');
          const argument = this.parseExpr();
          const spreadEnd = this.endLoc();
          elements.push({ kind: 'SpreadElement', argument, loc: this.loc(spreadStart, spreadEnd) });
        } else {
          elements.push(this.parseExpr());
        }

        while (this.at(',')) {
          this.eat(',');
          if (this.at(']')) break;

          if (this.at('...')) {
            const spreadStart = this.startLoc();
            this.eat('...');
            const argument = this.parseExpr();
            const spreadEnd = this.endLoc();
            elements.push({ kind: 'SpreadElement', argument, loc: this.loc(spreadStart, spreadEnd) });
          } else {
            elements.push(this.parseExpr());
          }
        }
      }
      this.eat(']');
      const end = this.endLoc();
      return { kind: 'ArrayExpr', elements, loc: this.loc(start, end) };
    }
    if (this.at('{')) {
      const start = this.startLoc();
      this.eat('{');
      const properties = [];
      if (!this.at('}')) {
        // First property
        if (this.at('...')) {
          // Spread property
          const spreadStart = this.startLoc();
          this.eat('...');
          const argument = this.parseExpr();
          const spreadEnd = this.endLoc();
          properties.push({ kind: 'SpreadProperty', argument, loc: this.loc(spreadStart, spreadEnd) });
        } else if (this.at('[')) {
          // Computed property
          this.eat('[');
          const key = this.parseExpr();
          this.eat(']');
          this.eat(':');
          const value = this.parseExpr();
          properties.push({ key, value, computed: true });
        } else {
          // Normal or shorthand property
          // Support both ident and string keys ('Content-Type', etc.)
          let key;
          if (this.at('string')) {
            key = this.eat('string').text;
          } else {
            key = this.eat('ident').text;
          }
          if (this.at(':')) {
            this.eat(':');
            const value = this.parseExpr();
            properties.push({ key, value });
          } else {
            // Shorthand: {name} = {name: name}
            const identStart = this.lastToken && this.lastToken.loc ? this.lastToken.loc.start : this.startLoc();
            const identEnd = this.lastToken && this.lastToken.loc ? this.lastToken.loc.end : this.endLoc();
            properties.push({ key, value: { kind: 'Identifier', name: key, loc: this.loc(identStart, identEnd) }, shorthand: true });
          }
        }

        while (this.at(',')) {
          this.eat(',');
          if (this.at('}')) break;

          if (this.at('...')) {
            const spreadStart = this.startLoc();
            this.eat('...');
            const argument = this.parseExpr();
            const spreadEnd = this.endLoc();
            properties.push({ kind: 'SpreadProperty', argument, loc: this.loc(spreadStart, spreadEnd) });
          } else if (this.at('[')) {
            this.eat('[');
            const key = this.parseExpr();
            this.eat(']');
            this.eat(':');
            const value = this.parseExpr();
            properties.push({ key, value, computed: true });
          } else {
            // Support both ident and string keys
            let key;
            if (this.at('string')) {
              key = this.eat('string').text;
            } else {
              key = this.eat('ident').text;
            }
            if (this.at(':')) {
              this.eat(':');
              const value = this.parseExpr();
              properties.push({ key, value });
            } else {
              const identStart = this.lastToken && this.lastToken.loc ? this.lastToken.loc.start : this.startLoc();
              const identEnd = this.lastToken && this.lastToken.loc ? this.lastToken.loc.end : this.endLoc();
              properties.push({ key, value: { kind: 'Identifier', name: key, loc: this.loc(identStart, identEnd) }, shorthand: true });
            }
          }
        }
      }
      this.eat('}');
      const end = this.endLoc();
      return { kind: 'ObjectExpr', properties, loc: this.loc(start, end) };
    }
    if (this.at('async')) {
      // Check if it's async fn expression by peeking ahead
      const cp = this.checkpoint();
      this.eat('async');
      const isAsyncFn = this.at('fn');
      this.restore(cp);

      if (isAsyncFn) {
        return this.parseFn(); // async fn() expression
      }
      // Otherwise fall through - might be async arrow or identifier
    }
    if (this.at('fn')) {
      return this.parseFn();
    }
    if (this.at('import')) {
      const start = this.startLoc();
      // Check if it's dynamic import import() or import.meta
      const next = this.lex.s[this.lex.i];
      if (next === '(') {
        // Dynamic import: import(specifier)
        this.eat('import');
        this.eat('(');
        const source = this.parseExpr();
        this.eat(')');
        const end = this.endLoc();
        return { kind: 'ImportExpr', source, loc: this.loc(start, end) };
      } else {
        // import.meta or other property access
        const id = { kind: 'Identifier', name: this.eat('import').text, loc: null };
        const end = this.endLoc();
        id.loc = this.loc(start, end);
        return id;
      }
    }
    if (this.at('(')) {
      this.eat('(');
      const e = this.parseExpr();
      this.eat(')');
      return e;
    }
    const error = ParserErrors.unexpectedToken(this);
    this.reportError(error);
    this.recover();
    // Return a placeholder identifier to continue parsing
    const start = this.startLoc();
    const end = this.endLoc();
    return { kind: 'Identifier', name: '__error__', loc: this.loc(start, end) };
  }

  parseSelect() {
    // Parse select expression: select { case recv ch1: ..., default: ..., ... }
    // Returns SelectExpr node with cases array and optional defaultCase with statement bodies
    const start = this.startLoc();
    this.eat('select');
    this.eat('{');

    const cases = [];
    let defaultCase = null;

    while (!this.at('}')) {
      if (this.at('case')) {
        this.eat('case');

        // Parse operation: 'recv' or 'send'
        let op;
        if (this.at('ident')) {
          const opText = this.t.text;
          if (opText === 'recv' || opText === 'send') {
            op = opText;
            this.eat('ident');
          } else {
            const error = ParserErrors.invalidSelectCase(this, `expected recv or send, got '${opText}'`);
            this.reportError(error);
            // Try to recover and continue
            this.recover();
            continue;
          }
        } else {
          const error = ParserErrors.invalidSelectCase(this, 'expected recv or send operation');
          this.reportError(error);
          this.recover();
          continue;
        }

        // Parse channel expression
        const channel = this.parseExpr();

        // For send operations, also parse the value
        let value = null;
        if (op === 'send') {
          // Next expression is the value to send
          value = this.parseExpr();
        }

        // Parse case body: optional ':' followed by statements
        let body = [];
        if (this.at(':')) {
          this.eat(':');
          // Parse statements until we hit 'case', 'default', or '}'
          while (!this.at('case') && !this.at('default') && !this.at('}')) {
            const stmt = this.parseStmt();
            if (stmt) body.push(stmt);
          }
        }

        cases.push({ op, channel, value, body });

        // Optional comma or newline between cases
        if (this.at(',')) this.eat(',');
      } else if (this.at('default')) {
        this.eat('default');

        // Default case can only appear once
        if (defaultCase !== null) {
          const error = ParserErrors.invalidSelectCase(this, 'multiple default cases not allowed');
          this.reportError(error);
          this.recover();
          continue;
        }

        // Parse default body: optional ':' followed by statements
        let body = [];
        if (this.at(':')) {
          this.eat(':');
          // Parse statements until we hit 'case', 'default', or '}'
          while (!this.at('case') && !this.at('default') && !this.at('}')) {
            const stmt = this.parseStmt();
            if (stmt) body.push(stmt);
          }
        }

        defaultCase = { kind: 'default', body };

        // Optional comma or newline after default
        if (this.at(',')) this.eat(',');
      } else {
        const error = ParserErrors.invalidSelectCase(this, 'expected case keyword');
        this.reportError(error);
        this.recover();
        break;
      }
    }

    this.eat('}');

    if (cases.length === 0 && defaultCase === null) {
      const error = ParserErrors.selectMustHaveCases(this);
      this.reportError(error);
    }

    const end = this.endLoc();
    return { kind: 'SelectExpr', cases, defaultCase, loc: this.loc(start, end) };
  }
}
