// Destructive fixtures are restricted to an explicitly named, empty disposable database.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdir, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { chromium } from 'playwright-core';

const { DATABASE_URL, TASTE_STORAGE_DIR, TASTE_FIXTURE_DIR, CHROME_PATH } = process.env;
assert.match(new URL(DATABASE_URL).pathname, /^\/taste_intake_test_[a-z0-9]+$/);
assert.ok(TASTE_STORAGE_DIR && TASTE_FIXTURE_DIR && CHROME_PATH);
await mkdir(TASTE_STORAGE_DIR, { recursive: true });
assert.deepEqual(await readdir(TASTE_STORAGE_DIR), []);
const db = new pg.Pool({ connectionString: DATABASE_URL });
const base = 'http://127.0.0.1:39377';
const env = { ...process.env, HOST: '127.0.0.1', PORT: '39377', ORIGIN: base };
delete env.BODY_SIZE_LIMIT;
let server, browser;
const results = [];
try {
 assert.equal((await db.query('SELECT 1 FROM refs LIMIT 1')).rowCount, 0);
 const names = (await readdir(TASTE_FIXTURE_DIR)).filter(n => /\.png$/i.test(n)).sort();
 assert.ok(names.length >= 20);
 const samples = await Promise.all(names.map(async name => ({ name, bytes: await readFile(join(TASTE_FIXTURE_DIR, name)) })));
 assert.ok(samples.every(s => s.bytes.length <= 10 * 1024 * 1024));
 server = spawn(process.execPath, ['scripts/start.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
 for (let i = 0; i < 100; i++) {
  try { if ((await fetch(base)).ok) break; } catch {}
  assert.ok(i < 99, 'Server failed to start');
  await new Promise(r => setTimeout(r, 100));
 }
 const state = async () => ({ rows: (await db.query('SELECT count(*)::int n FROM refs')).rows[0].n,
  images: (await db.query('SELECT count(*)::int n FROM screenshots')).rows[0].n,
  files: (await readdir(TASTE_STORAGE_DIR)).sort() });
 const post = async (items, fields = {}) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  for (const item of items) form.append('screenshots', new Blob([item.bytes], { type: 'image/png' }), item.name);
  return fetch(base + '/references/new', { method: 'POST', headers: { origin: base, accept: 'text/html' }, body: form, redirect: 'manual' });
 };
 const empty = await state();
 for (const [label, items, fields] of [
  ['oversized image', [samples[0], { name: 'oversized.png', bytes: Buffer.alloc(10 * 1024 * 1024 + 1) }], {}],
  ['corrupt image', [samples[0], { name: 'corrupt.png', bytes: samples[1].bytes.subarray(0, 20) }], {}],
  ['too many images', samples.slice(0, 21), {}],
  ['rollback after first image written', samples.slice(0, 2), { image_1_project: randomUUID() }]
 ]) {
  const response = await post(items, fields);
  assert.equal(response.status, 400, label);
  assert.deepEqual(await state(), empty, label + ' must leave no partial rows or files');
  results.push({ case: label, passed: true });
 }
 // Exercise enhanced-form recovery with an actual multi-megabyte source image.
 browser = await chromium.launch({ executablePath: CHROME_PATH });
 const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
 await page.goto(base + '/references/new');
 await page.locator('[name="title"]').fill('Preserved real image draft');
 await page.locator('input[type="file"]').setInputFiles([
  { name: 'too-big.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
  { name: samples[0].name, mimeType: 'image/png', buffer: samples[0].bytes }
 ]);
 await page.locator('details').last().locator('summary').click();
 await page.locator('[name="image_1_title"]').fill('Preserved real image draft');
 assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Intake must fit a 320px viewport');
 await page.getByRole('button', { name: 'Save references' }).click();
 await page.getByRole('alert').filter({ hasText: 'Remove oversized images' }).waitFor();
 assert.deepEqual(await state(), empty);
 await page.getByRole('button', { name: 'Remove too-big.png', exact: true }).click();
 assert.equal(await page.locator('[name="image_0_title"]').inputValue(), 'Preserved real image draft');
 await page.locator('[name="urls"]').fill('http://127.0.0.1/');

 await page.getByRole('button', { name: 'Save references' }).click();
 await page.getByRole('alert').filter({ hasText: 'valid HTTP(S)' }).waitFor();
 assert.equal(await page.locator('[name="title"]').inputValue(), 'Preserved real image draft');
 assert.equal(await page.locator('input[type="file"]').evaluate(e => e.files[0].size), samples[0].bytes.length);
 await page.locator('[name="urls"]').fill('');
 await page.getByRole('button', { name: 'Save references' }).click();
 await page.getByRole('heading', { name: 'Preserved real image draft' }).waitFor();
 results.push({ case: 'browser validation recovery', passed: true });
 // Import every remaining original through the normal HTTP action, in supported batches.
 for (let offset = 1; offset < samples.length; offset += 20) {
  const batch = samples.slice(offset, offset + 20);
  const start = performance.now();
  assert.equal((await post(batch, { confirmDuplicate: 'on' })).status, 303);
  results.push({ case: 'batch upload', files: batch.length, bytes: batch.reduce((n, s) => n + s.bytes.length, 0), ms: Math.round(performance.now() - start) });
 }
 const imported = await state();
 assert.equal(imported.rows, samples.length);
 assert.equal(imported.images, samples.length);
 assert.equal(imported.files.length, samples.length);
 // Verify every stored image is byte-for-byte intact, including the original filename.
 const rows = (await db.query('SELECT filename,storage_key,content_hash FROM screenshots')).rows;
 for (const row of rows) {
  const source = samples.find(s => s.name === row.filename);
  assert.ok(source);
  assert.equal(row.content_hash, createHash('sha256').update(source.bytes).digest('hex'));
  assert.deepEqual(await readFile(join(TASTE_STORAGE_DIR, row.storage_key)), source.bytes);
 }
 assert.equal((await post([samples[0]])).status, 409);
 assert.deepEqual(await state(), imported);
 assert.equal((await post([samples[0]], { confirmDuplicate: 'on' })).status, 303);
 assert.equal((await state()).rows, samples.length + 1);
 results.push({ case: 'duplicate rejection and explicit retry', passed: true });
 console.log(JSON.stringify({ sourceCount: samples.length, results }, null, 2));
} finally {
 await browser?.close();
 if (server && server.exitCode === null && server.signalCode === null) { const done = once(server, 'close'); server.kill(); await done; }
 await db.end();
}
