/**
 * Invoices Download Express Router
 * Mirrors the Python Flask API from the zip code (finops-local/app.py lines 2606–3320):
 *
 *   POST /api/invoice-download/request  — enqueue async job, return job_id immediately
 *   GET  /api/invoice-download/status/:jobId — poll job status (pending/processing/done/failed)
 *   GET  /api/invoice-download/history  — download history (last 200 records)
 *   GET  /api/invoice-download/file/:id — serve the zip file (redirect to signed URL)
 *
 * Key constants mirroring Python:
 *   _GCS_INVOICE_BUCKET      = 'fynd-assets-private'
 *   _GCS_INVOICE_BASE_PREFIX = 'documents/daytrader/'         (invoice_ids search)
 *   _GCS_INVOICE_PDF_PREFIX  = 'documents/daytrader/PDFs/'   (month_year search)
 *
 * Performance optimisations:
 *   - Async job: POST returns instantly with job_id; heavy work runs in background
 *   - Parallel PDF downloads: Promise.all with concurrency cap of 5
 *   - OAuth token cached for 55 min to avoid re-fetching
 *   - Token pre-warmed on module load
 *
 * GCS credentials come from GCS_SERVICE_ACCOUNT_JSON env var.
 * Uses direct GCS REST API (not the SDK) to avoid SDK auth-init hangs in production.
 * History is persisted in the invoice_download_history MySQL table.
 * Zip files are stored in S3 via storagePut().
 */

import { Router } from "express";
import { SignJWT, importPKCS8 } from "jose";
import archiver from "archiver";
import { randomUUID } from "crypto";
import { getDb } from "./db";
import { invoiceDownloadHistory } from "../drizzle/schema";
import { desc } from "drizzle-orm";
import { storagePut, storageGetSignedUrl } from "./storage";
import { PassThrough } from "stream";
import { BigQuery } from "@google-cloud/bigquery";

// ── BQ client for Sent Invoices ───────────────────────────────────────────────
const SENT_INV_BQ_PROJECT = "fynd-db";
let _sentInvBqClient: BigQuery | null = null;
function getSentInvBqClient(): BigQuery {
  if (_sentInvBqClient) return _sentInvBqClient;
  const credsRaw = process.env.BQ_SERVICE_ACCOUNT_JSON || "";
  if (!credsRaw) throw new Error("BQ_SERVICE_ACCOUNT_JSON not set");
  const credentials = JSON.parse(credsRaw);
  _sentInvBqClient = new BigQuery({ projectId: SENT_INV_BQ_PROJECT, credentials });
  return _sentInvBqClient;
}

function serializeBqValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("value" in obj) return String(obj.value);
    if (typeof obj.toString === "function") return obj.toString();
    return JSON.stringify(v);
  }
  return v as string | number | boolean;
}

// ── GCS constants (mirrors Python) ───────────────────────────────────────────
const GCS_INVOICE_BUCKET = "fynd-assets-private";
const GCS_INVOICE_BASE_PREFIX = "documents/daytrader/";       // for invoice_ids search
const GCS_INVOICE_PDF_PREFIX = "documents/daytrader/PDFs/";  // for month_year search
const GCS_OAUTH_SCOPE = "https://www.googleapis.com/auth/devstorage.read_only";
const GCS_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GCS_API_BASE = "https://storage.googleapis.com/storage/v1";
const GCS_DOWNLOAD_BASE = "https://storage.googleapis.com/download/storage/v1";

// ── In-memory job store (survives across requests in the same process) ────────
type JobStatus = "pending" | "processing" | "done" | "failed";
interface Job {
  id: string;
  status: JobStatus;
  progress: string;      // human-readable progress message
  downloadId?: string;   // set when done
  invoiceCount?: number;
  error?: string;
  createdAt: number;
}
const jobs = new Map<string, Job>();

// Clean up jobs older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of Array.from(jobs.entries())) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 30 * 60 * 1000);

// ── OAuth token cache ─────────────────────────────────────────────────────────
let _cachedToken: { token: string; expiresAt: number } | null = null;

