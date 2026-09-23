/**
 * Legal Connect tRPC router
 * Mirrors all /api/* endpoints from finops_v1/finops_legal/server.js
 * Data source: Google Sheets (SPREADSHEET_ID = 1WDJvLMJw_9Fz2CwV0IYentqOXEoc8vbo-x1vhrvQw3k)
 */

import { z } from 'zod';
import { publicProcedure, router } from './_core/trpc';
import { getSheetData, normalizeStatus, getSheetLastFetched } from './legalSheets';
import { getDisputeChartData, getTMSheetRows, getClaimsByFyndRows, getClaimsAgainstFyndRows } from './disputeSheets';
import { getRequests, insertRequest, patchRequest, deleteRequest, updateFullRequest, setSignedDoc, type LegalRequest } from './legalBigQuery';
import { listDownloadDocs, insertDownloadDoc, deleteDownloadDoc, formatFileSize } from './legalDownloads';
import { getLcUser } from './lcAuthRouter';
import { storagePut } from './storage';

// ─── Slack notification helper ───────────────────────────────────────────────
const LC_SLACK_CHANNEL = 'C0B40G1E02C'; // #legal-connect-requests
const LC_SLACK_TAGS    = '<@U092K3G6PRQ> <@U0AC7RFUHL5>';

async function sendLcSlackNotification(req: {
  name: string;
  counterParty: string;
  type: string;
  ipProduct: string;
  bizSegment: string;
  pnlOwner: string;
  raisedAt: string;
  request_id: string;
}): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🔔  Legal Connect (LC) — New Request', emoji: true },
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Request ID*\n${req.request_id}` },
        { type: 'mrkdwn', text: `*Raised At*\n${req.raisedAt}` },
        { type: 'mrkdwn', text: `*Requestor Name*\n${req.name || '—'}` },
        { type: 'mrkdwn', text: `*Counterparty Legal Name*\n${req.counterParty || '—'}` },
        { type: 'mrkdwn', text: `*Request Type*\n${req.type || '—'}` },
        { type: 'mrkdwn', text: `*IP / Product*\n${req.ipProduct || '—'}` },
        { type: 'mrkdwn', text: `*Business Segment*\n${req.bizSegment || '—'}` },
        { type: 'mrkdwn', text: `*PNL Owner*\n${req.pnlOwner || '—'}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `${LC_SLACK_TAGS} — please review this new request.` },
      ],
    },
  ];

  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: LC_SLACK_CHANNEL,
        text: `🔔 Legal Connect (LC) — New Request ${req.request_id} from ${req.name}`,
        blocks,
      }),
    });
  } catch (err) {
    console.error('[LC Slack] Failed to send notification:', err);
  }
}

// Admin email list — only these users can delete workflow cards and update status
const LC_ADMIN_EMAILS = new Set([
  'ninadmandavkar@gofynd.com',
  'aditisinha@gofynd.com',
  'samikshap@gofynd.com',
  'farheenansari@gofynd.com',
]);

// Deal Value is waived only for this exact Request Type (matches the New Request form's dropdown literal)
const NDA_REQUEST_TYPE = 'NDA Drafting / Review';

// ─── Live Tracker: unify Google Sheet rows (history) with Postgres Workflow requests (going forward) ──
interface TrackerRow {
  Request_Date: string;
  Brand_Name: string;
  Customer_Type: string;
  Business_Segment: string;
  Document_type: string;
  Current_Status: string;
  End_Date: string;
  Deal_Value: string;
  Ageing: string;
  Reviewer: string;
  Signed_Doc_Link: string;
  Drive_Doc_URL: string;
  Description_Docs: string;
}

// Broken spreadsheet formulas (#REF!, #N/A, etc.) sometimes leak raw into a cell's text value.
// Strip those out at the source rather than showing them to users.
const SHEET_FORMULA_ERROR = /^#(REF|N\/A|VALUE|DIV\/0|NAME\?|NULL|NUM)!?$/i;
function cleanSheetValue(v: string): string {
  const trimmed = (v || '').trim();
  return SHEET_FORMULA_ERROR.test(trimmed) ? '' : v || '';
}

