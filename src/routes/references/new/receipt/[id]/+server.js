import { json } from '@sveltejs/kit';
import { formatId, isUuid, pool } from '#lib/server/db.js';

export async function GET({ params }) {
 const { rows } = isUuid(params.id)
  ? await pool.query('SELECT first_ref_id FROM intake_receipts WHERE id = $1', [params.id])
  : { rows: [] };
 const receipt = rows[0];
 return json(
  receipt ? { referenceId: formatId(receipt.first_ref_id) } : { referenceId: null },
  { status: receipt ? 200 : 404, headers: { 'cache-control': 'no-store' } }
 );
}
