/**
 * Querypad Router — BigQuery SQL executor
 *
 * Uses the official @google-cloud/bigquery Node.js SDK.
 * - execute: preview (10 rows) — fast
 * - exportCsv / exportExcel: full export via tRPC mutation (base64 encoded)
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import type { Request, Response } from "express";
import { Router as ExpressRouter } from "express";
import { BigQuery } from "@google-cloud/bigquery";
import * as XLSX from "xlsx";
import { getDb } from "./db";
import { queryLogs } from "../drizzle/schema";
import { desc } from "drizzle-orm";
import { getBqClientOAuth } from "./bqOAuth";

// Default project for queries that don't specify a project in the table ID
const DEFAULT_BQ_PROJECT = "fynd-jio-commerceml-prod";

// Returns a BQ client using the owner's stored OAuth refresh token
async function getBqClient(): Promise<BigQuery> {
  return getBqClientOAuth(DEFAULT_BQ_PROJECT);
}

function blockDangerous(query: string) {
  const upper = query.trim().toUpperCase();
  if (upper.startsWith("DROP") || upper.startsWith("TRUNCATE") || upper.startsWith("ALTER")) {
    throw new Error("DROP, TRUNCATE, and ALTER operations are not allowed.");
  }
}

function serializeValue(v: any): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  // BQ SDK wraps DATE, DATETIME, TIME, NUMERIC, BIGNUMERIC, etc. as { value: "..." }
  // Return the raw value string as-is — never alter the data.
  if (typeof v === "object" && v !== null) {
    if ("value" in v) return v.value;
    // BigQuery BigInt / BigNumeric may also be objects with toString
    if (typeof v.toString === "function") return v.toString();
    return JSON.stringify(v);
  }
  return v;
}

async function runPreview(query: string): Promise<{
  columns: string[];
  rows: (string | number | boolean | null)[][];
  message?: string;
}> {
  blockDangerous(query);
  const isSelect = /^\s*SELECT/i.test(query);
  const bq = await getBqClient();

  const [job] = await bq.createQueryJob({ query, useLegacySql: false });

  if (!isSelect) {
    const [, , resp] = await job.getQueryResults({ maxResults: 1 });
    const affected = (resp as any)?.numDmlAffectedRows ?? 0;
    return { columns: [], rows: [], message: `${affected} rows affected` };
  }

  const [rows, , metadata] = await job.getQueryResults({
    maxResults: 10,
    autoPaginate: false,
  });

  const schema = (metadata as any)?.schema?.fields ?? [];
  const columns: string[] = schema.map((f: any) => f.name);
  const serialized = rows.map((row: any) =>
    columns.map((col) => serializeValue(row[col]))
  );
  return { columns, rows: serialized };
}

async function runFullExport(query: string): Promise<{
  columns: string[];
  rows: (string | number | boolean | null)[][];
}> {
  blockDangerous(query);
  const bq = await getBqClient();
  const [job] = await bq.createQueryJob({ query, useLegacySql: false });
  const [rows, , metadata] = await job.getQueryResults({ autoPaginate: true });
  const schema = (metadata as any)?.schema?.fields ?? [];
  const columns: string[] = schema.map((f: any) => f.name);
  const serialized = rows.map((row: any) =>
    columns.map((col) => serializeValue(row[col]))
  );
  return { columns, rows: serialized };
}

function buildCsv(columns: string[], rows: (string | number | boolean | null)[][]): string {
  const lines = [
    columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(","),
    ...rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")),
  ];
  return lines.join("\n");
}

function buildXlsx(columns: string[], rows: (string | number | boolean | null)[][]): Buffer {
  const wsData = [columns, ...rows.map(r => r.map(c => c ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Results");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export const querypadRouter = router({
  status: publicProcedure.query(async () => {
    try {
      await runPreview("SELECT 1");
      return { connected: true };
    } catch (err: any) {
      return { connected: false, error: String(err?.message || err) };
    }
  }),

  execute: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const query = input.query.trim();
      if (!query) throw new Error("Query is empty");
      return await runPreview(query);
    }),

  exportCsv: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { columns, rows } = await runFullExport(input.query.trim());
      const csv = buildCsv(columns, rows);
      const b64 = Buffer.from(csv, "utf-8").toString("base64");
      return { data: b64, totalRows: rows.length };
    }),

  exportExcel: publicProcedure
    .input(z.object({ query: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { columns, rows } = await runFullExport(input.query.trim());
      const xlsxBuf = buildXlsx(columns, rows);
      const b64 = xlsxBuf.toString("base64");
      return { data: b64, totalRows: rows.length };
    }),

  saveLog: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      queryType: z.string(),
      tables: z.array(z.string()),
      rowCount: z.number().default(0),
      elapsed: z.string().default(""),
      executedBy: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) return { ok: false };
        await db.insert(queryLogs).values({
          query: input.query.substring(0, 2000),
          queryType: input.queryType,
          tables: JSON.stringify(input.tables),
          rowCount: input.rowCount,
          elapsed: input.elapsed,
          executedBy: input.executedBy || "",
        });
        return { ok: true };
      } catch (e) {
        console.error("[querypad] saveLog error:", e);
        return { ok: false };
      }
    }),

  getLogs: publicProcedure
    .input(z.object({ limit: z.number().default(50) }).optional())
    .query(async ({ input }) => {
      try {
        const db = await getDb();
        if (!db) return { logs: [] };
        const rows = await db
          .select()
          .from(queryLogs)
          .orderBy(desc(queryLogs.runAt))
          .limit(input?.limit ?? 50);
        return {
          logs: rows.map(r => ({
            id: r.id,
            query: r.query,
            queryType: r.queryType,
            tables: (() => { try { return JSON.parse(r.tables || "[]"); } catch { return []; } })(),
            rowCount: r.rowCount ?? 0,
            elapsed: r.elapsed ?? "",
            runAt: r.runAt,
            executedBy: r.executedBy ?? "",
          })),
        };
      } catch (e) {
        console.error("[querypad] getLogs error:", e);
        return { logs: [] };
      }
    }),
});

// Keep the REST router for backward compat (dev only)
export const querypadExportRouter = ExpressRouter();

querypadExportRouter.post("/export", async (req: Request, res: Response) => {
  const { query, format } = req.body as { query?: string; format?: string };
  if (!query) { res.status(400).json({ error: "query is required" }); return; }
  const fmt = format === "xlsx" ? "xlsx" : "csv";
  try {
    const isSelect = /^\s*SELECT/i.test(query.trim());
    if (!isSelect) { res.status(400).json({ error: "Export only supported for SELECT queries" }); return; }
    const { columns, rows } = await runFullExport(query);
    if (fmt === "csv") {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="query_results.csv"`);
      res.send(buildCsv(columns, rows));
    } else {
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="query_results.xlsx"`);
      res.send(buildXlsx(columns, rows));
    }
  } catch (err: any) {
    if (!res.headersSent) res.status(500).json({ error: err?.message || "Export failed" });
  }
});
