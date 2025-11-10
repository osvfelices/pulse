
import fs from 'node:fs'; import path from 'node:path';
function parseEnv(t){const o={}; for(const l of t.split(/\r?\n/)){ const m=l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/); if(!m) continue; let v=m[2]; if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1); o[m[1]]=v;} return o;}
function load(){const cwd=process.cwd(), base=path.join(cwd,'.env'), local=path.join(cwd,'.env.local'); const env={}; if(fs.existsSync(base)) Object.assign(env, parseEnv(fs.readFileSync(base,'utf8'))); if(fs.existsSync(local)) Object.assign(env, parseEnv(fs.readFileSync(local,'utf8'))); return env;}
const cache=load();
export default { get(k){ return process.env[k] ?? cache[k]; }, all(){ return { ...cache, ...process.env }; } }
