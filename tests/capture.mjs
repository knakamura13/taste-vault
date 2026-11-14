// Requires a disposable migrated database and external network access.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { createPublicProxy, isPublicAddress } from '../scripts/public-proxy.js';
import net from 'node:net';
import http from 'node:http';
import { chromium } from 'playwright-core';
for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1']) assert.equal(isPublicAddress(address),false);
assert.equal(isPublicAddress('8.8.8.8'),true);
const proxy=await createPublicProxy();
const denied=await new Promise((resolve,reject)=>{const socket=net.connect(proxy.port,'127.0.0.1',()=>socket.write('CONNECT 127.0.0.1:80 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n'));let result='';socket.on('data',data=>result+=data);socket.on('end',()=>resolve(result));socket.on('error',reject);});
assert.match(denied,/403 Forbidden/);
let reached=false; const local=http.createServer((req,res)=>{reached=true;res.end('private');}); await new Promise(resolve=>local.listen(0,'127.0.0.1',resolve));
const chrome=process.env.CHROME_PATH || (process.platform==='darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium');
const browser=await chromium.launch({executablePath:chrome,headless:true,proxy:{server:`http://127.0.0.1:${proxy.port}`,bypass:'<-loopback>'},args:['--disable-quic','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
try {const page=await browser.newPage(); await page.goto(`http://127.0.0.1:${local.address().port}`,{timeout:5000}).catch(()=>{});assert.equal(reached,false,'Browser bypassed proxy to reach a local server');} finally {await browser.close();await new Promise(resolve=>local.close(resolve));await new Promise(resolve=>proxy.server.close(resolve));}
if(!process.env.DATABASE_URL || !process.env.TASTE_STORAGE_DIR) throw Error('Provide disposable database and storage paths');
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sourceUrl = 'https://example.com/';
const pending = randomUUID();
const interrupted = randomUUID();
const trashRef = (await db.query("INSERT INTO refs(title, source_url, trashed_at) VALUES ('Paused capture', $1, now()) RETURNING id", [sourceUrl])).rows[0].id;
const activeRef = (await db.query("INSERT INTO refs(title, source_url) VALUES ('Capture test', $1) RETURNING id", [sourceUrl])).rows[0].id;
await db.query("INSERT INTO capture_jobs(id, ref_id, source_url) VALUES ($1, $2, $3)", [pending, trashRef, sourceUrl]);
await db.query("INSERT INTO capture_jobs(id, ref_id, source_url, status, lease) VALUES ($1, $2, $3, 'running', $4)", [interrupted, activeRef, sourceUrl, randomUUID()]);
const worker = spawn(process.execPath, ['scripts/capture-worker.js'], { env: process.env, stdio: 'inherit' });

async function checkCapture(id, ref) {
 for (let attempt = 0; attempt < 90; attempt++) {
  const job = (await db.query('SELECT status, error FROM capture_jobs WHERE id=$1', [id])).rows[0];
  if (job.status === 'failed') assert.fail(job.error);
  if (job.status === 'succeeded') {
   const image = (await db.query('SELECT * FROM screenshots WHERE ref_id=$1', [ref])).rows[0];
   assert.equal(image.source_kind, 'live');
   await access(join(process.env.TASTE_STORAGE_DIR, image.storage_key));
   return;
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
 }
 assert.fail('Capture did not finish within 90 seconds');
}

try {
 await checkCapture(interrupted, activeRef);
 const paused = (await db.query('SELECT status, lease FROM capture_jobs WHERE id=$1', [pending])).rows[0];
 assert.deepEqual(paused, { status: 'queued', lease: null });
 await db.query('UPDATE refs SET trashed_at=NULL WHERE id=$1', [trashRef]);
 await checkCapture(pending, trashRef);
 console.log('Interrupted-job recovery, trash/restore queue handling, public capture and private-address proxy checks passed.');
} finally {
 worker.kill('SIGTERM');
 await db.end();
}
