import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
const { DATABASE_URL, TASTE_STORAGE_DIR } = process.env;
assert.match(new URL(DATABASE_URL).pathname, /^\/taste_interrupt_test_[a-z0-9]+$/);
assert.ok(TASTE_STORAGE_DIR);
await mkdir(TASTE_STORAGE_DIR, { recursive: true });
assert.deepEqual(await readdir(TASTE_STORAGE_DIR), []);
const db = new pg.Pool({ connectionString: DATABASE_URL });
const base = 'http://127.0.0.1:39378';
let server;
async function start() {
 server = spawn(process.execPath, ['scripts/start.js'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '39378', ORIGIN: base }, stdio: ['ignore', 'ignore', 'inherit'] });
 for (let i = 0; i < 100; i++) { try { if ((await fetch(base)).ok) return; } catch {} await new Promise(r => setTimeout(r, 100)); }
 throw Error('Server failed to start');
}
async function stop(signal = 'SIGTERM') { if (server && server.exitCode === null && server.signalCode === null) { const closed = once(server, 'close'); server.kill(signal); await closed; } }
const png = await sharp({ create: { width: 50, height: 50, channels: 3, background: '#112233' } }).png().toBuffer();
const upload = async () => { const form = new FormData(); form.append('screenshots', new Blob([png]), 'restart.png'); return fetch(base+'/references/new', { method: 'POST', headers: { origin: base, accept: 'text/html' }, body: form, redirect: 'manual' }); };
try {
 assert.equal((await db.query('SELECT 1 FROM refs')).rowCount, 0);
 await start();
 // Drop the connection before the multipart body completes.
 const req = http.request(base+'/references/new', { method: 'POST', headers: { origin: base, 'content-type': 'multipart/form-data; boundary=test', 'content-length': 100000 } });
 req.on('error', () => {});
 req.write('--test\r\nContent-Disposition: form-data; name="screenshots"; filename="partial.png"\r\nContent-Type: image/png\r\n\r\n');
 await new Promise(r => setTimeout(r, 100)); req.destroy();
 await stop('SIGKILL'); await start();
 assert.equal((await db.query('SELECT 1 FROM refs')).rowCount, 0);
 assert.deepEqual(await readdir(TASTE_STORAGE_DIR), []);
 // Deterministically pause after the file is written but before the row commits.
 await db.query("CREATE FUNCTION test_pause_intake() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(30); RETURN NEW; END $$");
 await db.query('CREATE TRIGGER test_pause BEFORE INSERT ON screenshots FOR EACH ROW EXECUTE FUNCTION test_pause_intake()');
 const pending = upload().catch(() => null);
 let found = false;
 for (let i=0;i<100;i++) { if ((await readdir(TASTE_STORAGE_DIR)).length) { found = true; break; } await new Promise(r=>setTimeout(r,100)); }
 assert.ok(found, 'Upload must reach the file-write boundary');
 await stop('SIGKILL'); await pending;
 // Terminate only the test transaction still executing the artificial sleep.
 await db.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND query LIKE 'INSERT INTO screenshots%' AND state='active'");
 await db.query('DROP TRIGGER test_pause ON screenshots');
 await db.query('DROP FUNCTION test_pause_intake()');
 assert.equal((await db.query('SELECT 1 FROM refs')).rowCount, 0);
 await start();
 assert.deepEqual(await readdir(TASTE_STORAGE_DIR), [], 'Restart removes rolled-back image files');
 assert.equal((await upload()).status, 303);
 const saved = (await db.query('SELECT storage_key FROM screenshots')).rows[0];
 await stop('SIGKILL'); await start();
 assert.deepEqual(await readFile(join(TASTE_STORAGE_DIR, saved.storage_key)), png);
 assert.equal((await upload()).status, 409, 'Retry after a committed response was lost must warn about duplicates');
 const lock = await db.connect();
 let recovery;
 try {
  await lock.query('BEGIN');
  await lock.query('SELECT pg_advisory_xact_lock_shared(1946276103)');
  await writeFile(join(TASTE_STORAGE_DIR, 'unrelated.txt'), 'preserve');
  recovery = spawn(process.execPath, ['scripts/recover-intake.js'], { env: process.env, stdio: 'ignore' });
  const finished = once(recovery, 'close');
  let waiting = false;
  for (let i = 0; i < 100; i++) {
   const result = await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND query='SELECT pg_advisory_xact_lock(1946276103)' AND wait_event_type='Lock'");
   if (result.rowCount) { waiting = true; break; }
   await new Promise(r => setTimeout(r, 50));
  }
  assert.ok(waiting, 'Cleanup must wait for an active intake transaction');
  await lock.query('COMMIT');
  assert.equal((await finished)[0], 0);
  assert.deepEqual(await readFile(join(TASTE_STORAGE_DIR, saved.storage_key)), png);
  assert.equal(await readFile(join(TASTE_STORAGE_DIR, 'unrelated.txt'), 'utf8'), 'preserve');
 } finally { await lock.query('ROLLBACK'); lock.release(); recovery?.kill(); }
 console.log('Interrupted multipart, mid-transaction kill cleanup, committed restart preservation, duplicate retry, cleanup locking, and unrelated-file preservation passed.');
} finally {
 await stop();
 await db.query('DROP TRIGGER IF EXISTS test_pause ON screenshots').catch(()=>{});
 await db.query('DROP FUNCTION IF EXISTS test_pause_intake()').catch(()=>{});
 await db.end();
}
