/**
 * Invoice Expo Express Router
 * Mirrors the Python Flask API from finops-local/app.py lines 2615–2873:
 *
 *   GET  /api/invoice-expo/run?month_year=MM-YYYY  — SSE stream: GCS → Drive → BQ → Bolt1 → Bolt2
 *   GET  /api/invoice-expo/history                 — last 100 export history records
 *
 * 6-step pipeline (exact match to god code):
 *   Step 1: GCS Extract   — list PDFs for month_year from GCS bucket
 *   Step 2: Bucket Upload  — download each PDF from GCS, upload to Google Drive folder
 *   Step 3: BQ Cleanup    — TRUNCATE valyx_pdf_link_table
 *   Step 4: BQ Insert     — insert (invoice_id, drive_url) rows
 *   Step 5: Bolt1         — POST to Boltic Bolt1 webhook
 *   Step 6: Bolt2         — POST to Boltic Bolt2 webhook
 *
 * Config constants mirror Python exactly.
 * GCS credentials come from GCS_SERVICE_ACCOUNT_JSON env var.
 * Google Drive / BQ credentials come from GOOGLE_SERVICE_ACCOUNT_JSON env var.
 * History is persisted in the invoice_expo_history MySQL table.
 */

import { Router } from "express";
import { SignJWT, importPKCS8 } from "jose";
import { randomUUID } from "crypto";
import { getDb } from "./db";
import { invoiceExpoHistory } from "../drizzle/schema";
import { desc } from "drizzle-orm";

// ── Config constants (mirrors Python) ────────────────────────────────────────
const GCS_INVOICE_BUCKET    = "fynd-assets-private";
const GCS_INVOICE_PDF_PREFIX = "documents/daytrader/PDFs/";
const GCS_OAUTH_SCOPE       = "https://www.googleapis.com/auth/devstorage.read_only";
const GCS_TOKEN_URL         = "https://oauth2.googleapis.com/token";
const GCS_API_BASE          = "https://storage.googleapis.com/storage/v1";
const GCS_DOWNLOAD_BASE     = "https://storage.googleapis.com/download/storage/v1";

// Google Drive folder ID for PDFs (mirrors Python _IS_DRIVE_PDF_FOLDER_ID)
const DRIVE_PDF_FOLDER_ID   = "1D3ViGVL2qrj3aBAvQvwZCJMS5h34hNmW";

// BQ destination table (mirrors Python _IS_BQ_TABLE)
const BQ_TABLE              = "fynd-db.valyx.valyx_pdf_link_table_raw";
const TEST_LIMIT            = 0; // 0 = no limit (process all files)
const BQ_PROJECT            = "fynd-db";

// Boltic webhook URLs (mirrors Python _BOLTIC_BOLT1_URL / _BOLTIC_BOLT2_URL)
const BOLT1_URL = "https://asia-south1.api.boltic.io/service/webhook/temporal/v1.0/093e2052-1c9b-4241-9bfd-9a813f622bb0/workflows/execute/5c63be91-3bd1-4ebf-a613-ddf2a160673a";
const BOLT2_URL = "https://asia-south1.api.boltic.io/service/webhook/temporal/v1.0/093e2052-1c9b-4241-9bfd-9a813f622bb0/workflows/execute/feda8c5f-af81-43ba-bb56-bbec90b1141f";

// ── OAuth token caches ────────────────────────────────────────────────────────
let _gcsToken: { token: string; expiresAt: number } | null = null;
let _driveToken: { token: string; expiresAt: number } | null = null;
let _bqToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(
  saJson: string,
  scope: string,
  cache: { token: string; expiresAt: number } | null,
  setCache: (v: { token: string; expiresAt: number }) => void
): Promise<string> {
  const now = Date.now();
  if (cache && cache.expiresAt > now + 60_000) return cache.token;

  const sa = JSON.parse(saJson);
  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;

  const jwt = await new SignJWT({ iss: sa.client_email, sub: sa.client_email, aud: GCS_TOKEN_URL, scope, iat, exp })
    .setProtectedHeader({ alg: "RS256" })
    .sign(privateKey);

  const resp = await fetchT(GCS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  }, 20_000, "OAuth token");

  if (!resp.ok) throw new Error(`OAuth token failed (${resp.status}): ${await resp.text()}`);
  const data = await resp.json() as { access_token: string; expires_in: number };
  const result = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  setCache(result);
  return result.token;
}

