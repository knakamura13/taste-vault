import { error, redirect } from '@sveltejs/kit';
import { pool, projects, formatId } from '#lib/server/db.js';
import { categories } from '#lib/server/manage.js';
export async function load({url}) {
 const page=Number(url.searchParams.get('page')||'1'); if(!Number.isSafeInteger(page)||page<1||page>100000) error(400,'Invalid page');
 const q=url.searchParams.get('q')||'', project=(url.searchParams.get('project')||'').toLowerCase(), category=(url.searchParams.get('category')||'').toLowerCase(), sort=url.searchParams.get('sort')||'newest';
 const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if((project && project!=='unassigned' && !valid.test(project)) || (category && !valid.test(category))) error(400,'Invalid filter');
 const order=sort==='oldest'?'r.id ASC':sort==='title'?'r.title ASC, r.id DESC':'r.id DESC';
 // Broad searches aggregate sparse related metadata once. Filtered searches
 // can use the reference indexes to fetch metadata for fewer candidates.
 const broadSearch = Boolean(q && !project && !category);
 const metadataJoins = broadSearch ? `
  LEFT JOIN (
   SELECT rc.ref_id,string_agg(c.name,' ' ORDER BY rc.category_id) names
   FROM ref_categories rc JOIN categories c ON c.id=rc.category_id GROUP BY rc.ref_id
  ) category_text ON category_text.ref_id=r.id
  LEFT JOIN (
   SELECT ref_id,string_agg(description,' ' ORDER BY id) descriptions
   FROM screenshots WHERE description_approved_at IS NOT NULL GROUP BY ref_id
  ) description_text ON description_text.ref_id=r.id
 ` : '';
 const categoryText = broadSearch ? 'category_text.names' :
  "(SELECT string_agg(c.name,' ' ORDER BY rc.category_id) FROM ref_categories rc JOIN categories c ON c.id=rc.category_id WHERE rc.ref_id=r.id)";
 const descriptionText = broadSearch ? 'description_text.descriptions' :
  "(SELECT string_agg(s.description,' ' ORDER BY s.id) FROM screenshots s WHERE s.ref_id=r.id AND s.description_approved_at IS NOT NULL)";
 const galleryQuery=`SELECT count(*) OVER()::int total,r.id,r.title,r.source_url,r.created_at,
 (SELECT id FROM screenshots s WHERE s.ref_id=r.id ORDER BY id LIMIT 1) screenshot_id
 FROM refs r ${metadataJoins} WHERE r.trashed_at IS NULL
 AND ($1='' OR strpos(lower(concat_ws(' ',r.title,r.notes,array_to_string(r.tags,' '),r.source_url,${categoryText},${descriptionText})),lower($1))>0)
 AND ($2='' OR ($2='unassigned' AND NOT EXISTS(SELECT 1 FROM ref_projects rp WHERE rp.ref_id=r.id)) OR EXISTS(SELECT 1 FROM ref_projects rp WHERE rp.ref_id=r.id AND rp.project_id=NULLIF(NULLIF($2,''),'unassigned')::uuid))
 AND ($3='' OR EXISTS(SELECT 1 FROM ref_categories rc WHERE rc.ref_id=r.id AND rc.category_id=NULLIF($3,'')::uuid)) ORDER BY ${order} LIMIT 60 OFFSET $4`;
 const rows=await pool.query(galleryQuery,[q,project,category,(page-1)*60]);
 // A stale page can become empty after deletion or a filter change. Find the
 // last available page only on this exceptional path, then retain the filters.
 if (page > 1 && rows.rowCount === 0) {
  const first = await pool.query(galleryQuery,[q,project,category,0]);
  const lastPage = Math.max(1, Math.ceil((first.rows[0]?.total || 0) / 60));
  const params = new URLSearchParams(url.searchParams);
  if (lastPage === 1) params.delete('page'); else params.set('page', String(lastPage));
  const query = params.toString();
  redirect(302, url.pathname + (query ? '?' + query : ''));
 }
 return {refs:rows.rows.map(r=>({...r,reference_id:formatId(r.id)})),total:rows.rows[0]?.total || 0,page,projects:await projects(),categories:await categories(),q,project,category,sort};
}
