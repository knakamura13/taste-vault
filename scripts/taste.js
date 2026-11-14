#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
process.env.TASTE_VAULT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const { pool, projects, search, storageRoot } = await import('../src/lib/server/db.js');
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
const config = process.env.TASTE_LINKS_FILE || join(homedir(), '.config/taste-vault/repo-links.json');
const root = () => { try { return execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim(); } catch { return process.cwd(); } };
async function links() { try { return JSON.parse(await readFile(config,'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; } }
try {
 const [command='search', ...args] = process.argv.slice(2);
 if (command === 'projects') console.log(JSON.stringify(await projects(), null, 2));
 else if (command === 'link') {
  const id=args[0]; if (!(await projects()).some(p=>p.id===id)) throw Error('Supply an existing project ID from the projects command.');
  const data=await links(); data[root()]=id; await mkdir(dirname(config),{recursive:true}); await writeFile(config, JSON.stringify(data,null,2)+'\n',{mode:0o600}); console.log(`Linked ${root()} to ${id}.`);
 } else if (command === 'search' || command === 'pin') {
  let project=null, q='';
  if (command === 'search') { const i=args.indexOf('--project'); if(i>=0) { if(!args[i+1]) throw Error('--project requires an ID'); project=args[i+1]; args.splice(i,2); } else project=(await links())[root()] || null; q=args.join(' '); if(project && !(await projects()).some(p=>p.id===project)) throw Error('Project not found. Run projects and link again.'); }
  const rows=await search(q,project,command==='pin' ? args[0] : null);
  if(command==='pin' && !args[0]) throw Error('pin requires a reference ID');
  if(command==='pin' && !rows.length) { console.error('Reference missing or in Trash.'); process.exitCode=1; }
  if(command==='search' && !project) console.error('General references only. Link this repository with: taste link <project-id>');
  console.log(JSON.stringify(rows.map(r=>({id:r.reference_id,title:r.title,notes:r.notes,tags:r.tags,projects:r.project_names,sourceUrl:r.source_url,images:r.screenshots.map(s=>({id:s.id,path:join(storageRoot,s.key),description:s.description}))})),null,2));
 } else throw Error('Usage: taste projects | link <project-id> | search [--project <id>] [query] | pin <REF-id>');
} catch(e) { console.error(e.message); process.exitCode=1; } finally { await pool.end(); }
