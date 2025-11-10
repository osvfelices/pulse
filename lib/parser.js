
import { Lexer } from './lexer.js';
export class Parser{
  constructor(src){ this.lex=new Lexer(src); this.t=this.lex.next(); }
  at(k){ return this.t && this.t.kind===k; }
  eat(k){ if(!this.at(k)) throw new Error('expected '+k+' got '+(this.t?this.t.kind:'EOF')); const v=this.t; this.t=this.lex.next(); return v; }

  // Checkpoint/restore for backtracking
  checkpoint(){ return { token: this.t, lexerState: this.lex.saveState() }; }
  restore(cp){ this.t = cp.token; this.lex.restoreState(cp.lexerState); }
  eatPropertyName(){
    // Property names can be identifiers or keywords
    if(this.at('ident')) return this.eat('ident').text;
    // Allow keywords as property names (e.g. obj.catch())
    if(this.t && this.t.text) {
      const prop = this.t.text;
      this.t = this.lex.next();
      return prop;
    }
    throw new Error('expected property name got '+(this.t?this.t.kind:'EOF'));
  }

  parseProgram(){ const body=[]; while(this.t){ body.push(this.parseStmt()); } return {kind:'Program',body}; }

  parseStmt(){
    if(this.at('import')) return this.parseImport();
    if(this.at('export')) return this.parseExport();
    if(this.at('view')) return this.parseView();
    if(this.at('async')) return this.parseFn(); // async fn
    if(this.at('fn')) return this.parseFn();
    if(this.at('let')||this.at('const')) return this.parseVar();
    if(this.at('return')){ this.eat('return'); let e=null; if(!this.at('}') && this.t) e=this.parseExpr(); return {kind:'ReturnStmt',expr:e}; }
    if(this.at('if')) return this.parseIf();
    if(this.at('for')) return this.parseFor();
    if(this.at('while')) return this.parseWhile();
    if(this.at('contract')) return this.parseContract();
    if(this.at('try')) return this.parseTry();
    if(this.at('throw')){ this.eat('throw'); const e=this.parseExpr(); return {kind:'ThrowStmt',expr:e}; }
    if(this.at('break')){ this.eat('break'); return {kind:'BreakStmt'}; }
    if(this.at('continue')){ this.eat('continue'); return {kind:'ContinueStmt'}; }
    if(this.at('switch')) return this.parseSwitch();
    if(this.at('class')) return this.parseClass();
    return {kind:'ExprStmt',expr:this.parseExpr()};
  }

  parseImport(){
    this.eat('import');

    // Side-effect import: import 'mod'
    if(this.at('string')){
      const src = this.eat('string').text.slice(1,-1);
      return {kind:'ImportDecl',source:src,sideEffect:true};
    }

    let defaultImport = null;
    let namespace = null;
    const named = [];

    // Namespace import: import * as ns from 'mod'
    if(this.at('*')){
      this.eat('*');
      this.eat('as');
      namespace = this.eat('ident').text;
    }
    // Named or default import
    else if(this.at('{')){
      // Named imports: import { a, b as c } from 'mod'
      this.eat('{');
      while(!this.at('}')){
        const imported = this.eat('ident').text;
        let local = imported;
        if(this.at('as')){
          this.eat('as');
          local = this.eat('ident').text;
        }
        named.push({imported,local});
        if(this.at(',')) this.eat(',');
        else break;
      }
      this.eat('}');
    }
    // Default import (possibly with named): import def from 'mod' or import def, { a } from 'mod'
    else if(this.at('ident')){
      defaultImport = this.eat('ident').text;

      // Combo: import def, { a, b } from 'mod'
      if(this.at(',')){
        this.eat(',');
        this.eat('{');
        while(!this.at('}')){
          const imported = this.eat('ident').text;
          let local = imported;
          if(this.at('as')){
            this.eat('as');
            local = this.eat('ident').text;
          }
          named.push({imported,local});
          if(this.at(',')) this.eat(',');
          else break;
        }
        this.eat('}');
      }
    }

    this.eat('from');
    const src = this.eat('string').text.slice(1,-1);

    return {
      kind: 'ImportDecl',
      source: src,
      default: defaultImport || undefined,
      namespace: namespace || undefined,
      named: named.length > 0 ? named : undefined,
      sideEffect: false
    };
  }

