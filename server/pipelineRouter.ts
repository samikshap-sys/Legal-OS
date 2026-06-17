/**
 * Pipeline Router — DataForm Pipelines + BQ Scheduled Queries
 *
 * Mirrors the Python Flask backend from finops-local/app.py (pipeline section).
 * Three pipeline types:
 *   - recon: DataForm Recon Pipeline (finance_recon_pipeline_asia / recon_pipeline workspace)
 *   - partner: DataForm Partner Pipeline (partner_collection_pipeline / partner_collection workspace)
 *   - scheduler: BigQuery Scheduled Queries (Data Transfer Service)
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { pipelineHistory } from "../drizzle/schema";
import { desc, eq, or, like } from "drizzle-orm";

// ── Config (mirrors _PIPELINE_CONFIGS in app.py) ─────────────────────────────
const PIPELINE_CONFIGS: Record<string, {
  projectId: string;
  region: string;
  repoId?: string;
  workspaceId?: string;
  displayName: string;
  type: "dataform" | "scheduled_query";
  path?: string;
}> = {
  recon: {
    projectId:   "fynd-db",
    region:      "asia-south1",
    repoId:      "finance_recon_pipeline_asia",
    workspaceId: "recon_pipeline",
    displayName: "Recon Pipeline",
    type:        "dataform",
  },
  partner: {
    projectId:   "fynd-db",
    region:      "asia-south1",
    repoId:      "partner_collection_pipeline",
    workspaceId: "partner_collection",
    displayName: "Partner Pipeline",
    type:        "dataform",
  },
  scheduler: {
    projectId:   "fynd-db",
    region:      "asia-south1",
    displayName: "Scheduler",
    type:        "scheduled_query",
    path:        "definitions",
  },
};

// ── Lazy Google SDK clients ───────────────────────────────────────────────────
let _dataformClient: any = null;
let _datatransferClient: any = null;

async function getDataformClient() {
  if (_dataformClient) return _dataformClient;
  const { DataformClient } = await import("@google-cloud/dataform");
  // Use BQ_SERVICE_ACCOUNT_JSON (plan-maker@fynd-db) — same as credentials.json in reference
  const credsRaw = process.env.BQ_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  if (!credsRaw) throw new Error("BQ_SERVICE_ACCOUNT_JSON not set");
  const credentials = JSON.parse(credsRaw);
  _dataformClient = new DataformClient({ credentials });
  return _dataformClient;
}

async function getDataTransferClient() {
  if (_datatransferClient) return _datatransferClient;
  const { DataTransferServiceClient } = await import("@google-cloud/bigquery-data-transfer");
  // Use BQ_SERVICE_ACCOUNT_JSON (plan-maker@fynd-db) — same as credentials.json in reference
  const credsRaw = process.env.BQ_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  if (!credsRaw) throw new Error("BQ_SERVICE_ACCOUNT_JSON not set");
  const credentials = JSON.parse(credsRaw);
  _datatransferClient = new DataTransferServiceClient({ credentials });
  return _datatransferClient;
}

// ── DataForm helpers (mirrors Python helpers in app.py) ───────────────────────
async function compileWorkspace(projectId: string, region: string, repoId: string, workspaceId: string, client: any): Promise<string> {
  const parent = `projects/${projectId}/locations/${region}/repositories/${repoId}`;
  const [result] = await client.createCompilationResult({
    parent,
    compilationResult: {
      gitCommitish: "HEAD",
      workspace: `${parent}/workspaces/${workspaceId}`,
    },
  });
  return result.name;
}

async function runWorkflow(projectId: string, region: string, repoId: string, compilationResultName: string, client: any, queryName?: string): Promise<string> {
  const parent = `projects/${projectId}/locations/${region}/repositories/${repoId}`;
  const invocation: any = { compilationResult: compilationResultName };
  if (queryName) {
    const parts = queryName.split(".", 3);
    let target: any;
    if (parts.length === 3) {
      target = { database: parts[0], schema: parts[1], name: parts[2] };
    } else if (parts.length === 2) {
      target = { schema: parts[0], name: parts[1] };
    } else {
      target = { name: queryName };
    }
    invocation.invocationConfig = { includedTargets: [target] };
  }
  const [result] = await client.createWorkflowInvocation({ parent, workflowInvocation: invocation });
  return result.name;
}

async function listPipelineQueries(projectId: string, region: string, repoId: string, workspaceId: string, client: any): Promise<string[]> {
  const parent = `projects/${projectId}/locations/${region}/repositories/${repoId}`;
  const [cr] = await client.createCompilationResult({
    parent,
    compilationResult: {
      gitCommitish: "HEAD",
      workspace: `${parent}/workspaces/${workspaceId}`,
    },
  });
  const queries = new Set<string>();
  let pageToken: string | undefined;
  do {
    const [resp]: any = await client.queryCompilationResultActions({
      name: cr.name,
      pageSize: 500,
      ...(pageToken ? { pageToken } : {}),
    });
    const actions = Array.isArray(resp) ? resp : (resp?.compilationResultActions ?? []);
    for (const action of actions) {
      const target = action?.target;
      if (!target?.name) continue;
      const database = target.database || "";
      const schema   = target.schema   || "";
      const name     = target.name     || "";
      if (database && schema) queries.add(`${database}.${schema}.${name}`);
      else if (schema)        queries.add(`${schema}.${name}`);
      else                    queries.add(name);
    }
    pageToken = resp?.nextPageToken;
  } while (pageToken);
  return Array.from(queries).sort();
}

async function listScheduledQueries(projectId: string, client: any): Promise<{ name: string; displayName: string }[]> {
  const results: { name: string; displayName: string }[] = [];
  const locations = ["us", "asia-south1", "eu", "us-central1", "us-east1", "asia-southeast1"];
  for (const location of locations) {
    try {
      const parent = `projects/${projectId}/locations/${location}`;
      const [configs] = await client.listTransferConfigs({ parent, dataSourceIds: ["scheduled_query"] });
      for (const cfg of configs) {
        results.push({ name: cfg.name, displayName: cfg.displayName });
      }
    } catch {
      // skip unavailable regions
    }
  }
  results.sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()));
  return results;
}

async function runScheduledQuery(configName: string, client: any): Promise<string> {
  const now = new Date();
  const requestedRunTime = { seconds: Math.floor(now.getTime() / 1000), nanos: 0 };
  const [resp] = await client.startManualTransferRuns({
    parent: configName,
    requestedRunTime,
  });
  const runs = resp?.runs ?? [];
  if (runs.length > 0) return runs[0].name;
  return configName + "/runs/manual";
}

async function getWorkflowInvocationState(runRef: string, client: any): Promise<"running" | "success" | "failed"> {
  const [inv] = await client.getWorkflowInvocation({ name: runRef });
  // Node.js SDK returns string ("SUCCEEDED") while Python SDK returns int (2)
  const s = String(inv.state).toUpperCase();
  if (s === "SUCCEEDED" || s === "2") return "success";
  if (s === "CANCELLED" || s === "FAILED" || s === "3" || s === "4") return "failed";
  return "running";
}

async function getTransferRunState(runRef: string, client: any): Promise<"running" | "success" | "failed"> {
  const [run] = await client.getTransferRun({ name: runRef });
  // Node.js SDK returns string ("SUCCEEDED") while Python SDK returns int (4)
  const s = String(run.state).toUpperCase();
  if (s === "SUCCEEDED" || s === "4") return "success";
  if (s === "FAILED" || s === "CANCELLED" || s === "5" || s === "6") return "failed";
  return "running";
}

// ── tRPC Router ───────────────────────────────────────────────────────────────
export const pipelineRouter = router({
  /** Get list of queries for a given pipeline type */
  getQueries: publicProcedure
    .input(z.object({ pipelineType: z.enum(["recon", "partner", "scheduler"]) }))
    .query(async ({ input }) => {
      const cfg = PIPELINE_CONFIGS[input.pipelineType];
      if (!cfg) throw new Error("Unknown pipeline type");
      try {
        if (cfg.type === "scheduled_query") {
          const client = await getDataTransferClient();
          const configs = await listScheduledQueries(cfg.projectId, client);
          // Format: "Display Name||resource_name"
          return {
            ok: true,
            scheduled: true,
            queries: configs.map(c => `${c.displayName}||${c.name}`),
          };
        } else {
          const client = await getDataformClient();
          const queries = await listPipelineQueries(cfg.projectId, cfg.region!, cfg.repoId!, cfg.workspaceId!, client);
          return { ok: true, scheduled: false, queries };
        }
      } catch (e: any) {
        return { ok: false, scheduled: false, queries: [], error: e.message };
      }
    }),

  /** Trigger a pipeline run */
  run: publicProcedure
    .input(z.object({
      pipelineType:  z.enum(["recon", "partner", "scheduler"]),
      executionMode: z.enum(["full", "single"]).default("full"),
      queryName:     z.string().optional(),
      executedBy:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const cfg = PIPELINE_CONFIGS[input.pipelineType];
      if (!cfg) throw new Error("Unknown pipeline type");
      const db = await getDb();
      let record: any;
      try {
        if (cfg.type === "scheduled_query") {
          const queryName = input.queryName || "";
          if (!queryName) throw new Error("Please select a scheduled query first.");
          // queryName is "Display Name||resource_name"
          const parts = queryName.split("||");
          const resourceName = parts[1] || parts[0];
          const displayLabel = parts[0];
          const client  = await getDataTransferClient();
          const runName = await runScheduledQuery(resourceName, client);
          const invocationId = runName.split("/").pop() || "";
          record = {
            status:        "running",
            jobType:       cfg.displayName,
            executionMode: "Scheduled Query",
            query:         displayLabel,
            invocationId,
            runRef:        runName,
            executedBy:    input.executedBy || "",
          };
          if (db) await db.insert(pipelineHistory).values(record);
          return { ok: true, invocationId, runRef: runName };
        } else {
          const client = await getDataformClient();
          const compilationResult = await compileWorkspace(cfg.projectId, cfg.region!, cfg.repoId!, cfg.workspaceId!, client);
          const invocationName = await runWorkflow(cfg.projectId, cfg.region!, cfg.repoId!, compilationResult, client,
            input.executionMode === "single" ? input.queryName : undefined);
          const invocationId = invocationName.split("/").pop() || "";
          record = {
            status:        "running",
            jobType:       cfg.displayName,
            executionMode: input.executionMode === "single" ? "Single Query" : "Full Workflow",
            query:         input.executionMode === "single" ? (input.queryName || "—") : "—",
            invocationId,
            runRef:        invocationName,
            executedBy:    input.executedBy || "",
          };
          if (db) await db.insert(pipelineHistory).values(record);
          return { ok: true, invocationId, runRef: invocationName };
        }
      } catch (e: any) {
        const failRecord = {
          status:        "failed",
          jobType:       cfg.displayName,
          executionMode: cfg.type === "scheduled_query" ? "Scheduled Query" : (input.executionMode === "single" ? "Single Query" : "Full Workflow"),
          query:         input.queryName || "—",
          invocationId:  "",
          runRef:        "",
          errorMsg:      e.message,
          executedBy:    input.executedBy || "",
        };
        if (db) await db.insert(pipelineHistory).values(failRecord);
        return { ok: false, error: e.message };
      }
    }),

  /** Poll status of a running pipeline */
  pollStatus: publicProcedure
    .input(z.object({
      pipelineType: z.enum(["recon", "partner", "scheduler"]),
      runRef:       z.string(),
      invocationId: z.string(),
    }))
    .query(async ({ input }) => {
      const cfg = PIPELINE_CONFIGS[input.pipelineType];
      if (!cfg) throw new Error("Unknown pipeline type");
      try {
        let state: "running" | "success" | "failed";
        if (cfg.type === "scheduled_query") {
          const client = await getDataTransferClient();
          state = await getTransferRunState(input.runRef, client);
        } else {
          const client = await getDataformClient();
          state = await getWorkflowInvocationState(input.runRef, client);
        }
        // Update DB record if terminal
        if (state !== "running") {
          const db = await getDb();
          if (db) {
            await db.update(pipelineHistory)
              .set({ status: state })
              .where(eq(pipelineHistory.invocationId, input.invocationId));
          }
        }
        return { ok: true, state };
      } catch (e: any) {
        return { ok: false, state: "failed" as const, error: e.message };
      }
    }),

  /** Get pipeline history (all pipelines, filtered client-side by jobType) */
  getHistory: publicProcedure
    .input(z.object({
      search: z.string().optional(),
      limit:  z.number().min(1).max(200).default(100),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [] };

      // ── Auto-reconcile: resolve any "running" rows against GCP ──────────────
      try {
        const runningRows = await db
          .select()
          .from(pipelineHistory)
          .where(eq(pipelineHistory.status, "running"));

        if (runningRows.length > 0) {
          const updates: Promise<any>[] = [];
          for (const row of runningRows) {
            if (!row.runRef) continue;
            const update = (async () => {
              try {
                let state: "running" | "success" | "failed";
                // Determine pipeline type from jobType field
                const isScheduler = row.jobType === "Scheduler";
                if (isScheduler) {
                  const client = await getDataTransferClient();
                  state = await getTransferRunState(row.runRef!, client);
                } else {
                  const client = await getDataformClient();
                  state = await getWorkflowInvocationState(row.runRef!, client);
                }
                if (state !== "running") {
                  await db.update(pipelineHistory)
                    .set({ status: state })
                    .where(eq(pipelineHistory.id, row.id));
                }
              } catch {
                // silently skip rows that can't be polled
              }
            })();
            updates.push(update);
          }
          // Wait for all reconciliation updates (with a 10s timeout)
          await Promise.race([
            Promise.allSettled(updates),
            new Promise(resolve => setTimeout(resolve, 10000)),
          ]);
        }
      } catch {
        // reconciliation errors must not block history fetch
      }
      // ── Fetch fresh rows after reconciliation ───────────────────────────────
      const rows = await db
        .select()
        .from(pipelineHistory)
        .orderBy(desc(pipelineHistory.createdAt))
        .limit(input.limit);
      return { rows };
    }),

  /** Get pipeline config metadata for display */
  getConfig: publicProcedure
    .input(z.object({ pipelineType: z.enum(["recon", "partner", "scheduler"]) }))
    .query(({ input }) => {
      const cfg = PIPELINE_CONFIGS[input.pipelineType];
      return cfg ?? null;
    }),
});
