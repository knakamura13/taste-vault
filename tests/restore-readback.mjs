// Run only on the isolated restored vault, after restore-check.mjs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const { DATABASE_URL, TASTE_STORAGE_DIR } = process.env;
assert.match(new URL(DATABASE_URL).pathname, /^\/taste_[a-z0-9_]*restor[a-z0-9_]*$/i);
assert.ok(TASTE_STORAGE_DIR);
const db = new pg.Pool({ connectionString: DATABASE_URL });
const base = 'http://127.0.0.1:39384';
const env = { ...process.env, HOST: '127.0.0.1', PORT: '39384', ORIGIN: base };

async function readback(images) {
 const server = spawn(process.execPath, ['scripts/start.js'], { env, stdio: ['ignore','ignore','inherit'] });
 const closed = once(server,'close');
 try {
  for(let i=0;i<100;i++){
   if(await fetch(base+'/healthz').then(r=>r.ok).catch(()=>false)) break;
   assert.ok(i<99,'Restored server did not become ready');
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  for(const image of images){
   const refId='REF-'+String(image.ref_id).padStart(6,'0');
   const response=await fetch(base+'/api/v1/references/'+refId);
   assert.equal(response.status,200);
   const ref=await response.json();
   assert.equal(ref.id,refId);
   const original=ref.screenshots.find(s=>s.id===image.id);
   assert.ok(original,'Restored reference lost its screenshot');
   const file=await fetch(base+original.url);
   assert.equal(file.status,200);
   assert.equal(createHash('sha256').update(Buffer.from(await file.arrayBuffer())).digest('hex'),image.hash);
   assert.equal((await fetch(base+'/assets/'+image.id+'/thumbnail')).status,200);
  }
 } finally {
  server.kill();
  await closed;
 }
}

try {
 const {rows:images}=await db.query(`
  SELECT DISTINCT ON (s.source_kind) s.id, s.ref_id, s.storage_key, s.source_kind
  FROM screenshots s JOIN refs r ON r.id=s.ref_id
  WHERE r.trashed_at IS NULL ORDER BY s.source_kind, s.ref_id DESC
 `);
 assert.ok(images.length>0);
 for(const image of images){
  image.hash=createHash('sha256').update(await readFile(join(TASTE_STORAGE_DIR,image.storage_key))).digest('hex');
 }
 await readback(images);
 await readback(images);
 console.log(JSON.stringify({ imageKinds:images.map(image=>image.source_kind), samplesPerStart:images.length, appStarts:2, verified:['reference IDs','original image hashes','thumbnail delivery'] }));
} finally {
 await db.end();
}