  parseExport(){
    this.eat('export');

    // export default expr
    if(this.at('default')){
      this.eat('default');
      const expr = this.parseAssignment();
      return {kind:'ExportDefault',expr};
    }

    // export * from 'mod' or export * as ns from 'mod'
    if(this.at('*')){
      this.eat('*');
      let asName = null;
      if(this.at('as')){
        this.eat('as');
        asName = this.eat('ident').text;
      }
      this.eat('from');
      const src = this.eat('string').text.slice(1,-1);
      return {kind:'ExportAll',source:src,as:asName||undefined};
    }

    // export { a, b as c } or export { a, b as c } from 'mod'
    if(this.at('{')){
      this.eat('{');
      const specifiers = [];
      while(!this.at('}')){
        const local = this.eat('ident').text;
        let exported = local;
        if(this.at('as')){
          this.eat('as');
          exported = this.eat('ident').text;
        }
        specifiers.push({local,exported});
        if(this.at(',')) this.eat(',');
        else break;
      }
      this.eat('}');

      // Re-export: export { a } from 'mod'
      if(this.at('from')){
        this.eat('from');
        const src = this.eat('string').text.slice(1,-1);
        return {kind:'ExportNamed',specifiers,source:src};
      }

      // Local export: export { a }
      return {kind:'ExportNamed',specifiers};
    }

    // export fn, export class, export const/let
    if(this.at('fn') || this.at('async')){
      const fn=this.parseFn();
      return {kind:'ExportDecl',declaration:fn};
    }
    if(this.at('class')){
      const cls=this.parseClass();
      return {kind:'ExportDecl',declaration:cls};
    }
    if(this.at('const') || this.at('let')){
      const varDecl=this.parseVar();
      return {kind:'ExportDecl',declaration:varDecl};
    }

    throw new Error('export supports default, *, {...}, fn, class, const, or let');
  }

  parseFn(){
    const isAsync = this.at('async');
    if(isAsync) this.eat('async');

    this.eat('fn');
    const name=this.at('ident')?this.eat('ident').text:null;
    this.eat('(');
    const params=[];
    while(!this.at(')')){
      // Rest parameter
      if(this.at('...')){
        this.eat('...');
        const id=this.eat('ident').text;
        params.push({name:id,rest:true});
        break; // Rest must be last
      }

      const id=this.eat('ident').text;
      let defaultValue=null;

      // Default parameter
      if(this.at('=')){
        this.eat('=');
        defaultValue=this.parseAssignment();
      }

      params.push({name:id,default:defaultValue});
      if(this.at(',')) this.eat(','); else break;
    }
    this.eat(')');
    const body=this.parseBlock();
    return {kind:'FnDecl',name,params,body,async:isAsync};
  }

  parseVar(){
    const c=this.eat(this.t.kind).kind==='const';

    // Check for destructuring
    if(this.at('[')){
      // Array destructuring
      this.eat('[');
      const elements=[];
      while(!this.at(']')){
        if(this.at('...')){
          this.eat('...');
          elements.push({kind:'RestElement',name:this.eat('ident').text});
          break;
        }
        elements.push(this.eat('ident').text);
        if(this.at(',')) this.eat(','); else break;
      }
      this.eat(']');
      this.eat('=');
      const init=this.parseExpr();
      return {kind:'VarDecl',constant:c,pattern:{kind:'ArrayPattern',elements},init};
    }

    if(this.at('{')){
      // Object destructuring
      this.eat('{');
      const properties=[];
      while(!this.at('}')){
        const key=this.eat('ident').text;
        let localName=key;
        if(this.at(':')){
          this.eat(':');
          localName=this.eat('ident').text;
        }
        properties.push({key,value:localName});
        if(this.at(',')) this.eat(','); else break;
      }
      this.eat('}');
      this.eat('=');
      const init=this.parseExpr();
      return {kind:'VarDecl',constant:c,pattern:{kind:'ObjectPattern',properties},init};
    }

    // Normal variable
    const name=this.eat('ident').text;
    let init=null;
    if(this.at('=')){ this.eat('='); init=this.parseExpr(); }
    return {kind:'VarDecl',constant:c,name,init};
  }