async function getGcsToken(): Promise<string> {
  const saJson = process.env.GCS_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error("GCS_SERVICE_ACCOUNT_JSON not set");
  return getOAuthToken(saJson, GCS_OAUTH_SCOPE, _gcsToken, v => { _gcsToken = v; });
}

async function getDriveToken(): Promise<string> {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  return getOAuthToken(
    saJson,
    "https://www.googleapis.com/auth/drive",
    _driveToken,
    v => { _driveToken = v; }
  );
}

async function getBqToken(): Promise<string> {
  const saJson = process.env.BQ_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error("BQ_SERVICE_ACCOUNT_JSON not set");
  return getOAuthToken(
    saJson,
    "https://www.googleapis.com/auth/bigquery",
    _bqToken,
    v => { _bqToken = v; }
  );
}

// ── fetch with timeout + optional external abort signal ───────────────────────────
// Combines the per-request timeout with an optional external AbortSignal (e.g. job abort).
// If the external signal fires, the fetch is cancelled immediately.
async function fetchT(url: string, init: RequestInit, ms: number, label: string, externalSignal?: AbortSignal): Promise<Response> {
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), ms);
  // Combine timeout signal with optional external signal
  const signals = externalSignal
    ? [timeoutCtrl.signal, externalSignal]
    : [timeoutCtrl.signal];
  const combinedSignal = (AbortSignal as any).any
    ? (AbortSignal as any).any(signals)
    : timeoutCtrl.signal; // fallback for older Node versions
  try {
    return await fetch(url, { ...init, signal: combinedSignal });
  } catch (e: any) {
    if (e.name === "AbortError") {
      if (externalSignal?.aborted) throw new Error(`${label} aborted by user`);
      throw new Error(`${label} timed out after ${ms}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── SSE helper ────────────────────────────────────────────────────────────────
function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ── GCS helpers ───────────────────────────────────────────────────────────────
interface GcsItem { name: string }

async function gcsListFiles(prefix: string): Promise<GcsItem[]> {
  const token = await getGcsToken();
  const items: GcsItem[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${GCS_API_BASE}/b/${encodeURIComponent(GCS_INVOICE_BUCKET)}/o`);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("fields", "nextPageToken,items(name)");
    url.searchParams.set("maxResults", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const resp = await fetchT(url.toString(), { headers: { Authorization: `Bearer ${token}` } }, 25_000, `GCS list(${prefix})`);
    if (!resp.ok) throw new Error(`GCS list failed (${resp.status}): ${await resp.text()}`);
    const data = await resp.json() as { items?: GcsItem[]; nextPageToken?: string };
    if (data.items) items.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

async function gcsDownload(objectName: string): Promise<Buffer> {
  const token = await getGcsToken();
  const url = `${GCS_DOWNLOAD_BASE}/b/${encodeURIComponent(GCS_INVOICE_BUCKET)}/o/${encodeURIComponent(objectName)}?alt=media`;
  const resp = await fetchT(url, { headers: { Authorization: `Bearer ${token}` } }, 120_000, `GCS download(${objectName})`);
  if (!resp.ok) throw new Error(`GCS download failed (${resp.status}): ${await resp.text()}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ── Google Drive helpers ──────────────────────────────────────────────────────
// Uses simple multipart upload (mirrors Python MediaIoBaseUpload with resumable=False).
// Rate-limit (429/503) handling: exponential backoff up to 5 attempts, matching
// the automatic retry behaviour of Python httplib2 used by googleapiclient.
async function driveUpload(folderId: string, filename: string, fileBytes: Buffer, mime = "application/pdf", onWait?: (msg: string) => void, abortSignal?: AbortSignal): Promise<string> {
  const token = await getDriveToken();

  // Build multipart/related body (same as Python MediaIoBaseUpload resumable=False)
  const boundary = "manus_drive_" + randomUUID().replace(/-/g, "");
  const metaPart = JSON.stringify({ name: filename, parents: [folderId] });
  const bodyBuf = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
      "utf8"
    ),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--`, "utf8"),
  ]);

  // ── Upload with 429/503 exponential backoff (mirrors httplib2 automatic retry) ────
  // Attempt schedule: immediate, 5s, 10s, 20s, 40s (total max ~75s of waiting)
  const MAX_ATTEMPTS = 5;
  let lastErr: Error = new Error("unknown");
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let uploadResp: Response;
    try {
      uploadResp = await fetchT(
        `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
            "Content-Length": String(bodyBuf.length),
          },
          body: bodyBuf as unknown as BodyInit,
        },
        90_000,  // 90-second per-attempt timeout
        `Drive upload(${filename}) attempt ${attempt}`,
        abortSignal
      );
    } catch (fetchErr: any) {
      // Network/timeout error — retry with backoff
      lastErr = fetchErr;
      // If aborted by user, propagate immediately
      if (abortSignal?.aborted) throw new Error(`Drive upload aborted by user`);
      if (attempt < MAX_ATTEMPTS) {
        const waitMs = 5000 * Math.pow(2, attempt - 1); // 5s, 10s, 20s, 40s
        onWait?.(`network error, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`);
        // Abortable wait: resolves early if abort signal fires
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, waitMs);
          abortSignal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("Drive upload aborted by user")); }, { once: true });
        });
        continue;
      }
      throw lastErr;
    }

    // 429 or 503 — rate limited, back off and retry
    if (uploadResp.status === 429 || uploadResp.status === 503) {
      const retryAfter = uploadResp.headers.get("retry-after");
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000 * Math.pow(2, attempt - 1);
      lastErr = new Error(`Drive upload rate-limited (${uploadResp.status}), waiting ${Math.round(waitMs / 1000)}s`);
      if (attempt < MAX_ATTEMPTS) {
        onWait?.(`rate limited (${uploadResp.status}), waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`);
        // Abortable wait: resolves early if abort signal fires
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, waitMs);
          abortSignal?.addEventListener("abort", () => { clearTimeout(t); reject(new Error("Drive upload aborted by user")); }, { once: true });
        });
        continue;
      }
      throw lastErr;
    }

    if (!uploadResp.ok) throw new Error(`Drive upload failed (${uploadResp.status}): ${await uploadResp.text()}`);
    const { id: fileId } = await uploadResp.json() as { id: string };

    // ── Make publicly readable ──────────────────────────────────────────────────
    await fetchT(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "anyone", role: "reader" }),
      },
      15_000,
      `Drive permission(${fileId})`,
      abortSignal
    );

    return `https://drive.google.com/file/d/${fileId}/view`;
  }

  throw lastErr;
}

// ── BigQuery helpers ──────────────────────────────────────────────────────────
async function bqTruncate(): Promise<void> {
  const token = await getBqToken();
  const [projectId, datasetId, tableId] = BQ_TABLE.split(".");
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;
  const resp = await fetchT(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `TRUNCATE TABLE \`${BQ_TABLE}\``, useLegacySql: false }),
  }, 30_000, "BQ truncate");
  if (!resp.ok) throw new Error(`BQ truncate failed (${resp.status}): ${await resp.text()}`);
  // Wait for job to complete
  const result = await resp.json() as { jobComplete?: boolean; jobReference?: { jobId: string; projectId: string } };
  if (!result.jobComplete && result.jobReference) {
    await waitBqJob(result.jobReference.projectId, result.jobReference.jobId, token);
  }
}

