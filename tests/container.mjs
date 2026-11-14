// Uses an explicitly named empty test database and creates/removes its own container and volume.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import sharp from 'sharp';
const { DATABASE_URL } = process.env;
assert.match(new URL(DATABASE_URL).pathname, /^\/taste_container_test[a-z0-9_]*$/);
const db = new pg.Pool({ connectionString: DATABASE_URL });
const name = 'taste-container-test-' + randomUUID();
const volume = name + '-images';
const base = 'http://127.0.0.1:39379';
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const web = 'Basic ' + Buffer.from('taste:local-test-web').toString('base64');
const containerDb = new URL(DATABASE_URL); containerDb.hostname = 'host.docker.internal';
async function ready() { for (let i=0;i<200;i++) { try { if ((await fetch(base+'/healthz')).status === 200) return; } catch {} await new Promise(r=>setTimeout(r,100)); } throw Error('Container readiness failed: '+docker('logs',name)); }
try {
 assert.equal((await db.query("SELECT 1 FROM information_schema.tables WHERE table_name='refs' AND table_schema='public'")).rowCount, 0);
 docker('volume', 'create', volume);
 docker('run', '-d', '--name', name, '-p', '127.0.0.1:39379:3000', '-v', volume+':/data',
  '-e', 'DATABASE_URL='+containerDb.href, '-e', 'ORIGIN='+base,
  '-e', 'TASTE_WEB_PASSWORD=local-test-web', '-e', 'TASTE_API_READ_TOKEN=local-test-read', '-e', 'TASTE_API_WRITE_TOKEN=local-test-write', 'taste-vault:local-trial');
 await ready();
 assert.equal((await fetch(base)).status,401);
 assert.equal((await fetch(base, {headers:{authorization:web}})).status,200);
 assert.equal((await fetch(base+'/api/v1/references')).status,401);
 const png = await sharp({create:{width:20,height:20,channels:3,background:'#abcdef'}}).png().toBuffer();
 const form = new FormData(); form.append('screenshots',new Blob([png]),'container.png');
 const saved = await fetch(base+'/references/new',{method:'POST',headers:{origin:base,authorization:web,accept:'text/html'},body:form,redirect:'manual'});
 assert.equal(saved.status,303);
 const image = (await db.query('SELECT id FROM screenshots LIMIT 1')).rows[0].id;
 assert.equal((await fetch(base+'/assets/'+image)).status,401);
 assert.deepEqual(Buffer.from(await (await fetch(base+'/assets/'+image,{headers:{authorization:web}})).arrayBuffer()),png);
 const urls = new URLSearchParams({urls:'https://example.com/'});
 assert.equal((await fetch(base+'/references/new',{method:'POST',headers:{origin:base,authorization:web,accept:'text/html'},body:urls,redirect:'manual'})).status,303);
 let job;
 for(let i=0;i<90;i++) { job=(await db.query('SELECT status,error FROM capture_jobs LIMIT 1')).rows[0]; if(['succeeded','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,1000)); }
 assert.equal(job.status,'succeeded',JSON.stringify(job));
 docker('restart','--time','30',name); await ready();
 assert.deepEqual(Buffer.from(await (await fetch(base+'/assets/'+image,{headers:{authorization:web}})).arrayBuffer()),png);
 const read = await fetch(base+'/api/v1/references',{headers:{authorization:'Bearer local-test-read'}});assert.equal(read.status,200);
 const writePath=base+'/api/v1/references/REF-000001/screenshots/'+image+'/description';
 assert.equal((await fetch(writePath,{method:'PUT',headers:{authorization:'Bearer local-test-read','content-type':'application/json'},body:JSON.stringify({description:'test',approved:true})})).status,401);
 assert.equal((await fetch(writePath,{method:'PUT',headers:{authorization:'Bearer local-test-write','content-type':'application/json'},body:JSON.stringify({description:'test',approved:true})})).status,200);
 // Unexpected worker exit must stop the web process too, allowing platform restart.
 docker('exec',name,'node','--input-type=module','-e',"import fs from 'node:fs'; for(const p of fs.readdirSync('/proc').filter(p=>/^\\d+$/.test(p))) {try {if(fs.readFileSync('/proc/'+p+'/cmdline','utf8').split('\\0')[1]==='scripts/capture-worker.js')process.kill(Number(p),'SIGKILL');}catch{}}");
 for(let i=0;i<100;i++){if(docker('inspect','-f','{{.State.Running}}',name)==='false')break;await new Promise(r=>setTimeout(r,100));}
 assert.equal(docker('inspect','-f','{{.State.ExitCode}}',name),'1');
 console.log('Container migrations, readiness, auth, upload, Chromium capture, volume restart, API permissions, and worker failure propagation passed.');
} finally {
 try { docker('rm','-f',name); } catch {}
 try { docker('volume','rm',volume); } catch {}
 await db.end();
}
