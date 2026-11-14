import { json } from '@sveltejs/kit';
import { pool, parseId, storageRoot } from '#lib/server/db.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export async function GET({params}) { const id=parseId(params.id); if(!id)return json({error:{code:'not_found',message:'Screenshot not found.'}},{status:404});const r=await pool.query('SELECT s.storage_key,s.media_type FROM screenshots s JOIN refs r ON r.id=s.ref_id WHERE r.id=$1 AND r.trashed_at IS NULL AND s.id::text=$2',[id,params.screenshotId]);if(!r.rowCount)return json({error:{code:'not_found',message:'Screenshot not found.'}},{status:404});try{return new Response(await readFile(join(storageRoot,r.rows[0].storage_key)),{headers:{'content-type':r.rows[0].media_type,'x-content-type-options':'nosniff'}});}catch(e){if(/** @type {NodeJS.ErrnoException} */ (e).code==='ENOENT')return json({error:{code:'not_found',message:'Screenshot file missing.'}},{status:404});throw e;}}