async function waitBqJob(projectId: string, jobId: string, token: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const resp = await fetchT(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/jobs/${jobId}`,
      { headers: { Authorization: `Bearer ${token}` } },
      15_000,
      `BQ job status(${jobId})`
    );
    if (!resp.ok) throw new Error(`BQ job status failed (${resp.status})`);
    const data = await resp.json() as { status?: { state?: string; errorResult?: { message: string } } };
    if (data.status?.state === "DONE") {
      if (data.status.errorResult) throw new Error(`BQ job error: ${data.status.errorResult.message}`);
      return;
    }
  }
  throw new Error("BQ job timed out");
}

async function bqInsertRows(rows: Array<{ invoice_no: string; month_year: string; pdf_link: string; supporting_link: string; created_at: string; job_id: string }>): Promise<void> {
  const token = await getBqToken();
  const [projectId, datasetId, tableId] = BQ_TABLE.split(".");
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableId}/insertAll`;
  const body = { rows: rows.map(r => ({ insertId: randomUUID(), json: r })) };
  const resp = await fetchT(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, 30_000, "BQ insertAll");
  if (!resp.ok) throw new Error(`BQ insertAll failed (${resp.status}): ${await resp.text()}`);
  const result = await resp.json() as { insertErrors?: Array<{ errors: Array<{ message: string }> }> };
  if (result.insertErrors && result.insertErrors.length > 0) {
    throw new Error(`BQ insert errors: ${JSON.stringify(result.insertErrors[0].errors)}`);
  }
}

// ── Boltic trigger ────────────────────────────────────────────────────────────
async function triggerBolt(url: string, label: string): Promise<{ status: number; body: string }> {
  try {
    const resp = await fetchT(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, 30_000, label);
    const body = await resp.text();
    return { status: resp.status, body };
  } catch (e: any) {
    return { status: 0, body: e.message };
  }
}

// ── Invoice ID extractor (mirrors Python regex) ───────────────────────────────
function extractInvoiceId(filename: string): string {
  const m = filename.match(/^[^_]+FY\d+/);
  return m ? m[0] : filename.replace(/\.pdf$/i, "");
}

// ── IST timestamp ─────────────────────────────────────────────────────────────
function nowIst(): string {
  const d = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return d.toISOString().replace("T", " ").slice(0, 19);
}

// ── Job State Store ─────────────────────────────────────────────────────────
// Persists the active job in server memory so the frontend can reconnect
// after a page navigation or refresh without losing log history.

interface JobState {
  id: string;
  monthYear: string;
  status: "running" | "success" | "failed" | "cancelled";
  step: number;           // 1-6, current active step
  progress: { current: number; total: number; filename: string } | null;
  logs: Array<Record<string, unknown>>;  // full event buffer
  abort: AbortController; // used to terminate the job
  listeners: Array<(event: Record<string, unknown>) => void>; // live SSE subscribers
}

let activeJob: JobState | null = null;

function broadcastToListeners(event: Record<string, unknown>) {
  const job = activeJob;
  if (!job) return;
  for (const fn of job.listeners) {
    try { fn(event); } catch { /* disconnected */ }
  }
}

// ── Startup Reconciliation ──────────────────────────────────────────────────
// When the server restarts while a job was running, the DB row stays stuck
// as 'running' forever. Fix those rows to 'failed' on startup.
async function reconcileStuckJobs() {
  try {
    const db = await getDb();
    if (!db) return;
    const { eq } = await import("drizzle-orm");
    await db.update(invoiceExpoHistory)
      .set({ status: "failed", errorMsg: "Server restarted while job was running" })
      .where(eq(invoiceExpoHistory.status, "running"))
      .catch(() => {});
  } catch { /* ignore startup errors */ }
}
// Run reconciliation asynchronously on module load (non-blocking)
reconcileStuckJobs();

// ── Router ────────────────────────────────────────────────────────────────────
export const invoiceExpoRouter = Router();

/**
 * GET /api/invoice-expo/status
 * Returns whether a job is currently running and its current state.
 */
invoiceExpoRouter.get("/status", (_req, res) => {
  const job = activeJob;
  if (!job) {
    res.json({ running: false });
    return;
  }
  res.json({
    running: job.status === "running",
    id: job.id,
    monthYear: job.monthYear,
    status: job.status,
    step: job.step,
    progress: job.progress,
    logCount: job.logs.length,
  });
});

/**
 * GET /api/invoice-expo/reconnect
 * SSE stream: replays all buffered logs then streams live events.
 * Use this when navigating back to the page while a job is running.
 */
invoiceExpoRouter.get("/reconnect", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: Record<string, unknown>) => {
    try {
      res.write(sseEvent(data));
      if (typeof (res as any).flush === "function") (res as any).flush();
    } catch { /* disconnected */ }
  };

  const job = activeJob;
  if (!job) {
    sendEvent({ type: "no_job" });
    res.end();
    return;
  }

  // Replay all buffered logs
  for (const evt of job.logs) {
    sendEvent(evt);
  }

  if (job.status !== "running") {
    // Job already finished — send final state and close
    sendEvent({ type: "done", status: job.status });
    res.end();
    return;
  }

  // Subscribe to live events
  const listener = (event: Record<string, unknown>) => sendEvent(event);
  job.listeners.push(listener);

  // Heartbeat
  const hb = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
      if (typeof (res as any).flush === "function") (res as any).flush();
    } catch { clearInterval(hb); }
  }, 3000);

  req.on("close", () => {
    clearInterval(hb);
    const idx = job.listeners.indexOf(listener);
    if (idx >= 0) job.listeners.splice(idx, 1);
  });
});

