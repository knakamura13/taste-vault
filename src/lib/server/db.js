import pg from 'pg';
import { resolve } from 'node:path';
const vaultRoot = resolve(process.env.TASTE_VAULT_ROOT || process.cwd());
try { process.loadEnvFile(resolve(vaultRoot, '.env')); } catch (e) { if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e; }
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://taste:taste@127.0.0.1:5432/taste_vault' });
export const storageRoot = resolve(vaultRoot, process.env.TASTE_STORAGE_DIR || '.taste-vault/images');
/** @param {string | number} id */
export const formatId = (id) => `REF-${String(id).padStart(6, '0')}`;
/** @param {string} id */
export function parseId(id) { const m = /^REF-(\d{6,})$/i.exec(id); return m && Number.isSafeInteger(Number(m[1])) && Number(m[1]) > 0 ? Number(m[1]) : null; }
export async function projects() { return (await pool.query('SELECT * FROM projects ORDER BY name')).rows; }
/** @param {string} q @param {string | null} project @param {string | null} id @param {boolean} all */
export async function search(q = '', project = null, id = null, all = false) {
 const number = id ? parseId(id) : null;
 if (id && !number) return [];
 const result = await pool.query(`SELECT r.*, COALESCE((SELECT json_agg(json_build_object('id',s.id,'key',s.storage_key,'description',s.description)) FROM screenshots s WHERE s.ref_id=r.id),'[]') screenshots,
 COALESCE((SELECT array_agg(p.name) FROM ref_projects rp JOIN projects p ON p.id=rp.project_id WHERE rp.ref_id=r.id),'{}') project_names
 FROM refs r WHERE r.trashed_at IS NULL AND ($3::bigint IS NULL OR r.id=$3)
 AND ($4::boolean OR $3::bigint IS NOT NULL OR (NOT EXISTS (SELECT 1 FROM ref_projects rp WHERE rp.ref_id=r.id) OR EXISTS (SELECT 1 FROM ref_projects rp WHERE rp.ref_id=r.id AND rp.project_id=$2::uuid)))
 AND ($1='' OR strpos(lower(concat_ws(' ',r.title,r.notes,array_to_string(r.tags,' '),r.source_url,(SELECT string_agg(c.name,' ') FROM ref_categories rc JOIN categories c ON c.id=rc.category_id WHERE rc.ref_id=r.id),(SELECT string_agg(s.description,' ') FROM screenshots s WHERE s.ref_id=r.id AND s.description_approved_at IS NOT NULL))),lower($1)) > 0) ORDER BY r.id DESC LIMIT 50`, [q, project, number, all]);
 return result.rows.map(r => ({...r, reference_id: formatId(r.id)}));
}
