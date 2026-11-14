import { error } from '@sveltejs/kit';
import { pool, projects, formatId } from '#lib/server/db.js';
import { categories } from '#lib/server/manage.js';
export async function load({url}) {
 const page=Number(url.searchParams.get('page')||'1'); if(!Number.isSafeInteger(page)||page<1||page>100000) error(400,'Invalid page');
 const q=url.searchParams.get('q')||'', project=url.searchParams.get('project')||'', category=url.searchParams.get('category')||'', sort=url.searchParams.get('sort')||'newest';
 const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if((project && project!=='unassigned' && !valid.test(project)) || (category && !valid.test(category))) error(400,'Invalid filter');
 const order=sort==='oldest'?'r.id ASC':sort==='title'?'r.title ASC, r.id DESC':'r.id DESC';
 const rows=await pool.query(`SELECT count(*) OVER()::int total,r.id,r.title,r.source_url,r.created_at,(SELECT id FROM screenshots s WHERE s.ref_id=r.id ORDER BY id LIMIT 1) screenshot_id FROM refs r WHERE r.trashed_at IS NULL
 AND ($1='' OR strpos(lower(concat_ws(' ',r.title,r.notes,array_to_string(r.tags,' '),r.source_url,(SELECT string_agg(c.name,' ') FROM ref_categories rc JOIN categories c ON c.id=rc.category_id WHERE rc.ref_id=r.id),(SELECT string_agg(s.description,' ') FROM screenshots s WHERE s.ref_id=r.id AND s.description_approved_at IS NOT NULL))),lower($1))>0)
 AND ($2='' OR ($2='unassigned' AND NOT EXISTS(SELECT 1 FROM ref_projects rp WHERE rp.ref_id=r.id)) OR EXISTS(SELECT 1 FROM ref_projects rp WHERE rp.ref_id=r.id AND rp.project_id::text=$2))
 AND ($3='' OR EXISTS(SELECT 1 FROM ref_categories rc WHERE rc.ref_id=r.id AND rc.category_id::text=$3)) ORDER BY ${order} LIMIT 60 OFFSET $4`,[q,project,category,(page-1)*60]);
 return {refs:rows.rows.map(r=>({...r,reference_id:formatId(r.id)})),total:rows.rows[0]?.total || 0,page,projects:await projects(),categories:await categories(),q,project,category,sort};
}