/**
 * POST /api/invoice-expo/terminate
 * Kills the currently running job.
 */
invoiceExpoRouter.post("/terminate", async (_req, res) => {
  const job = activeJob;
  if (!job || job.status !== "running") {
    res.json({ ok: false, error: "No running job" });
    return;
  }
  job.abort.abort();
  job.status = "cancelled";
  const terminateEvent = { type: "done", status: "cancelled", error: "Terminated by user" };
  job.logs.push(terminateEvent);
  broadcastToListeners(terminateEvent);

  // Update DB
  try {
    const db = await getDb();
    if (db) {
      const { eq } = await import("drizzle-orm");
      await db.update(invoiceExpoHistory)
        .set({ status: "failed", errorMsg: "Terminated by user" })
        .where(eq(invoiceExpoHistory.id, job.id))
        .catch(() => {});
    }
  } catch { /* ignore */ }

  res.json({ ok: true });
});

/**
 * GET /api/invoice-expo/run?month_year=MM-YYYY
 * SSE stream: GCS → Drive → BQ → Bolt1 → Bolt2
 * Stores job state in activeJob so /reconnect can replay logs after navigation.
 */
invoiceExpoRouter.get("/run", async (req, res) => {
  const monthYear = String(req.query.month_year || "").trim();
  const executedBy = String(req.query.executed_by || req.headers["x-qb-user"] || "").trim();
  if (!monthYear || !/^\d{2}-\d{4}$/.test(monthYear)) {
    res.status(400).json({ ok: false, error: "month_year must be MM-YYYY (e.g. 04-2025)" });
    return;
  }

  // Reject if a job is already running
  if (activeJob && activeJob.status === "running") {
    res.status(409).json({ ok: false, error: "A job is already running", running: true });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const runId = randomUUID();
  const abortCtrl = new AbortController();

  // Create the job state store
  activeJob = {
    id: runId,
    monthYear,
    status: "running",
    step: 1,
    progress: null,
    logs: [],
    abort: abortCtrl,
    listeners: [],
  };
  const job = activeJob;

  // write() — sends to the original SSE connection AND broadcasts to reconnected listeners
  const write = (data: Record<string, unknown>) => {
    // Buffer in job state for reconnect replay
    job.logs.push(data);
    // Broadcast to any reconnected listeners
    broadcastToListeners(data);
    // Write to the original SSE connection
    try {
      res.write(sseEvent(data));
      if (typeof (res as any).flush === "function") (res as any).flush();
    } catch { /* original connection closed — that's OK, we still broadcast */ }
  };
  const detail = (msg: string) => write({ type: "detail", msg });

  // Heartbeat: send a comment ping every 3 s so proxies don't close the connection
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(`: heartbeat\n\n`);
      if (typeof (res as any).flush === "function") (res as any).flush();
    } catch { clearInterval(heartbeatInterval); }
  }, 3000);

  // Clean up heartbeat when client disconnects
  req.on("close", () => clearInterval(heartbeatInterval));

  const db = await getDb();

  // Insert history row as 'running'
  if (db) {
    await db.insert(invoiceExpoHistory).values({ id: runId, monthYear, status: "running", pdfCount: 0, executedBy }).catch(() => {});
  }

  let pdfCount = 0;
  let finalStatus: "success" | "failed" | "cancelled" = "failed";
  let errorMsg: string | undefined;

  try {
    // ── Step 1: GCS Extract ──────────────────────────────────────────────────
    job.step = 1;
    write({ type: "step", n: 1, label: "GCS Extract" });
    detail(`Connecting to GCS bucket ${GCS_INVOICE_BUCKET}…`);

    const allBlobs = await gcsListFiles(GCS_INVOICE_PDF_PREFIX);
    const blobs = allBlobs.filter(b =>
      b.name.toLowerCase().endsWith(".pdf") &&
      b.name.toLowerCase().includes(monthYear.toLowerCase())
    );

    if (blobs.length === 0) {
      detail(`No PDFs found for ${monthYear}`);
      write({ type: "done", status: "failed", error: `No PDFs found for ${monthYear}` });
      errorMsg = `No PDFs found for ${monthYear}`;
      if (db) await db.update(invoiceExpoHistory).set({ status: "failed", errorMsg }).where(
        (await import("drizzle-orm")).eq(invoiceExpoHistory.id, runId)
      ).catch(() => {});
      clearInterval(heartbeatInterval);
      job.status = "failed";
      res.end();
      return;
    }

    detail(`Found ${blobs.length} PDF(s) for ${monthYear}`);
    // Apply test limit if set
    const filesToProcess = TEST_LIMIT > 0 ? blobs.slice(0, TEST_LIMIT) : blobs;
    if (TEST_LIMIT > 0) detail(`⚠ TEST MODE: limiting to first ${TEST_LIMIT} of ${blobs.length} files`);
    // ── Step 2: Bucket Upload ───────────────────────────────────────────────
    job.step = 2;
    write({ type: "step", n: 2, label: "Bucket Upload" });
    const pdfLinks: Array<{ invoice_no: string; pdf_link: string }> = [];
    let skipped = 0;

    for (let i = 0; i < filesToProcess.length; i++) {
      // Check if job was terminated
      if (abortCtrl.signal.aborted) {
        detail("⚠ Job terminated by user");
        finalStatus = "cancelled";
        throw new Error("Terminated by user");
      }

      const blob = filesToProcess[i];
      const filename = blob.name.split("/").pop() || blob.name;
      let fileBytes: Buffer | null = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          fileBytes = await gcsDownload(blob.name);
          break;
        } catch (dlErr: any) {
          if (attempt < 3) {
            detail(`(${i + 1}/${filesToProcess.length}) ${filename} — retry ${attempt}/3`);
            await new Promise(r => setTimeout(r, 2000 * attempt));
          } else {
            detail(`(${i + 1}/${filesToProcess.length}) ✗ ${filename} — skipped after 3 failures`);
            skipped++;
          }
        }
      }

      if (!fileBytes) continue;

      // Update progress in job state and send progress event
      job.progress = { current: i + 1, total: filesToProcess.length, filename };
      write({ type: "progress", current: i + 1, total: filesToProcess.length, filename });

      const invId = extractInvoiceId(filename);

      // Drive upload — multipart, 429/503 backoff handled inside driveUpload()
      // Pass job abortSignal so Terminate cancels the in-flight HTTP request immediately
      let driveUrl: string | null = null;
      try {
        driveUrl = await driveUpload(
          DRIVE_PDF_FOLDER_ID, filename, fileBytes, "application/pdf",
          (msg) => detail(`(${i + 1}/${filesToProcess.length}) ${filename} — ${msg}`),
          job.abort.signal
        );
      } catch (upErr: any) {
        // Re-throw abort errors so the outer abort check handles them
        if (job.abort.signal.aborted) throw upErr;
        detail(`(${i + 1}/${filesToProcess.length}) ✗ ${filename} — Drive upload failed: ${upErr?.message}`);
        skipped++;
      }

      if (!driveUrl) continue;

      pdfLinks.push({ invoice_no: invId, pdf_link: driveUrl });
      // Only 1 log line per file — after upload completes
      detail(`(${i + 1}/${filesToProcess.length}) ✓ ${filename}`);
    }

    if (skipped > 0) detail(`⚠ ${skipped} file(s) skipped due to download failures`);
    pdfCount = pdfLinks.length;
    job.progress = null;

    // ── Step 3: BQ Cleanup ───────────────────────────────────────────────────
    job.step = 3;
    write({ type: "step", n: 3, label: "BQ Cleanup" });
    detail(`Deleting old rows from ${BQ_TABLE}…`);
    await bqTruncate();
    detail(`✓ Truncated ${BQ_TABLE}`);

    // ── Step 4: BQ Insert ────────────────────────────────────────────────────
    job.step = 4;
    write({ type: "step", n: 4, label: "BQ Insert" });
    detail(`Inserting ${pdfLinks.length} rows into ${BQ_TABLE}…`);
    const ts = nowIst();
    const rows = pdfLinks.map(r => ({
      invoice_no: r.invoice_no,
      month_year: monthYear,
      pdf_link: r.pdf_link,
      supporting_link: "",
      created_at: ts,
      job_id: job.id,
    }));
    await bqInsertRows(rows);
    detail(`✓ ${rows.length} rows inserted into ${BQ_TABLE}`);

    // ── Step 5: Bolt1 ────────────────────────────────────────────────────────
    job.step = 5;
    write({ type: "step", n: 5, label: "Bolt1" });
    detail("Triggering Bolt1 — Invoice Data…");
    const b1 = await triggerBolt(BOLT1_URL, "Bolt1");
    detail(`Bolt1: HTTP ${b1.status} — ${b1.body.slice(0, 200)}`);

    // ── Step 6: Bolt2 ────────────────────────────────────────────────────────
    job.step = 6;
    write({ type: "step", n: 6, label: "Bolt2" });
    detail("Triggering Bolt2 — Invoice PDF…");
    const b2 = await triggerBolt(BOLT2_URL, "Bolt2");
    detail(`Bolt2: HTTP ${b2.status} — ${b2.body.slice(0, 200)}`);

    finalStatus = "success";
    write({ type: "done", status: "success", count: pdfCount });

  } catch (err: any) {
    if (finalStatus !== "cancelled") {
      errorMsg = String(err.message || err);
      detail(`✗ ${errorMsg}`);
      write({ type: "done", status: "failed", error: errorMsg });
    }
  }

  // Stop heartbeat
  clearInterval(heartbeatInterval);

  // Update job state
  job.status = finalStatus === "cancelled" ? "cancelled" : (finalStatus === "success" ? "success" : "failed");

  // Update history
  if (db) {
    const { eq } = await import("drizzle-orm");
    await db.update(invoiceExpoHistory)
      .set({ status: finalStatus, pdfCount, errorMsg: errorMsg ?? null })
      .where(eq(invoiceExpoHistory.id, runId))
      .catch(() => {});
  }

  res.end();
});

