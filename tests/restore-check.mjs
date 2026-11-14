import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';

const { DATABASE_URL, RESTORED_DATABASE_URL, TASTE_STORAGE_DIR, RESTORED_STORAGE_DIR } = process.env;
assert.ok(DATABASE_URL && RESTORED_DATABASE_URL && TASTE_STORAGE_DIR && RESTORED_STORAGE_DIR,
 'Supply the source and isolated restored databases and image directories.');
const sourceUrl = new URL(DATABASE_URL);
const restoredUrl = new URL(RESTORED_DATABASE_URL);
assert.match(restoredUrl.pathname, /^\/taste_[a-z0-9_]*restor[a-z0-9_]*$/i,
 'Use a disposable restore database with a name containing restore.');
assert.notEqual(sourceUrl.host + sourceUrl.pathname, restoredUrl.host + restoredUrl.pathname);
const source = new pg.Pool({ connectionString: DATABASE_URL });
const restored = new pg.Pool({ connectionString: RESTORED_DATABASE_URL });

try {
 const counts = {};
 for (const [table, orderBy] of [
  ['refs','id'], ['projects','id'], ['categories','id'],
  ['ref_projects','ref_id, project_id'], ['ref_categories','ref_id, category_id'],
  ['screenshots','id'], ['capture_jobs','id'], ['intake_receipts','id'],
  ['schema_migrations','name']
 ]) {
  const query = `SELECT * FROM ${table} ORDER BY ${orderBy}`;
  const [before, after] = await Promise.all([source.query(query), restored.query(query)]);
  assert.deepEqual(after.rows, before.rows, table + ' rows differ');
  counts[table] = after.rowCount;
 }
 const files = (await restored.query('SELECT storage_key FROM screenshots ORDER BY storage_key')).rows;
 assert.ok(files.length > 0);
 for (const { storage_key } of files) {
  const hash = async directory => createHash('sha256').update(await readFile(join(directory, storage_key))).digest('hex');
  const [before, after] = await Promise.all([hash(TASTE_STORAGE_DIR), hash(RESTORED_STORAGE_DIR)]);
  assert.equal(after, before, storage_key + ' bytes differ');
 }
 const sequence = 'SELECT last_value, is_called FROM reference_number';
 const [before, after] = await Promise.all([source.query(sequence), restored.query(sequence)]);
 assert.deepEqual(after.rows, before.rows);
 const { last_value, is_called } = after.rows[0];
 const expected = BigInt(last_value) + (is_called ? 1n : 0n);
 const next = (await restored.query("SELECT nextval('reference_number') AS n")).rows[0].n;
 assert.equal(BigInt(next), expected);
 console.log(JSON.stringify({ counts, matchingImageHashes: files.length, nextReferenceNumber: next }, null, 2));
} finally {
 await Promise.all([source.end(), restored.end()]);
}
