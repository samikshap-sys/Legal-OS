/**
 * Brand Ledger Router
 *
 * Payable Claims endpoints  → fynd-db.Outstanding.12_claim_payable
 *   POST /api/brand-ledger/payable/kpi
 *   POST /api/brand-ledger/payable/preview
 *   POST /api/brand-ledger/payable/download
 *
 * Payable Bags endpoints    → fynd-db.Outstanding.09_Payable_File_table
 *   POST /api/brand-ledger/bags/kpi
 *   POST /api/brand-ledger/bags/preview
 *   POST /api/brand-ledger/bags/download
 */
import { Router } from "express";
import { BigQuery } from "@google-cloud/bigquery";
import * as XLSX from "xlsx";
import { getDb } from "./db";
import { brandLedgerActivityLog, brandLedgerDownloadJobs, brandLedgerQueryJobs } from "../drizzle/schema";
import { desc } from "drizzle-orm";
import { createRequire } from "module";
import type { Request, Response } from "express";
import { storagePut, storageGetSignedUrl } from "./storage";
const _require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ExcelJS = _require("exceljs") as typeof import("exceljs");

/**
 * directDownload — sends an Excel file directly in the HTTP response.
 * Sets X-Accel-Buffering: no + Connection: keep-alive + flushHeaders()
 * BEFORE the async work so nginx keeps the connection alive while BQ runs.
 */
async function directDownload(
  res: Response,
  filename: string,
  work: () => Promise<Buffer>
): Promise<void> {
  // Tell nginx: don't buffer this response, don't apply your own timeout
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Transfer-Encoding", "chunked");
  res.flushHeaders(); // send headers to nginx immediately — keeps connection alive
  try {
    const buf = await work();
    res.end(buf);
  } catch (e: unknown) {
    // Headers already sent — we can't send a JSON error, just end the stream
    console.error("[BrandLedger] directDownload error:", e);
    res.end();
  }
}

import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

/**
 * startJob — starts an async Excel generation job.
 * Returns {jobId} immediately. Background work runs BQ queries, stores result in DB.
 * Frontend polls GET /download-job/:jobId/status, then GET /download-job/:jobId/file.
 */
type ProgressUpdater = (step: number, msg: string) => Promise<void>;

async function startJob(
  filename: string,
  work: (progress: ProgressUpdater) => Promise<Buffer>,
  contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
): Promise<string> {
  const jobId = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour TTL
  const db = await getDb();
  await db!.insert(brandLedgerDownloadJobs).values({
    id: jobId,
    status: "running",
    filename,
    expiresAt,
  });
  // Progress updater — writes step + message to DB so frontend can poll it
  const progress: ProgressUpdater = async (step: number, msg: string) => {
    await db!.update(brandLedgerDownloadJobs)
      .set({ progressStep: step, progressMsg: msg })
      .where(eq(brandLedgerDownloadJobs.id, jobId));
  };
  // Run in background (don't await)
  (async () => {
    try {
      const buf = await work(progress);
      // Upload to S3 — storagePut appends a hash suffix to the key, so save the returned key
      const s3InputKey = `brand-ledger-downloads/${jobId}/${filename}`;
      const { key: actualKey } = await storagePut(s3InputKey, buf, contentType);
      await db!.update(brandLedgerDownloadJobs)
        .set({ status: "done", fileKey: actualKey })
        .where(eq(brandLedgerDownloadJobs.id, jobId));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[BrandLedger] job error:", msg);
      await db!.update(brandLedgerDownloadJobs)
        .set({ status: "error", errorMsg: msg })
        .where(eq(brandLedgerDownloadJobs.id, jobId));
    }
  })();
  return jobId;
}

/**
 * startQueryJob — starts an async BQ query job.
 * Returns {jobId} immediately. Background work runs BQ queries, stores JSON result in S3.
 * Only the S3 key is stored in the DB to avoid large TEXT writes.
 * Frontend polls GET /query-job/:jobId/status, then GET /query-job/:jobId/result.
 */
async function startQueryJob(
  work: () => Promise<Record<string, unknown>>
): Promise<string> {
  const jobId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min TTL
  const db = await getDb();
  await db!.insert(brandLedgerQueryJobs).values({
    id: jobId,
    status: "running",
    expiresAt,
  });
  // Run in background (don't await)
  (async () => {
    try {
      const result = await work();
      // Store result JSON in S3 to avoid large TEXT writes to DB
      const { key } = await storagePut(
        `brand-ledger-query-jobs/${jobId}.json`,
        Buffer.from(JSON.stringify(result), "utf8"),
        "application/json"
      );
      await db!.update(brandLedgerQueryJobs)
        .set({ status: "done", resultKey: key })
        .where(eq(brandLedgerQueryJobs.id, jobId));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[BrandLedger] query job error:", msg);
      await db!.update(brandLedgerQueryJobs)
        .set({ status: "error", errorMsg: msg })
        .where(eq(brandLedgerQueryJobs.id, jobId));
    }
  })();
  return jobId;
}

const BQ_PROJECT    = "fynd-db";
const CLAIMS_TABLE  = "fynd-db.Outstanding.12_claim_payable";
const BAGS_TABLE    = "fynd-db.Outstanding.09_Payable_File_table";
const AR_TABLE      = "fynd-db.finance_dwh.AR_Ageing";
const PAYOUT_TABLE  = "fynd-db.finance_recon_tool_asia.Bag_Wise_Payout_Report";

// ── BQ client singleton ───────────────────────────────────────────────────────
let _bqClient: BigQuery | null = null;
function getBqClient(): BigQuery {
  if (_bqClient) return _bqClient;
  const credsRaw = process.env.BQ_SERVICE_ACCOUNT_JSON || "";
  if (!credsRaw) throw new Error("BQ_SERVICE_ACCOUNT_JSON not set");
  const credentials = JSON.parse(credsRaw);
  _bqClient = new BigQuery({ projectId: BQ_PROJECT, credentials });
  return _bqClient;
}

// ── Serialize BQ values ───────────────────────────────────────────────────────
function serializeValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("value" in obj) return String(obj.value);
    if (typeof obj.toString === "function") return obj.toString();
    return JSON.stringify(v);
  }
  return v as string | number | boolean;
}

// ── BQ retry helpers (handles "Rate exceeded" / transient errors) ────────────
const BQ_RETRYABLE = ["rate exceeded", "quota exceeded", "too many requests", "backend error", "503", "500"];

