import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const env={...process.env,HOST:'127.0.0.1',PORT:'39372',ORIGIN:'http://127.0.0.1:39372',TASTE_REQUIRE_AUTH:'true',TASTE_WEB_PASSWORD:'test-web-secret',TASTE_API_READ_TOKEN:'test-read-token',TASTE_API_WRITE_TOKEN:'test-write-token'};
const server=spawn(process.execPath,['build'],{env,stdio:'ignore'}),base='http://127.0.0.1:39372';
try {for(let i=0;i<100;i++){try{await fetch(base);break;}catch{await new Promise(r=>setTimeout(r,100));if(i===99)throw Error('Server did not start');}}
 assert.equal((await fetch(base)).status,401);
 assert.equal((await fetch(base,{headers:{authorization:'Basic '+Buffer.from('taste:test-web-secret').toString('base64')}})).status,200);
 assert.equal((await fetch(base+'/api/v1/references')).status,401);
 assert.equal((await fetch(base+'/api/v1/references',{headers:{authorization:'Bearer test-read-token'}})).status,200);
 const path=base+'/api/v1/references/REF-000001/screenshots/00000000-0000-0000-0000-000000000000/description';
 const req=token=>fetch(path,{method:'PUT',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({description:'test',approved:true})});
 assert.equal((await req('test-read-token')).status,401);assert.equal((await req('test-write-token')).status,404);
 const webAuth='Basic '+Buffer.from('taste:test-web-secret').toString('base64');
 const malformedId='-'.repeat(36);
 assert.equal((await fetch(base+'/assets/'+malformedId,{headers:{authorization:webAuth}})).status,404);
 const invalidBody=await fetch(path,{method:'PUT',headers:{authorization:'Bearer test-write-token','content-type':'application/json'},body:'null'});
 assert.equal(invalidBody.status,400);
 assert.equal((await invalidBody.json()).error.code,'invalid_body');
 console.log('Web and separate API read/write credentials passed.');
} finally {server.kill();}
