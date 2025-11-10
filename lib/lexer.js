
export class Lexer{
  constructor(src){ this.s=src; this.i=0; }

  // Save current lexer state for backtracking
  saveState(){ return { i: this.i }; }

  // Restore lexer state
  restoreState(state){ this.i = state.i; }

  next(){
    const s=this.s, n=s.length;
    while(this.i<n){
      const c=s[this.i];
      if(/\s/.test(c)){ this.i++; continue; }
      if(c==='/'&&s[this.i+1]=='/'){ this.i+=2; while(this.i<n&&s[this.i]!='\n') this.i++; continue; }
      if(c=='"'||c=='\''){ const q=c; let j=this.i+1; while(j<n){ const ch=s[j]; if(ch=='\\'){ j+=2; continue; } if(ch==q){ const t={kind:'string',text:s.slice(this.i,j+1)}; this.i=j+1; return t;} j++; } throw new Error('unterminated string'); }
      if(c=='`'){ let j=this.i+1; while(j<n){ const ch=s[j]; if(ch=='\\'){ j+=2; continue; } if(ch=='`'){ const t={kind:'string',text:s.slice(this.i,j+1)}; this.i=j+1; return t;} j++; } throw new Error('unterminated template string'); }
      if(/[0-9]/.test(c)){ let j=this.i+1; while(j<n&&/[0-9_.]/.test(s[j])) j++; const t={kind:'number',text:s.slice(this.i,j)}; this.i=j; return t; }
      if(/[A-Za-z_]/.test(c)){ let j=this.i+1; while(j<n&&/[A-Za-z0-9_]/.test(s[j])) j++; const text=s.slice(this.i,j); const kw=new Set(['import','from','as','fn','let','const','return','if','else','for','while','contract','export','view','true','false','null','in','of','try','catch','finally','throw','break','continue','switch','case','default','typeof','instanceof','delete','async','await','class','extends','new']); const k=kw.has(text)?text:'ident'; const t={kind:k,text}; this.i=j; return t; }
      // Multi-char operators (check 3-char first)
      if(c==='.'&&s[this.i+1]==='.'&&s[this.i+2]==='.'){ this.i+=3; return {kind:'...',text:'...'}; }
      // Two-char operators
      if(c==='='&&s[this.i+1]==='='){ this.i+=2; return {kind:'==',text:'=='}; }
      if(c==='!'&&s[this.i+1]==='='){ this.i+=2; return {kind:'!=',text:'!='}; }
      if(c==='<'&&s[this.i+1]==='='){ this.i+=2; return {kind:'<=',text:'<='}; }
      if(c==='>'&&s[this.i+1]==='='){ this.i+=2; return {kind:'>=',text:'>='}; }
      if(c==='&'&&s[this.i+1]==='&'){ this.i+=2; return {kind:'&&',text:'&&'}; }
      if(c==='|'&&s[this.i+1]==='|'){ this.i+=2; return {kind:'||',text:'||'}; }
      if(c==='+'&&s[this.i+1]==='='){ this.i+=2; return {kind:'+=',text:'+='}; }
      if(c==='-'&&s[this.i+1]==='='){ this.i+=2; return {kind:'-=',text:'-='}; }
      if(c==='*'&&s[this.i+1]==='='){ this.i+=2; return {kind:'*=',text:'*='}; }
      if(c==='/'&&s[this.i+1]==='='){ this.i+=2; return {kind:'/=',text:'/='}; }
      if(c==='%'&&s[this.i+1]==='='){ this.i+=2; return {kind:'%=',text:'%='}; }
      if(c==='+'&&s[this.i+1]==='+'){ this.i+=2; return {kind:'++',text:'++'}; }
      if(c==='-'&&s[this.i+1]==='-'){ this.i+=2; return {kind:'--',text:'--'}; }
      if(c==='='&&s[this.i+1]==='>'){ this.i+=2; return {kind:'=>',text:'=>'}; }
      if(c==='?'&&s[this.i+1]==='.'){ this.i+=2; return {kind:'?.',text:'?.'}; }
      if(c==='?'&&s[this.i+1]==='?'){ this.i+=2; return {kind:'??',text:'??'}; }
      // Single char operators
      const single='{}()[]=,:;.+-*/<>!%&|?'.split(''); if(single.includes(c)){ this.i++; return {kind:c,text:c}; }
      throw new Error('unknown char '+c);
    }
    return null;
  }
}
