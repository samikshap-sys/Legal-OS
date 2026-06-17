/**
 * cashfreeRouter.ts — Two-step SSE approach
 *
 * Step 1: POST /api/cashfree/upload
 *   - Accepts multipart file upload
 *   - Saves to /tmp, creates job record
 *   - Returns { jobId } immediately (no streaming)
 *
 * Step 2: GET /api/cashfree/stream/:jobId
 *   - Browser opens this as a native EventSource
 *   - Spawns Python processor, streams progress events
 *   - Ends with { type: "complete" } or { type: "error" }
 *
 * Step 3: GET /api/cashfree/download/:jobId
 *   - Streams the processed xlsx directly from /tmp
 */

import { Router, Request, Response } from "express";
import multer from "multer";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export const cashfreeRouter = Router();

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

interface CashfreeJob {
  id: string;
  status: "pending" | "processing" | "done" | "error";
  inputPath: string;
  outputPath: string;
  origName: string;
  outputName?: string;
  previewRows?: Record<string, string>[];
  previewCols?: string[];
  errorMsg?: string;
  createdAt: number;
}

const jobs = new Map<string, CashfreeJob>();

// Clean up jobs older than 2 hours
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of Array.from(jobs)) {
    if (job.createdAt < cutoff) {
      try { fs.unlinkSync(job.inputPath); } catch {}
      try { fs.unlinkSync(job.outputPath); } catch {}
      jobs.delete(id);
    }
  }
}, 30 * 60 * 1000);

function makeJobId(): string {
  return `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── STEP 1: POST /api/cashfree/upload ─────────────────────────────────────
// Saves the file and returns jobId immediately — no processing yet
cashfreeRouter.post(
  "/upload",
  upload.single("file"),
  (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const jobId = makeJobId();
    const tmpDir = os.tmpdir();
    const inputPath  = path.join(tmpDir, `cf_input_${jobId}.xlsx`);
    const outputPath = path.join(tmpDir, `cf_output_${jobId}.xlsx`);

    fs.writeFileSync(inputPath, req.file.buffer);

    const job: CashfreeJob = {
      id: jobId,
      status: "pending",
      inputPath,
      outputPath,
      origName: req.file.originalname,
      createdAt: Date.now(),
    };
    jobs.set(jobId, job);

    res.json({ jobId });
  }
);

// ── STEP 2: GET /api/cashfree/stream/:jobId ────────────────────────────────
// Browser opens this as EventSource — spawns Python and streams progress
cashfreeRouter.get("/stream/:jobId", (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (job.status !== "pending") {
    res.status(409).json({ error: "Job already started or completed" });
    return;
  }

  job.status = "processing";

  // SSE headers — disable all buffering
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof (res as any).flush === "function") (res as any).flush();
    } catch { /* client disconnected */ }
  };

  // Heartbeat every 2s
  const heartbeat = setInterval(() => {
    try {
      res.write(": heartbeat\n\n");
      if (typeof (res as any).flush === "function") (res as any).flush();
    } catch { clearInterval(heartbeat); }
  }, 2000);

  // Spawn Python processor with -u for unbuffered stdout
  const scriptPath = path.join(__dirname, "cashfree_processor.py");
  const py = spawn("python3", ["-u", scriptPath, job.inputPath, job.outputPath]);

  let buffer = "";

  py.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.error) {
          job.status = "error";
          job.errorMsg = parsed.error;
          send({ type: "error", message: parsed.error });
        } else {
          send({
            type: "progress",
            step: parsed.step,
            total: parsed.total,
            label: parsed.label,
            detail: parsed.detail ?? "",
            done: parsed.done ?? false,
            extra: parsed,
          });
        }
      } catch { /* ignore non-JSON */ }
    }
  });

  py.stderr.on("data", (chunk: Buffer) => {
    console.error("[cashfree stderr]", chunk.toString());
  });

  py.on("close", async (code) => {
    clearInterval(heartbeat);
    try { fs.unlinkSync(job.inputPath); } catch {}

    if (code !== 0 || job.status === "error") {
      job.status = "error";
      if (!job.errorMsg) job.errorMsg = `Processor exited with code ${code}`;
      send({ type: "error", message: job.errorMsg });
      res.end();
      return;
    }

    // Build preview
    const outName = job.origName.replace(/\.xlsx$/i, "") + "_processed.xlsx";
    job.outputName = outName;
    job.status = "done";

    try {
      const previewData = await buildPreview(job.outputPath);
      job.previewRows = previewData.rows;
      job.previewCols = previewData.cols;
    } catch (e) {
      console.error("[cashfree preview]", e);
    }

    send({
      type: "complete",
      jobId: job.id,
      outputName: outName,
      previewRows: job.previewRows ?? [],
      previewCols: job.previewCols ?? [],
    });

    res.end();
  });
});

// ── STEP 3: GET /api/cashfree/download/:jobId ─────────────────────────────
cashfreeRouter.get("/download/:jobId", (req: Request, res: Response) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.status !== "done" || !job.outputPath) {
    res.status(404).json({ error: "Job not found or not complete" });
    return;
  }
  if (!fs.existsSync(job.outputPath)) {
    res.status(410).json({ error: "Output file has expired. Please re-process." });
    return;
  }
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${job.outputName ?? "cashfree_processed.xlsx"}"`
  );
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  fs.createReadStream(job.outputPath).pipe(res);
});

// ── Helper: build preview ─────────────────────────────────────────────────
async function buildPreview(filePath: string): Promise<{ rows: Record<string, string>[]; cols: string[] }> {
  return new Promise((resolve, reject) => {
    const script = `
import sys, json, pandas as pd
xl = pd.read_excel(sys.argv[1], sheet_name='transfer report', dtype=str, header=4)
df = xl.head(20)
cols = list(df.columns)
rows = df.fillna('').to_dict('records')
print(json.dumps({'cols': cols, 'rows': rows}))
`;
    const tmpScript = path.join(os.tmpdir(), `cf_preview_${Date.now()}.py`);
    fs.writeFileSync(tmpScript, script);
    const py = spawn("python3", [tmpScript, filePath]);
    let out = "";
    py.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    py.stderr.on("data", (d: Buffer) => { console.error("[preview stderr]", d.toString()); });
    py.on("close", (code) => {
      try { fs.unlinkSync(tmpScript); } catch {}
      if (code !== 0) { reject(new Error("Preview extraction failed")); return; }
      try { resolve(JSON.parse(out.trim())); } catch (e) { reject(e); }
    });
  });
}