  parseIf(){
    this.eat('if');
    this.eat('(');
    const test=this.parseExpr();
    this.eat(')');
    const consequent=this.parseBlock();
    let alternate=null;
    if(this.at('else')){
      this.eat('else');
      if(this.at('if')){
        alternate=this.parseIf(); // else if
      } else {
        alternate=this.parseBlock();
      }
    }
    return {kind:'IfStmt',test,consequent,alternate};
  }

  parseFor(){
    this.eat('for');
    this.eat('(');
    const init=this.at('let')||this.at('const')?this.parseVar():{kind:'ExprStmt',expr:this.parseExpr()};

    // Check for for-of loop
    if(this.at('of')){
      this.eat('of');
      const iterable=this.parseExpr();
      this.eat(')');
      const body=this.parseBlock();
      return {kind:'ForOfStmt',variable:init,iterable,body};
    }

    // Check for for-in loop
    if(this.at('in')){
      this.eat('in');
      const object=this.parseExpr();
      this.eat(')');
      const body=this.parseBlock();
      return {kind:'ForInStmt',variable:init,object,body};
    }

    // Regular for loop
    this.eat(';');
    const test=this.parseExpr();
    this.eat(';');
    const update=this.parseExpr();
    this.eat(')');
    const body=this.parseBlock();
    return {kind:'ForStmt',init,test,update,body};
  }

  parseWhile(){
    this.eat('while');
    this.eat('(');
    const test=this.parseExpr();
    this.eat(')');
    const body=this.parseBlock();
    return {kind:'WhileStmt',test,body};
  }

  parseTry(){
    this.eat('try');
    const body=this.parseBlock();
    let handler=null;
    let finalizer=null;
    if(this.at('catch')){
      this.eat('catch');
      this.eat('(');
      const param=this.eat('ident').text;
      this.eat(')');
      const catchBody=this.parseBlock();
      handler={param,body:catchBody};
    }
    if(this.at('finally')){
      this.eat('finally');
      finalizer=this.parseBlock();
    }
    return {kind:'TryStmt',body,handler,finalizer};
  }

  parseSwitch(){
    this.eat('switch');
    this.eat('(');
    const discriminant=this.parseExpr();
    this.eat(')');
    this.eat('{');
    const cases=[];
    while(!this.at('}')){
      if(this.at('case')){
        this.eat('case');
        const test=this.parseExpr();
        this.eat(':');
        const consequent=[];
        while(!this.at('case')&&!this.at('default')&&!this.at('}')){
          consequent.push(this.parseStmt());
        }
        cases.push({test,consequent});
      } else if(this.at('default')){
        this.eat('default');
        this.eat(':');
        const consequent=[];
        while(!this.at('case')&&!this.at('default')&&!this.at('}')){
          consequent.push(this.parseStmt());
        }
        cases.push({test:null,consequent});
      } else {
        throw new Error('expected case or default in switch');
      }
    }
    this.eat('}');
    return {kind:'SwitchStmt',discriminant,cases};
  }

