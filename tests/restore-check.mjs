import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
const {DATABASE_URL,RESTORED_DATABASE_URL,TASTE_STORAGE_DIR,RESTORED_STORAGE_DIR}=process.env;
if(!DATABASE_URL||!RESTORED_DATABASE_URL||!TASTE_STORAGE_DIR||!RESTORED_STORAGE_DIR)throw Error('Supply both disposable databases and image directories');
const source=new pg.Pool({connectionString:DATABASE_URL}),restored=new pg.Pool({connectionString:RESTORED_DATABASE_URL});
try {const query='SELECT id,title,source_url,trashed_at FROM refs ORDER BY id';assert.deepEqual((await restored.query(query)).rows,(await source.query(query)).rows);
 const files=(await restored.query('SELECT storage_key FROM screenshots ORDER BY storage_key')).rows;assert.ok(files.length>0);
 for(const {storage_key} of files){const hash=async dir=>createHash('sha256').update(await readFile(join(dir,storage_key))).digest('hex');assert.equal(await hash(TASTE_STORAGE_DIR),await hash(RESTORED_STORAGE_DIR));}
 const before=(await source.query('SELECT last_value,is_called FROM reference_number')).rows[0],after=(await restored.query('SELECT last_value,is_called FROM reference_number')).rows[0];assert.deepEqual(after,before);const next=(await restored.query("SELECT nextval('reference_number') AS n")).rows[0].n;assert.ok(BigInt(next)>=(BigInt(after.last_value)+(after.is_called?1n:0n)));console.log(`Restore passed: ${files.length} matching screenshots and sequence state.`);
} finally {await source.end();await restored.end();}