async function retryBqQuery(
  bq: import("@google-cloud/bigquery").BigQuery,
  sql: string,
  maxRetries = 4
): Promise<Record<string, unknown>[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const [rows] = await bq.query({ query: sql, useLegacySql: false });
      return rows as Record<string, unknown>[];
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const isRetryable = BQ_RETRYABLE.some(k => msg.includes(k));
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[BrandLedger] BQ rate limit (query, attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms…`);
      await new Promise(r => setTimeout(r, delay));
      lastErr = err;
    }
  }
  throw lastErr;
}

async function retryCreateJob(
  bq: import("@google-cloud/bigquery").BigQuery,
  query: string,
  maxRetries = 4
): Promise<import("@google-cloud/bigquery").Job> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const [job] = await bq.createQueryJob({ query, useLegacySql: false });
      return job;
    } catch (err: unknown) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const isRetryable = BQ_RETRYABLE.some(k => msg.includes(k));
      if (!isRetryable || attempt === maxRetries) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[BrandLedger] BQ rate limit (createJob, attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms…`);
      await new Promise(r => setTimeout(r, delay));
      lastErr = err;
    }
  }
  throw lastErr;
}
// ── Generic WHERE builder (recon_date filter) ─────────────────────────────────
function buildWhere(
  companyId: string,
  fromDate: string,
  toDate: string,
  companyField = "company_id"
): string {
  const parts: string[] = [];
  if (companyId && companyId.trim()) {
    const trimmed = companyId.trim();
    // company_id is INT64 in BQ — use integer comparison when input is numeric
    if (/^\d+$/.test(trimmed)) {
      parts.push(`${companyField} = ${parseInt(trimmed, 10)}`);
    } else {
      parts.push(`CAST(${companyField} AS STRING) = '${trimmed.replace(/'/g, "''")}'`);
    }
  }
  if (fromDate) parts.push(`DATE(recon_date) >= DATE('${fromDate}')`);
  if (toDate)   parts.push(`DATE(recon_date) <= DATE('${toDate}')`);
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

// ── Generic full-download helper ──────────────────────────────────────────────
async function downloadAll(
  table: string,
  where: string
): Promise<{ columns: string[]; rows: (string | number | boolean | null)[][] }> {
  const query = `SELECT * FROM \`${table}\` ${where}`;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, query);
  const allRows: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  let columns: string[] = [];
  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts: any = { maxResults: 5000, autoPaginate: false };
    if (pageToken) opts.pageToken = pageToken;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await job.getQueryResults(opts) as any;
    const rows = result[0] as Record<string, unknown>[];
    const metadata = result[2] as Record<string, unknown> & {
      schema?: { fields?: { name: string }[] };
      pageToken?: string;
    };
    if (columns.length === 0) {
      columns = (metadata?.schema?.fields ?? []).map((f: { name: string }) => f.name);
    }
    allRows.push(...rows);
    pageToken = metadata?.pageToken;
  } while (pageToken);
  const serialized = allRows.map((row) => columns.map((col) => serializeValue(row[col])));
  return { columns, rows: serialized };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYABLE CLAIMS  (12_claim_payable)
// ═══════════════════════════════════════════════════════════════════════════════

async function queryPayableKpi(
  companyId: string, fromDate: string, toDate: string
): Promise<{ net_payable_claim: number; shipment_count: number }> {
  const where = buildWhere(companyId, fromDate, toDate);
  const query = `
    SELECT
      COALESCE(SUM(claimable_amt), 0)         AS net_payable_claim,
      COUNT(DISTINCT forward_shipment_id)      AS shipment_count
    FROM \`${CLAIMS_TABLE}\`
    ${where}
  `;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, query);
  const [rows] = await job.getQueryResults({ maxResults: 1, autoPaginate: false });
  const row = rows[0] as Record<string, unknown>;
  return {
    net_payable_claim: Number(serializeValue(row["net_payable_claim"]) ?? 0),
    shipment_count:    Number(serializeValue(row["shipment_count"]) ?? 0),
  };
}

async function queryPayablePreview(
  companyId: string, fromDate: string, toDate: string
): Promise<{ columns: string[]; rows: (string | number | boolean | null)[][]; totalPreview: number }> {
  const where = buildWhere(companyId, fromDate, toDate);
  const query = `
    SELECT
      CAST(company_id AS STRING)    AS company_id,
      fynd_order_id                 AS order_id,
      forward_shipment_id           AS shipment_id,
      transaction_type              AS type,
      CAST(recon_date AS STRING)    AS recon_date,
      claimable_amt
    FROM \`${CLAIMS_TABLE}\`
    ${where}
    LIMIT 20
  `;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, query);
  const [rows, , metadata] = await job.getQueryResults({ maxResults: 20, autoPaginate: false });
  const schema = (metadata as Record<string, unknown> & {
    schema?: { fields?: { name: string }[] };
  })?.schema?.fields ?? [];
  const columns = schema.map((f: { name: string }) => f.name);
  const serialized = rows.map((row: Record<string, unknown>) =>
    columns.map((col) => serializeValue(row[col]))
  );
  return { columns, rows: serialized, totalPreview: serialized.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYABLE BAGS  (09_Payable_File_table)
// ═══════════════════════════════════════════════════════════════════════════════

async function queryBagsKpi(
  companyId: string, fromDate: string, toDate: string
): Promise<{ payable_seller_sale: number; bag_count: number }> {
  const where = buildWhere(companyId, fromDate, toDate);
  const query = `
    SELECT
      COALESCE(SUM(seller_net_collection), 0)  AS payable_seller_sale,
      COUNT(bag_id)                             AS bag_count
    FROM \`${BAGS_TABLE}\`
    ${where}
  `;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, query);
  const [rows] = await job.getQueryResults({ maxResults: 1, autoPaginate: false });
  const row = rows[0] as Record<string, unknown>;
  return {
    payable_seller_sale: Number(serializeValue(row["payable_seller_sale"]) ?? 0),
    bag_count:           Number(serializeValue(row["bag_count"]) ?? 0),
  };
}

async function queryBagsPreview(
  companyId: string, fromDate: string, toDate: string
): Promise<{ columns: string[]; rows: (string | number | boolean | null)[][]; totalPreview: number }> {
  const where = buildWhere(companyId, fromDate, toDate);
  const query = `
    SELECT
      CAST(bag_id AS STRING)           AS bag_id,
      fynd_order_id,
      settlement_type,
      CAST(recon_date AS STRING)       AS recon_date,
      seller_net_collection
    FROM \`${BAGS_TABLE}\`
    ${where}
    LIMIT 20
  `;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, query);
  const [rows, , metadata] = await job.getQueryResults({ maxResults: 20, autoPaginate: false });
  const schema = (metadata as Record<string, unknown> & {
    schema?: { fields?: { name: string }[] };
  })?.schema?.fields ?? [];
  const columns = schema.map((f: { name: string }) => f.name);
  const serialized = rows.map((row: Record<string, unknown>) =>
    columns.map((col) => serializeValue(row[col]))
  );
  return { columns, rows: serialized, totalPreview: serialized.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECEIVABLE  (AR_Ageing_table)
// ═══════════════════════════════════════════════════════════════════════════════

// Schema probe — called once on first request to discover columns
let _arColumns: string[] | null = null;
async function getArColumns(): Promise<string[]> {
  if (_arColumns) return _arColumns;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, `SELECT * FROM \`${AR_TABLE}\` LIMIT 1`);
  const [, , meta] = await job.getQueryResults({ maxResults: 1, autoPaginate: false });
  const fields = (meta as Record<string, unknown> & {
    schema?: { fields?: { name: string }[] };
  })?.schema?.fields ?? [];
  _arColumns = fields.map((f: { name: string }) => f.name);
  return _arColumns;
}

// AR table uses: Company_ID, Invoice_Date, Outstanding_Amount
// Always filter: UPPER(TRIM(STATUS)) = 'OPEN' AND Invoice_Type = 'INV'
function buildArWhere(
  companyId: string,
  fromDate: string,
  toDate: string
): string {
  // Hardcoded base filters: Open status only + INV invoice type only
  const parts: string[] = [
    `UPPER(TRIM(STATUS)) = 'OPEN'`,
    `Invoice_Type = 'INV'`,
  ];
  if (companyId && companyId.trim()) {
    parts.push(`CAST(Company_ID AS STRING) = '${companyId.trim().replace(/'/g, "''")}' `);
  }
  if (fromDate) parts.push(`DATE(Invoice_Date) >= DATE('${fromDate}')`);
  if (toDate)   parts.push(`DATE(Invoice_Date) <= DATE('${toDate}')`);
  return `WHERE ${parts.join(" AND ")}`;
}

