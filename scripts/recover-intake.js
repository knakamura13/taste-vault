// Only batch-intake files use this prefix and participate in this lock protocol.
import { readdir, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pool, storageRoot } from '../src/lib/server/db.js';
const client = await pool.connect();
try {
 await client.query('BEGIN');
 // Active batches hold the shared transaction lock until their database commit.
 await client.query('SELECT pg_advisory_xact_lock(1946276103)');
 await mkdir(storageRoot, { recursive: true });
 let files;
 try { files = await readdir(storageRoot); }
 catch (error) { if (error.code !== 'ENOENT') throw error; files = []; }
 const candidates = files.filter(name => /^intake-[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name));
 const saved = new Set((await client.query('SELECT storage_key FROM screenshots WHERE storage_key = ANY($1::text[])', [candidates])).rows.map(row => row.storage_key));
 let removed = 0;
 for (const name of candidates) {
  if (saved.has(name)) continue;
  await unlink(join(storageRoot, name));
  removed++;
 }
 await client.query('COMMIT');
 if (removed) console.log(`Recovered ${removed} interrupted intake file(s).`);
} catch (error) {
 await client.query('ROLLBACK');
 throw error;
} finally { client.release(); await pool.end(); }
