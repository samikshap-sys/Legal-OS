/**
 * BQ Upload Express Router
 * Mirrors the Python Flask API from the zip code (finops-local/app.py lines 2290–2595):
 *   POST /api/bq/validate          — validate columns + types, no upload
 *   POST /api/bq/validate-and-upload — validate + load to BigQuery via load job (CSV)
 *   GET  /api/bq/history           — upload history (last 200 records)
 *   GET  /api/bq/download/:id      — download original uploaded file
 *
 * Key design decisions mirroring Python:
 *  - Uses BigQuery LOAD JOB (load_table_from_file) not streaming insert
 *  - Reads file as-is (dtype=str equivalent), renames columns to match schema, then
 *    converts to CSV buffer and loads via LoadJobConfig with WRITE_APPEND
 *  - _norm() uses regex: re.sub(r'[\s_]+', '_', s.strip().lower())
 *  - Saves original file bytes to S3 for download
 *  - Logs history to DB (replaces Python's JSON file)
 */

import { Router } from "express";
import multer from "multer";
import { BigQuery, TableSchema } from "@google-cloud/bigquery";
import * as XLSX from "xlsx";
import { randomUUID } from "crypto";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { getDb } from "./db";
import { bqUploadHistory } from "../drizzle/schema";
import { desc, sql } from "drizzle-orm";
import { storagePut, storageGetSignedUrl } from "./storage";
import { getBqClientOAuth } from "./bqOAuth";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });

// ── BigQuery client (uses owner's OAuth refresh token) ────────────────────────────────────────────────────────────────────────────────────
// projectId is parsed from the user-supplied table ID (e.g. fynd-jio-commerceml-prod.dataset.table)
async function getBqClient(projectId?: string): Promise<BigQuery> {
  return getBqClientOAuth(projectId);
}

// ── Column normaliser (mirrors Python _norm: re.sub(r'[\s_]+', '_', s.strip().lower())) ──
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, "_");
}

// ── Type checker (mirrors Python _bq_check_type exactly) ─────────────────────
function bqCheckType(value: unknown, bqType: string): boolean {
  if (value === null || value === undefined) return true;
  const s = String(value).trim();
  if (s === "" || ["nan", "none", "null"].includes(s.toLowerCase())) return true;
  const t = bqType.toUpperCase();
  try {
    if (["INTEGER", "INT64", "INT", "SMALLINT", "BIGINT", "TINYINT", "BYTEINT"].includes(t)) {
      // Python: int(float(s)) — allow "1.0" → 1
      const n = parseFloat(s);
      if (isNaN(n)) return false;
      return isFinite(n);
    }
    if (["FLOAT", "FLOAT64", "NUMERIC", "BIGNUMERIC", "DECIMAL", "BIGDECIMAL"].includes(t)) {
      const n = parseFloat(s);
      return !isNaN(n) && isFinite(n);
    }
    if (["BOOLEAN", "BOOL"].includes(t)) {
      return ["true", "false", "1", "0", "yes", "no", "t", "f"].includes(s.toLowerCase());
    }
    if (t === "DATE") {
      // Python: datetime.strptime(s, '%Y-%m-%d')
      return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
    }
    if (t === "TIME") {
      // Python: datetime.strptime(s[:8], '%H:%M:%S')
      return /^\d{2}:\d{2}:\d{2}/.test(s);
    }
    if (t === "DATETIME") {
      // Python: tries multiple formats
      const fmts = [
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      ];
      return fmts.some(r => r.test(s)) && !isNaN(Date.parse(s));
    }
    if (t === "TIMESTAMP") {
      const clean = s.replace(" UTC", "").replace("Z", "").trim();
      return !isNaN(Date.parse(clean));
    }
    // STRING, BYTES, JSON, RECORD, STRUCT, GEOGRAPHY — always valid
    return true;
  } catch {
    return false;
  }
}

