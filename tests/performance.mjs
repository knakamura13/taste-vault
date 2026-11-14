// Synthetic SSR baseline; only run against a dedicated disposable database.
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
if(!process.env.DATABASE_URL?.includes('taste_perf_test')) throw Error('DATABASE_URL must point to the disposable taste_perf_test database.');
const db=new pg.Pool({connectionString:process.env.DATABASE_URL});
if(Number((await db.query('SELECT count(*) AS n FROM refs')).rows[0].n)!==0) throw Error('Performance database must be empty.');
await db.query("INSERT INTO refs(title,notes) SELECT 'Reference ' || n, CASE WHEN n%10=0 THEN 'dashboard inspiration' ELSE 'general notes' END FROM generate_series(1,10000) n");
const env={...process.env,HOST:'127.0.0.1',PORT:'39374',ORIGIN:'http://127.0.0.1:39374'};const server=spawn(process.execPath,['build'],{env,stdio:'ignore'});const base='http://127.0.0.1:39374';
try{for(let i=0;i<100;i++){try{await fetch(base);break;}catch{await new Promise(r=>setTimeout(r,100));if(i===99)throw Error('Server did not start');}}
 const output={description:'Synthetic 10,000 reference SSR baseline; sequential localhost requests, warm database; no screenshots, browser rendering or concurrent clients.',node:process.version,date:new Date().toISOString(),cases:{}};
 for(const [name,path] of [['gallery','/'],['search','/?q=dashboard'],['noMatch','/?q=not-a-real-match']]){const timings=[];let bytes=0,errors=0;for(let i=0;i<25;i++){const start=performance.now();try{const response=await fetch(base+path);const html=await response.text();if(!response.ok)errors++;bytes=Buffer.byteLength(html);}catch{errors++;}const elapsed=performance.now()-start;if(i>=5)timings.push(elapsed);}timings.sort((a,b)=>a-b);output.cases[name]={runs:timings.length,errors,medianMs:timings[10],p95Ms:timings[18],minMs:timings[0],maxMs:timings.at(-1),bytes};}
 await writeFile('/tmp/taste-vault-performance.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));
}finally{server.kill();await db.end();}
