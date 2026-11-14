// Browser is already isolated behind the public-network proxy.
export async function capturePage(page, sourceUrl) {
 async function screenshot() {const bytes=await page.screenshot({type:'png',timeout:15000});if(bytes.length>10*1024*1024)throw Error('Captured screenshot exceeded 10 MB');return bytes;}
 let liveError;
 try {const response=await page.goto(sourceUrl,{waitUntil:'domcontentloaded'});if(!response || response.status()>=400)throw Error(`Page returned ${response?.status()||'no response'}`);return {bytes:await screenshot(),kind:'live',pageUrl:sourceUrl,archiveTimestamp:null};}catch(error){liveError=error;}
 const availability='https://archive.org/wayback/available?url='+encodeURIComponent(sourceUrl);
 try {const response=await page.goto(availability,{waitUntil:'domcontentloaded'});if(!response || !response.ok())throw Error('Wayback availability unavailable');const body=JSON.parse(await page.locator('body').innerText());const snapshot=body?.archived_snapshots?.closest;if(!snapshot?.available || !snapshot.url || new URL(snapshot.url).hostname!=='web.archive.org' || !/^\d{14}$/.test(snapshot.timestamp||''))throw Error('No usable Wayback snapshot');const replay=await page.goto(snapshot.url,{waitUntil:'domcontentloaded'});if(!replay || replay.status()>=400)throw Error('Archive replay could not be loaded');return {bytes:await screenshot(),kind:'wayback',pageUrl:snapshot.url,archiveTimestamp:snapshot.timestamp};}catch(archiveError){throw Error(`Live capture failed: ${liveError.message || liveError}; archive: ${archiveError.message || archiveError}`);}
}