/**
 * GET /api/invoice-expo/today-stats
 * Runs two BQ queries against daily_invoice_logs:
 *   1. Count of distinct invoice_no for the latest invoice_posted_at date
 *   2. Full list of rows for that same date
 */
const BQ_DAILY_INVOICE_TABLE = "fynd-db.finance_dwh.daily_invoice_logs";

async function bqQuery(sql: string): Promise<Array<Record<string, string | null>>> {
  const token = await getBqToken();
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${BQ_PROJECT}/queries`;
  const resp = await fetchT(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql, useLegacySql: false, timeoutMs: 60000 }),
  }, 90_000, "BQ query");
  if (!resp.ok) throw new Error(`BQ query failed (${resp.status}): ${await resp.text()}`);
  const result = await resp.json() as {
    jobComplete?: boolean;
    jobReference?: { jobId: string; projectId: string };
    schema?: { fields: Array<{ name: string }> };
    rows?: Array<{ f: Array<{ v: string | null }> }>;
  };
  // If not complete, poll for result
  let data = result;
  if (!data.jobComplete && data.jobReference) {
    await waitBqJob(data.jobReference.projectId, data.jobReference.jobId, token);
    const pollUrl = `https://bigquery.googleapis.com/bigquery/v2/projects/${data.jobReference.projectId}/queries/${data.jobReference.jobId}?timeoutMs=60000`;
    const pollResp = await fetchT(pollUrl, { headers: { Authorization: `Bearer ${token}` } }, 90_000, "BQ poll");
    if (!pollResp.ok) throw new Error(`BQ poll failed (${pollResp.status})`);
    data = await pollResp.json() as typeof result;
  }
  const fields = data.schema?.fields?.map(f => f.name) ?? [];
  return (data.rows ?? []).map(row => {
    const obj: Record<string, string | null> = {};
    fields.forEach((name, i) => { obj[name] = row.f[i]?.v ?? null; });
    return obj;
  });
}