async function getGcsAccessToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && _cachedToken.expiresAt > now + 60_000) {
    return _cachedToken.token;
  }

  const saJson = process.env.GCS_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error("GCS_SERVICE_ACCOUNT_JSON env variable is not set");
  const sa = JSON.parse(saJson);

  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const iat = Math.floor(now / 1000);
  const exp = iat + 3600;

  const jwt = await new SignJWT({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: GCS_TOKEN_URL,
    scope: GCS_OAUTH_SCOPE,
    iat,
    exp,
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign(privateKey);

  const resp = await fetchWithTimeout(GCS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  }, 20_000, "GCS OAuth token fetch");

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`GCS token fetch failed (${resp.status}): ${body}`);
  }

  const data = await resp.json() as { access_token: string; expires_in: number };
  _cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return _cachedToken.token;
}

// Pre-warm the token on startup (fire and forget — errors are non-fatal)
getGcsAccessToken().catch(() => {});

// ── fetch with timeout ────────────────────────────────────────────────────────
async function fetchWithTimeout(url: string, init: RequestInit, ms: number, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error(`${label} timed out after ${ms}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── List GCS blobs under a prefix (handles pagination) ───────────────────────
interface GcsItem { name: string }

async function gcsListFiles(bucket: string, prefix: string): Promise<GcsItem[]> {
  const token = await getGcsAccessToken();
  const items: GcsItem[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${GCS_API_BASE}/b/${encodeURIComponent(bucket)}/o`);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("fields", "nextPageToken,items(name)");
    url.searchParams.set("maxResults", "1000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resp = await fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    }, 25_000, `GCS list(${prefix})`);

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`GCS list failed (${resp.status}): ${body}`);
    }

    const data = await resp.json() as { items?: GcsItem[]; nextPageToken?: string };
    if (data.items) items.push(...data.items);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

/**
 * Fast per-ID search: instead of listing the entire bucket, fire one GCS list
 * request per invoice ID in parallel. Each request uses the invoice ID as part
 * of the prefix so GCS filters server-side — no full-bucket scan needed.
 *
 * GCS doesn't support substring search, but invoice IDs appear in the filename
 * so we search under the base prefix and use matchGlob if available, or fall
 * back to a prefix search using the ID directly.
 *
 * Strategy:
 *   1. Try prefix = `${GCS_INVOICE_BASE_PREFIX}` with matchGlob = `**${id}**.pdf`
 *      (supported on GCS JSON API v1 since 2023)
 *   2. All IDs searched in parallel — total time ≈ slowest single ID lookup
 */
async function gcsSearchByIds(
  bucket: string,
  basePrefix: string,
  invoiceIds: string[],
  onProgress?: (found: number, total: number) => void
): Promise<string[]> {
  const token = await getGcsAccessToken();
  let found = 0;

  const perIdSearch = async (invId: string): Promise<string[]> => {
    const results: string[] = [];
    let pageToken: string | undefined;

    do {
      const url = new URL(`${GCS_API_BASE}/b/${encodeURIComponent(bucket)}/o`);
      url.searchParams.set("prefix", basePrefix);
      url.searchParams.set("matchGlob", `**${invId}**.pdf`);
      url.searchParams.set("fields", "nextPageToken,items(name)");
      url.searchParams.set("maxResults", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const resp = await fetchWithTimeout(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      }, 25_000, `GCS search(${invId})`);

      if (!resp.ok) {
        // matchGlob not supported on this bucket/region — fall back to full scan
        // (caller handles this)
        throw Object.assign(new Error(`GCS matchGlob failed (${resp.status})`), { status: resp.status });
      }

      const data = await resp.json() as { items?: GcsItem[]; nextPageToken?: string };
      if (data.items) {
        for (const item of data.items) {
          if (item.name.toLowerCase().endsWith(".pdf")) results.push(item.name);
        }
      }
      pageToken = data.nextPageToken;
    } while (pageToken);

    found++;
    onProgress?.(found, invoiceIds.length);
    return results;
  };

  // Run all ID searches in parallel
  const allResults = await Promise.all(invoiceIds.map(id => perIdSearch(id)));
  // Flatten and deduplicate
  const seen = new Set<string>();
  const matched: string[] = [];
  for (const batch of allResults) {
    for (const name of batch) {
      if (!seen.has(name)) { seen.add(name); matched.push(name); }
    }
  }
  return matched;
}

