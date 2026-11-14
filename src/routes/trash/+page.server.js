import { pool, formatId } from '#lib/server/db.js';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { storageRoot, parseId } from '#lib/server/db.js';
export async function load() { const r=await pool.query('SELECT id,title,trashed_at FROM refs WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC'); return {refs:r.rows.map(x=>({...x,reference_id:formatId(x.id)}))}; }
export const actions={
 restore:async ({request})=>{const id=parseId(String((await request.formData()).get('id')||'')); if(id) await pool.query('UPDATE refs SET trashed_at=NULL,updated_at=now() WHERE id=$1 AND trashed_at IS NOT NULL',[id]);},
 delete:async ({request})=>{const f=await request.formData(),id=parseId(String(f.get('id')||'')); if(!id||f.get('confirm')!=='delete') return; const c=await pool.connect(); let keys=[]; try {await c.query('BEGIN'); const locked=await c.query('SELECT id FROM refs WHERE id=$1 AND trashed_at IS NOT NULL FOR UPDATE',[id]); if(locked.rowCount){keys=(await c.query('SELECT storage_key,id FROM screenshots WHERE ref_id=$1',[id])).rows.flatMap(x=>[x.storage_key,`thumbnails/${x.id}.webp`]);await c.query('DELETE FROM refs WHERE id=$1',[id]);} await c.query('COMMIT');} catch(e){await c.query('ROLLBACK');throw e;} finally{c.release();} await Promise.all(keys.map(key=>unlink(join(storageRoot,key)).catch(e=>{if(e.code!=='ENOENT') console.error('Could not remove deleted screenshot',key,e);})));}
};