invoiceExpoRouter.get("/today-stats", async (_req, res) => {
  try {
    const latestDateSubquery = `(SELECT MAX(DATE(invoice_posted_at)) FROM \`${BQ_DAILY_INVOICE_TABLE}\`)`;
    const whereClause = `WHERE SAFE_CAST(invoice_posted_at AS DATE) IN (${latestDateSubquery})`;

    // Run count query
    const countSql = `SELECT COUNT(DISTINCT invoice_no) AS invoice_count FROM \`${BQ_DAILY_INVOICE_TABLE}\` ${whereClause}`;
    const countRows = await bqQuery(countSql);
    const invoiceCount = parseInt(countRows[0]?.invoice_count ?? "0", 10);

    // Run list query
    const listSql = `SELECT * FROM \`${BQ_DAILY_INVOICE_TABLE}\` ${whereClause}`;
    const listRows = await bqQuery(listSql);

    res.json({ ok: true, invoiceCount, invoices: listRows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err.message || err) });
  }
});

/**
 * GET /api/invoice-expo/pdfs-today
 * Returns the count of distinct invoice_no for the latest invoice_posted_at date
 * from fynd-db.finance_dwh.daily_invoice_logs
 */
invoiceExpoRouter.get("/pdfs-today", async (_req, res) => {
  try {
    const latestDateSubquery = `(SELECT MAX(DATE(invoice_posted_at)) FROM \`${BQ_DAILY_INVOICE_TABLE}\`)`;
    const sql = `SELECT COUNT(DISTINCT invoice_no) AS invoice_count FROM \`${BQ_DAILY_INVOICE_TABLE}\` WHERE SAFE_CAST(invoice_posted_at AS DATE) IN (${latestDateSubquery})`;
    const rows = await bqQuery(sql);
    const count = parseInt(rows[0]?.invoice_count ?? "0", 10);
    res.json({ ok: true, count });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err.message || err), count: null });
  }
});