// ── Download a single GCS object as Buffer ────────────────────────────────────
async function gcsDownloadFile(bucket: string, objectName: string): Promise<Buffer> {
  const token = await getGcsAccessToken();
  const url = `${GCS_DOWNLOAD_BASE}/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectName)}?alt=media`;

  const resp = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${token}` },
  }, 30_000, `GCS download(${objectName})`);

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`GCS download failed (${resp.status}): ${body}`);
  }

  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// ── Parallel download with concurrency cap ────────────────────────────────────
async function downloadParallel(
  names: string[],
  concurrency = 5,
  onProgress?: (done: number, total: number) => void
): Promise<{ name: string; data: Buffer }[]> {
  const results: { name: string; data: Buffer }[] = new Array(names.length);
  let idx = 0;
  let done = 0;

  async function worker() {
    while (idx < names.length) {
      const i = idx++;
      const name = names[i];
      results[i] = { name, data: await gcsDownloadFile(GCS_INVOICE_BUCKET, name) };
      done++;
      onProgress?.(done, names.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, names.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── Format timestamp (mirrors Python datetime.utcnow().strftime('%d/%m/%Y %H:%M:%S')) ──
function fmtTimestamp(d: Date = new Date()): string {
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000); // UTC → IST
  const dd = String(ist.getUTCDate()).padStart(2, "0");
  const mm = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = ist.getUTCFullYear();
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const min = String(ist.getUTCMinutes()).padStart(2, "0");
  const ss = String(ist.getUTCSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

// ── Background job processor ──────────────────────────────────────────────────
async function processJob(
  jobId: string,
  dlId: string,
  reqType: string,
  query: string,
  rawIds: string,
  monthYear: string,
  downloadedBy: string = ""
) {
  const job = jobs.get(jobId)!;

  try {
    job.status = "processing";
    job.progress = "Searching GCS bucket…";

    const matched: string[] = [];

    if (reqType === "invoice_ids") {
      const invoiceIds = rawIds.split(",").map(x => x.trim()).filter(Boolean);
      job.progress = `Searching for ${invoiceIds.length} invoice(s)…`;

      try {
        // Fast path: parallel per-ID matchGlob queries (O(n_ids) instead of O(bucket_size))
        const results = await gcsSearchByIds(
          GCS_INVOICE_BUCKET,
          GCS_INVOICE_BASE_PREFIX,
          invoiceIds,
          (done, total) => { job.progress = `Searching… (${done}/${total} IDs queried)`; }
        );
        matched.push(...results);
      } catch (e: any) {
        // Fallback: full bucket scan (matchGlob not supported or other error)
        job.progress = "Listing invoice files (full scan)…";
        const blobs = await gcsListFiles(GCS_INVOICE_BUCKET, GCS_INVOICE_BASE_PREFIX);
        for (const blob of blobs) {
          if (!blob.name.toLowerCase().endsWith(".pdf")) continue;
          for (const invId of invoiceIds) {
            if (blob.name.toLowerCase().includes(invId.toLowerCase())) {
              matched.push(blob.name);
              break;
            }
          }
        }
      }
    } else {
      // Fast path: fire matchGlob queries for all common date patterns in parallel
      // monthYear is MM-YYYY (e.g. "04-2026")
      // Python mirrors: matches '04-2026', 'April_2026', 'April-2026', '04_2026'
      const [mm, yyyy] = monthYear.split("-");
      const MONTH_NAMES = ["","January","February","March","April","May","June",
        "July","August","September","October","November","December"];
      const monthName = MONTH_NAMES[parseInt(mm, 10)] || mm;
      const patterns = [
        `**${mm}-${yyyy}**.pdf`,      // 04-2026
        `**${mm}_${yyyy}**.pdf`,      // 04_2026
        `**${monthName}-${yyyy}**.pdf`, // April-2026
        `**${monthName}_${yyyy}**.pdf`, // April_2026
      ];

      job.progress = `Searching PDFs for ${monthName} ${yyyy}…`;

      try {
        const token = await getGcsAccessToken();
        const patternResults = await Promise.all(patterns.map(async (glob) => {
          const results: string[] = [];
          let pageToken: string | undefined;
          do {
            const url = new URL(`${GCS_API_BASE}/b/${encodeURIComponent(GCS_INVOICE_BUCKET)}/o`);
            url.searchParams.set("prefix", GCS_INVOICE_PDF_PREFIX);
            url.searchParams.set("matchGlob", glob);
            url.searchParams.set("fields", "nextPageToken,items(name)");
            url.searchParams.set("maxResults", "1000");
            if (pageToken) url.searchParams.set("pageToken", pageToken);
            const resp = await fetchWithTimeout(url.toString(), {
              headers: { Authorization: `Bearer ${token}` },
            }, 25_000, `GCS month_year matchGlob(${glob})`);
            if (!resp.ok) throw Object.assign(new Error(`matchGlob failed (${resp.status})`), { status: resp.status });
            const data = await resp.json() as { items?: GcsItem[]; nextPageToken?: string };
            if (data.items) for (const item of data.items) results.push(item.name);
            pageToken = data.nextPageToken;
          } while (pageToken);
          return results;
        }));

        // Merge + deduplicate across all pattern results
        const seen = new Set<string>();
        for (const batch of patternResults) {
          for (const name of batch) {
            if (!seen.has(name)) { seen.add(name); matched.push(name); }
          }
        }
      } catch {
        // Fallback: full scan
        job.progress = "Listing PDF files (full scan)…";
        const blobs = await gcsListFiles(GCS_INVOICE_BUCKET, GCS_INVOICE_PDF_PREFIX);
        for (const blob of blobs) {
          if (!blob.name.toLowerCase().endsWith(".pdf")) continue;
          if (blob.name.toLowerCase().includes(monthYear.toLowerCase())) {
            matched.push(blob.name);
          }
        }
      }
    }

    if (matched.length === 0) {
      const errMsg = `No matching invoices found in GCS bucket (${GCS_INVOICE_BUCKET})`;
      job.status = "failed";
      job.error = errMsg;
      job.progress = "No invoices found";

      const db = await getDb();
      if (db) await db.insert(invoiceDownloadHistory).values({
        id: dlId, requestType: reqType, query,
        invoiceCount: 0, fileNames: "[]",
        status: "failed", fileKey: "", errorMsg: errMsg,
        downloadedBy,
      });
      return;
    }

    job.progress = `Downloading ${matched.length} invoice(s)…`;

    // Parallel download with progress updates — higher concurrency for large batches
    const concurrency = matched.length > 50 ? 15 : 10;
    const fileData = await downloadParallel(matched, concurrency, (done, total) => {
      job.progress = `Downloading invoices… (${done}/${total})`;
    });

    job.progress = "Packaging zip…";

    // Pre-fetch S3 presigned URL in parallel with zip packaging to eliminate the
    // presign round-trip from the upload critical path
    const forgeApiUrl = (process.env.BUILT_IN_FORGE_API_URL || "").replace(/\/+$/, "");
    const forgeApiKey = process.env.BUILT_IN_FORGE_API_KEY || "";
    const zipKey = `invoice-downloads/${dlId}_${crypto.randomUUID().replace(/-/g,"").slice(0,8)}.zip`;
    const presignPromise = (async () => {
      if (!forgeApiUrl || !forgeApiKey) return null;
      const presignUrl = new URL("v1/storage/presign/put", forgeApiUrl + "/");
      presignUrl.searchParams.set("path", zipKey);
      const r = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeApiKey}` } });
      if (!r.ok) return null;
      const { url } = await r.json() as { url: string };
      return url || null;
    })();

    // Build zip in memory — use level 1 (fastest) for speed; PDFs are already compressed
    const fileNames = matched.map(n => n.split("/").pop()!);
    const zipChunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const archive = archiver("zip", { zlib: { level: 1 } });
      const pass = new PassThrough();
      pass.on("data", (chunk: Buffer) => zipChunks.push(chunk));
      pass.on("end", resolve);
      pass.on("error", reject);
      archive.on("error", reject);
      archive.pipe(pass);

      for (const { name, data } of fileData) {
        const arcName = name.split("/").pop()!;
        archive.append(data, { name: arcName });
      }
      archive.finalize();
    });

    const zipBuffer = Buffer.concat(zipChunks);
    job.progress = "Uploading zip…";

    // Use pre-fetched presigned URL if available, otherwise fall back to storagePut
    const s3Url = await presignPromise;
    let fileKey: string;
    if (s3Url) {
      const uploadResp = await fetch(s3Url, {
        method: "PUT",
        headers: { "Content-Type": "application/zip" },
        body: new Blob([zipBuffer], { type: "application/zip" }),
      });
      if (!uploadResp.ok) throw new Error(`S3 upload failed (${uploadResp.status})`);
      fileKey = zipKey;
    } else {
      const result = await storagePut(`invoice-downloads/${dlId}.zip`, zipBuffer, "application/zip");
      fileKey = result.key;
    }

    // Log success
    const db = await getDb();
    if (db) await db.insert(invoiceDownloadHistory).values({
      id: dlId, requestType: reqType, query,
      invoiceCount: matched.length,
      fileNames: JSON.stringify(fileNames),
      status: "success", fileKey, errorMsg: null,
      downloadedBy,
    });

    job.status = "done";
    job.downloadId = dlId;
    job.invoiceCount = matched.length;
    job.progress = `Ready — ${matched.length} invoice(s) packaged`;

  } catch (e: any) {
    job.status = "failed";
    job.error = String(e?.message || e);
    job.progress = "Failed";

    try {
      const db2 = await getDb();
      if (db2) await db2.insert(invoiceDownloadHistory).values({
        id: dlId, requestType: reqType, query,
        invoiceCount: 0, fileNames: "[]",
        status: "failed", fileKey: "",
        errorMsg: String(e?.message || e),
        downloadedBy,
      });
    } catch {}
  }
}

