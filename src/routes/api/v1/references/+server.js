import { json } from '@sveltejs/kit';
import { pool, formatId } from '#lib/server/db.js';
export async function GET({url}) {
 const q=url.searchParams.get('q')||'', project=url.searchParams.get('project')||'', rawLimit=url.searchParams.get('limit')||'25', cursor=url.searchParams.get('cursor')||'';
 if(q.length>500 || !/^\d+$/.test(rawLimit) || Number(rawLimit)<1 || Number(rawLimit)>100 || (cursor && (!/^\d{1,18}$/.test(cursor) || BigInt(cursor)>9223372036854775807n)) || (project && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(project))) return json({error:{code:'invalid_query',message:'Invalid query, project, limit, or cursor.'}},{status:400});
 if(project && !(await pool.query('SELECT 1 FROM projects WHERE id::text=$1',[project])).rowCount) return json({error:{code:'invalid_project',message:'Project not found.'}},{status:400});
 const limit=Number(rawLimit); const r=await pool.query(`SELECT r.id,r.title,r.notes,r.source_url,(SELECT count(*)::int FROM screenshots s WHERE s.ref_id=r.id) image_count FROM refs r WHERE r.trashed_at IS NULL AND ($3='' OR r.id<NULLIF($3,'')::bigint)
 AND (NOT EXISTS(SELECT 1 FROM ref_projects p WHERE p.ref_id=r.id) OR EXISTS(SELECT 1 FROM ref_projects p WHERE p.ref_id=r.id AND p.project_id::text=$2))
 AND ($1='' OR strpos(lower(concat_ws(' ',r.title,r.notes,array_to_string(r.tags,' '),(SELECT string_agg(c.name,' ') FROM ref_categories rc JOIN categories c ON c.id=rc.category_id WHERE rc.ref_id=r.id),(SELECT string_agg(s.description,' ') FROM screenshots s WHERE s.ref_id=r.id AND s.description_approved_at IS NOT NULL))),lower($1))>0) ORDER BY r.id DESC LIMIT $4`,[q,project,cursor,limit+1]);
 const more=r.rows.length>limit, rows=r.rows.slice(0,limit); return json({references:rows.map(x=>({id:formatId(x.id),title:x.title,excerpt:x.notes.slice(0,240),sourceUrl:x.source_url,imageCount:x.image_count})),nextCursor:more ? String(rows.at(-1).id):null});
}
