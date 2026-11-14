import { error } from '@sveltejs/kit';
import { pool, storageRoot } from '#lib/server/db.js';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';

/** @type {Map<string, Promise<Buffer<ArrayBuffer>>>} */
const pendingPreviews = new Map();
const previewDir = join(storageRoot, 'thumbnails');

/** @param {string} path @param {string} storageKey */
async function readOrCreatePreview(path, storageKey) {
 try {
  return await readFile(path);
 } catch (cause) {
  if (/** @type {NodeJS.ErrnoException} */ (cause).code !== 'ENOENT') throw cause;
 }

 const bytes = await sharp(join(storageRoot, storageKey), { limitInputPixels: 100000000 })
  .rotate()
  .resize({ width: 480, height: 320, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 75 })
  .toBuffer();
 await mkdir(previewDir, { recursive: true });

 const temporaryPath = join(previewDir, randomUUID() + '.tmp');
 try {
  await writeFile(temporaryPath, bytes, { flag: 'wx' });
  await rename(temporaryPath, path);
 } finally {
  await unlink(temporaryPath).catch(() => {});
 }
 return bytes;
}

export async function GET({ params }) {
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(params.id)) error(404);
 const result = await pool.query(
  'SELECT s.storage_key FROM screenshots s JOIN refs r ON r.id=s.ref_id WHERE s.id=$1 AND r.trashed_at IS NULL',
  [params.id]
 );
 if (!result.rowCount) error(404);

 let preview = pendingPreviews.get(params.id);
 if (!preview) {
  const path = join(previewDir, params.id + '.webp');
  preview = readOrCreatePreview(path, result.rows[0].storage_key)
   .finally(() => pendingPreviews.delete(params.id));
  pendingPreviews.set(params.id, preview);
 }

 let bytes;
 try {
  bytes = await preview;
 } catch {
  error(404, 'Preview unavailable');
 }
 return new Response(bytes, {
  headers: {
   'content-type': 'image/webp',
   'cache-control': 'private, max-age=3600',
   'x-content-type-options': 'nosniff'
  }
 });
}