  parseClass(){
    this.eat('class');
    const name=this.eat('ident').text;
    let superClass=null;
    if(this.at('extends')){
      this.eat('extends');
      superClass=this.eat('ident').text;
    }
    this.eat('{');
    const methods=[];
    while(!this.at('}')){
      // Check for async keyword before method name
      const isAsync = this.at('async');
      if(isAsync) this.eat('async');

      const methodName=this.eat('ident').text;
      this.eat('(');
      const params=[];
      while(!this.at(')')){
        params.push({name:this.eat('ident').text});
        if(this.at(',')) this.eat(','); else break;
      }
      this.eat(')');
      const body=this.parseBlock();
      methods.push({name:methodName,params,body,async:isAsync});
    }
    this.eat('}');
    return {kind:'ClassDecl',name,superClass,methods};
  }

  parseContract(){
    this.eat('contract');
    const name=this.eat('ident').text;
    this.eat('{');
    const fields=[];
    while(!this.at('}')){
      const fieldName=this.eat('ident').text;
      this.eat(':');
      const fieldType=this.eat('ident').text;
      fields.push({name:fieldName,type:fieldType});
      if(this.at(',')) this.eat(',');
    }
    this.eat('}');
    return {kind:'ContractDecl',name,fields};
  }

  parseView(){
    this.eat('view');
    const name=this.eat('ident').text;
    this.eat('(');
    const params=[];
    while(!this.at(')')){
      const id=this.eat('ident').text;
      params.push({name:id});
      if(this.at(',')) this.eat(','); else break;
    }
    this.eat(')');
    const body=this.parseBlock();
    return {kind:'ViewDecl',name,params,body};
  }

  parseBlock(){
    this.eat('{');
    const st=[];
    while(!this.at('}')) st.push(this.parseStmt());
    this.eat('}');
    return {kind:'Block',statements:st};
  }

  parseExpr(){ return this.parseAssignment(); }

  parseAssignment(){
    let l=this.parseArrow();
    if(this.at('=')){
      this.eat('=');
      const r=this.parseAssignment(); // Right-associative
      return {kind:'BinaryExpr',op:'=',left:l,right:r};
    }
    if(this.at('+=')||this.at('-=')||this.at('*=')||this.at('/=')||this.at('%=')){
      const op=this.eat(this.t.kind).text;
      const r=this.parseAssignment();
      return {kind:'BinaryExpr',op,left:l,right:r};
    }
    return l;
  }

