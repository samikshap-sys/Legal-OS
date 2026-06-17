/**
 * DataForm Pipelines Page
 * Mirrors the reference HTML from finops_querybee/dashboard.html (page-pipelines section)
 * Three tabs: Recon Pipeline | Partner Pipeline | Scheduler
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useQbUser } from "@/contexts/QbUserContext";

type TabType = "recon" | "partner" | "scheduler";
type ExecMode = "full" | "single";
type RunState = "idle" | "triggering" | "running" | "success" | "failed";

interface HistoryRow {
  id: number;
  status: string;
  jobType: string;
  executionMode: string;
  query: string;
  invocationId: string | null;
  runRef: string | null;
  errorMsg: string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
  executedBy?: string;
}

const TAB_LABELS: Record<TabType, string> = {
  recon:     "Recon Pipeline",
  partner:   "Partner Pipeline",
  scheduler: "Scheduler",
};

const META: Record<TabType, { label: string; val: string }[]> = {
  recon: [
    { label: "Project",   val: "fynd-db" },
    { label: "Region",    val: "asia-south1" },
    { label: "Repo",      val: "finance_recon_pipeline_asia" },
    { label: "Workspace", val: "recon_pipeline" },
  ],
  partner: [
    { label: "Project",   val: "fynd-db" },
    { label: "Region",    val: "asia-south1" },
    { label: "Repo",      val: "partner_collection_pipeline" },
    { label: "Workspace", val: "partner_collection" },
  ],
  scheduler: [
    { label: "Project", val: "fynd-db" },
    { label: "Region",  val: "asia-south1" },
    { label: "Repo",    val: "finance_recon_pipeline_asia" },
    { label: "Path",    val: "definitions" },
  ],
};

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase();
  const cls =
    s === "success" ? "pl-status-badge success" :
    s === "running" ? "pl-status-badge running" :
    "pl-status-badge failed";
  const icon =
    s === "success"
      ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      : s === "running"
      ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
  return <span className={cls}>{icon}{status || "—"}</span>;
}

// ── Per-tab panel ─────────────────────────────────────────────────────────────
function PipelinePanel({ tab }: { tab: TabType }) {
  const { qbUser } = useQbUser();
  const [execMode, setExecMode]       = useState<ExecMode>("full");
  const [selectedQuery, setSelected]  = useState("");
  const [runState, setRunState]       = useState<RunState>("idle");
  const [runMsg, setRunMsg]           = useState("");
  const [runRef, setRunRef]           = useState("");
  const [invocationId, setInvId]      = useState("");
  const [histSearch, setHistSearch]   = useState("");
  const [histPage, setHistPage]         = useState(1);
  const [refreshSpin, setRefreshSpin] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isScheduler = tab === "scheduler";

  // Queries list
  const queriesQuery = trpc.pipeline.getQueries.useQuery(
    { pipelineType: tab },
    { retry: false, refetchOnWindowFocus: false }
  );

  // History
  const historyQuery = trpc.pipeline.getHistory.useQuery(
    { limit: 100 },
    { refetchOnWindowFocus: false }
  );

  const runMutation = trpc.pipeline.run.useMutation();

  // Poll status
  const pollStatus = trpc.pipeline.pollStatus.useQuery(
    { pipelineType: tab, runRef, invocationId },
    {
      enabled: runState === "running" && !!runRef,
      refetchInterval: runState === "running" ? 5000 : false,
      retry: false,
    }
  );

  // Auto-poll: update runState when pollStatus resolves
  useEffect(() => {
    if (runState !== "running" || !pollStatus.data) return;
    const { state } = pollStatus.data;
    if (state === "success") {
      setRunState("success");
      setRunMsg(`Execution completed successfully.\nRef: ${invocationId}`);
      historyQuery.refetch();
    } else if (state === "failed") {
      setRunState("failed");
      setRunMsg(`Execution failed.\nRef: ${invocationId}`);
      historyQuery.refetch();
    }
  }, [pollStatus.data, runState]);

  // Auto-refresh history every 5s while any row is still "running"
  useEffect(() => {
    const hasRunning = (historyQuery.data?.rows ?? []).some(
      (r: any) => r.status?.toLowerCase() === "running"
    );
    if (!hasRunning) return;
    const timer = setInterval(() => { historyQuery.refetch(); }, 5000);
    return () => clearInterval(timer);
  }, [historyQuery.data]);

  const handleRun = async () => {
    if (isScheduler) {
      if (!selectedQuery) {
        setRunState("failed");
        setRunMsg("Please select a scheduled query first.");
        return;
      }
    } else if (execMode === "single" && !selectedQuery) {
      setRunState("failed");
      setRunMsg("Please select a query first.");
      return;
    }
    setRunState("triggering");
    setRunMsg("");
    try {
      const result = await runMutation.mutateAsync({
        pipelineType:  tab,
        executionMode: isScheduler ? "single" : execMode,
        queryName:     selectedQuery || undefined,
        executedBy:    qbUser?.email ?? "",
      });
      if (!result.ok) {
        setRunState("failed");
        setRunMsg(result.error || "Unknown error");
        historyQuery.refetch();
        return;
      }
      setRunRef(result.runRef || "");
      setInvId(result.invocationId || "");
      setRunState("running");
      setRunMsg(`Ref: ${result.invocationId} · waiting…`);
      historyQuery.refetch();
    } catch (e: any) {
      setRunState("failed");
      setRunMsg(e.message || "Unknown error");
      historyQuery.refetch();
    }
  };

  const handleRefresh = async () => {
    setRefreshSpin(true);
    await historyQuery.refetch();
    setRefreshSpin(false);
  };

  // Filter history for this tab
  const allRows: HistoryRow[] = (historyQuery.data?.rows ?? []) as HistoryRow[];
  const tabLabel = TAB_LABELS[tab];
  const filtered = allRows.filter(r => {
    if (r.jobType !== tabLabel) return false;
    if (!histSearch) return true;
    const q = histSearch.toLowerCase();
    return (
      r.status?.toLowerCase().includes(q) ||
      r.query?.toLowerCase().includes(q) ||
      r.executionMode?.toLowerCase().includes(q) ||
      formatDate(r.updatedAt).toLowerCase().includes(q)
    );
  });

  const PL_HIST_PAGE_SIZE = 5;
  const histTotalPages = Math.max(1, Math.ceil(filtered.length / PL_HIST_PAGE_SIZE));
  const paginatedFiltered = filtered.slice((histPage - 1) * PL_HIST_PAGE_SIZE, histPage * PL_HIST_PAGE_SIZE);

  const queries: string[] = queriesQuery.data?.queries ?? [];
  const isScheduled = queriesQuery.data?.scheduled ?? false;

  const runBtnLabel = "Run";
  const isBusy = runState === "triggering" || runState === "running";

  return (
    <div className="pl-panel">
      {/* Meta strip */}
      <div className="pl-meta-strip">
        {META[tab].map(m => (
          <div key={m.label} className="pl-meta-chip">
            <span className="pl-meta-chip-label">{m.label}</span>
            <span className="pl-meta-chip-val">{m.val}</span>
          </div>
        ))}
      </div>

      {/* Control card */}
      <div className="pl-ctrl-card">
        <div className="pl-ctrl-header">
          <div className="pl-ctrl-header-icon">
            {isScheduler
              ? /* Calendar/clock icon for Scheduler */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                  <polyline points="9 16 11 18 15 14"/>
                </svg>
              : tab === "recon"
              ? /* Git-branch / reconcile icon for Recon */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="18" r="3"/>
                  <circle cx="6" cy="6" r="3"/>
                  <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
                  <line x1="6" y1="9" x2="6" y2="21"/>
                </svg>
              : /* Network / partner icon for Partner Pipeline */
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="5" r="3"/>
                  <circle cx="5" cy="19" r="3"/>
                  <circle cx="19" cy="19" r="3"/>
                  <line x1="12" y1="8" x2="5" y2="16"/>
                  <line x1="12" y1="8" x2="19" y2="16"/>
                </svg>
            }
          </div>
          <div>
            <div className="pl-ctrl-title">
              {isScheduler ? "Scheduled Queries" : tab === "recon" ? "Reconciliation Pipeline" : "Partner Pipeline"}
            </div>
            <div className="pl-ctrl-sub">
              {isScheduler
                ? "Select and trigger a BigQuery Scheduled Query manually"
                : "Compile workspace and trigger a DataForm workflow invocation"}
            </div>
          </div>
        </div>
        <div className="pl-ctrl-body">
          {!isScheduler && (
            <>
              <div className="pl-exec-label">Execution Mode</div>
              <div className="pl-radio-group">
                <label className="pl-radio">
                  <input
                    type="radio"
                    name={`${tab}-mode`}
                    value="full"
                    checked={execMode === "full"}
                    onChange={() => { setExecMode("full"); setSelected(""); }}
                  />
                  Run Full Pipeline
                </label>
                <label className="pl-radio">
                  <input
                    type="radio"
                    name={`${tab}-mode`}
                    value="single"
                    checked={execMode === "single"}
                    onChange={() => setExecMode("single")}
                  />
                  Run Individual Query
                </label>
              </div>
            </>
          )}

          {(isScheduler || execMode === "single") && (
            <div className="pl-query-select-wrap">
              <div className="pl-query-select-label">
                {isScheduler ? "Select Scheduled Query" : "Select Query"}
              </div>
              <select
                className="pl-query-select"
                value={selectedQuery}
                onChange={e => setSelected(e.target.value)}
                disabled={queriesQuery.isLoading}
              >
                <option value="">
                  {queriesQuery.isLoading
                    ? "Loading queries…"
                    : isScheduler ? "— Select a scheduled query —" : "— Select a query —"}
                </option>
                {queries.map(q => {
                  if (isScheduled) {
                    const parts = q.split("||");
                    return <option key={q} value={q}>{parts[0]}</option>;
                  }
                  return <option key={q} value={q}>{q}</option>;
                })}
              </select>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 4 }}>
            <button
              className="pl-run-btn"
              onClick={handleRun}
              disabled={isBusy}
            >
              {isBusy
                ? <><span className="pl-spin" /> Triggering…</>
                : <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    {runBtnLabel}
                  </>
              }
            </button>
          </div>

          {/* Result banner */}
          {runState !== "idle" && (
            <div className={`pl-result ${runState === "success" ? "ok" : runState === "failed" ? "err" : "running"}`}>
              {runState === "running" && (
                <div className="pl-result-title">
                  <span className="pl-spin" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />
                  Executing…
                </div>
              )}
              {runState === "success" && <div className="pl-result-title">✓ Success</div>}
              {runState === "failed"  && <div className="pl-result-title">✗ Error</div>}
              {runMsg.split("\n").map((line, i) => (
                <div key={i} className={i > 0 ? "pl-result-detail" : ""}>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* History card */}
      <div className="pl-hist-card">
        <div className="pl-hist-header">
          <div className="pl-hist-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            History
          </div>
          <div className="pl-hist-actions">
            <div className="pl-hist-search-wrap">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                className="pl-hist-search"
                type="text"
                placeholder="Search history…"
                value={histSearch}
                onChange={e => { setHistSearch(e.target.value); setHistPage(1); }}
              />
            </div>
            <button className="pl-refresh-btn" onClick={handleRefresh}>
              <svg
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ animation: refreshSpin ? "spin .7s linear infinite" : undefined }}
              >
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Refresh
            </button>
          </div>
        </div>
        <div className="pl-table-wrap">
          <table className="pl-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Updated At</th>
                <th>Job Type</th>
                <th>Execution Mode</th>
                <th>Query</th>
                <th>Executed By</th>
              </tr>
            </thead>
            <tbody>
              {historyQuery.isLoading ? (
                <tr><td colSpan={6} className="pl-empty-row">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="pl-empty-row">No history yet for this pipeline.</td></tr>
              ) : (
                paginatedFiltered.map(r => (
                  <tr key={r.id}>
                    <td><StatusBadge status={r.status} /></td>
                    <td><span className="pl-time-mono">{formatDate(r.updatedAt)}</span></td>
                    <td><span className="pl-type-tag">{r.jobType || "—"}</span></td>
                    <td><span className="pl-mode-tag">{r.executionMode || "—"}</span></td>
                    <td><span className="pl-query-mono">{r.query || "—"}</span></td>
                    <td className="qbd-user-cell">{r.executedBy ? r.executedBy.replace('@gofynd.com', '') : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > PL_HIST_PAGE_SIZE && (
          <div className="qbd-pagination" style={{ marginTop: "10px" }}>
            <button
              className="qbd-page-btn"
              onClick={() => setHistPage(p => Math.max(1, p - 1))}
              disabled={histPage === 1}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Prev
            </button>
            <span className="qbd-page-info">
              Page {histPage} of {histTotalPages}
            </span>
            <button
              className="qbd-page-btn"
              onClick={() => setHistPage(p => Math.min(histTotalPages, p + 1))}
              disabled={histPage === histTotalPages}
            >
              Next
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Pipelines Page ───────────────────────────────────────────────────────
export default function Pipelines() {
  const [activeTab, setActiveTab] = useState<TabType>("recon");

  return (
    <div className="pl-page">
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <path d="M17.5 14v3m0 0v3m0-3h-3m3 0h3"/>
            </svg>
            DataForm Pipelines
          </h1>
        </div>
      </div>

      {/* Tab bar */}
      <div className="pl-tabbar">
        <button
          className={`pl-tab${activeTab === "recon" ? " active" : ""}`}
          onClick={() => setActiveTab("recon")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          Recon Pipeline
        </button>
        <button
          className={`pl-tab${activeTab === "partner" ? " active" : ""}`}
          onClick={() => setActiveTab("partner")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          Partner Pipeline
        </button>
        <button
          className={`pl-tab${activeTab === "scheduler" ? " active" : ""}`}
          onClick={() => setActiveTab("scheduler")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Scheduler
        </button>
      </div>

      {/* Active panel */}
      <PipelinePanel key={activeTab} tab={activeTab} />
    </div>
  );
}