function mapSheetRow(r: Record<string, string>): TrackerRow {
  return {
    Request_Date:     r['Request Date'] || '',
    Brand_Name:       r['Counter Party Legal Name'] || '',
    Customer_Type:    r['Counter Party Type'] || '',
    Business_Segment: r['Business Segment'] || '',
    Document_type:    r['Document Type'] || '',
    Current_Status:   normalizeStatus(r['Status'] || ''),
    End_Date:         r['Last Updated'] || '',
    Deal_Value:       r['Deal Value'] || '',
    Ageing:           cleanSheetValue(r['Ageing']),
    Reviewer:         r['Reviewer'] || '',
    Signed_Doc_Link:  r['Signed Doc Link'] || '',
    Drive_Doc_URL:    r['Link'] || '',
    Description_Docs: r['Description (Docs)'] || '',
  };
}

// Collapses Workflow's granular stage id into Live Tracker's coarse status vocabulary
const WORKFLOW_STATUS_MAP: Record<string, string> = {
  'executed':           'Closed',
  'rejected':            'Closed',
  'on-hold':             'On Hold',
  'pending-business':    'Pending',
  'pending-finance':     'Pending',
  'pending-client':      'Pending',
  'sent-for-signature':  'Pending',
  'request-raised':      'Open',
  'under-legal-review':  'Open',
};

function collapseWorkflowStatus(stage: string): string {
  return WORKFLOW_STATUS_MAP[stage] || 'Open';
}

function computeAgeing(submittedAt: string, updatedAt: string, currentStatus: string): string {
  const start = new Date(submittedAt).getTime();
  if (isNaN(start)) return '';
  const endTime = currentStatus === 'executed' ? new Date(updatedAt).getTime() : Date.now();
  const end = isNaN(endTime) ? Date.now() : endTime;
  const days = Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  return String(days);
}