/**
 * GET /api/invoice-expo/history
 * Returns last 100 export history records
 */
invoiceExpoRouter.get("/history", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) { res.json({ history: [] }); return; }

    // Ensure the table exists (idempotent CREATE IF NOT EXISTS)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS \`invoice_expo_history\` (
        \`id\` varchar(64) NOT NULL,
        \`monthYear\` varchar(10) NOT NULL,
        \`status\` varchar(20) NOT NULL DEFAULT 'running',
        \`pdfCount\` int DEFAULT 0,
        \`errorMsg\` text,
        \`createdAt\` timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`invoice_expo_history_id\` PRIMARY KEY(\`id\`)
      )
    `).catch(() => {}); // ignore if already exists or no permission

    const rows = await db
      .select()
      .from(invoiceExpoHistory)
      .orderBy(desc(invoiceExpoHistory.createdAt))
      .limit(100)
      .catch(() => [] as typeof invoiceExpoHistory.$inferSelect[]); // return empty if table still missing
    res.json({ history: rows });
  } catch (err: any) {
    // If table truly doesn't exist, return empty history gracefully
    res.json({ history: [] });
  }
});

/**
 * GET /api/invoice-expo/defaulters
 * Returns invoices that were not sent — seller_id IS NULL and not in downstream tables.
 * Only callable after a successful export run.
 */
