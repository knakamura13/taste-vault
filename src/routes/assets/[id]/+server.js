import { error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool, storageRoot, isUuid } from '#lib/server/db.js';
export async function GET({params}) { if(!isUuid(params.id)) error(404); const r=await pool.query('SELECT s.storage_key,s.media_type FROM screenshots s JOIN refs r ON r.id=s.ref_id WHERE s.id=$1 AND r.trashed_at IS NULL',[params.id]); if(!r.rowCount) error(404); try { return new Response(await readFile(join(storageRoot,r.rows[0].storage_key)),{headers:{'content-type':r.rows[0].media_type,'x-content-type-options':'nosniff'}}); } catch(e) { if(/** @type {NodeJS.ErrnoException} */ (e).code==='ENOENT') error(404); throw e; } }