// Workflow's deal_value is always a plain INR decimal string (numeric column on lc_requests),
// unlike the Sheet's freeform Deal Value column which mixes currencies/units/text — so only
// this side is safe to reformat consistently.
function formatInrValue(value: string): string {
  if (!value) return '';
  const n = parseFloat(value);
  if (isNaN(n)) return value;
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function mapPgRow(d: LegalRequest): TrackerRow {
  const signedDocUrl = d.signed_doc_key
    ? `/api/download?key=${encodeURIComponent(d.signed_doc_key)}&name=${encodeURIComponent(d.signed_doc_name || d.signed_doc_key)}`
    : '';
  return {
    Request_Date:     d.submitted_at,
    Brand_Name:       d.counter_party,
    Customer_Type:    d.customer_type,
    Business_Segment: d.biz_segment,
    Document_type:    d.request_type,
    Current_Status:   collapseWorkflowStatus(d.current_status),
    End_Date:         d.updated_at,
    Deal_Value:       formatInrValue(d.deal_value),
    Ageing:           computeAgeing(d.submitted_at, d.updated_at, d.current_status),
    Reviewer:         d.status_updated_by || d.requested_by,
    Signed_Doc_Link:  d.signed_doc_name,
    Drive_Doc_URL:    signedDocUrl,
    Description_Docs: d.description,
  };
}

// Google Sheet history + Postgres Workflow requests, unified — the single source every
// Dashboard/Live Tracker/Team procedure below reads from, so none of them silently drift
// out of sync as new requests move from the Sheet to the Workflow system.
async function getMergedTrackerRows(): Promise<TrackerRow[]> {
  const [sheetRows, pgRequests] = await Promise.all([getSheetData(), getRequests()]);
  return [...sheetRows.map(mapSheetRow), ...pgRequests.map(mapPgRow)];
}

export const legalRouter = router({

  /** Dashboard KPI cards */
  kpis: publicProcedure.query(async () => {
    const rows = await getMergedTrackerRows();
    let open_count = 0, closed_count = 0, on_hold_count = 0, pending_count = 0;
    const reviewers = new Set<string>();

    for (const r of rows) {
      if (r.Current_Status === 'Open')         open_count++;
      else if (r.Current_Status === 'Closed')  closed_count++;
      else if (r.Current_Status === 'On Hold') on_hold_count++;
      else if (r.Current_Status === 'Pending') pending_count++;
      const rev = (r.Reviewer || '').trim();
      if (rev) reviewers.add(rev);
    }

    return {
      total:          rows.length,
      open_count,
      closed_count,
      on_hold_count,
      pending_count,
      reviewer_count: reviewers.size,
    };
  }),

  /** Donut chart: contract status breakdown */
  chartStatus: publicProcedure.query(async () => {
    const rows = await getMergedTrackerRows();
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (r.Current_Status) counts[r.Current_Status] = (counts[r.Current_Status] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([status, cnt]) => ({ status, cnt }))
      .sort((a, b) => b.cnt - a.cnt);
  }),

  /** Bar chart: top 6 document types */
  chartDoctypes: publicProcedure.query(async () => {
    const rows = await getMergedTrackerRows();
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const dt = (r.Document_type || '').trim();
      if (dt) counts[dt] = (counts[dt] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([label, cnt]) => ({ label, cnt }))
      .sort((a, b) => b.cnt - a.cnt)
      .slice(0, 6);
  }),

  /** Stacked bar: Open/Closed/On Hold/Pending per region (Business Segment) */
  chartRegionStatus: publicProcedure.query(async () => {
    const rows = await getMergedTrackerRows();
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const region = (r.Business_Segment || '').trim() || 'Unknown';
      const status = r.Current_Status;
      if (!status) continue;
      const key = `${region}|${status}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([key, cnt]) => {
        const [region, status] = key.split('|');
        return { region, status, cnt };
      })
      .sort((a, b) => a.region.localeCompare(b.region) || a.status.localeCompare(b.status));
  }),

  /** Last 10 contracts for dashboard table */
  recent: publicProcedure.query(async () => {
    const rows = await getMergedTrackerRows();
    const parseRequestDate = (s: string) => {
      const t = new Date(s).getTime();
      return isNaN(t) ? 0 : t;
    };
    const sorted = [...rows].sort((a, b) =>
      parseRequestDate(b.Request_Date) - parseRequestDate(a.Request_Date)
    );
    return sorted.slice(0, 10).map(r => ({
      Brand_Name:        (r.Brand_Name || '—').trim() || '—',
      Document_type:     (r.Document_type || '').trim(),
      Description_Docs:  (r.Description_Docs || '').trim(),
      Business_Segment:  (r.Business_Segment || '').trim(),
      Current_Status:    r.Current_Status,
      Request_Date:      (r.Request_Date || '').trim(),
      Reviewer:          (r.Reviewer || '').trim(),
    }));
  }),

  /** Full contract list for Live Tracker */
  contracts: publicProcedure
    .input(z.object({
      status:       z.string().optional(),
      segment:      z.string().optional(),
      docType:      z.string().optional(),
      customerType: z.string().optional(),
      search:       z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const i = input || {};
      let rows: TrackerRow[] = await getMergedTrackerRows();

      if (i.status)       rows = rows.filter(r => r.Current_Status === i.status);
      if (i.segment)      rows = rows.filter(r => r.Business_Segment === i.segment);
      if (i.docType)      rows = rows.filter(r => r.Document_type === i.docType);
      if (i.customerType) rows = rows.filter(r => r.Customer_Type === i.customerType);
      if (i.search) {
        const q = i.search.toLowerCase();
        rows = rows.filter(r =>
          Object.values(r).some(v => String(v).toLowerCase().includes(q))
        );
      }

      const parseRequestDate = (s: string) => {
        const t = new Date(s).getTime();
        return isNaN(t) ? 0 : t;
      };
      rows = [...rows].sort((a, b) =>
        parseRequestDate(b.Request_Date) - parseRequestDate(a.Request_Date)
      );

      return rows;
    }),

  /** Filter options for Live Tracker dropdowns */
  filterOptions: publicProcedure.query(async () => {
    const rows = await getMergedTrackerRows();
    const segments  = new Set<string>();
    const docTypes  = new Set<string>();
    const custTypes = new Set<string>();

    for (const r of rows) {
      const seg = (r.Business_Segment || '').trim();
      const dt  = (r.Document_type || '').trim();
      const ct  = (r.Customer_Type || '').trim();
      if (seg) segments.add(seg);
      if (dt)  docTypes.add(dt);
      if (ct)  custTypes.add(ct);
    }

    return {
      segments:      Array.from(segments).sort(),
      docTypes:      Array.from(docTypes).sort(),
      customerTypes: Array.from(custTypes).sort(),
    };
  }),

  /** Distinct dropdown options from Google Sheets for the request form */
  formOptions: publicProcedure.query(async () => {
    const rows = await getSheetData();
    const customer_types    = new Set<string>();
    const ip_products       = new Set<string>();
    const business_segments = new Set<string>();
    const pnl_owners        = new Set<string>();
    const regions           = new Set<string>();
    for (const r of rows) {
      const ct  = String(r['Counter Party Type'] || '').trim();
      const ip  = String(r['IP/Product']         || '').trim();
      const bs  = String(r['Business Segment']   || '').trim();
      const pnl = String(r['PNL Owner']          || '').trim();
      if (ct)  customer_types.add(ct);
      if (ip)  ip_products.add(ip);
      if (bs)  { business_segments.add(bs); regions.add(bs); }
      if (pnl) pnl_owners.add(pnl);
    }
    return {
      customer_types:    Array.from(customer_types).sort(),
      ip_products:       Array.from(ip_products).sort(),
      business_segments: Array.from(business_segments).sort(),
      pnl_owners:        Array.from(pnl_owners).sort(),
      regions:           Array.from(regions).sort(),
    };
  }),

  /** Get all legal requests from MySQL (lc_requests table) */
  getRequests: publicProcedure.query(async () => {
    return getRequests();
  }),

  /** Submit a new legal request to MySQL (lc_requests table) */
  submitRequest: publicProcedure
    .input(z.object({
      name:           z.string().min(1),
      email:          z.string().email(),
      dept:           z.string().min(1),
      type:           z.string().min(1),
      counterParty:   z.string().default(''),
      customerType:   z.string().default(''),
      ipProduct:      z.string().default(''),
      bizSegment:     z.string().default(''),
      pnlOwner:       z.string().default(''),
      region:         z.string().default(''),
      priority:       z.string().default('Normal (48 hrs)'),
      deadline:       z.string().default(''),
      description:    z.string().min(1),
      docLink:        z.string().default(''),
      requestedBy:    z.string().optional(),
      isConfidential: z.boolean().default(false),
      dealValue:      z.string().optional(),
    }).superRefine((val, ctx) => {
      if (val.type !== NDA_REQUEST_TYPE && !val.dealValue?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dealValue'], message: 'Deal Value is required unless the request type is NDA Drafting / Review.' });
      }
    }))
    .mutation(async ({ input }) => {
      const request_id = await insertRequest(input);
      // Fire-and-forget Slack notification — do not await so it never blocks the response
      const raisedAt = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
      sendLcSlackNotification({
        request_id,
        name:        input.name,
        counterParty: input.counterParty,
        type:        input.type,
        ipProduct:   input.ipProduct,
        bizSegment:  input.bizSegment,
        pnlOwner:    input.pnlOwner,
        raisedAt,
      });
      return { request_id };
    }),

  /** Update request status (admin only) */
  updateRequestStatus: publicProcedure
    .input(z.object({
      id:              z.string(),
      status:          z.string(),
      note:            z.string().default(''),
      history_json:    z.string().default('[]'),
      statusUpdatedBy: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const lcUser = await getLcUser(ctx.req);
      if (!lcUser || !LC_ADMIN_EMAILS.has(lcUser.email)) {
        throw new Error('FORBIDDEN: admin access required');
      }
      await patchRequest(input.id, input.status, input.note, input.history_json, input.statusUpdatedBy);
      return { ok: true };
    }),

  /** Full-row update of a request (admin only) */
  updateRequest: publicProcedure
    .input(z.object({
      request_id:       z.string().min(1),
      requester_name:   z.string().min(1),
      requester_email:  z.string().email(),
      department:       z.string().min(1),
      request_type:     z.string().min(1),
      counter_party:    z.string().default(''),
      customer_type:    z.string().default(''),
      ip_product:       z.string().default(''),
      biz_segment:      z.string().default(''),
      pnl_owner:        z.string().default(''),
      region:           z.string().default(''),
      priority:         z.string().default('Normal (48 hrs)'),
      deadline:         z.string().default(''),
      description:      z.string().default(''),
      doc_link:         z.string().default(''),
      current_status:   z.string().default('request-raised'),
      is_confidential:  z.boolean().default(false),
      deal_value:       z.string().optional(),
    }).superRefine((val, ctx) => {
      if (val.request_type !== NDA_REQUEST_TYPE && !val.deal_value?.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['deal_value'], message: 'Deal Value is required unless the request type is NDA Drafting / Review.' });
      }
    }))
    .mutation(async ({ input, ctx }) => {
      const lcUser = await getLcUser(ctx.req);
      if (!lcUser || !LC_ADMIN_EMAILS.has(lcUser.email)) {
        throw new Error('FORBIDDEN: admin access required');
      }
      await updateFullRequest({
        ...input,
        status_updated_by: lcUser.name || lcUser.email,
      });
      return { ok: true };
    }),

  /** Delete a workflow request (admin only) */
  deleteRequest: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const lcUser = await getLcUser(ctx.req);
      if (!lcUser || !LC_ADMIN_EMAILS.has(lcUser.email)) {
        throw new Error('FORBIDDEN: admin access required');
      }
      await deleteRequest(input.id);
      return { ok: true };
    }),

  /** Resolve a storage key to our own download-proxy URL */
  getDownloadUrl: publicProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ input }) => {
      // Strip leading /manus-storage/ prefix if present
      const key = input.key.replace(/^\/manus-storage\//, '');
      return { url: `/api/download?key=${encodeURIComponent(key)}` };
    }),

  /** Upload the signed/executed copy of a request's document (admin only) */
  uploadSignedDocument: publicProcedure
    .input(z.object({
      id:           z.string().min(1),
      fileName:     z.string().min(1),
      fileBase64:   z.string().min(1),
      contentType:  z.string().default('application/octet-stream'),
    }))
    .mutation(async ({ input, ctx }) => {
      const lcUser = await getLcUser(ctx.req);
      if (!lcUser || !LC_ADMIN_EMAILS.has(lcUser.email)) {
        throw new Error('FORBIDDEN: admin access required');
      }
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const { key } = await storagePut(`legal/signed-docs/${input.id}/${input.fileName}`, buffer, input.contentType);
      await setSignedDoc(input.id, key, input.fileName);
      return { key, name: input.fileName };
    }),

  /** List every document in the Downloads repository */
  listDownloads: publicProcedure.query(async () => {
    const rows = await listDownloadDocs();
    return { rows };
  }),

  /** Upload a new document into the Downloads repository (admin only) */
  uploadDownloadDoc: publicProcedure
    .input(z.object({
      region:       z.enum(['india', 'mea', 'uk']),
      category:     z.enum(['agreements', 'kyc']),
      cardName:     z.string().min(1),
      fileName:     z.string().min(1),
      fileBase64:   z.string().min(1),
      contentType:  z.string().default('application/octet-stream'),
    }))
    .mutation(async ({ input, ctx }) => {
      const lcUser = await getLcUser(ctx.req);
      if (!lcUser || !LC_ADMIN_EMAILS.has(lcUser.email)) {
        throw new Error('FORBIDDEN: admin access required');
      }
      const buffer = Buffer.from(input.fileBase64, 'base64');
      const { key } = await storagePut(
        `legal/downloads/${input.region}/${input.category}/${input.cardName}/${input.fileName}`,
        buffer,
        input.contentType,
      );
      await insertDownloadDoc({
        region:     input.region,
        category:   input.category,
        cardName:   input.cardName,
        docName:    input.fileName,
        docSize:    formatFileSize(buffer.length),
        storageKey: key,
        uploadedBy: lcUser.name || lcUser.email,
      });
      return { ok: true };
    }),

  /** Remove a document from the Downloads repository (admin only) */
  deleteDownloadDoc: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const lcUser = await getLcUser(ctx.req);
      if (!lcUser || !LC_ADMIN_EMAILS.has(lcUser.email)) {
        throw new Error('FORBIDDEN: admin access required');
      }
      await deleteDownloadDoc(input.id);
      return { ok: true };
    }),

  /** Per-reviewer team stats */
  teamStats: publicProcedure.query(async () => {
    const lastUpdated = getSheetLastFetched()?.toISOString() ?? null;
    const rows = await getMergedTrackerRows();
    const memberData: Record<string, {
      total: number; open_count: number; closed_count: number;
      on_hold_count: number; pending_count: number; ageing_sum: number; ageing_cnt: number;
      doc_counts: Record<string, number>;
    }> = {};

    for (const r of rows) {
      const reviewer = (r.Reviewer || '').trim();
      if (!reviewer) continue;
      const parts = reviewer.split('/').map(p => p.trim()).filter(Boolean);
      for (const part of parts) {
        const pl = part.toLowerCase();
        let member: string | null = null;
        if (pl.includes('farheen'))                           member = 'Farheen';
        else if (pl.includes('aditi'))                        member = 'Aditi';
        else if (pl.includes('samiksha'))                     member = 'Samiksha';
        else if (pl.includes('sresth') || pl.includes('shresth')) member = 'Sreshta';
        if (!member) continue;

        if (!memberData[member]) {
          memberData[member] = { total: 0, open_count: 0, closed_count: 0,
            on_hold_count: 0, pending_count: 0, ageing_sum: 0, ageing_cnt: 0, doc_counts: {} };
        }
        const md = memberData[member];
        md.total++;
        if (r.Current_Status === 'Open')         md.open_count++;
        else if (r.Current_Status === 'Closed')  md.closed_count++;
        else if (r.Current_Status === 'On Hold') md.on_hold_count++;
        else if (r.Current_Status === 'Pending') md.pending_count++;
        const days = parseInt(r.Ageing || '', 10);
        if (!isNaN(days)) { md.ageing_sum += days; md.ageing_cnt++; }
        const dt = (r.Document_type || '').trim();
        if (dt) md.doc_counts[dt] = (md.doc_counts[dt] || 0) + 1;
      }
    }

    const members = Object.entries(memberData).map(([member, md]) => {
      let top_doc_type: string | null = null;
      let maxCnt = 0;
      for (const [dt, cnt] of Object.entries(md.doc_counts)) {
        if (cnt > maxCnt) { maxCnt = cnt; top_doc_type = dt; }
      }
      return {
        member,
        total:           md.total,
        open_count:      md.open_count,
        closed_count:    md.closed_count,
        on_hold_count:   md.on_hold_count,
        pending_count:   md.pending_count,
        avg_ageing_days: md.ageing_cnt > 0 ? Math.round(md.ageing_sum / md.ageing_cnt) : null,
        top_doc_type,
      };
    }).sort((a, b) => b.total - a.total);
    return { members, lastUpdated };
  }),

  /** Dispute & Litigation Tracker chart data (all 4 sheets) */
  disputeTrackerCharts: publicProcedure.query(async () => {
    return await getDisputeChartData();
  }),

  /** Raw TM Master sheet rows for table display (columns up to Valid Upto) */
  tmSheetRows: publicProcedure.query(async () => {
    const TM_COLUMNS = [
      'Trademark Name',
      'Trademark Image',
      'Nature',
      'Class',
      'Status',
      'Application No.',
      'Certificate Sr. No.',
      'Certificate Start Date',
      'Valid Upto',
    ];
    const rows = await getTMSheetRows();
    return rows.map(row => {
      const out: Record<string, string> = {};
      for (const col of TM_COLUMNS) {
        // flexible key match
        const key = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g,'').includes(col.toLowerCase().replace(/[^a-z0-9]/g,'')));
        out[col] = key ? (row[key] || '') : '';
      }
      return out;
    });
  }),

  /** Raw "Claims By Fynd" sheet rows for the Litigation tab */
  claimsByFyndRows: publicProcedure.query(async () => {
    const COLUMNS = [
      'Company Name',
      'Date of Default',
      'Cause of Action',
      'Net Recoverable Amount',
      'Matter Handled by',
      'Contract Termination Date',
      'Demand Notice Date',
      'Legal Notice Date',
      'Arbitration Notice Date',
      'Ageing Analysis',
      'Status',
    ];
    const rows = await getClaimsByFyndRows();
    return rows.map(row => {
      const out: Record<string, string> = {};
      for (const col of COLUMNS) {
        const key = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g,'').includes(col.toLowerCase().replace(/[^a-z0-9]/g,'')));
        out[col] = key ? (row[key] || '') : '';
      }
      return out;
    });
  }),

  /** Raw "Claims Against Fynd" sheet rows for the Litigation tab */
  claimsAgainstFyndRows: publicProcedure.query(async () => {
    const COLUMNS = [
      'Company Name',
      'Amount in Dispute',
      'Cause of Action',
      'Account Manager',
      'Matter Handled By',
      'Notice Received On',
      'Arbitration Notice Date',
      'Status',
    ];
    const rows = await getClaimsAgainstFyndRows();
    return rows.map(row => {
      const out: Record<string, string> = {};
      for (const col of COLUMNS) {
        const key = Object.keys(row).find(k => k.toLowerCase().replace(/[^a-z0-9]/g,'').includes(col.toLowerCase().replace(/[^a-z0-9]/g,'')));
        out[col] = key ? (row[key] || '') : '';
      }
      return out;
    });
  }),
});