const DEFAULTER_SQL = `
SELECT 
  Invoice_Reference,
  Customer_Name,
  seller_id,
  'valyx_tally_payload_table' as table_name
FROM
  \`finance_dwh.valyx_tally_payload_table\` a
WHERE 
  EXISTS (
    SELECT 1
    FROM \`fynd-db.valyx.valyx_pdf_link_table\` d
    WHERE a.Invoice_Reference = d.invoice_no
  )
  AND seller_id IS NULL
  AND Invoice_Reference LIKE '%-I-%'
  AND NOT EXISTS (
    SELECT 1
    FROM \`finance_dwh.valyx_fp_invoices_table\` b
    WHERE a.Invoice_Reference = b.Invoice_Reference
  )
  AND NOT EXISTS (
    SELECT 1
    FROM \`finance_dwh.valyx_api_data_table\` c
    WHERE a.Invoice_Reference = c.invoiceNumber
  )

UNION ALL

SELECT 
  Invoice_Reference,
  Customer_Name,
  seller_id,
  'valyx_fp_invoices_table' as table_name
FROM
  \`finance_dwh.valyx_fp_invoices_table\` a
WHERE 
  EXISTS (
    SELECT 1
    FROM \`fynd-db.valyx.valyx_pdf_link_table\` d
    WHERE a.Invoice_Reference = d.invoice_no
  )
  AND seller_id IS NULL
  AND Invoice_Reference LIKE '%-I-%'
  AND NOT EXISTS (
    SELECT 1
    FROM \`finance_dwh.valyx_api_data_table\` c
    WHERE a.Invoice_Reference = c.invoiceNumber
  )
`;

invoiceExpoRouter.get("/defaulters", async (_req, res) => {
  try {
    const rows = await bqQuery(DEFAULTER_SQL);
    res.json({ ok: true, defaulters: rows });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: String(err.message || err), defaulters: [] });
  }
});
