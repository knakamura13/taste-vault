// Exercise the built gallery with disposable PostgreSQL and image storage.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const { DATABASE_URL, TASTE_STORAGE_DIR, CHROME_PATH } = process.env;
assert.match(new URL(DATABASE_URL).pathname, /^\/taste_gallery_bench_[a-z0-9]+$/);
assert.ok(TASTE_STORAGE_DIR && CHROME_PATH, 'Set disposable image storage and CHROME_PATH.');
const db = new pg.Pool({ connectionString: DATABASE_URL });
await mkdir(join(TASTE_STORAGE_DIR, 'gallery-fixtures'));
const servers = [];
let browser;
const sourceDir = process.env.TASTE_FIXTURE_DIR;
const sources = sourceDir ? (await readdir(sourceDir)).filter(name => /\.png$/i.test(name)).sort() : [];
assert.ok(!sourceDir || sources.length, 'Fixture directory must contain PNG images.');
const fixtureCount = sourceDir ? sources.length * 3 : 180;
const fixtures = [];


try {
 const empty = await db.query('SELECT 1 FROM refs LIMIT 1');
 assert.equal(empty.rowCount, 0, 'The benchmark database must be empty.');

 for (let n = 0; n < fixtureCount; n++) {
  const imageId = randomUUID();
  const key = 'gallery-fixtures/' + imageId + '.png';
  const panels = Array.from({ length: 72 }, (_, i) =>
   '<rect x="' + (48 + (i % 8) * 224) + '" y="' + (80 + Math.floor(i / 8) * 108) +
   '" width="200" height="90" rx="8" fill="hsl(' + ((i * 23 + n * 11) % 360) + ', 40%, 75%)"/>'
  ).join('');
  const screenshot = '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">' +
   '<rect width="100%" height="100%" fill="#fafafa"/>' + panels + '</svg>';
  const source = sourceDir ? join(sourceDir, sources[n % sources.length]) : null;
  const scale = sourceDir ? [0.5, 1, 2][Math.floor(n / sources.length)] : 1;
  const input = source ?? Buffer.from(screenshot);
  const original = await sharp(input).metadata();
  await sharp(input).resize({ width: Math.round(original.width * scale) }).png().toFile(join(TASTE_STORAGE_DIR, key));
  fixtures.push({ width: Math.round(original.width * scale), height: Math.round(original.height * scale), scale,
   bytes: (await stat(join(TASTE_STORAGE_DIR, key))).size });
  const title = (n % 2 === 0 ? 'Dashboard' : 'Reference') + ' ' + n;
  const ref = await db.query('INSERT INTO refs(title) VALUES ($1) RETURNING id', [title]);
  await db.query(
   "INSERT INTO screenshots(id,ref_id,storage_key,content_hash,media_type,filename) VALUES ($1,$2,$3,$4,'image/png','fixture.png')",
   [imageId, ref.rows[0].id, key, imageId]
  );
 }

 async function startServer(build, port) {
  const origin = 'http://127.0.0.1:' + port;
  servers.push(spawn(process.execPath, [build], {
   env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), ORIGIN: origin },
   stdio: ['ignore', 'ignore', 'inherit']
  }));
  for (let attempt = 0; attempt < 100; attempt++) {
   try {
    if ((await fetch(origin)).ok) return origin;
   } catch {
    // Wait for the built server to bind.
   }
   await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error('The gallery server did not start.');
 }

 const builds = { current: await startServer('build', 39375) };
 if (process.env.TASTE_BASELINE_BUILD) {
  builds.baseline = await startServer(process.env.TASTE_BASELINE_BUILD, 39376);
 }

 browser = await chromium.launch({ executablePath: CHROME_PATH });
 async function visit(origin, path, expectedCount, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  try {
   const page = await context.newPage();
   const failures = [];
   page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
   page.on('requestfailed', request => failures.push(request.url()));
   assert.ok((await page.goto(origin + path, { waitUntil: 'domcontentloaded' })).ok());
   await page.locator('main').getByText(expectedCount + ' references', { exact: true }).waitFor();
   const metrics = await page.evaluate(async () => {
    const previews = [...document.querySelectorAll('.gallery img')];
    const visible = previews.filter(img => {
     const bounds = img.getBoundingClientRect();
     return bounds.top < innerHeight && bounds.bottom > 0;
    });
    await Promise.all(visible.map(img => img.decode()));
    return {
     visiblePreviews: visible.length,
     horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
     visibleDecodedMs: Math.round(performance.now()),
     serverResponseMs: Math.round(performance.getEntriesByType('navigation')[0].responseStart),
     visibleEncodedBytes: visible.reduce((sum, img) =>
      sum + (performance.getEntriesByName(img.currentSrc).at(-1)?.encodedBodySize ?? 0), 0)
    };
   });
   await page.waitForLoadState("networkidle");

   assert.equal(metrics.horizontalOverflow, false, 'Page overflows the viewport.');
   assert.ok(metrics.visiblePreviews > 0);
   assert.ok(metrics.visibleEncodedBytes > 0);
   assert.deepEqual(failures, []);
   return metrics;
  } finally {
   await context.close();
  }
 }

 const rounds = [];
 for (let round = 0; round < 5; round++) {
  const arms = Object.entries(builds);
  if (round % 2 === 1) arms.reverse();
  const results = {};
  for (const [name, origin] of arms) {
   await rm(join(TASTE_STORAGE_DIR, 'thumbnails'), { recursive: true, force: true });
   const cold = await Promise.all(Array.from({ length: 3 }, () => visit(origin, '/', fixtureCount)));
   const warm = await Promise.all(Array.from({ length: 3 }, () => visit(origin, '/', fixtureCount)));
   const search = await visit(origin, '/?q=dashboard', Math.ceil(fixtureCount / 2));
   const mobile = await visit(origin, '/', fixtureCount, 390);
   const narrow = await visit(origin, '/', fixtureCount, 320);
   results[name] = { cold, warm, search, mobile, narrow };
  }
  rounds.push(results);
 }
 console.log(JSON.stringify({
  fixtureSource: sourceDir ? 'User-supplied temporary Alarm UI PNGs' : 'Synthetic panels',
  sourceCount: sources.length, fixtureCount, fixtures,
  browser: browser.version(),
  node: process.version,
  architecture: process.arch,
  rounds
 }, null, 2));
} finally {
 await browser?.close();
 await Promise.all(servers.map(async server => {
  if (server.exitCode !== null || server.signalCode !== null) return;
  const closed = once(server, 'close');
  server.kill();
  await closed;
 }));
 await db.end();
}
