import { randomUUID } from 'node:crypto';
import { pool, parseId, formatId } from './db.js';

export async function categories() { return (await pool.query('SELECT * FROM categories ORDER BY name')).rows; }
/** @param {string} referenceId @param {boolean} trashed */
export async function reference(referenceId, trashed=false) {
 const id=parseId(referenceId); if (!id) return null;
 const result=await pool.query(`SELECT r.*, COALESCE((SELECT json_agg(json_build_object('id',s.id,'key',s.storage_key,'filename',s.filename,'description',CASE WHEN s.description_approved_at IS NOT NULL THEN s.description ELSE NULL END,'approvedAt',s.description_approved_at,'sourceKind',s.source_kind,'pageUrl',s.page_url,'capturedAt',s.captured_at,'archiveTimestamp',s.archive_timestamp) ORDER BY s.id) FROM screenshots s WHERE s.ref_id=r.id),'[]') screenshots,
 COALESCE((SELECT array_agg(project_id::text) FROM ref_projects WHERE ref_id=r.id),'{}') project_ids,
 COALESCE((SELECT array_agg(category_id::text) FROM ref_categories WHERE ref_id=r.id),'{}') category_ids,
 (SELECT row_to_json(j) FROM (SELECT id,status,error,updated_at FROM capture_jobs WHERE ref_id=r.id ORDER BY created_at DESC LIMIT 1) j) capture
 FROM refs r WHERE id=$1 AND (r.trashed_at IS NOT NULL)=$2`,[id,trashed]);
 return result.rows[0] ? {...result.rows[0],reference_id:formatId(id)} : null;
}
/** @param {string} kind @param {string} name */
export async function createNamed(kind,name) {
 if(!['projects','categories'].includes(kind)) throw Error('Invalid kind');
 const id=randomUUID(); await pool.query(`INSERT INTO ${kind} (id,name) VALUES ($1,$2)`,[id,name]); return id;
}
/** @param {string} kind @param {string} id @param {string} name */
export async function renameNamed(kind,id,name) {
 if(!['projects','categories'].includes(kind)) throw Error('Invalid kind');
 return pool.query(`UPDATE ${kind} SET name=$1 WHERE id::text=$2`,[name,id]);
}
/** @param {string} id @param {{title:string,notes:string,tags:string[],sourceUrl:string|null,projectIds:string[],categoryIds:string[]}} values */
export async function updateReference(id,values) {
 const n=parseId(id); if(!n) return false; const client=await pool.connect();
 try { await client.query('BEGIN');
  const updated=await client.query('UPDATE refs SET title=$2, notes=$3, tags=$4, source_url=$5, updated_at=now() WHERE id=$1 AND trashed_at IS NULL RETURNING id',[n,values.title,values.notes,values.tags,values.sourceUrl]);
  if(!updated.rowCount) {await client.query('ROLLBACK');return false;}
  for (const [table,column,ids] of [['ref_projects','project_id',values.projectIds],['ref_categories','category_id',values.categoryIds]]) {
   await client.query(`DELETE FROM ${table} WHERE ref_id=$1`,[n]);
   for(const item of /** @type {string[]} */ (ids)) await client.query(`INSERT INTO ${table} (ref_id,${column}) VALUES ($1,$2)`,[n,item]);
  }
  await client.query('COMMIT'); return true;
 } catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
