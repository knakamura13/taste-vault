// Run against a disposable copy of the extended gallery and its image files.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright-core';

const { DATABASE_URL, TASTE_STORAGE_DIR, CHROME_PATH } = process.env;
assert.match(new URL(DATABASE_URL).pathname, /^\/taste_gallery_bench_busy[a-z0-9]+$/);
assert.ok(TASTE_STORAGE_DIR && CHROME_PATH);
const db = new pg.Pool({connectionString:DATABASE_URL});
const base = 'http://127.0.0.1:39383';
const children = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
function start(script) {
 const child = spawn(process.execPath, [script], {
  env: {...process.env, HOST:'127.0.0.1', PORT:'39383', ORIGIN:base},
  stdio:['ignore','ignore','inherit']
 });
 children.push(child);
 return child;
}
async function stop(child, signal='SIGTERM') {
 if (child.exitCode !== null || child.signalCode !== null) return;
 const done=once(child,'close');
 child.kill(signal);
 await done;
}
async function submit(fields, screenshots=[]) {
 const form=new FormData();
 for(const [key,value] of Object.entries(fields)) form.set(key,value);
 for(const image of screenshots) form.append('screenshots',new Blob([image],{type:'image/png'}),'trial.png');
 const response=await fetch(base+'/references/new',{
  method:'POST',headers:{origin:base,accept:'text/html'},body:form,redirect:'manual'
 });
 assert.equal(response.status,303,await response.text());
 return response.headers.get('location');
}
async function jobs(title) {
 return (await db.query(
  'SELECT j.status,j.error,r.id,(SELECT count(*)::int FROM screenshots s WHERE s.ref_id=r.id) images FROM refs r JOIN capture_jobs j ON j.ref_id=r.id WHERE r.title=$1 ORDER BY r.id',[title]
 )).rows;
}
async function waitForJobs(title) {
 for(let attempt=0;attempt<150;attempt++){
  const rows=await jobs(title);
  if(rows.length && rows.every(row=>['succeeded','failed'].includes(row.status))) return rows;
  await delay(500);
 }
 throw Error('Capture jobs did not finish: '+title);
}