async function queryArKpi(
  companyId: string, fromDate: string, toDate: string
): Promise<{ net_receivable: number; record_count: number }> {
  const where = buildArWhere(companyId, fromDate, toDate);
  const query = `
    SELECT
      COALESCE(SUM(Outstanding_Amount), 0)  AS net_receivable,
      COUNT(*)                               AS record_count
    FROM \`${AR_TABLE}\`
    ${where}
  `;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, query);
  const [rows] = await job.getQueryResults({ maxResults: 1, autoPaginate: false });
  const row = rows[0] as Record<string, unknown>;
  return {
    net_receivable: Number(serializeValue(row["net_receivable"]) ?? 0),
    record_count:   Number(serializeValue(row["record_count"]) ?? 0),
  };
}

async function queryArPreview(
  companyId: string, fromDate: string, toDate: string
): Promise<{ columns: string[]; rows: (string | number | boolean | null)[][]; totalPreview: number }> {
  const where = buildArWhere(companyId, fromDate, toDate);
  const query = `
    SELECT
      CAST(Company_ID AS STRING)       AS company_id,
      Seller_Name                       AS seller_name,
      Business                          AS business,
      Channel                           AS channel,
      Transaction_Type                  AS transaction_type,
      Invoice_No                        AS invoice_no,
      Invoice_Type                      AS invoice_type,
      CAST(Invoice_Date AS STRING)      AS invoice_date,
      CAST(Due_Date AS STRING)          AS due_date,
      Invoice_Amount                    AS invoice_amount,
      Outstanding_Amount                AS outstanding_amount,
      Company_Level_Due                 AS company_level_due,
      Days                              AS days,
      Aging_Bucket                      AS aging_bucket,
      STATUS                            AS status,
      TOTAL_COLLECTIONS                 AS total_collections
    FROM \`${AR_TABLE}\`
    ${where}
    LIMIT 20
  `;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, query);
  const [rows, , metadata] = await job.getQueryResults({ maxResults: 20, autoPaginate: false });
  const schema = (metadata as Record<string, unknown> & {
    schema?: { fields?: { name: string }[] };
  })?.schema?.fields ?? [];
  const columns = schema.map((f: { name: string }) => f.name);
  const serialized = rows.map((row: Record<string, unknown>) =>
    columns.map((col) => serializeValue(row[col]))
  );
  return { columns, rows: serialized, totalPreview: serialized.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESS ROUTER
// ═══════════════════════════════════════════════════════════════════════════════
const brandLedgerRouter = Router();

// ── Payable Claims ────────────────────────────────────────────────────────────

// Combined async fetch endpoint (returns {jobId} immediately)
brandLedgerRouter.post("/payable/fetch", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  try {
    const jobId = await startQueryJob(async () => {
      const [kpi, preview] = await Promise.all([
        queryPayableKpi(company_id, from_date, to_date),
        queryPayablePreview(company_id, from_date, to_date),
      ]);
      return { success: true, ...kpi, ...preview } as Record<string, unknown>;
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

brandLedgerRouter.post("/payable/download", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  const filename = `payable_claims_${company_id || "all"}_${from_date || "start"}_to_${to_date || "end"}.xlsx`;
  try {
    const jobId = await startJob(filename, async (_progress) => {
      const where = buildWhere(company_id, from_date, to_date);
      const { columns, rows } = await downloadAll(CLAIMS_TABLE, where);
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payable Claims");
      return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── Payable Bags ──────────────────────────────────────────────────────────────

// Combined async fetch endpoint (returns {jobId} immediately)
brandLedgerRouter.post("/bags/fetch", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  try {
    const jobId = await startQueryJob(async () => {
      const [kpi, preview] = await Promise.all([
        queryBagsKpi(company_id, from_date, to_date),
        queryBagsPreview(company_id, from_date, to_date),
      ]);
      return { success: true, ...kpi, ...preview } as Record<string, unknown>;
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

brandLedgerRouter.post("/bags/download", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  const filename = `payable_bags_${company_id || "all"}_${from_date || "start"}_to_${to_date || "end"}.xlsx`;
  try {
    const jobId = await startJob(filename, async (_progress) => {
      const where = buildWhere(company_id, from_date, to_date);
      const { columns, rows } = await downloadAll(BAGS_TABLE, where);
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payable Bags");
      return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── Receivable ────────────────────────────────────────────────────────────────

// Combined async fetch endpoint (returns {jobId} immediately)
brandLedgerRouter.post("/receivable/fetch", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  try {
    const jobId = await startQueryJob(async () => {
      const [kpi, preview] = await Promise.all([
        queryArKpi(company_id, from_date, to_date),
        queryArPreview(company_id, from_date, to_date),
      ]);
      return { success: true, ...kpi, ...preview } as Record<string, unknown>;
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

brandLedgerRouter.post("/receivable/download", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  const filename = `receivable_${company_id || "all"}_${from_date || "start"}_to_${to_date || "end"}.xlsx`;
  try {
    const jobId = await startJob(filename, async (_progress) => {
      const where = buildArWhere(company_id, from_date, to_date);
      const { columns, rows } = await downloadAll(AR_TABLE, where);
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Receivable");
      return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAYOUT REPORT  (Bag_Wise_Payout_Report)
// ═══════════════════════════════════════════════════════════════════════════════

async function queryPayoutKpi(
  companyId: string, fromDate: string, toDate: string
): Promise<{ seller_net_payout: number; bag_count: number }> {
  const where = buildWhere(companyId, fromDate, toDate);
  const query = `
    SELECT
      COALESCE(SUM(Net_Payout), 0)  AS seller_net_payout,
      COUNT(bag_id)                  AS bag_count
    FROM \`${PAYOUT_TABLE}\`
    ${where}
  `;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, query);
  const [rows] = await job.getQueryResults({ maxResults: 1, autoPaginate: false });
  const row = rows[0] as Record<string, unknown>;
  return {
    seller_net_payout: Number(serializeValue(row["seller_net_payout"]) ?? 0),
    bag_count:         Number(serializeValue(row["bag_count"]) ?? 0),
  };
}

async function queryPayoutPreview(
  companyId: string, fromDate: string, toDate: string
): Promise<{ columns: string[]; rows: (string | number | boolean | null)[][]; totalPreview: number }> {
  const where = buildWhere(companyId, fromDate, toDate);
  const query = `
    SELECT
      CAST(bag_id AS STRING)           AS bag_id,
      CAST(company_id AS STRING)       AS company_id,
      company_name,
      brand_name,
      fynd_order_id,
      transaction_type,
      sales_channel,
      recon_status,
      store_state,
      CAST(recon_date AS STRING)       AS recon_date,
      CAST(order_date AS STRING)       AS order_date,
      seller_net_collection,
      Net_Payout
    FROM \`${PAYOUT_TABLE}\`
    ${where}
    LIMIT 20
  `;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, query);
  const [rows, , metadata] = await job.getQueryResults({ maxResults: 20, autoPaginate: false });
  const schema = (metadata as Record<string, unknown> & {
    schema?: { fields?: { name: string }[] };
  })?.schema?.fields ?? [];
  const columns = schema.map((f: { name: string }) => f.name);
  const serialized = rows.map((row: Record<string, unknown>) =>
    columns.map((col) => serializeValue(row[col]))
  );
  return { columns, rows: serialized, totalPreview: serialized.length };
}

// ── Payout Report routes ─────────────────────────────────────────────────────────────────────────────

// Combined async fetch endpoint (returns {jobId} immediately)
brandLedgerRouter.post("/payout/fetch", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  try {
    const jobId = await startQueryJob(async () => {
      const [kpi, preview] = await Promise.all([
        queryPayoutKpi(company_id, from_date, to_date),
        queryPayoutPreview(company_id, from_date, to_date),
      ]);
      return { success: true, ...kpi, ...preview } as Record<string, unknown>;
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

brandLedgerRouter.post("/payout/download", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  const filename = `payout_report_${company_id || "all"}_${from_date || "start"}_to_${to_date || "end"}.xlsx`;
  try {
    const jobId = await startJob(filename, async (_progress) => {
      const where = buildWhere(company_id, from_date, to_date);
      const { columns, rows } = await downloadAll(PAYOUT_TABLE, where);
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payout Report");
      return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── Claim Payout routes (Shipment_wise_Claim_UTR) ──
const CLAIM_UTR_TABLE = "fynd-db.finance_recon_tool_asia.Shipment_wise_Claim_UTR";

async function queryClaimPayoutKpi(
  company_id: string, from_date: string, to_date: string
): Promise<{ net_claim_payout: number; row_count: number }> {
  const where = buildWhere(company_id, from_date, to_date);
  const sql = `SELECT
    COALESCE(SUM(claimable_amt), 0) AS net_claim_payout,
    COUNT(*) AS row_count
  FROM \`${CLAIM_UTR_TABLE}\`
  ${where}`;
  const bq = getBqClient();
  const rows = await retryBqQuery(bq, sql);
  const row = rows[0] ?? {};
  return {
    net_claim_payout: Number(serializeValue(row["net_claim_payout"]) ?? 0),
    row_count: Number(serializeValue(row["row_count"]) ?? 0),
  };
}

async function queryClaimPayoutPreview(
  company_id: string, from_date: string, to_date: string
): Promise<{ columns: string[]; rows: (string | number | boolean | null)[][] }> {
  const where = buildWhere(company_id, from_date, to_date);
  // Preview shows limited columns; download (downloadAll) returns full dataset
  const sql = `SELECT
    company_id, company_name, fynd_order_id, current_shipment_id,
    transaction_type, recon_status, sales_channel,
    Payment_Date, SF_UTR, claimable_amt
  FROM \`${CLAIM_UTR_TABLE}\`
  ${where}
  LIMIT 20`;
  const bq = getBqClient();
  const rows = await retryBqQuery(bq, sql);
  if (!rows.length) return { columns: [], rows: [] };
  const columns = Object.keys(rows[0]);
  const data = rows.map((r: Record<string, unknown>) => columns.map(c => serializeValue(r[c])));
  return { columns, rows: data };
}

// Combined async fetch endpoint (returns {jobId} immediately)
brandLedgerRouter.post("/claim-payout/fetch", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  try {
    const jobId = await startQueryJob(async () => {
      const [kpi, preview] = await Promise.all([
        queryClaimPayoutKpi(company_id, from_date, to_date),
        queryClaimPayoutPreview(company_id, from_date, to_date),
      ]);
      return { success: true, ...kpi, ...preview } as Record<string, unknown>;
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

brandLedgerRouter.post("/claim-payout/download", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  const filename = `claim_payouts_${company_id || "all"}_${from_date || "start"}_to_${to_date || "end"}.xlsx`;
  try {
    const jobId = await startJob(filename, async (_progress) => {
      const where = buildWhere(company_id, from_date, to_date);
      const { columns, rows } = await downloadAll(CLAIM_UTR_TABLE, where);
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Claim Payouts");
      return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});


// ── Manual Dispute (fynd-db.Outstanding.Manual_Dispute) ──────────────────────
const MANUAL_DISPUTE_TABLE = "fynd-db.Outstanding.Manual_Dispute";

function buildManualDisputeWhere(
  companyId: string,
  fromDate: string,
  toDate: string
): string {
  const parts: string[] = [];
  if (companyId && companyId.trim()) {
    const trimmed = companyId.trim();
    if (/^\d+$/.test(trimmed)) {
      parts.push(`company_id = ${parseInt(trimmed, 10)}`);
    } else {
      parts.push(`CAST(company_id AS STRING) = '${trimmed.replace(/'/g, "''")}'`);
    }
  }
  if (fromDate) parts.push(`DATE(sett_date) >= DATE('${fromDate}')`);
  if (toDate)   parts.push(`DATE(sett_date) <= DATE('${toDate}')`);
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}

async function queryManualDisputePreview(
  company_id: string, from_date: string, to_date: string
): Promise<{ columns: string[]; rows: (string | number | boolean | null)[][] }> {
  const where = buildManualDisputeWhere(company_id, from_date, to_date);
  const sql = `SELECT
    company_id, company_name, ordering_channel, order_type,
    sale_channel, sett_date, entry_type, fiscal_Year,
    sett_id, dispute_amount, Comment
  FROM \`${MANUAL_DISPUTE_TABLE}\`
  ${where}
  ORDER BY sett_date DESC
  LIMIT 20`;
  const bq = getBqClient();
  const rows = await retryBqQuery(bq, sql);
  if (!rows.length) return { columns: [], rows: [] };
  const columns = Object.keys(rows[0]);
  const data = rows.map((r: Record<string, unknown>) => columns.map(c => serializeValue(r[c])));
  return { columns, rows: data };
}

// Combined async fetch endpoint (returns {jobId} immediately)
brandLedgerRouter.post("/manual-dispute/fetch", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  try {
    const jobId = await startQueryJob(async () => {
      const [kpi, preview] = await Promise.all([
        queryAdjustmentsKpi(company_id, from_date, to_date),
        queryManualDisputePreview(company_id, from_date, to_date),
      ]);
      return { success: true, ...kpi, ...preview } as Record<string, unknown>;
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

brandLedgerRouter.post("/manual-dispute/download", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  const filename = `manual_dispute_${company_id || "all"}_${from_date || "start"}_to_${to_date || "end"}.xlsx`;
  try {
    const jobId = await startJob(filename, async (_progress) => {
      const where = buildManualDisputeWhere(company_id, from_date, to_date);
      const { columns, rows } = await downloadAll(MANUAL_DISPUTE_TABLE, where);
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Manual Dispute");
      return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// ── Adjustments KPI (sum of dispute_amount for a company) ─────────────────
async function queryAdjustmentsKpi(
  company_id: string,
  from_date: string,
  to_date: string
): Promise<{ total_dispute_amount: number; row_count: number }> {
  const where = buildManualDisputeWhere(company_id, from_date, to_date);
  const sql = `SELECT
    COALESCE(SUM(dispute_amount), 0) AS total_dispute_amount,
    COUNT(*) AS row_count
  FROM \`${MANUAL_DISPUTE_TABLE}\`
  ${where}`;
  const bq = getBqClient();
  const rows = await retryBqQuery(bq, sql);
  if (!rows.length) return { total_dispute_amount: 0, row_count: 0 };
  const r = rows[0] as Record<string, unknown>;
  return {
    total_dispute_amount: Number(serializeValue(r["total_dispute_amount"]) ?? 0),
    row_count: Number(serializeValue(r["row_count"]) ?? 0),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECEIPTS  (AR_Ageing — status=Open, Invoice_Type IN Advance_Receipt/Receipt)
// ═══════════════════════════════════════════════════════════════════════════════

// Fixed date floor for receipts: 2026-04-01
const RECEIPTS_DATE_FLOOR = "2026-04-01";

function buildReceiptsWhere(companyId: string): string {
  const parts: string[] = [
    `UPPER(TRIM(status)) = 'OPEN'`,
    `DATE(Invoice_Date) >= DATE('${RECEIPTS_DATE_FLOOR}')`,
    `Invoice_Type IN ('Advance_Receipt', 'Receipt')`,
  ];
  if (companyId && companyId.trim()) {
    parts.push(`CAST(Company_ID AS STRING) = '${companyId.trim().replace(/'/g, "''")}'`);
  }
  return `WHERE ${parts.join(" AND ")}`;
}

async function queryReceiptsKpi(
  companyId: string
): Promise<{ total_receipts: number; record_count: number }> {
  const where = buildReceiptsWhere(companyId);
  const sql = `SELECT
    COALESCE(SUM(Outstanding_Amount), 0) AS total_receipts,
    COUNT(*) AS record_count
  FROM \`${AR_TABLE}\`
  ${where}`;
  const bq = getBqClient();
  const rows = await retryBqQuery(bq, sql);
  if (!rows.length) return { total_receipts: 0, record_count: 0 };
  const r = rows[0] as Record<string, unknown>;
  return {
    total_receipts: Number(serializeValue(r["total_receipts"]) ?? 0),
    record_count: Number(serializeValue(r["record_count"]) ?? 0),
  };
}

async function queryReceiptsPreview(
  companyId: string
): Promise<{ columns: string[]; rows: (string | number | boolean | null)[][]; totalPreview: number }> {
  const where = buildReceiptsWhere(companyId);
  const query = `
    SELECT
      CAST(Company_ID AS STRING)       AS COMPANY_ID,
      Seller_Name                       AS SELLER_NAME,
      Business                          AS BUSINESS,
      Channel                           AS CHANNEL,
      Transaction_Type                  AS TRANSACTION_TYPE,
      Invoice_No                        AS INVOICE_NO,
      Invoice_Type                      AS INVOICE_TYPE,
      CAST(Invoice_Date AS STRING)      AS INVOICE_DATE,
      CAST(Due_Date AS STRING)          AS DUE_DATE,
      Invoice_Amount                    AS INVOICE_AMOUNT,
      Outstanding_Amount                AS OUTSTANDING_AMOUNT,
      Company_Level_Due                 AS COMPANY_LEVEL_DUE,
      Days                              AS DAYS,
      Aging_Bucket                      AS AGING_BUCKET,
      STATUS                            AS STATUS
    FROM \`${AR_TABLE}\`
    ${where}
    LIMIT 20
  `;
  const bq = getBqClient();
  const job = await retryCreateJob(bq, query);
  const [rows, , metadata] = await job.getQueryResults({ maxResults: 20, autoPaginate: false });
  const schema = (metadata as Record<string, unknown> & {
    schema?: { fields?: { name: string }[] };
  })?.schema?.fields ?? [];
  const columns = schema.map((f: { name: string }) => f.name);
  const serialized = rows.map((row: Record<string, unknown>) =>
    columns.map((col) => serializeValue(row[col]))
  );
  return { columns, rows: serialized, totalPreview: serialized.length };
}

// ── Receipts endpoints ────────────────────────────────────────────────────────

// Combined async fetch endpoint (returns {jobId} immediately)
brandLedgerRouter.post("/receipts/fetch", async (req, res) => {
  const { company_id = "" } = req.body as Record<string, string>;
  try {
    const jobId = await startQueryJob(async () => {
      const [kpi, preview] = await Promise.all([
        queryReceiptsKpi(company_id),
        queryReceiptsPreview(company_id),
      ]);
      return { success: true, ...kpi, ...preview } as Record<string, unknown>;
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

brandLedgerRouter.post("/receipts/download", async (req, res) => {
  const { company_id = "" } = req.body as Record<string, string>;
  const filename = `receipts_${company_id || "all"}.xlsx`;
  try {
    const jobId = await startJob(filename, async (_progress) => {
      const where = buildReceiptsWhere(company_id);
      const { columns, rows } = await downloadAll(AR_TABLE, where);
      const ws = XLSX.utils.aoa_to_sheet([columns, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Receipts");
      return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// Backward-compat aliases
brandLedgerRouter.post("/claimable/preview", (_req, res) => {
  res.redirect(307, "/api/brand-ledger/payable/preview");
});
brandLedgerRouter.post("/claimable/download", (_req, res) => {
  res.redirect(307, "/api/brand-ledger/payable/download");
});


// ── Summary Preview (async job, returns {jobId} immediately) ─────────────────
brandLedgerRouter.post("/summary/preview", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  try {
    const jobId = await startQueryJob(async () => {
      const [
        payableBagsKpi,
        payableClaimsKpi,
        settledBagsKpi,
        settledClaimsKpi,
        arKpi,
        receivablePreview,
        adjustmentsKpi,
        receiptsKpi,
      ] = await Promise.all([
        queryBagsKpi(company_id, from_date, to_date),
        queryPayableKpi(company_id, from_date, to_date),
        queryPayoutKpi(company_id, from_date, to_date),
        queryClaimPayoutKpi(company_id, from_date, to_date),
        queryArKpi(company_id, from_date, to_date),
        queryArPreview(company_id, from_date, to_date),
        queryAdjustmentsKpi(company_id, from_date, to_date),
        queryReceiptsKpi(company_id),
      ]);
      let companyName = company_id;
      if (receivablePreview.rows.length > 0) {
        const cnIdx = receivablePreview.columns.findIndex(c => c.toLowerCase() === "seller_name");
        if (cnIdx >= 0) companyName = String(receivablePreview.rows[0][cnIdx] ?? company_id);
      }
      const hasAdjustments = adjustmentsKpi.row_count > 0;
      const effectivePayableSale = hasAdjustments
        ? payableBagsKpi.payable_seller_sale + adjustmentsKpi.total_dispute_amount
        : payableBagsKpi.payable_seller_sale;
      const payableTotal = effectivePayableSale + payableClaimsKpi.net_payable_claim;
      const settledTotal = settledBagsKpi.seller_net_payout + settledClaimsKpi.net_claim_payout;
      const hasReceipts = receiptsKpi.record_count > 0;
      const effectiveReceivable = hasReceipts
        ? arKpi.net_receivable - receiptsKpi.total_receipts
        : arKpi.net_receivable;
      const netBalance = effectiveReceivable - payableTotal;
      return {
        success: true,
        companyName,
        dateLabel: to_date || new Date().toISOString().slice(0, 10),
        kpis: {
          receivable: arKpi.net_receivable,
          receivableRecords: arKpi.record_count,
          payableSale: effectivePayableSale,
          payableSaleRaw: payableBagsKpi.payable_seller_sale,
          payableSaleBags: payableBagsKpi.bag_count,
          payableClaim: payableClaimsKpi.net_payable_claim,
          payableClaimShipments: payableClaimsKpi.shipment_count,
          payableTotal,
          hasAdjustments,
          adjustmentAmount: adjustmentsKpi.total_dispute_amount,
          adjustmentCount: adjustmentsKpi.row_count,
          hasReceipts,
          receiptsAmount: receiptsKpi.total_receipts,
          receiptsCount: receiptsKpi.record_count,
          effectiveReceivable,
          settledBags: settledBagsKpi.seller_net_payout,
          settledBagCount: settledBagsKpi.bag_count,
          settledClaims: settledClaimsKpi.net_claim_payout,
          settledClaimCount: settledClaimsKpi.row_count,
          settledTotal,
          netBalance,
        },
        receivablePreview: {
          columns: receivablePreview.columns,
          rows: receivablePreview.rows,
        },
      } as Record<string, unknown>;
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[BrandLedger] summary/preview error:", msg);
    res.status(500).json({ error: msg });
  }
});

// POST /api/brand-ledger/summary/download — starts async job, returns {jobId} immediately
brandLedgerRouter.post("/summary/download", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  const summaryFilename = `brand_ledger_summary_${company_id.trim() || "all"}_${from_date || "start"}_to_${to_date || "end"}.xlsx`;
  try {
    const jobId = await startJob(summaryFilename, async (_progress) => {
    const whereInt = buildWhere(company_id, from_date, to_date);
    const whereAr  = buildArWhere(company_id, from_date, to_date);

    const [
      settledBagsResult,
      settledClaimsResult,
      payableBagsResult,
      payableClaimsResult,
      receivableResult,
      payableBagsKpi,
      payableClaimsKpi,
      settledBagsKpi,
      settledClaimsKpi,
      adjustmentsKpi,
      receiptsKpi,
    ] = await Promise.all([
      downloadAll(PAYOUT_TABLE, whereInt),
      downloadAll(CLAIM_UTR_TABLE, whereInt),
      downloadAll(BAGS_TABLE, whereInt),
      downloadAll(CLAIMS_TABLE, whereInt),
      downloadAll(AR_TABLE, whereAr),
      queryBagsKpi(company_id, from_date, to_date),
      queryPayableKpi(company_id, from_date, to_date),
      queryPayoutKpi(company_id, from_date, to_date),
      queryClaimPayoutKpi(company_id, from_date, to_date),
      queryAdjustmentsKpi(company_id, from_date, to_date),
      queryReceiptsKpi(company_id),
    ]);

    const hasAdjustments = adjustmentsKpi.row_count > 0;
    const effectivePayableSale = hasAdjustments
      ? payableBagsKpi.payable_seller_sale + adjustmentsKpi.total_dispute_amount
      : payableBagsKpi.payable_seller_sale;
    const hasReceipts = receiptsKpi.record_count > 0;
    const arSumForReceipts = receivableResult.rows.reduce((acc, row) => {
      const outIdx = receivableResult.columns.findIndex(c => c.toLowerCase() === "outstanding_amount");
      const v = outIdx >= 0 ? row[outIdx] : null;
      return acc + (typeof v === "number" ? v : parseFloat(String(v ?? 0)) || 0);
    }, 0);
    const effectiveReceivable = hasReceipts ? arSumForReceipts - receiptsKpi.total_receipts : arSumForReceipts;

    const companyIdNum = company_id.trim();
    let companyName = companyIdNum;
    if (settledBagsResult.columns.length > 0) {
      const cnIdx = settledBagsResult.columns.findIndex(c => c.toLowerCase() === "company_name");
      if (cnIdx >= 0 && settledBagsResult.rows.length > 0) {
        companyName = String(settledBagsResult.rows[0][cnIdx] ?? companyIdNum);
      }
    }
    if (companyName === companyIdNum && receivableResult.columns.length > 0) {
      const cnIdx = receivableResult.columns.findIndex(c => c.toLowerCase() === "seller_name");
      if (cnIdx >= 0 && receivableResult.rows.length > 0) {
        companyName = String(receivableResult.rows[0][cnIdx] ?? companyIdNum);
      }
    }
    const dateLabel = to_date || new Date().toISOString().slice(0, 10);

    const wb = new ExcelJS.Workbook();

    const addDataSheet = (
      name: string,
      data: { columns: string[]; rows: (string | number | boolean | null)[][] }
    ) => {
      const ws = wb.addWorksheet(name);
      if (data.columns.length > 0) {
        ws.addRow(data.columns);
        const headerRow = ws.getRow(1);
        headerRow.font = { bold: true };
        headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAD3" } };
        data.rows.forEach(r => ws.addRow(r));
      }
      return ws;
    };

    addDataSheet("settled_bags", settledBagsResult);
    addDataSheet("settled_claims", settledClaimsResult);
    addDataSheet("payable_bags", payableBagsResult);
    addDataSheet("payable_claims", payableClaimsResult);
    addDataSheet("receivable", receivableResult);

    const summaryWs = wb.addWorksheet("summary");
    summaryWs.getCell("A3").value = `Payable and Receivable ledger till ${dateLabel} for ${companyName}`;
    summaryWs.getCell("A3").font = { bold: true, size: 12 };
    summaryWs.getCell("A6").value = `Total Outstanding receivable from ${companyName}`;
    summaryWs.getCell("A6").font = { bold: true };

    const arCols = receivableResult.columns;
    const arColIdxs: Record<string, number> = {};
    [
      "company_id", "seller_name", "business", "channel",
      "transaction_type", "invoice_no", "invoice_type", "invoice_date",
      "due_date", "outstanding_amount"
    ].forEach(col => {
      const idx = arCols.findIndex(c => c.toLowerCase() === col);
      if (idx >= 0) arColIdxs[col] = idx;
    });

    const arDisplayCols = [
      "company_id", "seller_name", "business", "channel",
      "transaction_type", "invoice_no", "invoice_type", "invoice_date",
      "due_date", "outstanding_amount"
    ].filter(c => arColIdxs[c] !== undefined);

    const arHeaderRow = summaryWs.getRow(7);
    arDisplayCols.forEach((col, i) => { arHeaderRow.getCell(i + 2).value = col; });
    arHeaderRow.font = { bold: true };
    arHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAD3" } };

    let arDataRowNum = 8;
    receivableResult.rows.forEach(row => {
      const wsRow = summaryWs.getRow(arDataRowNum);
      arDisplayCols.forEach((col, i) => { wsRow.getCell(i + 2).value = row[arColIdxs[col]] ?? null; });
      arDataRowNum++;
    });

    const arSumRowNum = arDataRowNum + 1;
    const outAmtColIdx = arDisplayCols.indexOf("outstanding_amount");
    if (outAmtColIdx >= 0) {
      const sumRow = summaryWs.getRow(arSumRowNum);
      const labelColIdx = outAmtColIdx + 1;
      sumRow.getCell(labelColIdx).value = "coming from receivable (sum Outstanding_Amount)";
      const outAmtExcelCol = outAmtColIdx + 2;
      sumRow.getCell(outAmtExcelCol).value = arSumForReceipts;
      sumRow.getCell(outAmtExcelCol).font = { bold: true };
      sumRow.getCell(outAmtExcelCol).numFmt = "#,##0.00";
    }

    let arSectionEndRow = arSumRowNum;
    if (hasReceipts && outAmtColIdx >= 0) {
      const outAmtExcelCol = outAmtColIdx + 2;
      const receiptsDeductRow = summaryWs.getRow(arSumRowNum + 1);
      receiptsDeductRow.getCell(outAmtColIdx + 1).value = "Less: Receipts (Advance_Receipt / Receipt)";
      receiptsDeductRow.getCell(outAmtExcelCol).value = -receiptsKpi.total_receipts;
      receiptsDeductRow.getCell(outAmtExcelCol).numFmt = "#,##0.00";
      receiptsDeductRow.getCell(outAmtColIdx + 1).font = { italic: true };
      receiptsDeductRow.getCell(outAmtExcelCol).font = { italic: true };
      const effRecRow = summaryWs.getRow(arSumRowNum + 2);
      effRecRow.getCell(outAmtColIdx + 1).value = "Effective Receivable (after Receipts)";
      effRecRow.getCell(outAmtExcelCol).value = effectiveReceivable;
      effRecRow.getCell(outAmtExcelCol).numFmt = "#,##0.00";
      effRecRow.getCell(outAmtExcelCol).font = { bold: true };
      effRecRow.getCell(outAmtColIdx + 1).font = { bold: true };
      arSectionEndRow = arSumRowNum + 2;
    }

    const payableStartRow = arSectionEndRow + 4;
    summaryWs.getCell(`A${payableStartRow}`).value = "Total outstanding payable by Fynd";
    summaryWs.getCell(`A${payableStartRow}`).font = { bold: true };

    const payableHeaderRow = summaryWs.getRow(payableStartRow + 1);
    ["company_id", "company_name", "Payable", "payable_amt"].forEach((h, i) => {
      payableHeaderRow.getCell(i + 2).value = h;
    });
    payableHeaderRow.font = { bold: true };
    payableHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };

    const sellerSaleRow = summaryWs.getRow(payableStartRow + 2);
    sellerSaleRow.getCell(2).value = companyIdNum;
    sellerSaleRow.getCell(3).value = companyName;
    sellerSaleRow.getCell(4).value = "Seller sale";
    sellerSaleRow.getCell(5).value = payableBagsKpi.payable_seller_sale;
    sellerSaleRow.getCell(5).numFmt = "#,##0.00";
    if (hasAdjustments) {
      sellerSaleRow.getCell(6).value = "coming from payable bags (seller_net_collection)";
    }

    let nextPayableRow = payableStartRow + 3;
    if (hasAdjustments) {
      const adjRow = summaryWs.getRow(nextPayableRow);
      adjRow.getCell(2).value = companyIdNum;
      adjRow.getCell(3).value = companyName;
      adjRow.getCell(4).value = "Adjustments (Dispute)";
      adjRow.getCell(5).value = adjustmentsKpi.total_dispute_amount;
      adjRow.getCell(5).numFmt = "#,##0.00";
      adjRow.getCell(6).value = `sum(dispute_amount) — ${adjustmentsKpi.row_count} records`;
      adjRow.getCell(4).font = { italic: true };
      nextPayableRow++;
      const effRow = summaryWs.getRow(nextPayableRow);
      effRow.getCell(4).value = "Effective Seller Sale (after Adjustments)";
      effRow.getCell(5).value = effectivePayableSale;
      effRow.getCell(5).numFmt = "#,##0.00";
      effRow.getCell(5).font = { bold: true };
      effRow.getCell(4).font = { bold: true };
      nextPayableRow++;
    }

    const claimRow = summaryWs.getRow(nextPayableRow);
    claimRow.getCell(2).value = companyIdNum;
    claimRow.getCell(3).value = companyName;
    claimRow.getCell(4).value = "Claim";
    claimRow.getCell(5).value = payableClaimsKpi.net_payable_claim;
    claimRow.getCell(5).numFmt = "#,##0.00";
    if (hasAdjustments) {
      claimRow.getCell(6).value = "coming from payable claims (claimable amount)";
    }

    const payableTotalRow = summaryWs.getRow(nextPayableRow + 2);
    const payableTotal = effectivePayableSale + payableClaimsKpi.net_payable_claim;
    payableTotalRow.getCell(5).value = payableTotal;
    payableTotalRow.getCell(5).font = { bold: true };
    payableTotalRow.getCell(5).numFmt = "#,##0.00";
    payableTotalRow.getCell(6).value = hasAdjustments
      ? "(seller_net_collection + adjustments) + (claimable_amount)"
      : "(seller_net_collection) + (claimable_amount)";

    const settlementStartRow = payableStartRow + 12;
    summaryWs.getCell(`A${settlementStartRow}`).value = `Total settlement till date for ${companyName}`;
    summaryWs.getCell(`A${settlementStartRow}`).font = { bold: true };

    const settlementHeaderRow = summaryWs.getRow(settlementStartRow + 1);
    ["company_id", "company_name", "settlement", "settled_amt"].forEach((h, i) => {
      settlementHeaderRow.getCell(i + 2).value = h;
    });
    settlementHeaderRow.font = { bold: true };
    settlementHeaderRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCE6F1" } };

    const settledBagsRow = summaryWs.getRow(settlementStartRow + 2);
    settledBagsRow.getCell(2).value = companyIdNum;
    settledBagsRow.getCell(3).value = companyName;
    settledBagsRow.getCell(4).value = "Seller sale";
    settledBagsRow.getCell(5).value = settledBagsKpi.seller_net_payout;
    settledBagsRow.getCell(5).numFmt = "#,##0.00";

    const settledClaimsRow = summaryWs.getRow(settlementStartRow + 3);
    settledClaimsRow.getCell(2).value = companyIdNum;
    settledClaimsRow.getCell(3).value = companyName;
    settledClaimsRow.getCell(4).value = "Claim";
    settledClaimsRow.getCell(5).value = settledClaimsKpi.net_claim_payout;
    settledClaimsRow.getCell(5).numFmt = "#,##0.00";

    const settlementTotalRow = summaryWs.getRow(settlementStartRow + 5);
    const settlementTotal = settledBagsKpi.seller_net_payout + settledClaimsKpi.net_claim_payout;
    settlementTotalRow.getCell(5).value = settlementTotal;
    settlementTotalRow.getCell(5).font = { bold: true };
    settlementTotalRow.getCell(5).numFmt = "#,##0.00";
    settlementTotalRow.getCell(6).value = "(seller_net_collection) + (claimable_amount)";

    summaryWs.getColumn(1).width = 40;
    summaryWs.getColumn(2).width = 15;
    summaryWs.getColumn(3).width = 20;
    summaryWs.getColumn(4).width = 15;
    summaryWs.getColumn(5).width = 18;
    summaryWs.getColumn(6).width = 45;
      const xlsxBuffer = Buffer.from(await wb.xlsx.writeBuffer());
      return Buffer.from(xlsxBuffer);
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[BrandLedger] summary/download error:", msg);
    res.status(500).json({ error: msg });
  }
});



// ── Activity Log ─────────────────────────────────────────────────────────────

// POST /api/brand-ledger/activity-log — insert a log entry
brandLedgerRouter.post("/activity-log", async (req, res) => {
  try {
    const { user_name = "", activity_type, company_id = "" } = req.body as Record<string, string>;
    if (!activity_type) {
      res.status(400).json({ success: false, error: "activity_type is required" });
      return;
    }
    const db = await getDb();
    await db!.insert(brandLedgerActivityLog).values({
      userName: user_name,
      activityType: activity_type,
      companyId: company_id,
    });
    res.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[BrandLedger] activity-log insert error:", msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/brand-ledger/activity-log — paginated list (newest first)
brandLedgerRouter.get("/activity-log", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const limit = Math.max(1, parseInt(String(req.query.limit ?? "5"), 10));
    const offset = (page - 1) * limit;
    const db = await getDb();
    const rows = await db!
      .select()
      .from(brandLedgerActivityLog)
      .orderBy(desc(brandLedgerActivityLog.createdAt))
      .limit(limit)
      .offset(offset);
    // Get total count
    const countRows = await db!
      .select({ count: brandLedgerActivityLog.id })
      .from(brandLedgerActivityLog);
    const total = countRows.length;
    res.json({ success: true, rows, total, page, limit });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[BrandLedger] activity-log list error:", msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// ── Consolidated Download ────────────────────────────────────────────────────
// POST /api/brand-ledger/consolidated/download
// Single BQ query against brand_ledger_union master table — one query, 7 sheets.
// Rows are split by sheet_type into 7 named sheets in navbar order.
const UNION_TABLE = "fynd-db.finance_dwh.brand_ledger_union";
function buildUnionWhere(companyId: string, fromDate: string, toDate: string): string {
  const parts: string[] = [];
  if (companyId && companyId.trim()) {
    const trimmed = companyId.trim();
    // brand_ledger_union stores company_id as STRING — always quote it
    parts.push(`CAST(company_id AS STRING) = '${trimmed.replace(/'/g, "''")}' `);
  }
  if (fromDate) parts.push(`DATE(recon_date) >= DATE('${fromDate}')`);
  if (toDate)   parts.push(`DATE(recon_date) <= DATE('${toDate}')`);
  return parts.length ? `WHERE ${parts.join(" AND ")}` : "";
}
brandLedgerRouter.post("/consolidated/download", async (req, res) => {
  const { company_id = "", from_date = "", to_date = "" } = req.body as Record<string, string>;
  const label = company_id.trim() || "all";
  const filename = `brand_ledger_${label}_${from_date || "start"}_to_${to_date || "end"}.xlsx`;
  const SHEET_ORDER = [
    "Receivable",
    "Receipts",
    "Payable Bags",
    "Payable Claims",
    "Adjustments",
    "Settled Bags",
    "Settled Claims",
  ];
  try {
    const jobId = await startJob(filename, async (progress) => {
      await progress(1, "Querying master table…");
      const where = buildUnionWhere(company_id, from_date, to_date);
      const sql = `SELECT * FROM \`${UNION_TABLE}\` ${where} ORDER BY sheet_type`;
      const bq = getBqClient();
      const job = await retryCreateJob(bq, sql);
      // Paginate through all results
      const allRows: Record<string, unknown>[] = [];
      let pageToken: string | undefined;
      let columns: string[] = [];
      do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const opts: any = { maxResults: 5000, autoPaginate: false };
        if (pageToken) opts.pageToken = pageToken;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await job.getQueryResults(opts) as any;
        const rows = result[0] as Record<string, unknown>[];
        const metadata = result[2] as Record<string, unknown> & {
          schema?: { fields?: { name: string }[] };
          pageToken?: string;
        };
        if (columns.length === 0) {
          columns = (metadata?.schema?.fields ?? []).map((f: { name: string }) => f.name);
        }
        allRows.push(...rows);
        pageToken = metadata?.pageToken;
      } while (pageToken);
      await progress(2, "Building workbook sheets…");
      // Remove sheet_type from the columns shown in each sheet
      const dataColumns = columns.filter((c) => c !== "sheet_type");
      // Group rows by sheet_type
      const sheetMap = new Map<string, (string | number | boolean | null)[][]>();
      for (const row of allRows) {
        const sheetType = String(row["sheet_type"] ?? "Unknown");
        if (!sheetMap.has(sheetType)) sheetMap.set(sheetType, []);
        sheetMap.get(sheetType)!.push(dataColumns.map((col) => serializeValue(row[col])));
      }
      const wb = XLSX.utils.book_new();
      for (const sheetName of SHEET_ORDER) {
        const rows = sheetMap.get(sheetName) ?? [];
        const ws = XLSX.utils.aoa_to_sheet([dataColumns, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
      // Add any extra sheet_types not in SHEET_ORDER (future-proofing)
      for (const [sheetName, rows] of Array.from(sheetMap.entries())) {
        if (!SHEET_ORDER.includes(sheetName)) {
          const ws = XLSX.utils.aoa_to_sheet([dataColumns, ...rows]);
          XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
        }
      }
      await progress(3, "Finalising workbook…");
      return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
    });
    res.json({ jobId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/brand-ledger/download-job/:jobId/status — poll job status
brandLedgerRouter.get("/download-job/:jobId/status", async (req, res) => {
  const { jobId } = req.params;
  try {
    const db = await getDb();
    const rows = await db!.select({
      status: brandLedgerDownloadJobs.status,
      filename: brandLedgerDownloadJobs.filename,
      errorMsg: brandLedgerDownloadJobs.errorMsg,
      progressMsg: brandLedgerDownloadJobs.progressMsg,
      progressStep: brandLedgerDownloadJobs.progressStep,
    }).from(brandLedgerDownloadJobs).where(eq(brandLedgerDownloadJobs.id, jobId));
    if (rows.length === 0) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(rows[0]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/brand-ledger/download-job/:jobId/file — download the completed file
brandLedgerRouter.get("/download-job/:jobId/file", async (req, res) => {
  const { jobId } = req.params;
  try {
    const db = await getDb();
    const rows = await db!.select().from(brandLedgerDownloadJobs).where(eq(brandLedgerDownloadJobs.id, jobId));
    if (rows.length === 0) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const job = rows[0];
    if (job.status !== "done" || !job.fileKey) {
      res.status(400).json({ error: "File not ready", status: job.status });
      return;
    }
    // Get a presigned S3 URL, fetch the file server-side, and stream it to the client
    const signedUrl = await storageGetSignedUrl(job.fileKey);
    const s3Res = await fetch(signedUrl);
    if (!s3Res.ok) throw new Error(`S3 fetch failed: ${s3Res.status}`);
    const buf = Buffer.from(await s3Res.arrayBuffer());
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${job.filename}"`);
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
    // Clean up job record after serving
    db!.delete(brandLedgerDownloadJobs).where(eq(brandLedgerDownloadJobs.id, jobId)).catch(() => {});
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/brand-ledger/query-job/:jobId/status — poll query job status
brandLedgerRouter.get("/query-job/:jobId/status", async (req, res) => {
  const { jobId } = req.params;
  try {
    const db = await getDb();
    const rows = await db!.select({
      status: brandLedgerQueryJobs.status,
      errorMsg: brandLedgerQueryJobs.errorMsg,
    }).from(brandLedgerQueryJobs).where(eq(brandLedgerQueryJobs.id, jobId));
    if (rows.length === 0) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    res.json(rows[0]);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/brand-ledger/query-job/:jobId/result — get the completed query result (fetched from S3)
brandLedgerRouter.get("/query-job/:jobId/result", async (req, res) => {
  const { jobId } = req.params;
  try {
    const db = await getDb();
    const rows = await db!.select({
      status: brandLedgerQueryJobs.status,
      resultKey: brandLedgerQueryJobs.resultKey,
      errorMsg: brandLedgerQueryJobs.errorMsg,
    }).from(brandLedgerQueryJobs).where(eq(brandLedgerQueryJobs.id, jobId));
    if (rows.length === 0) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const job = rows[0];
    if (job.status !== "done" || !job.resultKey) {
      res.status(400).json({ error: "Result not ready", status: job.status, errorMsg: job.errorMsg });
      return;
    }
    // Fetch JSON from S3 via signed URL
    const signedUrl = await storageGetSignedUrl(job.resultKey);
    const s3Res = await fetch(signedUrl);
    if (!s3Res.ok) {
      res.status(502).json({ error: "Failed to fetch result from storage" });
      return;
    }
    const result = await s3Res.json();
    res.json(result);
    // Clean up DB row after serving (S3 object will expire naturally)
    db!.delete(brandLedgerQueryJobs).where(eq(brandLedgerQueryJobs.id, jobId)).catch(() => {});
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export { brandLedgerRouter };
