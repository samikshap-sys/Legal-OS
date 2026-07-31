/**
 * legalBigQuery.ts — Legal Connect data layer
 *
 * Originally backed by BigQuery (fynd-db.finance_dwh.finops_legal_requests).
 * Now fully migrated to MySQL/TiDB via Drizzle ORM (lc_requests table).
 *
 * All exported function signatures are unchanged — legalRouter.ts and the
 * entire Legal Connect UI require zero modifications.
 */
import { desc, eq } from 'drizzle-orm';
import { getDb } from './db';
import { lcRequests } from '../drizzle/schema';

// ── Types (unchanged from original BQ version) ───────────────────────────────

export interface LegalRequest {
  request_id: string;
  requester_name: string;
  requester_email: string;
  department: string;
  request_type: string;
  priority: string;
  deadline: string;
  description: string;
  doc_link: string;
  submitted_at: string;
  current_status: string;
  status_note: string;
  updated_at: string;
  history_json: string;
  requested_by: string;
  status_updated_by: string;
  counter_party: string;
  customer_type: string;
  ip_product: string;
  biz_segment: string;
  pnl_owner: string;
  region: string;
  is_confidential: boolean;
}

export interface InsertRequestInput {
  name: string;
  email: string;
  dept: string;
  type: string;
  counterParty?: string;
  customerType?: string;
  ipProduct?: string;
  bizSegment?: string;
  pnlOwner?: string;
  region?: string;
  priority: string;
  deadline: string;
  description: string;
  docLink: string;
  requestedBy?: string;
  isConfidential?: boolean;
}

export interface UpdateRequestInput {
  request_id: string;
  requester_name: string;
  requester_email: string;
  department: string;
  request_type: string;
  counter_party?: string;
  customer_type?: string;
  ip_product?: string;
  biz_segment?: string;
  pnl_owner?: string;
  region?: string;
  priority?: string;
  deadline?: string;
  description?: string;
  doc_link?: string;
  current_status?: string;
  is_confidential?: boolean;
  status_updated_by?: string;
}

// ── Row normaliser ────────────────────────────────────────────────────────────

function normaliseRow(row: typeof lcRequests.$inferSelect): LegalRequest {
  return {
    request_id:        row.request_id        ?? '',
    requester_name:    row.requester_name    ?? '',
    requester_email:   row.requester_email   ?? '',
    department:        row.department        ?? '',
    request_type:      row.request_type      ?? '',
    priority:          row.priority          ?? '',
    deadline:          row.deadline          ?? '',
    description:       row.description       ?? '',
    doc_link:          row.doc_link          ?? '',
    submitted_at:      row.submitted_at      ?? '',
    current_status:    row.current_status    ?? '',
    status_note:       row.status_note       ?? '',
    updated_at:        row.updated_at        ?? '',
    history_json:      row.history_json      ?? '[]',
    requested_by:      row.requested_by      ?? '',
    status_updated_by: row.status_updated_by ?? '',
    counter_party:     row.counter_party     ?? '',
    customer_type:     row.customer_type     ?? '',
    ip_product:        row.ip_product        ?? '',
    biz_segment:       row.biz_segment       ?? '',
    pnl_owner:         row.pnl_owner         ?? '',
    region:            row.region            ?? '',
    is_confidential:   Boolean(row.is_confidential),
  };
}

// ── ID generator — LGL-XXXX ───────────────────────────────────────────────────

async function generateRequestId(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const rows = await db
    .select({ request_id: lcRequests.request_id })
    .from(lcRequests)
    .orderBy(desc(lcRequests.request_id))
    .limit(200);

  let maxNum = 0;
  for (const r of rows) {
    const m = r.request_id.match(/^LGL-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return 'LGL-' + String(next).padStart(4, '0');
}

// ── Public API ────────────────────────────────────────────────────────────────

/** GET all requests, ordered by submitted_at DESC */
export async function getRequests(): Promise<LegalRequest[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(lcRequests)
    .orderBy(desc(lcRequests.submitted_at));
  return rows.map(normaliseRow);
}

/** INSERT a new request, returns the generated request_id */
export async function insertRequest(d: InsertRequestInput): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const request_id = await generateRequestId();
  const now = new Date().toISOString();

  const history = JSON.stringify([
    {
      status:    'request-raised',
      ts:        now,
      note:      'Request raised by ' + d.name,
      updatedBy: d.requestedBy || '',
    },
  ]);

  await db.insert(lcRequests).values({
    request_id,
    requester_name:    d.name           || '',
    requester_email:   d.email          || '',
    department:        d.dept           || '',
    request_type:      d.type           || '',
    priority:          d.priority       || '',
    // Live column is timestamptz — an empty string is not a valid timestamp literal, so
    // an unset (optional) deadline must be NULL rather than ''.
    deadline:          d.deadline       || null,
    description:       d.description    || '',
    doc_link:          d.docLink        || '',
    submitted_at:      now,
    current_status:    'request-raised',
    status_note:       '',
    updated_at:        now,
    history_json:      history,
    requested_by:      d.requestedBy    || '',
    counter_party:     d.counterParty   || '',
    customer_type:     d.customerType   || '',
    ip_product:        d.ipProduct      || '',
    biz_segment:       d.bizSegment     || '',
    pnl_owner:         d.pnlOwner       || '',
    region:            d.region         || '',
    is_confidential:   d.isConfidential ? 1 : 0,
    status_updated_by: '',
  });

  return request_id;
}

/** PATCH request status, note, history, and status_updated_by */
export async function patchRequest(
  id: string,
  status: string,
  note: string,
  history_json: string,
  statusUpdatedBy?: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const now = new Date().toISOString();
  await db
    .update(lcRequests)
    .set({
      current_status:    status,
      status_note:       note           || '',
      updated_at:        now,
      history_json:      history_json   || '[]',
      status_updated_by: statusUpdatedBy || '',
    })
    .where(eq(lcRequests.request_id, id));
}

/** Full-row UPDATE for all editable fields (admin only — enforced at router level) */
export async function updateFullRequest(d: UpdateRequestInput): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const now = new Date().toISOString();
  await db
    .update(lcRequests)
    .set({
      requester_name:    d.requester_name    || '',
      requester_email:   d.requester_email   || '',
      department:        d.department        || '',
      request_type:      d.request_type      || '',
      counter_party:     d.counter_party     || '',
      customer_type:     d.customer_type     || '',
      ip_product:        d.ip_product        || '',
      biz_segment:       d.biz_segment       || '',
      pnl_owner:         d.pnl_owner         || '',
      region:            d.region            || '',
      priority:          d.priority          || '',
      deadline:          d.deadline          || null,
      description:       d.description       || '',
      doc_link:          d.doc_link          || '',
      current_status:    d.current_status    || 'request-raised',
      is_confidential:   d.is_confidential   ? 1 : 0,
      status_updated_by: d.status_updated_by || '',
      updated_at:        now,
    })
    .where(eq(lcRequests.request_id, d.request_id));
}

/** DELETE a request by request_id (admin only — enforced at router level) */
export async function deleteRequest(id: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  await db
    .delete(lcRequests)
    .where(eq(lcRequests.request_id, id));
}
