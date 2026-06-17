/**
 * splitterRouter.ts — Invoice Splitter (Simple Sync Approach)
 *
 * POST /api/splitter/process
 *   - Accepts multipart .xlsx upload (up to 50 MB)
 *   - Processes synchronously: reads, splits by invoice col, zips, uploads to S3
 *   - Returns JSON result directly (no SSE, no chunking)
 *
 * GET /api/splitter/download-db/:dbId
 *   - Redirect to signed S3 URL for ZIP download
 *
 * GET /api/splitter/history
 *   - Returns last 50 split jobs
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import archiver from "archiver";
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const XLSX = _require("xlsx") as typeof import("xlsx");
import { jwtVerify } from "jose";
import { getDb } from "./db";
import { splitterJobs } from "../drizzle/schema";
import { storagePut, storageGetSignedUrl } from "./storage";
import { ENV } from "./_core/env";
import { desc } from "drizzle-orm";

export const splitterRouter = Router();

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getQbUser(req: Request): Promise<{ email: string; name: string }> {
  try {
    const token = req.cookies?.["qb_session"];
    if (!token) return { email: "unknown@fynd.com", name: "Unknown" };
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    const { payload } = await jwtVerify(token, secret);
    return {
      email: (payload.email as string) || "unknown@fynd.com",
      name: (payload.name as string) || "Unknown",
    };
  } catch {
    return { email: "unknown@fynd.com", name: "Unknown" };
  }
}

// ── Multer — accept up to 50 MB xlsx ─────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.originalname.endsWith(".xlsx")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .xlsx files are accepted"));
    }
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeJobId(): string {
  return `spl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").slice(0, 100);
}

const INVOICE_COL_PATTERNS = ["inv_no", "invoice_id", "invoice_no", "invoiceid", "invoiceno", "invoice number", "invoice_number"];
const NUMERIC_COL_PATTERNS = ["net_charges", "net_charge", "amount", "total", "value", "net_amount"];

function detectInvoiceCol(cols: string[]): string | null {
  for (const col of cols) {
    const norm = col.trim().toLowerCase().replace(/\s+/g, "_");
    if (INVOICE_COL_PATTERNS.includes(norm)) return col;
  }
  for (const col of cols) {
    if (col.toLowerCase().includes("inv")) return col;
  }
  return null;
}

function detectNumericCol(cols: string[], data: Record<string, unknown>[]): string | null {
  for (const col of cols) {
    const norm = col.trim().toLowerCase().replace(/\s+/g, "_");
    if (NUMERIC_COL_PATTERNS.includes(norm)) return col;
  }
  for (const col of cols) {
    const lc = col.toLowerCase();
    if (["id", "qty", "quantity", "count"].some(x => lc.includes(x))) continue;
    const sample = data.slice(0, 10).map(r => r[col]).filter(v => v != null && v !== "");
    if (sample.length > 0 && sample.every(v => !isNaN(Number(v)))) return col;
  }
  return null;
}

interface SummaryRow {
  num: number;
  invoiceNo: string;
  rows: number;
  numericSum: number | null;
  isSplit: boolean;
}

// ── MAIN: POST /api/splitter/process ─────────────────────────────────────────
splitterRouter.post("/process", upload.single("file"), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ ok: false, error: "No file uploaded" });
    return;
  }

  const qbUser = await getQbUser(req);
  const jobId = makeJobId();
  const logs: string[] = [];
  const log = (msg: string) => { logs.push(msg); };

  const inputPath = path.join(os.tmpdir(), `spl_input_${jobId}.xlsx`);
  fs.writeFileSync(inputPath, req.file.buffer);

  const db = await getDb();
  let dbId: number | null = null;
  try {
    const [result] = await db!.insert(splitterJobs).values({
      userEmail: qbUser.email,
      userName: qbUser.name,
      filename: req.file.originalname,
      status: "processing",
      invoiceCol: "",
      numericCol: "",
      totalInvoices: 0,
      skippedRows: 0,
      zipKey: "",
      summaryJson: "[]",
      bqQuery: "",
      logs: "[]",
    });
    dbId = (result as any).insertId;
  } catch (e) {
    console.error("[splitter] DB insert failed:", e);
  }

  const fail = async (msg: string) => {
    log(`Error: ${msg}`);
    if (dbId) {
      try {
        const { eq } = await import("drizzle-orm");
        await db!.update(splitterJobs)
          .set({ status: "failed", logs: JSON.stringify(logs) })
          .where(eq(splitterJobs.id, dbId));
      } catch {}
    }
    try { fs.unlinkSync(inputPath); } catch {}
    res.status(500).json({ ok: false, error: msg, logs });
  };

  try {
    log(`Reading file: ${req.file.originalname}`);

    const workbook = XLSX.readFile(inputPath, { type: "file" });

    let sheetName = workbook.SheetNames[0];
    let maxRows = 0;
    for (const name of workbook.SheetNames) {
      const ws = workbook.Sheets[name];
      const ref = ws["!ref"];
      if (ref) {
        const range = XLSX.utils.decode_range(ref);
        const rows = range.e.r - range.s.r;
        if (rows > maxRows) { maxRows = rows; sheetName = name; }
      }
    }
    log(`Using sheet: "${sheetName}" (${maxRows} data rows)`);

    const ws = workbook.Sheets[sheetName];
    const rawData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null });

    if (rawData.length === 0) {
      await fail("Sheet is empty — no data rows found.");
      return;
    }

    const columns = Object.keys(rawData[0] as object);
    log(`Detected ${columns.length} columns`);

    const invoiceCol = detectInvoiceCol(columns);
    if (!invoiceCol) {
      await fail(`Could not detect invoice column. Available columns: ${columns.join(", ")}`);
      return;
    }
    log(`Invoice column: "${invoiceCol}"`);

    const numericCol = detectNumericCol(columns, rawData as Record<string, unknown>[]);
    if (numericCol) {
      log(`Numeric validation column: "${numericCol}"`);
    } else {
      log(`No numeric validation column found — proceeding without sum`);
    }

    const validRows = rawData.filter(r => {
      const v = r[invoiceCol];
      return v != null && String(v).trim() !== "" && String(v).trim().toLowerCase() !== "nan";
    });
    const skippedRows = rawData.length - validRows.length;
    if (skippedRows > 0) log(`Skipped ${skippedRows} rows with blank invoice values`);

    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of validRows) {
      const key = String(row[invoiceCol]).trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    log(`Found ${groups.size} unique invoice group(s)`);

    const outDir = path.join(os.tmpdir(), `spl_out_${jobId}`);
    fs.mkdirSync(outDir, { recursive: true });

    const summary: SummaryRow[] = [];
    let totalFiles = 0;

    for (const [invVal, groupRows] of Array.from(groups)) {
      const parts = invVal.includes("&")
        ? invVal.split("&").map(p => p.trim()).filter(Boolean)
        : [invVal];

      for (const part of parts) {
        totalFiles++;
        const isSplit = parts.length > 1;
        const outRows = groupRows.map(r => ({ ...r, [invoiceCol]: part }));
        const newWb = XLSX.utils.book_new();
        const newWs = XLSX.utils.json_to_sheet(outRows);
        XLSX.utils.book_append_sheet(newWb, newWs, "Sheet1");
        const safeName = sanitizeFilename(part);
        const outPath = path.join(outDir, `${safeName}.xlsx`);
        XLSX.writeFile(newWb, outPath);

        const numericSum = numericCol
          ? groupRows.reduce((acc, r) => {
              const v = Number(r[numericCol]);
              return acc + (isNaN(v) ? 0 : v);
            }, 0)
          : null;

        summary.push({ num: totalFiles, invoiceNo: part, rows: groupRows.length, numericSum, isSplit });
        if (isSplit) {
          log(`[${totalFiles}] ${part} (& split from "${invVal}") — ${groupRows.length} rows`);
        } else {
          log(`[${totalFiles}] ${part} — ${groupRows.length} rows`);
        }
      }
    }

    log(`Split complete: ${totalFiles} invoice files created`);
    log(`Creating ZIP archive...`);

    const zipPath = path.join(os.tmpdir(), `split_invoices_${jobId}.zip`);
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 6 } });
      output.on("close", resolve);
      archive.on("error", reject);
      archive.pipe(output);
      archive.directory(outDir, false);
      archive.finalize();
    });

    const zipSizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
    log(`ZIP created: split_invoices.zip (${zipSizeMB} MB)`);

    log(`Uploading ZIP to storage...`);
    const zipBuffer = fs.readFileSync(zipPath);
    const { key: zipKey } = await storagePut(
      `splitter/split_invoices_${jobId}.zip`,
      zipBuffer,
      "application/zip"
    );
    log(`Upload complete`);

    const allInvoiceIds = summary.map(s => s.invoiceNo);
    const bqQuery = "select\n*\nfrom\n`<your_table>`\nwhere Invoice_id in (\n" + allInvoiceIds.map(id => "  '" + id + "'").join(",\n") + "\n)";

    try { fs.unlinkSync(inputPath); } catch {}
    try { fs.rmSync(outDir, { recursive: true }); } catch {}
    try { fs.unlinkSync(zipPath); } catch {}

    if (dbId) {
      try {
        const { eq } = await import("drizzle-orm");
        await db!.update(splitterJobs)
          .set({
            status: "done",
            invoiceCol,
            numericCol: numericCol ?? "",
            totalInvoices: totalFiles,
            skippedRows,
            zipKey,
            summaryJson: JSON.stringify(summary),
            bqQuery,
            logs: JSON.stringify(logs),
          })
          .where(eq(splitterJobs.id, dbId!));
      } catch (e) {
        console.error("[splitter] DB update failed:", e);
      }
    }

    res.json({
      ok: true,
      dbId,
      totalInvoices: totalFiles,
      skippedRows,
      invoiceCol,
      numericCol,
      summary,
      bqQuery,
      zipKey,
      logs,
    });

  } catch (err: any) {
    await fail(err?.message ?? "Unknown processing error");
  }
});

// ── GET /api/splitter/download-db/:dbId ──────────────────────────────────────
splitterRouter.get("/download-db/:dbId", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    const { eq } = await import("drizzle-orm");
    const rows = await db!.select().from(splitterJobs).where(eq(splitterJobs.id, parseInt(req.params.dbId)));
    const record = rows[0];
    if (!record || !record.zipKey) {
      res.status(404).json({ error: "Record not found or no ZIP available" });
      return;
    }
    const signedUrl = await storageGetSignedUrl(record.zipKey);
    res.redirect(302, signedUrl);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to get download URL" });
  }
});

// ── GET /api/splitter/history ─────────────────────────────────────────────────
splitterRouter.get("/history", async (_req: Request, res: Response) => {
  try {
    const db = await getDb();
    const rows = await db!.select().from(splitterJobs).orderBy(desc(splitterJobs.createdAt)).limit(50);
    res.json({ history: rows });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to fetch history" });
  }
});
