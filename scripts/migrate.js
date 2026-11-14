import { readdir, readFile } from 'node:fs/promises';
import { pool } from '../src/lib/server/db.js';
const client = await pool.connect();
try {
 await client.query('SELECT pg_advisory_lock(1946276101)');
 await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
 const directory = new URL('../migrations/', import.meta.url);
 const files = (await readdir(directory)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
 for (const file of files) {
  if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1',[file])).rowCount) continue;
  await client.query('BEGIN');
  try { await client.query(await readFile(new URL(file,directory),'utf8')); await client.query('INSERT INTO schema_migrations(name) VALUES ($1)',[file]); await client.query('COMMIT'); console.log(`Applied ${file}`); }
  catch (error) { await client.query('ROLLBACK'); throw error; }
 }
 console.log('Database schema ready.');
} finally { await client.query('SELECT pg_advisory_unlock(1946276101)'); client.release(); await pool.end(); }