  parseArrow(){
    // Arrow function parsing with proper backtracking
    // Patterns: x => expr, (x) => expr, () => expr, (a, b) => expr, async x => expr

    // Save checkpoint for potential backtracking
    const startCheckpoint = this.checkpoint();

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
        return {
          kind: 'ArrowFn',
          params: [param],
          body: body,
          async: isAsync
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
        return {
          kind: 'ArrowFn',
          params: params,
          body: body,
          async: isAsync
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

  parseNullish(){
    let l=this.parseTernary();
    while(this.at('??')){
      const op=this.eat('??').text;
      const r=this.parseTernary();
      l={kind:'BinaryExpr',op,left:l,right:r};
    }
    return l;
  }

  parseTernary(){
    let l=this.parseOr();
    if(this.at('?')){
      this.eat('?');
      const consequent=this.parseOr();
      this.eat(':');
      const alternate=this.parseTernary(); // Right-associative
      return {kind:'TernaryExpr',test:l,consequent,alternate};
    }
    return l;
  }

  parseOr(){
    let l=this.parseAnd();
    while(this.at('||')){
      this.eat('||');
      const r=this.parseAnd();
      l={kind:'BinaryExpr',op:'||',left:l,right:r};
    }
    return l;
  }

  parseAnd(){
    let l=this.parseEquality();
    while(this.at('&&')){
      this.eat('&&');
      const r=this.parseEquality();
      l={kind:'BinaryExpr',op:'&&',left:l,right:r};
    }
    return l;
  }

  parseEquality(){
    let l=this.parseComparison();
    while(this.at('==')||this.at('!=')){
      const op=this.t.text;
      this.eat(op);
      const r=this.parseComparison();
      l={kind:'BinaryExpr',op,left:l,right:r};
    }
    return l;
  }

  parseComparison(){
    let l=this.parseAdd();
    while(this.at('<')||this.at('>')||this.at('<=')||this.at('>=')||this.at('instanceof')||this.at('in')){
      const op=this.t.text;
      this.eat(this.t.kind);
      const r=this.parseAdd();
      l={kind:'BinaryExpr',op,left:l,right:r};
    }
    return l;
  }

  parseAdd(){
    let l=this.parseMul();
    while(this.at('+')||this.at('-')){
      const op=this.t.text;
      this.eat(op);
      const r=this.parseMul();
      l={kind:'BinaryExpr',op,left:l,right:r};
    }
    return l;
  }

  parseMul(){
    let l=this.parseUnary();
    while(this.at('*')||this.at('/')||this.at('%')){
      const op=this.t.text;
      this.eat(op);
      const r=this.parseUnary();
      l={kind:'BinaryExpr',op,left:l,right:r};
    }
    return l;
  }

  parseUnary(){
    if(this.at('!')||this.at('-')){
      const op=this.t.text;
      this.eat(op);
      const arg=this.parseUnary();
      return {kind:'UnaryExpr',op,argument:arg};
    }
    if(this.at('++')||this.at('--')){
      const op=this.eat(this.t.kind).text;
      const arg=this.parseUnary();
      return {kind:'UpdateExpr',op,argument:arg,prefix:true};
    }
    if(this.at('typeof')||this.at('delete')||this.at('await')){
      const op=this.eat(this.t.kind).text;
      const arg=this.parseUnary();
      return {kind:'UnaryExpr',op,argument:arg};
    }
    if(this.at('new')){
      this.eat('new');
      const callee=this.parsePrim();
      let args=[];
      if(this.at('(')){
        this.eat('(');
        if(!this.at(')')){
          args.push(this.parseExpr());
          while(this.at(',')){
            this.eat(',');
            if(!this.at(')')) args.push(this.parseExpr());
          }
        }
        this.eat(')');
      }

      // Allow postfix chains after new expression (method calls, property access, etc.)
      let expr = {kind:'NewExpr',callee,args};
      return this.applyPostfixChains(expr);
    }
    return this.parsePostfix();
  }

  // Apply postfix operations (., [], (), etc.) to an expression
  applyPostfixChains(expr){
    while(true){
      if(this.at('?.')){
        this.eat('?.');
        const prop=this.eatPropertyName();
        expr={kind:'OptionalMemberExpr',object:expr,property:prop};
      } else if(this.at('.')){
        this.eat('.');
        const prop=this.eatPropertyName();
        expr={kind:'MemberExpr',object:expr,property:prop};
      } else if(this.at('[')){
        this.eat('[');
        const index=this.parseExpr();
        this.eat(']');
        expr={kind:'IndexExpr',object:expr,index};
      } else if(this.at('(')){
        this.eat('(');
        const args=[];
        if(!this.at(')')){
          args.push(this.parseExpr());
          while(!this.at(')')){
            if(this.at(',')){ this.eat(','); if(this.at(')')) break; args.push(this.parseExpr()); }
            else break;
          }
        }
        this.eat(')');
        expr={kind:'CallExpr',callee:expr,args};
      } else if(this.at('++')||this.at('--')){
        const op=this.eat(this.t.kind).text;
        expr={kind:'UpdateExpr',op,argument:expr,prefix:false};
      } else {
        break;
      }
    }
    return expr;
  }

  parsePostfix(){
    let expr=this.parsePrim();
    return this.applyPostfixChains(expr);
  }

  parsePrim(){
    if(this.at('ident')){
      const id={kind:'Identifier',name:this.eat('ident').text};
      return id;
    }
    if(this.at('number')){
      const n=Number(this.eat('number').text.replaceAll('_',''));
      return {kind:'NumberLiteral',value:n};
    }
    if(this.at('string')){
      const s=this.eat('string').text;
      if(s[0]==='`'){
        // Template string - keep original including backticks
        return {kind:'TemplateLiteral',value:s};
      }
      return {kind:'StringLiteral',value:s.slice(1,-1)};
    }
    if(this.at('true')){ this.eat('true'); return {kind:'BooleanLiteral',value:true}; }
    if(this.at('false')){ this.eat('false'); return {kind:'BooleanLiteral',value:false}; }
    if(this.at('null')){ this.eat('null'); return {kind:'NullLiteral'}; }
    if(this.at('[')){
      this.eat('[');
      const elements=[];
      if(!this.at(']')){
        // Spread or normal element
        if(this.at('...')){
          this.eat('...');
          elements.push({kind:'SpreadElement',argument:this.parseExpr()});
        } else {
          elements.push(this.parseExpr());
        }

        while(this.at(',')){
          this.eat(',');
          if(this.at(']')) break;

          if(this.at('...')){
            this.eat('...');
            elements.push({kind:'SpreadElement',argument:this.parseExpr()});
          } else {
            elements.push(this.parseExpr());
          }
        }
      }
      this.eat(']');
      return {kind:'ArrayExpr',elements};
    }
    if(this.at('{')){
      this.eat('{');
      const properties=[];
      if(!this.at('}')){
        // First property
        if(this.at('...')){
          // Spread property
          this.eat('...');
          properties.push({kind:'SpreadProperty',argument:this.parseExpr()});
        } else if(this.at('[')){
          // Computed property
          this.eat('[');
          const key=this.parseExpr();
          this.eat(']');
          this.eat(':');
          const value=this.parseExpr();
          properties.push({key,value,computed:true});
        } else {
          // Normal or shorthand property
          // Support both ident and string keys ('Content-Type', etc.)
          let key;
          if(this.at('string')){
            key=this.eat('string').text;
          } else {
            key=this.eat('ident').text;
          }
          if(this.at(':')){
            this.eat(':');
            const value=this.parseExpr();
            properties.push({key,value});
          } else {
            // Shorthand: {name} = {name: name}
            properties.push({key,value:{kind:'Identifier',name:key},shorthand:true});
          }
        }

        while(this.at(',')){
          this.eat(',');
          if(this.at('}')) break;

          if(this.at('...')){
            this.eat('...');
            properties.push({kind:'SpreadProperty',argument:this.parseExpr()});
          } else if(this.at('[')){
            this.eat('[');
            const key=this.parseExpr();
            this.eat(']');
            this.eat(':');
            const value=this.parseExpr();
            properties.push({key,value,computed:true});
          } else {
            // Support both ident and string keys
            let key;
            if(this.at('string')){
              key=this.eat('string').text;
            } else {
              key=this.eat('ident').text;
            }
            if(this.at(':')){
              this.eat(':');
              const value=this.parseExpr();
              properties.push({key,value});
            } else {
              properties.push({key,value:{kind:'Identifier',name:key},shorthand:true});
            }
          }
        }
      }
      this.eat('}');
      return {kind:'ObjectExpr',properties};
    }
    if(this.at('fn')){
      return this.parseFn();
    }
    if(this.at('import')){
      // Check if it's dynamic import import() or import.meta
      const next = this.lex.s[this.lex.i];
      if(next === '('){
        // Dynamic import: import(specifier)
        this.eat('import');
        this.eat('(');
        const source=this.parseExpr();
        this.eat(')');
        return {kind:'ImportExpr',source};
      } else {
        // import.meta or other property access
        const id={kind:'Identifier',name:this.eat('import').text};
        return id;
      }
    }
    if(this.at('(')){
      this.eat('(');
      const e=this.parseExpr();
      this.eat(')');
      return e;
    }
    throw new Error('unexpected token: '+(this.t?this.t.kind+' ('+this.t.text+')':'EOF'));
  }
}