try {
 const {rows:[population]}=await db.query('SELECT count(*)::int total FROM refs');
 assert.equal(population.total,52376,'Start with an untouched copy of the mixed fixture database.');
 const category=randomUUID();
 await db.query("INSERT INTO categories(id,name) VALUES ($1,'Rehearsal category')",[category]);
 const initial=(await db.query('SELECT storage_key FROM screenshots ORDER BY ref_id DESC LIMIT 20')).rows;
 const candidates=await Promise.all(initial.map(({storage_key})=>readFile(join(TASTE_STORAGE_DIR,storage_key))));
 const input=candidates.filter(bytes=>bytes.length<=10*1024*1024).slice(0,8);
 assert.equal(input.length,8);
 const project=(await db.query("SELECT id FROM projects WHERE name='Sparse project'")).rows[0].id;
 start('scripts/start.js');
 for(let attempt=0;attempt<100;attempt++){
  if(await fetch(base+'/healthz').then(r=>r.ok).catch(()=>false)) break;
  assert.ok(attempt<99,'Server did not become ready');
  await delay(100);
 }
 let worker=start('scripts/capture-worker.js');
 browser=await chromium.launch({executablePath:CHROME_PATH});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage();
 const failures=[];
 page.on('response',r=>{if(r.status()>=400)failures.push(r.status());});
 page.on('requestfailed',r=>{if(r.failure()?.errorText!=='net::ERR_ABORTED')failures.push(r.failure()?.errorText);});
 async function browse() {
  const start=performance.now();
  const response=await page.goto(base+'/?project='+project+'&q=dashboard',{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  assert.equal(await page.locator('.gallery article').count(),60);
  await page.locator('.gallery img').first().evaluate(img=>img.decode());
  const firstPreviewMs=Math.round(performance.now()-start);
  const next=performance.now();
  await page.getByRole('link',{name:'Next',exact:true}).click();
  await page.waitForURL(url=>url.searchParams.get('page')==='2');
  await page.locator('.gallery img').first().evaluate(img=>img.decode());
  return {firstPreviewMs,nextPageMs:Math.round(performance.now()-next)};
 }
 await browse();
 const rounds=[];
 for(let round=0;round<5;round++){
  const result={};
  for(const arm of round%2?['busy','quiet']:['quiet','busy']){
   const title='Capture rehearsal '+randomUUID();
   const samples=[];
   let upload;
   let uploadPending=false;
   if(arm==='busy'){
    await submit({title,urls:[1,2,3].map(n=>'https://example.com/?taste-trial='+round+'-'+n).join('\n')});
    for(let i=0;i<100;i++){
     if((await jobs(title)).some(j=>j.status==='running'))break;
     assert.ok(i<99,'Worker did not start capture');
     await delay(50);
    }
    uploadPending=true;
    upload=submit({title:'Intake rehearsal '+round,confirmDuplicate:'on',group:'on',categories:category,receipt:randomUUID()},input)
     .then(()=>null,error=>error).finally(()=>{uploadPending=false;});
   }
   for(let i=0;i<3;i++){
    const captureRunning=arm==='busy' && (await jobs(title)).some(job=>job.status==='running');
    const intakeRunning=uploadPending;
    samples.push({...await browse(),captureRunning,intakeRunning});
   }
   result[arm]=samples;
   if(arm==='busy'){
    const uploadError=await upload;
    if(uploadError)throw uploadError;
    const outcomes=await waitForJobs(title);
    assert.deepEqual(outcomes.map(j=>[j.status,j.images]),Array(3).fill(['succeeded',1]),JSON.stringify(outcomes));
   }
  }
  rounds.push(result);
 }
 const title='Restart capture rehearsal';
 const path=await submit({title,urls:'https://example.com/?taste-restart='+randomUUID()});
 for(let i=0;i<100;i++){
  if((await jobs(title)).some(j=>j.status==='running'))break;
  assert.ok(i<99,'Worker did not claim the restart fixture');
  await delay(25);
 }
 await stop(worker,'SIGKILL');
 worker=start('scripts/capture-worker.js');
 assert.deepEqual((await waitForJobs(title)).map(j=>[j.status,j.images]),[['succeeded',1]]);
 await fetch(base+path+'?/retry',{method:'POST',headers:{origin:base,accept:'text/html'},body:new URLSearchParams()}).then(r=>assert.equal(r.status,200));
 assert.deepEqual((await waitForJobs(title)).map(j=>[j.status,j.images]),[['succeeded',1],['succeeded',1]]);
 await stop(worker);
 const manualTitle='Manual capture recovery rehearsal';
 const manualPath=await submit({title:manualTitle,urls:'https://example.com/?manual='+randomUUID()});
 // Inject a terminal capture failure to exercise the user recovery path.
 await db.query(
  "UPDATE capture_jobs SET status='failed', error='Simulated capture failure' WHERE ref_id=(SELECT id FROM refs WHERE title=$1)",[manualTitle]
 );
 const detail=await page.goto(base+manualPath);
 assert.equal(detail.status(),200);
 await page.getByRole('button',{name:'Retry capture'}).waitFor();
 await page.locator('.add-image summary').click();
 await page.locator('input[name="screenshot"]').setInputFiles({name:'manual.png',mimeType:'image/png',buffer:input[0]});
 await page.locator('.add-image [name="confirmDuplicate"]').check();
 await page.getByRole('button',{name:'Add screenshot',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Capture: succeeded'}).waitFor();
 assert.deepEqual((await jobs(manualTitle)).map(j=>[j.status,j.images]),[['succeeded',1]]);
 assert.deepEqual(failures,[]);
 console.log(JSON.stringify({population:population.total,inputBytes:input.reduce((n,b)=>n+b.length,0),browser:browser.version(),node:process.version,architecture:process.arch,rounds,restartAndRepeatCapture:'passed',manualCaptureRecovery:'passed using a simulated failure',failedRequests:failures.length},null,2));
} finally {
 await browser?.close();
 for(const child of children.reverse()) await stop(child);
 await db.end();
}
