import { access, constants } from 'node:fs/promises';
import { pool, storageRoot } from '#lib/server/db.js';
export async function GET() {
 try {
  await pool.query('SELECT 1 FROM screenshots LIMIT 1');
  await access(storageRoot, constants.R_OK | constants.W_OK);
  return new Response('ready', { headers: { 'cache-control': 'no-store' } });
 } catch {
  return new Response('unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
 }
}
