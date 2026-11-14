import sharp from 'sharp';
import { fail, redirect } from '@sveltejs/kit';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { pool, projects, storageRoot } from '#lib/server/db.js';
import { categories } from '#lib/server/manage.js';
import { validateIntakeUrl } from '../../../../scripts/public-proxy.js';
export async function load() { return {projects: await projects(),categories:await categories()}; }
export const actions = { default: async ({request}) => {
 const data=await request.formData(); const files=/** @type {File[]} */ (data.getAll('screenshots').filter(f=>f instanceof File && f.size > 0)); const project=String(data.get('project') || ''); const title=String(data.get('title') || '').trim(); const notes=String(data.get('notes') || '').trim(); const tags=String(data.get('tags') || '').split(',').map(x=>x.trim()).filter(Boolean); const sourceUrl=String(data.get('sourceUrl') || '').trim(); const grouped=data.has('group'); const categoryIds=data.getAll('categories').map(String); const urls=String(data.get('urls')||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean); if(!files.length && sourceUrl) urls.unshift(sourceUrl);
 if(urls.length>20 || (!files.length && !urls.length) || files.length>20 || files.some(f=>f.size>10*1024*1024)) return fail(400,{error:'Enter up to 20 URLs or choose up to 20 images, each no larger than 10 MB.',duplicates:[]});
 try { for(const url of urls) validateIntakeUrl(url); if(sourceUrl && files.length && !['http:','https:'].includes(new URL(sourceUrl).protocol)) throw Error(); } catch { return fail(400,{error:'Enter valid HTTP(S) URLs for capture.',duplicates:[]}); }
 /** @param {string} prefix @param {number} index @param {string} defaultSource */
 const settings=(prefix,index,defaultSource)=>{const k=`${prefix}_${index}`, itemTitle=String(data.get(`${k}_title`)||'').trim()||title; const p=String(data.get(`${k}_project`)??'default'); const itemProject=p==='default'?project:p; const mode=String(data.get(`${k}_category_mode`)||'default'); const itemCategories=mode==='default'?categoryIds:mode==='none'?[]:data.getAll(`${k}_categories`).map(String); const sourceMode=String(data.get(`${k}_source_mode`)||'default'); const itemSource=sourceMode==='default'?defaultSource:sourceMode==='none'?'':String(data.get(`${k}_source`)||'').trim(); return {title:itemTitle,project:itemProject,categories:itemCategories,source:itemSource};};
 const imageSettings=files.map((_,i)=>grouped?{title,project,categories:categoryIds,source:sourceUrl}:settings('image',i,sourceUrl)); const groups=files.map((_,i)=>grouped?'__all__':String(data.get(`image_${i}_group`)||'').trim());
 const seenGroups=new Map(); for(let i=0;i<groups.length;i++){const key=groups[i];if(key.length>80)return fail(400,{error:'Group labels must be at most 80 characters.',duplicates:[]});if(key){const signature=JSON.stringify(imageSettings[i]);if(seenGroups.has(key)&&seenGroups.get(key)!==signature)return fail(400,{error:'Screenshots in the same group must have the same title, assignments and source.',duplicates:[]});seenGroups.set(key,signature);}}
 const urlSettings=urls.map((url,i)=>settings('url',i,url));
 try {for(const item of [...imageSettings,...urlSettings]) {if(item.title.length>200)throw Error();if(item.source && !['http:','https:'].includes(new URL(item.source).protocol))throw Error();}}catch{return fail(400,{error:'Check item titles and source URLs.',duplicates:[]});}
 if(title.length>200 || notes.length>10000 || tags.length>50 || tags.some(t=>t.length>80)) return fail(400,{error:'Title or notes are too long.',duplicates:[]});
 const prepared=[];
 for (const file of files) { const bytes=Buffer.from(await file.arrayBuffer()); let type, ext; if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {type='image/png';ext='.png';} else if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255) {type='image/jpeg';ext='.jpg';} else if(bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP') {type='image/webp';ext='.webp';} else return fail(400,{error:'Only PNG, JPEG, and WebP images are supported.',duplicates:[]}); try { await sharp(bytes,{limitInputPixels:100000000}).resize(1,1).toBuffer(); } catch { return fail(400,{error:'An image is invalid or too large to decode.',duplicates:[]}); } prepared.push({file,bytes,type,ext,hash:createHash('sha256').update(bytes).digest('hex')}); }
 const referenceUrls = [...urls];
 for (const [index, item] of imageSettings.entries()) {
  const group = groups[index];
  if (item.source && (!group || groups.indexOf(group) === index)) referenceUrls.push(item.source);
 }
 const hashes = prepared.map(item => item.hash);
 const distinctUrls = new Set(referenceUrls.map(url => new URL(url).href));
 if (!data.has('confirmDuplicate')) {
  const existing = await pool.query(`SELECT DISTINCT r.id,r.title FROM refs r LEFT JOIN screenshots s ON s.ref_id=r.id WHERE (s.content_hash=ANY($1::text[]) OR r.source_url=ANY($2::text[])) AND r.trashed_at IS NULL`, [hashes, referenceUrls]);
  if (existing.rowCount || new Set(hashes).size !== hashes.length || distinctUrls.size !== referenceUrls.length) {
   return fail(409, { error: 'An image or URL appears more than once in this batch or is already saved. Select the confirmation checkbox to save another copy.', duplicates: existing.rows });
  }
 }
 const client=await pool.connect(); const written=[]; let first;
 try { await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock_shared(1946276103)'); if(project && !(await client.query('SELECT 1 FROM projects WHERE id::text=$1',[project])).rowCount) { await client.query('ROLLBACK'); return fail(400,{error:'Project no longer exists.',duplicates:[]}); } await mkdir(storageRoot,{recursive:true});
 for (const [i,source] of urls.entries()) { const opts=urlSettings[i]; const url=new URL(source); const result=await client.query('INSERT INTO refs(title,notes,tags,source_url) VALUES ($1,$2,$3,$4) RETURNING id',[opts.title || url.hostname,notes,tags,source]); const urlId=result.rows[0].id; first ||= urlId; if(opts.project) await client.query('INSERT INTO ref_projects VALUES ($1,$2)',[urlId,opts.project]); for(const category of opts.categories) await client.query('INSERT INTO ref_categories VALUES ($1,$2)',[urlId,category]); await client.query('INSERT INTO capture_jobs(id,ref_id,source_url) VALUES ($1,$2,$3)',[randomUUID(),urlId,source]); }
 /** @type {Map<string,string>} */ const groupIds=new Map();
 for (const [i,item] of prepared.entries()) { const opts=imageSettings[i]; const filename=basename(item.file.name); const fallback=filename.replace(extname(filename),'').replace(/[_-]+/g,' ').trim(); /** @type {string | undefined} */ let id=groups[i] ? groupIds.get(groups[i]) : undefined;
 if (!id) { const generic=/^(screenshot|screen shot|image|img|untitled|dsc)([ _-]*[0-9 .-]*)?$/i.test(fallback); const result=await client.query('INSERT INTO refs(title,notes,tags,source_url) VALUES ($1,$2,$3,$4) RETURNING id',[opts.title || (!generic && fallback) || 'Screenshot',notes,tags,opts.source || null]); id=result.rows[0].id; first ||= id; if(groups[i] && id) groupIds.set(groups[i],id); if (!opts.title && (generic || !fallback)) await client.query("UPDATE refs SET title='Screenshot ' || lpad(id::text,greatest(6,length(id::text)),'0') || ' · ' || to_char(current_date,'YYYY-MM-DD') WHERE id=$1",[id]); if(opts.project) await client.query('INSERT INTO ref_projects VALUES ($1,$2)',[id,opts.project]); for(const category of opts.categories) await client.query('INSERT INTO ref_categories VALUES ($1,$2)',[id,category]); }
 const sid=randomUUID(), key='intake-'+sid+item.ext; await writeFile(join(storageRoot,key),item.bytes,{flag:'wx'}); written.push(join(storageRoot,key)); await client.query('INSERT INTO screenshots(id,ref_id,storage_key,content_hash,media_type,filename) VALUES ($1,$2,$3,$4,$5,$6)',[sid,id,key,item.hash,item.type,filename]); }
 await client.query('COMMIT'); } catch(e) { await client.query('ROLLBACK'); await Promise.all(written.map(path=>unlink(path).catch(()=>{}))); if(['23503','22P02'].includes(/** @type {NodeJS.ErrnoException} */ (e).code||'')) return fail(400,{error:'A project or category is no longer available.',duplicates:[]}); throw e; } finally {client.release();}
 redirect(303,`/references/REF-${String(first).padStart(6,'0')}`);
} };
