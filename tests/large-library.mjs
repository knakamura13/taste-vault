// Metadata/SSR comparison only: screenshots have metadata but no image files.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import pg from 'pg';
const {DATABASE_URL,TASTE_BASELINE_BUILD}=process.env;
assert.match(new URL(DATABASE_URL).pathname,/^\/taste_large_bench_[a-z0-9]+$/);
assert.ok(TASTE_BASELINE_BUILD);
const db=new pg.Pool({connectionString:DATABASE_URL});const servers=[];
try {
 assert.equal((await db.query('SELECT 1 FROM refs LIMIT 1')).rowCount,0);
 await db.query("INSERT INTO projects(id,name) SELECT md5('project'||n)::uuid,'Project '||n FROM generate_series(1,500) n");
 await db.query("INSERT INTO categories(id,name) SELECT md5('category'||n)::uuid,'Category '||n FROM generate_series(1,100) n");
 await db.query("INSERT INTO refs(title,notes) SELECT 'Reference '||n, CASE WHEN n%2=0 THEN 'dashboard inspiration' ELSE 'general notes' END FROM generate_series(1,50000) n");
 await db.query("INSERT INTO ref_projects SELECT id,md5('project'||(1+id%500))::uuid FROM refs");
 await db.query("INSERT INTO ref_categories SELECT id,md5('category'||(1+id%100))::uuid FROM refs");
 await db.query("INSERT INTO screenshots(id,ref_id,storage_key,content_hash,media_type,filename,description,description_approved_at) SELECT md5('image'||id)::uuid,id,'unused/'||id,id::text,'image/png','fixture.png','Synthetic approved screenshot description for reference '||id,now() FROM refs");
 await db.query('ANALYZE');
 const project=(await db.query("SELECT id FROM projects WHERE name='Project 1'")).rows[0].id;
 const category=(await db.query("SELECT id FROM categories WHERE name='Category 1'")).rows[0].id;
 const cases=[['projectGallery','/?project='+project,100],['categoryGallery','/?category='+category,500],['projectSearch','/?project='+project+'&q=dashboard',100],['projectApi','/api/v1/references?project='+project,25],['projectApiNoMatch','/api/v1/references?project='+project+'&q=nonexistent-fixture',0]];
 async function start(build,port){const origin='http://127.0.0.1:'+port;servers.push(spawn(process.execPath,[build],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),ORIGIN:origin},stdio:['ignore','ignore','inherit']}));for(let i=0;i<100;i++){try{if((await fetch(origin)).ok)return origin;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Server did not start');}
 const arms={baseline:await start(TASTE_BASELINE_BUILD,39381),current:await start('build',39382)};
 const rounds=[];
 for(let round=0;round<5;round++){const result={};const names=Object.keys(arms);if(round%2)names.reverse();for(const arm of names){result[arm]={};for(const [name,path,count]of cases){const samples=[];for(let i=0;i<13;i++){const start=performance.now();const r=await fetch(arms[arm]+path);const body=await r.text();const ms=performance.now()-start;assert.equal(r.status,200);if(path.startsWith('/api/'))assert.equal(JSON.parse(body).references.length,count);else assert.ok(body.includes(count+' references'));if(i>=3)samples.push(ms);}result[arm][name]=samples;}}rounds.push(result);}
 console.log(JSON.stringify({node:process.version,architecture:process.arch,referenceCount:50000,projectCount:500,categoryCount:100,screenshotMetadataCount:50000,description:'Five alternating rounds per build; three warmups and ten sequential full-response localhost requests per case per round. No image files, browser rendering, WAN, or concurrent clients.',rounds},null,2));
}finally{await Promise.all(servers.map(async s=>{if(s.exitCode!==null||s.signalCode!==null)return;const done=once(s,'close');s.kill();await done;}));await db.end();}