export const invoicesDownloadRouter = Router();

// ── POST /request — enqueue job, return immediately ───────────────────────────
invoicesDownloadRouter.post("/request", async (req, res) => {
  let reqType: string = (req.body.request_type || "").trim();
  const rawIdsInput = req.body.invoice_ids;
  const rawIds: string = Array.isArray(rawIdsInput)
    ? rawIdsInput.join(",")
    : (rawIdsInput || "").toString().trim();
  const monthYear: string = (req.body.month_year || "").toString().trim();

  if (rawIds && !reqType) reqType = "invoice_ids";
  if (monthYear && !reqType) reqType = "month_year";

  if (!["invoice_ids", "month_year"].includes(reqType)) {
    return res.status(400).json({ ok: false, error: "Provide invoice_ids or month_year" });
  }
  if (reqType === "invoice_ids" && !rawIds) {
    return res.status(400).json({ ok: false, error: "invoice_ids is required" });
  }
  if (reqType === "month_year" && !monthYear) {
    return res.status(400).json({ ok: false, error: "month_year is required" });
  }
  if (reqType === "month_year" && !/^\d{2}-\d{4}$/.test(monthYear)) {
    return res.status(400).json({ ok: false, error: "month_year must be MM-YYYY (e.g. 04-2025)" });
  }

  const query = reqType === "invoice_ids" ? rawIds : monthYear;
  const jobId = randomUUID();
  const dlId = randomUUID();

  // Register job immediately
  jobs.set(jobId, {
    id: jobId,
    status: "pending",
    progress: "Queued…",
    createdAt: Date.now(),
  });

  // Fire and forget — process runs in background
  const downloadedBy = (req.body.downloaded_by || req.headers["x-qb-user"] || "").toString().trim();
  setImmediate(() => processJob(jobId, dlId, reqType, query, rawIds, monthYear, downloadedBy));

  // Return job ID immediately (no waiting)
  return res.json({ ok: true, job_id: jobId });
});

