import { chromium } from 'playwright-core';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool, storageRoot } from '../src/lib/server/db.js';
import { createPublicProxy, validatePublicUrl } from './public-proxy.js';
import { capturePage } from './capture-flow.js';

const chrome = process.env.CHROME_PATH || (process.platform==='darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium');
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
let stopping=false; process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
async function claim() {
 const client=await pool.connect(); try {await client.query('BEGIN');
  await client.query("UPDATE capture_jobs SET status='queued',lease=NULL WHERE status='running' AND updated_at < now() - interval '10 minutes'");
  const row = (await client.query(`
   SELECT j.* FROM capture_jobs j JOIN refs r ON r.id = j.ref_id
   WHERE j.status = 'queued' AND r.trashed_at IS NULL
   ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1
  `)).rows[0];
  if(row){row.lease=randomUUID();await client.query("UPDATE capture_jobs SET status='running',lease=$2,updated_at=now(),error=NULL WHERE id=$1",[row.id,row.lease]);}
  await client.query('COMMIT');return row;
 } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
}
async function run(job) {
 let proxy,browser,key;
 try {
  await validatePublicUrl(job.source_url);
  proxy=await createPublicProxy();
  browser=await chromium.launch({executablePath:chrome,headless:true,proxy:{server:`http://127.0.0.1:${proxy.port}`,bypass:'<-loopback>'},args:['--disable-quic','--disable-background-networking','--disable-features=AsyncDns,UseDnsHttpsSvcbAlpn','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
  const context=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block',acceptDownloads:false});
  const page=await context.newPage();page.setDefaultNavigationTimeout(20000);
  const {bytes,kind,pageUrl,archiveTimestamp}=await capturePage(page,job.source_url);
  const sid=randomUUID();key=sid+'.png';await mkdir(storageRoot,{recursive:true});await writeFile(join(storageRoot,key),bytes,{flag:'wx'});
  const client=await pool.connect();let accepted=false;try{await client.query('BEGIN');const current=await client.query("SELECT j.id FROM capture_jobs j JOIN refs r ON r.id=j.ref_id WHERE j.id=$1 AND j.lease=$2 AND j.status='running' AND r.trashed_at IS NULL FOR UPDATE OF j,r",[job.id,job.lease]);
   if(current.rowCount){const existing=await client.query('SELECT 1 FROM screenshots WHERE ref_id=$1 LIMIT 1',[job.ref_id]);if(!existing.rowCount){await client.query('INSERT INTO screenshots(id,ref_id,storage_key,content_hash,media_type,filename,source_kind,page_url,captured_at,archive_timestamp) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),$9)',[sid,job.ref_id,key,createHash('sha256').update(bytes).digest('hex'),'image/png','capture.png',kind,pageUrl,archiveTimestamp]);accepted=true;}await client.query("UPDATE capture_jobs SET status='succeeded',screenshot_id=$2,lease=NULL,updated_at=now() WHERE id=$1",[job.id,accepted?sid:null]);}
   if (!current.rowCount) {
    // A reference trashed during capture can resume immediately after restoration.
    await client.query(`
     UPDATE capture_jobs SET status = 'queued', lease = NULL, updated_at = now()
     WHERE id = $1 AND lease = $2 AND status = 'running'
    `, [job.id, job.lease]);
   }
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  if(!accepted)await unlink(join(storageRoot,key));key=null;
 } catch(e) {if(key)await unlink(join(storageRoot,key)).catch(()=>{});await pool.query("UPDATE capture_jobs j SET status=CASE WHEN r.trashed_at IS NULL THEN 'failed' ELSE 'queued' END,error=CASE WHEN r.trashed_at IS NULL THEN $3 ELSE NULL END,lease=NULL,updated_at=now() FROM refs r WHERE r.id=j.ref_id AND j.id=$1 AND j.lease=$2 AND j.status='running'",[job.id,job.lease,String(e.message||e).slice(0,500)]);console.error(`Capture ${job.id} failed:`,e.message||e);}
 finally {if(browser)await browser.close();if(proxy)await new Promise(resolve=>proxy.server.close(resolve));}
}
const lock=await pool.connect();
try {
 const acquired=await lock.query('SELECT pg_try_advisory_lock(1946276102) AS acquired');
 if(!acquired.rows[0].acquired) throw Error('Another capture worker is already running.');
 await pool.query("UPDATE capture_jobs SET status='queued',lease=NULL,updated_at=now() WHERE status='running'");
 while(!stopping){const job=await claim();if(job)await run(job);else await delay(2000);}
} finally {await lock.query('SELECT pg_advisory_unlock(1946276102)').catch(()=>{});lock.release();await pool.end();}
