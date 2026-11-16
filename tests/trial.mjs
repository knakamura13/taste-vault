// Run only against a disposable database; the caller supplies DATABASE_URL and TASTE_STORAGE_DIR.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import sharp from 'sharp';
if (!process.env.DATABASE_URL || !process.env.TASTE_STORAGE_DIR) throw Error('Set DATABASE_URL and TASTE_STORAGE_DIR to disposable test locations.');
const temp = await mkdtemp(join(tmpdir(), 'taste-test-'));
const env = {...process.env, HOST:'127.0.0.1', PORT:'39371', ORIGIN:'http://127.0.0.1:39371', BODY_SIZE_LIMIT:'210M', TASTE_LINKS_FILE:join(temp,'links.json')};
const db = new pg.Pool({connectionString:env.DATABASE_URL});
const server = spawn(process.execPath,['build'],{env,stdio:'ignore'});
const base='http://127.0.0.1:39371';
const png=await sharp({create:{width:4,height:4,channels:3,background:'#ccddee'}}).png().toBuffer();
try {
 for(let i=0;i<100;i++) { try { await fetch(base); break; } catch { await new Promise(r=>setTimeout(r,100)); if(i===99) throw Error('Server did not start'); } }
 const a=randomUUID(), b=randomUUID(); await db.query('INSERT INTO projects(id,name) VALUES ($1,$2),($3,$4)',[a,'Alarm',b,'Other']);
 async function upload(title, project, group=false, duplicate=false) { const f=new FormData(); f.set('title',title); if(project) f.set('project',project); if(group) f.set('group','on'); if(duplicate) f.set('confirmDuplicate','on'); f.append('screenshots',new Blob([png],{type:'image/png'}),'image.png'); if(group) f.append('screenshots',new Blob([png],{type:'image/png'}),'mobile.png'); return fetch(base+'/references/new',{method:'POST',headers:{origin:base,accept:'text/html'},body:f,redirect:'manual'}); }
 assert.equal((await upload('Alarm clock',a,true,true)).status,303);
 assert.equal((await upload('Duplicate',null)).status,409);
 assert.equal((await upload('General reference',null,false,true)).status,303);
 const oldestGallery = await fetch(base+'/?sort=oldest');
 assert.equal(oldestGallery.status,200);
 const oldestHtml = await oldestGallery.text();
 assert.match(oldestHtml,/>2 references</);
 assert.deepEqual([...oldestHtml.matchAll(/<strong>([^<]+)<\/strong>/g)].map(match=>match[1]),['Alarm clock','General reference']);
 const assignedGallery = await fetch(base+'/?project='+a);
 assert.equal(assignedGallery.status,200);
 const assignedHtml = await assignedGallery.text();
 assert.match(assignedHtml,/>1 references</);
 assert.match(assignedHtml,/<strong>Alarm clock<\/strong>/);
 const script=resolve('scripts/taste.js'); const run=(...args)=>JSON.parse(execFileSync(process.execPath,[script,...args],{cwd:temp,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 let scoped=run('search','--project',a); assert.deepEqual(scoped.map(x=>x.title),['General reference','Alarm clock']); assert.equal(scoped[1].images.length,2);
 assert.deepEqual(run('search','--project',b).map(x=>x.title),['General reference']);
 const pin=run('pin',scoped[1].id); assert.equal(pin[0].images.length,2);
 const image=await fetch(base+'/assets/'+pin[0].images[0].id); assert.equal(image.status,200); assert.deepEqual(Buffer.from(await image.arrayBuffer()),png); assert.equal((await fetch(base+'/assets/'+pin[0].images[0].id+'/thumbnail')).status,200);
 execFileSync(process.execPath,[script,'link',a],{cwd:temp,env,stdio:'ignore'}); assert.deepEqual(run('search').map(x=>x.title),['General reference','Alarm clock']);
 const upperImage = pin[0].images[0].id.toUpperCase();
 assert.equal((await fetch(base+'/assets/'+upperImage)).status,200);
 assert.equal((await fetch(base+'/assets/'+upperImage+'/thumbnail')).status,200);
 assert.equal((await fetch(base+'/api/v1/references/'+pin[0].id+'/screenshots/'+upperImage)).status,200);
 const post=async (path,values)=>fetch(base+path,{method:'POST',headers:{origin:base,accept:'text/html'},body:new URLSearchParams(values),redirect:'manual'});
 assert.equal((await post('/categories?/create',{name:'Motion'})).status,200);
 const category=(await db.query("SELECT id FROM categories WHERE name='Motion'")).rows[0].id;
 assert.equal((await post('/references/'+pin[0].id+'?/save',{title:'Edited clock',notes:'test note',tags:'motion',projects:a,categories:category})).status,200);
 let api=await (await fetch(base+'/api/v1/references?project='+a+'&q=motion')).json(); assert.equal(api.references[0].title,'Edited clock');
 const upperScoped=await fetch(base+'/api/v1/references?project='+a.toUpperCase()+'&q=motion');
 assert.equal(upperScoped.status,200);
 assert.equal((await upperScoped.json()).references[0].title,'Edited clock');
 const upperGallery=await fetch(base+'/?project='+a.toUpperCase()+'&category='+category.toUpperCase());
 assert.equal(upperGallery.status,200);
 assert.match(await upperGallery.text(),/1 references/);
 const unassignedGallery = await fetch(base+'/?project=unassigned');
 assert.equal(unassignedGallery.status,200);
 const unassignedHtml = await unassignedGallery.text();
 assert.match(unassignedHtml,/<strong>General reference<\/strong>/);
 assert.doesNotMatch(unassignedHtml,/<strong>Edited clock<\/strong>/);
 const unassignedQuery = await fetch(base+'/?project=unassigned&q=general');
 assert.equal(unassignedQuery.status,200);
 assert.match(await unassignedQuery.text(),/<strong>General reference<\/strong>/);

 assert.equal((await fetch(base+'/api/v1/references?project='+b+'&q=motion').then(r=>r.json())).references.length,0);
 const apiRef=await (await fetch(base+'/api/v1/references/'+pin[0].id)).json(); assert.equal(apiRef.title,'Edited clock');
 assert.equal((await fetch(base+apiRef.screenshots[0].url)).status,200);
 assert.equal((await fetch(base+apiRef.screenshots[0].url+'/description',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({description:'Approved phrase',approved:true})})).status,200);
 await db.query("UPDATE screenshots SET description = 'Unapproved browser phrase' WHERE id=$1",[apiRef.screenshots[1].id]);
 for (const [query, count] of [['approved phrase', 1], ['Motion', 1], ['Unapproved browser phrase', 0], ['test note motion', 1]]) {
  const search = await fetch(base+'/?q='+encodeURIComponent(query));
  assert.equal(search.status,200);
  assert.match(await search.text(), new RegExp('>'+count+' references<'));
  const scopedSearch = await fetch(base+'/?'+new URLSearchParams({q:query,project:a,category}));
  assert.equal(scopedSearch.status,200);
  assert.match(await scopedSearch.text(),new RegExp('>'+count+' references<'));
  const unassignedSearch = await fetch(base+'/?'+new URLSearchParams({q:query,project:'unassigned'}));
  assert.equal(unassignedSearch.status,200);
  assert.match(await unassignedSearch.text(),/>0 references</);
 }

 assert.equal((await fetch(base+'/api/v1/references?project='+a+'&q=Approved%20phrase').then(r=>r.json())).references.length,1);
 assert.equal((await post('/references/'+pin[0].id+'?/trash',{})).status,303); assert.deepEqual(run('search','--project',a).map(x=>x.title),['General reference']);
 assert.equal((await fetch(base+'/api/v1/references/'+pin[0].id)).status,404);
 assert.equal((await post('/trash?/restore',{id:pin[0].id})).status,200); assert.equal((await fetch(base+'/api/v1/references/'+pin[0].id)).status,200);
 assert.equal((await post('/projects?/archive',{id:a})).status,200); assert.equal((await fetch(base+'/api/v1/references?project='+b+'&q=Edited').then(r=>r.json())).references.length,0);
 assert.equal((await post('/references/'+pin[0].id+'?/trash',{})).status,303); assert.equal((await post('/trash?/delete',{id:pin[0].id,confirm:'delete'})).status,200); assert.equal((await db.query('SELECT 1 FROM refs WHERE id=$1',[Number(pin[0].id.slice(4))])).rowCount,0);
 const batch=new FormData();batch.set('title','Batch');batch.set('project',a);batch.set('categories',category);batch.set('confirmDuplicate','on');batch.set('urls','https://example.org/');batch.set('url_0_title','URL item');batch.set('url_0_project',b);batch.set('url_0_category_mode','none');batch.set('image_0_title','General image');batch.set('image_0_project','');batch.set('image_0_category_mode','none');batch.set('image_1_title','Other image');batch.set('image_1_project',b);batch.set('image_1_source_mode','custom');batch.set('image_1_source','https://example.org/design');batch.append('screenshots',new Blob([png],{type:'image/png'}),'a.png');batch.append('screenshots',new Blob([png],{type:'image/png'}),'b.png');
 assert.equal((await fetch(base+'/references/new',{method:'POST',headers:{origin:base,accept:'text/html'},body:batch,redirect:'manual'})).status,303);
 const batchRefs=(await db.query("SELECT r.id,r.title,r.source_url,ARRAY(SELECT project_id::text FROM ref_projects WHERE ref_id=r.id) projects,ARRAY(SELECT category_id::text FROM ref_categories WHERE ref_id=r.id) categories FROM refs r WHERE title=ANY($1::text[]) ORDER BY title",[['General image','Other image','URL item']])).rows;assert.equal(batchRefs.length,3);assert.deepEqual(batchRefs[0].projects,[]);assert.deepEqual(batchRefs[0].categories,[]);assert.deepEqual(batchRefs[1].projects,[b]);assert.equal(batchRefs[1].source_url,'https://example.org/design');assert.deepEqual(batchRefs[2].projects,[b]);assert.deepEqual(batchRefs[2].categories,[]);
 const groupedBatch=new FormData();groupedBatch.set('confirmDuplicate','on');groupedBatch.set('image_0_group','pair');groupedBatch.set('image_1_group','pair');groupedBatch.set('image_0_title','Grouped pair');groupedBatch.set('image_1_title','Grouped pair');groupedBatch.set('image_2_title','Solo image');for(let i=0;i<3;i++)groupedBatch.append('screenshots',new Blob([png],{type:'image/png'}),`part-${i}.png`);assert.equal((await fetch(base+'/references/new',{method:'POST',headers:{origin:base,accept:'text/html'},body:groupedBatch,redirect:'manual'})).status,303);const groups=(await db.query("SELECT r.title,count(s.id)::int n FROM refs r JOIN screenshots s ON s.ref_id=r.id WHERE r.title=ANY($1::text[]) GROUP BY r.id ORDER BY r.title",[['Grouped pair','Solo image']])).rows;assert.deepEqual(groups.map(x=>[x.title,x.n]),[['Grouped pair',2],['Solo image',1]]);
 const invalid=await post('/references/new',{urls:'http://127.0.0.1/'}); assert.equal(invalid.status,400);
 const queued=await post('/references/new',{urls:'https://example.com/'}); assert.equal(queued.status,303); assert.equal((await db.query("SELECT count(*)::int n FROM capture_jobs WHERE status='queued'")).rows[0].n,2);
 const failed=(await db.query("UPDATE capture_jobs SET status='failed',error='network failure' WHERE id=(SELECT id FROM capture_jobs ORDER BY created_at DESC LIMIT 1) RETURNING ref_id")).rows[0].ref_id;const manual=new FormData();manual.set('confirmDuplicate','on');manual.set('screenshot',new Blob([png],{type:'image/png'}),'manual.png');const manualId='REF-'+String(failed).padStart(6,'0');assert.equal((await fetch(base+'/references/'+manualId+'?/upload',{method:'POST',headers:{origin:base,accept:'text/html'},body:manual})).status,200);const recovered=(await db.query('SELECT status,error,screenshot_id FROM capture_jobs WHERE ref_id=$1',[failed])).rows[0];assert.equal(recovered.status,'succeeded');assert.equal(recovered.error,null);assert.ok(recovered.screenshot_id);
 const duplicateSources = new FormData();
 duplicateSources.set('urls', 'https://example.net/design');
 duplicateSources.set('sourceUrl', 'https://example.net/design');
 const uniqueImage = await sharp({create:{width:5,height:5,channels:3,background:'#123456'}}).png().toBuffer();
 duplicateSources.append('screenshots', new Blob([uniqueImage], {type:'image/png'}), 'new.png');
 assert.equal((await fetch(base+'/references/new',{method:'POST',headers:{origin:base,accept:'text/html'},body:duplicateSources})).status,409);

 if (process.env.CHROME_PATH) {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
   const context = await browser.newContext();
   const page = await context.newPage();
   await page.goto(base+'/references/new');
   await page.locator('[name="title"]').fill('Recovery batch');
   await page.locator('[name="project"]').selectOption(b);
   await page.locator('[name="categories"]').check();
   await page.locator('[name="urls"]').fill('http://127.0.0.1/');
   await page.locator('input[type="file"]').setInputFiles({name:'recovery.png',mimeType:'image/png',buffer:png});
   await page.getByText('recovery.png', {exact:true}).click();
   await page.locator('[name="image_0_title"]').fill('Recovered screenshot');
   await page.getByRole('button', {name:'Save references'}).click();
   await page.getByRole('alert').filter({hasText:'valid HTTP(S) URLs'}).waitFor();
   await page.locator('[name="urls"]').fill('');
   await page.getByRole('button', {name:'Save references'}).click();
   await page.getByRole('alert').filter({hasText:'already saved'}).waitFor();
   assert.equal(await page.locator('[name="title"]').inputValue(), 'Recovery batch');
   assert.equal(await page.locator('[name="project"]').inputValue(), b);
   assert.equal(await page.locator('[name="categories"]').isChecked(), true);
   assert.equal(await page.locator('[name="image_0_title"]').inputValue(), 'Recovered screenshot');
   assert.equal(await page.locator('input[type="file"]').evaluate(input => input.files[0].name), 'recovery.png');
   await page.locator('[name="confirmDuplicate"]').check();
   await page.getByRole('button', {name:'Save references'}).click();
   await page.getByRole('heading', {name:'Recovered screenshot'}).waitFor();

   // Let the server commit, then drop the enhanced form response.
   const destinationProject = randomUUID();
   await db.query('INSERT INTO projects(id,name) VALUES ($1,$2)',[destinationProject,'Rediscovery destination']);
   await page.goto(base+'/references/new');
   await page.locator('[name="title"]').fill('Lost response batch');
   await page.locator('[name="project"]').selectOption(b);
   await page.locator('[name="notes"]').fill('Keep the submitted metadata');
   await page.locator('[name="confirmDuplicate"]').check();
   await page.locator('input[type="file"]').setInputFiles({name:'lost.png',mimeType:'image/png',buffer:png});
   await page.route('**/references/new', async route => {
    if (route.request().method() === 'POST') {
     await route.fetch({maxRedirects:0});
     await route.abort();
    } else await route.continue();
   }, {times:1});
   await page.getByRole('button', {name:'Save references'}).click();
   await page.getByRole('button', {name:'Check saved batch'}).click();
   const saved = page.getByRole('link', {name:'Open saved batch'});
   await saved.waitFor();
   const savedPath = await saved.getAttribute('href');
   assert.equal((await db.query("SELECT count(*)::int n FROM refs WHERE title='Lost response batch'")).rows[0].n,1);
   const reopenedIntake = await context.newPage();
   try {
    await reopenedIntake.goto(base+'/references/new');
    assert.equal(await reopenedIntake.locator('[name="screenshots"]').evaluate(input => input.files.length),0);
    await reopenedIntake.getByRole('button', {name:'Check previous batch'}).click();
    const previous = reopenedIntake.getByRole('link', {name:'Open previous batch'});
    assert.equal(await previous.getAttribute('href'),savedPath);
    await previous.click();
    await reopenedIntake.waitForURL(base+savedPath);
    await reopenedIntake.goto(base+'/references/new');
    await reopenedIntake.waitForFunction(() => !Object.keys(localStorage).some(key => key.startsWith('taste:intake-recovery:')));
   } finally {
    await reopenedIntake.close();
   }
   await saved.click();
   await page.waitForURL(base+savedPath);
   await page.getByRole('heading', {name:'Lost response batch'}).waitFor();
   await page.locator('[name="notes"]').fill('Draft notes after failure');
   await page.locator('[name="sourceUrl"]').fill('ftp://example.com/');
   assert.equal(await page.locator('[name="sourceUrl"]').inputValue(),'ftp://example.com/');
   const submittedEdit = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('?/save'));
   await page.getByRole('button', {name:'Save changes'}).click();
   assert.equal(new URLSearchParams((await submittedEdit).postData()).get('sourceUrl'),'ftp://example.com/');
   await page.getByRole('alert').filter({hasText:'Enter a valid HTTP(S) URL.'}).waitFor({timeout:10000});
   assert.equal(await page.locator('[name="notes"]').inputValue(),'Draft notes after failure');
   await page.getByRole('link', {name:'← All references'}).click();
   await page.waitForURL(base+'/');
   await page.goBack();
   await page.waitForURL(base+savedPath);
   assert.equal(await page.locator('[name="notes"]').inputValue(),'Draft notes after failure');
   await page.getByText('Image description', {exact:true}).click();
   await page.locator('[name="description"]').fill('Draft recovery trial description');
   await page.getByRole('button', {name:'Save description',exact:true}).click();
   await page.getByRole('status').filter({hasText:'Description saved.'}).waitFor();
   assert.equal(await page.locator('[name="notes"]').inputValue(),'Draft notes after failure');
   assert.equal(await page.locator('[name="sourceUrl"]').inputValue(),'ftp://example.com/');

   // Move the reference while correcting the edit, then verify both project scopes.
   const rediscoveryNote = 'Rediscovery note ' + randomUUID();
   await page.locator('[name="sourceUrl"]').fill('https://example.com/');
   await page.locator('[name="notes"]').fill(rediscoveryNote);
   const previousProject = page.locator(`[name="projects"][value="${b}"]`);
   assert.equal(await previousProject.isChecked(),true);
   await previousProject.uncheck();
   await page.locator(`[name="projects"][value="${destinationProject}"]`).check();
   await page.getByRole('button', {name:'Save changes'}).click();
   await page.getByRole('status').filter({hasText:'Reference saved.'}).waitFor();
   const freshSession = await browser.newContext();
   try {
    const freshPage = await freshSession.newPage();
    await freshPage.goto(base+'/');
    await freshPage.locator('[name="q"]').fill(rediscoveryNote);
    await freshPage.locator('[name="project"]').selectOption(b);
    await freshPage.getByRole('button', {name:'Apply',exact:true}).click();
    await freshPage.waitForURL(url => url.searchParams.get('q') === rediscoveryNote && url.searchParams.get('project') === b);
    await freshPage.getByText('No references found.',{exact:true}).waitFor();
    await freshPage.locator('[name="project"]').selectOption(destinationProject);
    await freshPage.getByRole('button', {name:'Apply',exact:true}).click();
    await freshPage.waitForURL(url => url.searchParams.get('q') === rediscoveryNote && url.searchParams.get('project') === destinationProject);
    assert.equal(await freshPage.locator('.gallery article').count(),1);
    await freshPage.getByRole('link',{name:'Lost response batch'}).click();
    await freshPage.waitForURL(url => url.pathname === savedPath);
    assert.equal(await freshPage.locator('[name="notes"]').inputValue(),rediscoveryNote);
    const originalImage = freshPage.locator('.image-stack img');
    await originalImage.evaluate(image => image.decode());
    const originalImageUrl = await originalImage.getAttribute('src');
    await freshPage.getByRole('link', {name:'← All references'}).click();
    await freshPage.waitForURL(url => url.pathname === '/' &&
     url.searchParams.get('q') === rediscoveryNote &&
     url.searchParams.get('project') === destinationProject);
    assert.equal(await freshPage.locator('[name="q"]').inputValue(), rediscoveryNote);
    assert.equal(await freshPage.locator('[name="project"]').inputValue(), destinationProject);
    const galleryResult = freshPage.getByRole('link', {name:'Lost response batch', exact:true});
    const projectSearchUrl = freshPage.url();
    await galleryResult.click();
    await freshPage.waitForURL(url => url.pathname === savedPath);
    freshPage.once('dialog', dialog => dialog.accept());
    await freshPage.getByRole('button', {name:'Move to Trash', exact:true}).click();
    await freshPage.waitForURL(base+'/trash');
    const trashRow = freshPage.locator('.management-row').filter({
     has: freshPage.getByText('Lost response batch', {exact:true})
    });
    await trashRow.waitFor();

    await freshPage.goto(projectSearchUrl);
    await freshPage.getByText('No references found.', {exact:true}).waitFor();
    await freshPage.goto(base+'/trash');
    await trashRow.getByRole('button', {name:'Restore', exact:true}).click();
    await trashRow.waitFor({state:'hidden'});
    await freshPage.goto(projectSearchUrl);
    await galleryResult.click();
    await freshPage.waitForURL(url => url.pathname === savedPath);
    assert.equal(await originalImage.getAttribute('src'), originalImageUrl);
    await originalImage.evaluate(image => image.decode());
   } finally {
    await freshSession.close();
   }

   const queuedRef = (await db.query("SELECT ref_id FROM capture_jobs WHERE status='queued' ORDER BY created_at LIMIT 1")).rows[0].ref_id;
   await page.goto(base+'/references/REF-'+String(queuedRef).padStart(6,'0'));
   await page.getByRole('status').filter({hasText:'Capture: queued'}).waitFor();
   await db.query("UPDATE capture_jobs SET status='failed', error='Test capture failure' WHERE ref_id=$1", [queuedRef]);
   await page.getByRole('status').filter({hasText:'Test capture failure'}).waitFor();
   assert.equal(await page.getByRole('button', {name:'Retry capture'}).isVisible(), true);
   await db.query(`
    WITH fixtures AS (
     INSERT INTO refs(title)
     SELECT 'Selection trial ' || n FROM generate_series(1,61) n
     RETURNING id
    )
    INSERT INTO ref_projects(ref_id,project_id) SELECT id,$1 FROM fixtures
   `, [b]);
   const selectionSearch = new URLSearchParams({q:'Selection trial',project:b});
   await page.goto(base+'/?'+selectionSearch);
   await page.locator('.gallery input[type="checkbox"]').first().check();
   await page.getByRole('link', {name:'Next',exact:true}).click();
   await page.waitForURL(url => url.searchParams.get('page') === '2');
   await page.locator('.gallery input[type="checkbox"]').first().check();
   await page.getByRole('button', {name:'Copy 2 selected IDs'}).waitFor();
   const pageTwoReference = page.locator('.gallery article a').first();
   const referenceHref = await pageTwoReference.getAttribute('href');
   const cardId = await pageTwoReference.getAttribute('id');
   assert.match(cardId,/^REF-[0-9]+$/);
   await pageTwoReference.click();
   await page.waitForURL(new URL(referenceHref, base).href);
   await page.getByRole('link', {name:'← All references'}).click();
   await page.waitForURL(url => url.pathname === '/' &&
    url.searchParams.get('page') === '2' &&
    url.searchParams.get('q') === 'Selection trial' &&
    url.searchParams.get('project') === b &&
    url.hash === '#'+cardId);
   assert.equal(await pageTwoReference.getAttribute('href'), referenceHref);
   await page.getByRole('button', {name:'Copy 2 selected IDs'}).waitFor();
   await page.getByRole('button', {name:'Clear selection'}).click();
   await db.query("DELETE FROM refs WHERE title LIKE 'Selection trial %'");
   await page.goto(base+'/?project='+a.toUpperCase()+'&category='+category.toUpperCase());
   assert.equal(await page.locator('[name="project"]').inputValue(),a);
   assert.equal(await page.locator('[name="category"]').inputValue(),category);

  } finally {
   await browser.close();
  }
 }
 // A saved page may become invalid after a reference is removed.
 await db.query("INSERT INTO refs(title) SELECT 'Pagination regression ' || n FROM generate_series(1,61) n");
 const gallery = (path) => fetch(base + path, {redirect:'manual'});
 let paged = await gallery('/?q=Pagination%20regression&page=2&sort=oldest');
 assert.equal(paged.status,200);
 assert.match(await paged.text(), /61 references/);
 await db.query("UPDATE refs SET trashed_at=now() WHERE id=(SELECT max(id) FROM refs WHERE title LIKE 'Pagination regression %')");
 paged = await gallery('/?q=Pagination%20regression&page=2&sort=oldest');
 assert.equal(paged.status,302);
 let location = new URL(paged.headers.get('location'), base);
 assert.equal(location.searchParams.get('q'),'Pagination regression');
 assert.equal(location.searchParams.get('sort'),'oldest');
 assert.equal(location.searchParams.has('page'),false);
 const recoveredGallery = await gallery(location.pathname + location.search);
 assert.match(await recoveredGallery.text(), /60 references/);
 const emptyPage = await gallery('/?q=NoMatchingPaginationRef&page=9');
 assert.equal(emptyPage.status,302);
 assert.equal(new URL(emptyPage.headers.get('location'),base).searchParams.has('page'),false);
 await db.query("DELETE FROM refs WHERE title LIKE 'Pagination regression %'");
 console.log('Trial integration passed: grouped intake, duplicate detection, image retrieval, project isolation, repo linking, pins, and trash exclusion.');
} finally { server.kill(); await db.end(); await rm(temp,{recursive:true,force:true}); }