// ── GET /status/:jobId — poll job progress ────────────────────────────────────
invoicesDownloadRouter.get("/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  return res.json({
    status: job.status,
    progress: job.progress,
    download_id: job.downloadId,
    invoice_count: job.invoiceCount,
    error: job.error,
  });
});

// ── GET /history ──────────────────────────────────────────────────────────────
invoicesDownloadRouter.get("/history", async (_req, res) => {
  try {
    const db = await getDb();
    if (!db) return res.json([]);
    const rows = await db
      .select()
      .from(invoiceDownloadHistory)
      .orderBy(desc(invoiceDownloadHistory.createdAt))
      .limit(200);

    const history = rows.map(r => ({
      id: r.id,
      request_type: r.requestType,
      query: r.query,
      invoice_count: r.invoiceCount,
      file_names: (() => { try { return JSON.parse(r.fileNames || "[]"); } catch { return []; } })(),
      status: r.status,
      file_key: r.fileKey,
      error: r.errorMsg,
      created_at: fmtTimestamp(r.createdAt),
      downloaded_by: r.downloadedBy ?? "",
    }));

    return res.json(history);
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// ── GET /file/:dlId ───────────────────────────────────────────────────────────
invoicesDownloadRouter.get("/file/:dlId", async (req, res) => {
  const { dlId } = req.params;
  if (!/^[a-f0-9\-]+$/.test(dlId)) {
    return res.status(400).json({ error: "Invalid ID" });
  }

  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "Database not available" });
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(invoiceDownloadHistory)
      .where(eq(invoiceDownloadHistory.id, dlId))
      .limit(1);

    const record = rows[0];
    if (!record || !record.fileKey) {
      return res.status(404).json({ error: "File not found — it may have expired" });
    }

    const q = (record.query || dlId).replace(/[^\w\-]/g, "_");
    const ts = (record.createdAt instanceof Date ? fmtTimestamp(record.createdAt) : "")
      .replace(/\//g, "").replace(/:/g, "").replace(/ /g, "_");
    const downloadName = `invoices_${q}_${ts}.zip`;

    const signedUrl = await storageGetSignedUrl(record.fileKey);
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    return res.redirect(307, signedUrl);
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// ── GET /api/invoice-download/sent-invoices ───────────────────────────────────
// Returns rows from daily_invoice_logs where invoice_posted_at = max(invoice_posted_at)
// Supports pagination via ?page=N&limit=N (default limit=50)
invoicesDownloadRouter.get("/sent-invoices", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10));
    const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? "50"), 10)));
    const offset = (page - 1) * limit;

    const bq = getSentInvBqClient();

    const sql = `
      SELECT *
      FROM \`fynd-db.finance_dwh.daily_invoice_logs\`
      WHERE SAFE_CAST(invoice_posted_at AS DATE) IN (
        SELECT MAX(DATE(invoice_posted_at))
        FROM \`fynd-db.finance_dwh.daily_invoice_logs\`
      )
      ORDER BY invoice_posted_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    const countSql = `
      SELECT COUNT(*) AS total
      FROM \`fynd-db.finance_dwh.daily_invoice_logs\`
      WHERE SAFE_CAST(invoice_posted_at AS DATE) IN (
        SELECT MAX(DATE(invoice_posted_at))
        FROM \`fynd-db.finance_dwh.daily_invoice_logs\`
      )
    `;

    const [[rawRows], [countRows]] = await Promise.all([
      bq.query({ query: sql,      useLegacySql: false }),
      bq.query({ query: countSql, useLegacySql: false }),
    ]);

    const rows = (rawRows as Record<string, unknown>[]).map(row =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, serializeBqValue(v)])
      )
    );

    const total = Number((countRows as Record<string, unknown>[])[0]?.total ?? 0);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

    return res.json({ ok: true, rows, columns, total, page, limit });
  } catch (e: any) {
    console.error("[SentInvoices] BQ error:", e?.message || e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

// ── GET /api/invoice-download/sent-invoices/download ─────────────────────────
// Downloads ALL rows from daily_invoice_logs (latest date) as Excel
invoicesDownloadRouter.get("/sent-invoices/download", async (req, res) => {
  try {
    const bq = getSentInvBqClient();
    const sql = `
      SELECT *
      FROM \`fynd-db.finance_dwh.daily_invoice_logs\`
      WHERE SAFE_CAST(invoice_posted_at AS DATE) IN (
        SELECT MAX(DATE(invoice_posted_at))
        FROM \`fynd-db.finance_dwh.daily_invoice_logs\`
      )
      ORDER BY invoice_posted_at DESC
    `;

    const [rawRows] = await bq.query({ query: sql, useLegacySql: false });
    const rows = (rawRows as Record<string, unknown>[]).map(row =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, serializeBqValue(v)])
      )
    );

    // Build Excel using xlsx
    const { utils, write } = await import("xlsx");
    const ws = utils.json_to_sheet(rows);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Sent Invoices");
    const buf = write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="sent_invoices_${today}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buf);
  } catch (e: any) {
    console.error("[SentInvoices] Download error:", e?.message || e);
    return res.status(500).json({ error: String(e?.message || e) });
  }
});
