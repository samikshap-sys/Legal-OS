/**
 * migrateLcBqToMysql.mjs
 *
 * One-time migration script: reads all rows from
 *   fynd-db.finance_dwh.finops_legal_requests  (BigQuery)
 * and inserts them into the MySQL lc_requests table.
 *
 * Usage:
 *   node server/scripts/migrateLcBqToMysql.mjs
 *
 * Prerequisites:
 *   - DATABASE_URL env var pointing to the MySQL/TiDB instance
 *   - GOOGLE_SERVICE_ACCOUNT_JSON env var with BQ credentials
 *
 * Safe to re-run: uses INSERT IGNORE so existing rows are skipped.
 */

import { BigQuery } from '@google-cloud/bigquery';
import mysql from 'mysql2/promise';

const REQ_TABLE = '`fynd-db.finance_dwh.finops_legal_requests`';

async function main() {
  // ── 1. Connect to BigQuery ──────────────────────────────────────────────
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) {
    console.error('ERROR: GOOGLE_SERVICE_ACCOUNT_JSON not set');
    process.exit(1);
  }
  const credentials = JSON.parse(saJson);
  const bq = new BigQuery({ projectId: 'fynd-db', credentials });

  console.log('[BQ] Fetching rows from finops_legal_requests…');
  const [rows] = await bq.query({
    query: `
      SELECT request_id, requester_name, requester_email, department, request_type,
             priority, deadline, description, doc_link,
             submitted_at, current_status, status_note, updated_at, history_json,
             requested_by, status_updated_by,
             counter_party, customer_type, ip_product, biz_segment, pnl_owner, region,
             is_confidential
      FROM ${REQ_TABLE}
      ORDER BY submitted_at ASC
    `,
  });
  console.log(`[BQ] Fetched ${rows.length} rows`);

  if (rows.length === 0) {
    console.log('[DONE] Nothing to migrate.');
    return;
  }

  // ── 2. Connect to MySQL ─────────────────────────────────────────────────
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL not set');
    process.exit(1);
  }
  const conn = await mysql.createConnection(dbUrl);
  console.log('[MySQL] Connected');

  // ── 3. Insert rows ──────────────────────────────────────────────────────
  const ts = (v) => {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && v !== null && 'value' in v) return String(v.value);
    return String(v);
  };

  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    const values = [
      String(row.request_id        ?? ''),
      String(row.requester_name    ?? ''),
      String(row.requester_email   ?? ''),
      String(row.department        ?? ''),
      String(row.request_type      ?? ''),
      String(row.priority          ?? ''),
      String(row.deadline          ?? ''),
      String(row.description       ?? ''),
      String(row.doc_link          ?? ''),
      ts(row.submitted_at),
      String(row.current_status    ?? ''),
      String(row.status_note       ?? ''),
      ts(row.updated_at),
      String(row.history_json      ?? '[]'),
      String(row.requested_by      ?? ''),
      String(row.status_updated_by ?? ''),
      String(row.counter_party     ?? ''),
      String(row.customer_type     ?? ''),
      String(row.ip_product        ?? ''),
      String(row.biz_segment       ?? ''),
      String(row.pnl_owner         ?? ''),
      String(row.region            ?? ''),
      row.is_confidential ? 1 : 0,
    ];

    try {
      const [result] = await conn.execute(
        `INSERT IGNORE INTO lc_requests
          (request_id, requester_name, requester_email, department, request_type,
           priority, deadline, description, doc_link,
           submitted_at, current_status, status_note, updated_at, history_json,
           requested_by, status_updated_by,
           counter_party, customer_type, ip_product, biz_segment, pnl_owner, region,
           is_confidential)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        values
      );
      if (result.affectedRows > 0) {
        inserted++;
        if (inserted % 10 === 0) console.log(`  Inserted ${inserted}…`);
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  ERROR inserting ${row.request_id}: ${err.message}`);
    }
  }

  await conn.end();

  console.log(`\n[DONE] Migration complete.`);
  console.log(`  Inserted : ${inserted}`);
  console.log(`  Skipped  : ${skipped} (already existed)`);
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
