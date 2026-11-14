import { fail } from '@sveltejs/kit';
import { pool, projects } from '#lib/server/db.js';
import { createNamed, renameNamed } from '#lib/server/manage.js';
export async function load() { return { projects: await projects() }; }
export const actions = {
 create: async ({request}) => { const name=String((await request.formData()).get('name') || '').trim(); if(!name || name.length>120) return fail(400,{error:'Enter a project name (up to 120 characters).'}); try { await createNamed('projects',name); } catch(e) { if(/** @type {NodeJS.ErrnoException} */ (e).code==='23505') return fail(400,{error:'That project already exists.'}); throw e; } },
 rename: async ({request}) => { const f=await request.formData(), name=String(f.get('name')||'').trim(), id=String(f.get('id')||''); if(!name || name.length>120) return fail(400,{error:'Enter a valid name.'}); try { await renameNamed('projects',id,name); } catch(e) { if(/** @type {NodeJS.ErrnoException} */ (e).code==='23505') return fail(400,{error:'That name is already in use.'}); throw e; } },
 archive: async ({request}) => { const f=await request.formData(); await pool.query('UPDATE projects SET archived_at=CASE WHEN archived_at IS NULL THEN now() ELSE NULL END WHERE id::text=$1',[String(f.get('id')||'')]); }
};