// ── Parse file buffer to {columns, rows} (mirrors pd.read_csv/read_excel dtype=str) ──
function parseFile(buffer: Buffer, fileType: string): { columns: string[]; rows: Record<string, string>[] } {
  if (fileType === "csv") {
    // For CSV: parse as raw text to preserve exact string values (mirrors pd.read_csv(dtype=str))
    // Using type:"string" tells XLSX to treat the buffer as a CSV text string
    const csvText = buffer.toString("utf-8");
    const wb = XLSX.read(csvText, { type: "string", raw: true, cellText: false, cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: true });
    const columns = data.length > 0 ? Object.keys(data[0]) : [];
    return { columns, rows: data.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? "")]))) };
  }
  // For XLSX: use cellText mode to get formatted string representations
  const wb = XLSX.read(buffer, { type: "buffer", raw: false, cellText: true, cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
  const columns = data.length > 0 ? Object.keys(data[0]) : [];
  return { columns, rows: data };
}

// ── Convert rows to CSV string (mirrors df.to_csv(index=False)) ──────────────
function rowsToCsv(columns: string[], rows: Record<string, string>[]): string {
  const escape = (v: string) => {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = columns.map(escape).join(",");
  const body = rows.map(row => columns.map(c => escape(row[c] ?? "")).join(",")).join("\n");
  return header + "\n" + body;
}

// ── Router ────────────────────────────────────────────────────────────────────
export const bqUploadRouter = Router();

/**
 * POST /api/bq/validate
 * Mirrors Python bq_validate_only() exactly.
 * Validates file columns + datatypes against BQ schema — no upload.
 */
bqUploadRouter.post("/validate", upload.single("file"), async (req, res) => {
  try {
    const tableId  = (req.body.table_id  || "").trim();
    const fileType = (req.body.file_type || "").trim().toLowerCase();
    const file     = req.file;

    if (!tableId)                              return res.status(400).json({ ok: false, error: "Table ID is required" });
    if (!["csv", "xlsx"].includes(fileType))   return res.status(400).json({ ok: false, error: "File type must be csv or xlsx" });
    if (!file)                                 return res.status(400).json({ ok: false, error: "No file uploaded" });

    // ── Parse file (dtype=str equivalent) ──────────────────────────────────
    const { columns: dfColumns, rows } = parseFile(file.buffer, fileType);

    // ── Fetch BQ schema ─────────────────────────────────────────────────────
    const parts = tableId.split(".");
    if (parts.length !== 3) return res.status(400).json({ ok: false, error: "Table ID must be in format project.dataset.table" });
    const [tableProject, tableDataset, tableName] = parts;
    const bq = await getBqClient(tableProject); // use project from table ID
    const [tableRef] = await bq.dataset(tableDataset).table(tableName).get();
    const schemaFields = (tableRef.metadata.schema?.fields || []) as { name: string; field_type?: string; type?: string }[];
    // Normalise field_type vs type (BQ Node SDK uses 'type')
    const schema: { name: string; type: string }[] = schemaFields.map(f => ({ name: f.name, type: (f.field_type || f.type || "STRING") }));

    // ── Column validation ───────────────────────────────────────────────────────────────────────
    const dfNorm:     Record<string, string>                    = {};
    const schemaNorm: Record<string, { name: string; type: string }> = {};
    for (const c of dfColumns)  dfNorm[norm(c)]     = c;
    for (const f of schema)     schemaNorm[norm(f.name)] = f;

    const missing = Object.keys(schemaNorm).filter(k => !(k in dfNorm)).map(k => schemaNorm[k].name);
    const extra   = Object.keys(dfNorm).filter(k => !(k in schemaNorm)).map(k => dfNorm[k]);
    const schemaSummary = schema.map(f => ({ name: f.name, type: f.type }));

    if (missing.length > 0 || extra.length > 0) {
      return res.json({
        ok: false,
        columns_valid: false,
        missing,
        extra,
        type_errors: [],
        schema: schemaSummary,
        total_rows: rows.length,
        total_columns: schema.length,
      });
    }

    // ── Align columns (rename df cols to match schema) ──────────────────────
    const renameMap: Record<string, string> = {};
    for (const k of Object.keys(schemaNorm)) {
      if (k in dfNorm) renameMap[dfNorm[k]] = schemaNorm[k].name;
    }
    const renamedRows = rows.map(row => {
      const newRow: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) newRow[renameMap[k] ?? k] = String(v ?? "");
      return newRow;
    });

    // ── Datatype validation — up to 5 bad samples per column ───────────────
    const MAX_SAMPLES = 5;
    const typeErrors: { column: string; expected_type: string; samples: { row: number; value: string }[] }[] = [];
    for (const field of schema) {
      const samples: { row: number; value: string }[] = [];
      for (let i = 0; i < renamedRows.length; i++) {
        const val = renamedRows[i][field.name] ?? "";
        if (!bqCheckType(val, field.type)) {
          samples.push({ row: i + 2, value: String(val) });
          if (samples.length >= MAX_SAMPLES) break;
        }
      }
      if (samples.length > 0) typeErrors.push({ column: field.name, expected_type: field.type, samples });
    }

    return res.json({
      ok: typeErrors.length === 0,
      columns_valid: true,
      type_errors: typeErrors,
      schema: schemaSummary,
      total_rows: rows.length,
      total_columns: schema.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * POST /api/bq/validate-and-upload
 * Mirrors Python bq_validate_and_upload() exactly.
 * Uses BigQuery LOAD JOB (load_table_from_file with CSV) — same as Python.
 * Data is uploaded as-is (only column headers renamed to match schema).
 */
bqUploadRouter.post("/validate-and-upload", upload.single("file"), async (req, res) => {
  const tableId    = (req.body.table_id    || "").trim();
  const fileType   = (req.body.file_type   || "").trim().toLowerCase();
  const uploadedBy = (req.body.uploaded_by || "").trim() || "anonymous";
  const file       = req.file;
  const uploadId   = randomUUID();
  const originalFileName = file?.originalname || req.body.file_name || "";

  if (!tableId)                            return res.status(400).json({ ok: false, error: "Table ID is required" });
  if (!["csv", "xlsx"].includes(fileType)) return res.status(400).json({ ok: false, error: "File type must be csv or xlsx" });
  if (!file)                               return res.status(400).json({ ok: false, error: "No file uploaded" });

  const nowStr = () => {
    const d = new Date();
    return `${String(d.getUTCDate()).padStart(2,"0")}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}:${String(d.getUTCSeconds()).padStart(2,"0")}`;
  };

  try {
    // ── Parse file (dtype=str equivalent) ──────────────────────────────────
    const { columns: dfColumns, rows } = parseFile(file.buffer, fileType);

    // ── Fetch BQ schema ─────────────────────────────────────────────────────
    const parts = tableId.split(".");
    if (parts.length !== 3) return res.status(400).json({ ok: false, error: "Table ID must be in format project.dataset.table" });
    const [tableProject, tableDataset, tableName] = parts;
    const bq = await getBqClient(tableProject); // use project from table ID
    const [tableRef] = await bq.dataset(tableDataset).table(tableName).get();
    const schemaFields = (tableRef.metadata.schema?.fields || []) as { name: string; field_type?: string; type?: string }[];
    const schema: { name: string; type: string }[] = schemaFields.map(f => ({ name: f.name, type: (f.field_type || f.type || "STRING") }));
    const fieldNames = schema.map(f => f.name);

    // ── Column validation ───────────────────────────────────────────────────
    const dfNorm:     Record<string, string> = {};
    const schemaNorm: Record<string, string> = {};
    for (const c of dfColumns) dfNorm[norm(c)]     = c;
    for (const f of fieldNames) schemaNorm[norm(f)] = f;

    const missing = Object.keys(schemaNorm).filter(k => !(k in dfNorm)).map(k => schemaNorm[k]);
    const extra   = Object.keys(dfNorm).filter(k => !(k in schemaNorm)).map(k => dfNorm[k]);

    if (missing.length > 0 || extra.length > 0) {
      const msgParts: string[] = [];
      if (missing.length) msgParts.push(`Missing columns: ${missing.join(", ")}`);
      if (extra.length)   msgParts.push(`Extra columns: ${extra.join(", ")}`);
      return res.json({ ok: false, error: msgParts.join("; "), validation_error: true, missing, extra });
    }

    // ── Align columns: rename df cols to schema names, reorder ─────────────
    // Mirrors Python: rename_map = {df_norm[k]: schema_norm[k] for k in schema_norm if k in df_norm}
    //                 df = df.rename(columns=rename_map)[schema_fields]
    const renameMap: Record<string, string> = {};
    for (const k of Object.keys(schemaNorm)) {
      if (k in dfNorm) renameMap[dfNorm[k]] = schemaNorm[k];
    }
    const alignedRows = rows.map(row => {
      const newRow: Record<string, string> = {};
      for (const fn of fieldNames) {
        // find original column key that maps to fn
        const origKey = Object.keys(renameMap).find(k => renameMap[k] === fn);
        newRow[fn] = origKey !== undefined ? String(row[origKey] ?? "") : "";
      }
      return newRow;
    });

    // ── Convert to CSV buffer (mirrors df.to_csv(index=False)) ─────────────
    const csvString = rowsToCsv(fieldNames, alignedRows);
    const csvBuffer = Buffer.from(csvString, "utf-8");

    // ── Upload via BigQuery LOAD JOB (mirrors bq.load_table_from_file) ─────
    // Write CSV to temp file (Node SDK requires file path, not stream)
    const tmpCsvPath = join(tmpdir(), `bq_upload_${uploadId}.csv`);
    writeFileSync(tmpCsvPath, csvBuffer);
    let loadJobError: string | null = null;
    try {
      const jobConfig = {
        writeDisposition: "WRITE_APPEND" as const,
        schema: tableRef.metadata.schema as TableSchema,
        sourceFormat: "CSV" as const,
        skipLeadingRows: 1,
      };
      const [job] = await bq.dataset(tableDataset).table(tableName).load(tmpCsvPath, jobConfig);
      // job.load() already waits for completion and throws on error
    } catch (loadErr: unknown) {
      loadJobError = loadErr instanceof Error ? loadErr.message : String(loadErr);
    } finally {
      try { unlinkSync(tmpCsvPath); } catch { /* ignore cleanup error */ }
    }
    if (loadJobError) throw new Error(loadJobError);

    // ── Save original file bytes to S3 ──────────────────────────────────────
    const ext     = fileType === "xlsx" ? "xlsx" : "csv";
    const fileKey = `bq-uploads/${uploadId}.${ext}`;
    const { url: fileUrl } = await storagePut(fileKey, file.buffer, file.mimetype || "application/octet-stream");

    // ── Log success to DB ────────────────────────────────────────────────────
    const db = await getDb();
    if (db) {
      await db.insert(bqUploadHistory).values({
        id: uploadId,
        tableId,
        fileType: fileType.toUpperCase(),
        status: "success",
        totalColumns: fieldNames.length,
        totalRows: alignedRows.length,
        uploadedBy,
        fileKey,
        fileUrl,
        fileName: originalFileName,
        uploadedAt: new Date(),
      });
    }

    return res.json({
      ok: true,
      total_rows: alignedRows.length,
      total_columns: fieldNames.length,
      upload_id: uploadId,
      table_id: tableId,
      file_name: originalFileName,
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Log failure to DB
    try {
      const db = await getDb();
      if (db) {
        await db.insert(bqUploadHistory).values({
          id: uploadId,
          tableId,
          fileType: fileType.toUpperCase(),
          status: "failed",
          totalColumns: 0,
          totalRows: 0,
          uploadedBy,
          fileName: originalFileName,
          errorMsg: msg,
          uploadedAt: new Date(),
        });
      }
    } catch { /* ignore logging error */ }
    return res.status(500).json({ ok: false, error: msg });
  }
});

/**
 * GET /api/bq/history
 * Returns upload history (mirrors Python bq_upload_history returning JSON list).
 */
bqUploadRouter.get("/history", async (req, res) => {
  try {
    const searchQ = ((req.query.search as string) || "").trim().toLowerCase();
    const db = await getDb();
    if (!db) return res.json({ history: [] });

    const rows = await db
      .select()
      .from(bqUploadHistory)
      .orderBy(desc(bqUploadHistory.uploadedAt))
      .limit(200);

    const filtered = searchQ
      ? rows.filter(r =>
          r.tableId.toLowerCase().includes(searchQ) ||
          (r.uploadedBy || "").toLowerCase().includes(searchQ)
        )
      : rows;

    // Format uploaded_at as dd/mm/yyyy HH:MM:SS (mirrors Python strftime('%d/%m/%Y %H:%M:%S'))
    const formatDate = (d: Date | null | undefined) => {
      if (!d) return "";
      const dt = d instanceof Date ? d : new Date(d);
      if (isNaN(dt.getTime())) return "";
      return `${String(dt.getUTCDate()).padStart(2,"0")}/${String(dt.getUTCMonth()+1).padStart(2,"0")}/${dt.getUTCFullYear()} ${String(dt.getUTCHours()).padStart(2,"0")}:${String(dt.getUTCMinutes()).padStart(2,"0")}:${String(dt.getUTCSeconds()).padStart(2,"0")}`;
    };

    return res.json({
      history: filtered.map(r => ({
        id:           r.id,
        table_id:     r.tableId,
        file_type:    r.fileType,
        status:       r.status,
        total_columns: r.totalColumns,
        total_rows:   r.totalRows,
        uploaded_at:  formatDate(r.uploadedAt),
        uploaded_by:  r.uploadedBy,
        has_file:     !!(r.fileKey),
        file_name:    r.fileName || undefined,
        error:        r.errorMsg || undefined,
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/bq/download/:id
 * Returns a presigned S3 URL to download the original uploaded file.
 * Mirrors Python bq_upload_download() which sends the file directly.
 */
bqUploadRouter.get("/download/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!/^[a-f0-9-]+$/.test(id)) return res.status(400).json({ error: "Invalid ID" });
    const db = await getDb();
    if (!db) return res.status(503).json({ error: "Database unavailable" });
    const rows = await db
      .select()
      .from(bqUploadHistory)
      .where(sql`${bqUploadHistory.id} = ${id}`)
      .limit(1);
    const record = rows[0];
    if (!record || !record.fileKey) return res.status(404).json({ error: "File not found" });
    const url = await storageGetSignedUrl(record.fileKey);
    return res.redirect(url);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: msg });
  }
});
