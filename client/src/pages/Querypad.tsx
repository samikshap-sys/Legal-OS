/**
 * Querypad — SQL editor for BigQuery
 * Design: pale teal header, white editor body, white results card with teal border
 * Features: 10-row preview, tRPC-based full CSV/Excel export, DB-persisted query logs
 */
import { useRef, useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useQbUser } from "@/contexts/QbUserContext";

const QP_PREVIEW_ROWS = 10;

interface QpData {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  message?: string;
}

type QueryType = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CREATE" | "OTHER";

function detectQueryType(query: string): QueryType {
  const upper = query.trim().toUpperCase();
  if (upper.startsWith("SELECT")) return "SELECT";
  if (upper.startsWith("INSERT")) return "INSERT";
  if (upper.startsWith("UPDATE")) return "UPDATE";
  if (upper.startsWith("DELETE")) return "DELETE";
  if (upper.startsWith("CREATE")) return "CREATE";
  return "OTHER";
}

function extractTables(query: string): string[] {
  const tables: string[] = [];
  const patterns = [
    /\bFROM\s+`?([a-zA-Z0-9_.\-]+)`?/gi,
    /\bJOIN\s+`?([a-zA-Z0-9_.\-]+)`?/gi,
    /\bINTO\s+`?([a-zA-Z0-9_.\-]+)`?/gi,
    /\bUPDATE\s+`?([a-zA-Z0-9_.\-]+)`?/gi,
  ];
  for (const pattern of patterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(query)) !== null) {
      const t = m[1].trim();
      if (t && !tables.includes(t)) tables.push(t);
    }
  }
  return tables;
}

function queryTypeBadgeStyle(type: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    SELECT: { bg: "#e0f2fe", color: "#0369a1" },
    INSERT: { bg: "#dcfce7", color: "#15803d" },
    UPDATE: { bg: "#fef9c3", color: "#854d0e" },
    DELETE: { bg: "#fee2e2", color: "#b91c1c" },
    CREATE: { bg: "#f3e8ff", color: "#7c3aed" },
    OTHER:  { bg: "#f1f5f9", color: "#475569" },
  };
  const s = map[type] ?? map.OTHER;
  return {
    background: s.bg,
    color: s.color,
    fontSize: "0.65rem",
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: "6px",
    letterSpacing: "0.05em",
    textTransform: "uppercase" as const,
    flexShrink: 0,
  };
}

function formatRunAt(runAt: Date | string): string {
  const d = typeof runAt === "string" ? new Date(runAt) : runAt;
  if (isNaN(d.getTime())) return String(runAt);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Querypad() {
  const { qbUser } = useQbUser();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const linesRef = useRef<HTMLDivElement>(null);
  const curPosRef = useRef<HTMLSpanElement>(null);

  const [qpData, setQpData] = useState<QpData | null>(null);
  const [msgState, setMsgState] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [rowCount, setRowCount] = useState(0);
  const [execTime, setExecTime] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [lastQuery, setLastQuery] = useState("");

  const statusQuery = trpc.querypad.status.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const connected = statusQuery.data?.connected ?? null;

  // DB-backed logs
  const logsQuery = trpc.querypad.getLogs.useQuery(
    { limit: 50 },
    { refetchOnWindowFocus: false }
  );
  const saveLogMutation = trpc.querypad.saveLog.useMutation({
    onSuccess: () => logsQuery.refetch(),
  });
  const utils = trpc.useUtils();

  const executeMutation = trpc.querypad.execute.useMutation();
  const exportCsvMutation = trpc.querypad.exportCsv.useMutation();
  const exportExcelMutation = trpc.querypad.exportExcel.useMutation();

  const updateLines = useCallback(() => {
    const ta = textareaRef.current;
    const ln = linesRef.current;
    if (!ta || !ln) return;
    const count = (ta.value.match(/\n/g) || []).length + 1;
    ln.innerHTML = Array.from({ length: count }, (_, i) => i + 1).join("<br>");
  }, []);

  const updateCursor = useCallback(() => {
    const ta = textareaRef.current;
    const cp = curPosRef.current;
    if (!ta || !cp) return;
    const val = ta.value.substring(0, ta.selectionStart);
    const ln = (val.match(/\n/g) || []).length + 1;
    const col = val.length - val.lastIndexOf("\n");
    cp.textContent = `Ln ${ln}, Col ${col}`;
  }, []);

  const handleExecute = useCallback(async () => {
    const ta = textareaRef.current;
    const query = (ta?.value || "").trim();
    if (!query || isRunning) return;

    setIsRunning(true);
    setMsgState(null);
    setShowResults(false);

    const startTime = performance.now();
    try {
      const data = await executeMutation.mutateAsync({ query });
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      const isSelect = /^\s*SELECT/i.test(query);
      const count = data.rows?.length ?? 0;
      const label = isSelect
        ? `Preview ready (showing first ${count} rows)`
        : (data.message || "Query executed");
      setLastQuery(query);
      setMsgState({ type: "success", text: `✓ ${label} [${elapsed}s]` });
      setQpData(data);

      if (data.columns?.length && data.rows?.length) {
        setShowResults(true);
        setRowCount(count);
        setExecTime(`${elapsed}s`);
      }

      // Save log to DB
      const qType = detectQueryType(query);
      const tables = extractTables(query);
      saveLogMutation.mutate({
        query: query.substring(0, 2000),
        queryType: qType,
        tables,
        rowCount: count,
        elapsed: `${elapsed}s`,
        executedBy: qbUser?.email ?? "",
      });
    } catch (err: any) {
      setMsgState({ type: "error", text: `✗ ${err?.message || "Query failed"}` });
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, executeMutation, saveLogMutation]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const onInput = () => updateLines();
    const onCursorMove = () => updateCursor();
    const onScroll = () => {
      if (linesRef.current) linesRef.current.scrollTop = ta.scrollTop;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleExecute();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const start = ta.selectionStart;
        ta.value = ta.value.substring(0, start) + "  " + ta.value.substring(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = start + 2;
        updateLines();
      }
    };
    ta.addEventListener("input", onInput);
    ta.addEventListener("click", onCursorMove);
    ta.addEventListener("keyup", onCursorMove);
    ta.addEventListener("scroll", onScroll);
    ta.addEventListener("keydown", onKeyDown);
    return () => {
      ta.removeEventListener("input", onInput);
      ta.removeEventListener("click", onCursorMove);
      ta.removeEventListener("keyup", onCursorMove);
      ta.removeEventListener("scroll", onScroll);
      ta.removeEventListener("keydown", onKeyDown);
    };
  }, [updateLines, updateCursor, handleExecute]);

  const handleClear = () => {
    if (textareaRef.current) textareaRef.current.value = "";
    if (linesRef.current) linesRef.current.innerHTML = "1";
    if (curPosRef.current) curPosRef.current.textContent = "Ln 1, Col 1";
    setMsgState(null);
    setShowResults(false);
    setQpData(null);
  };

  const downloadFromBase64 = (b64: string, filename: string, mime: string) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    if (!lastQuery || isExporting) return;
    setIsExporting(true);
    try {
      const result = await exportCsvMutation.mutateAsync({ query: lastQuery });
      downloadFromBase64(result.data, "query_results.csv", "text/csv");
    } catch (e: any) {
      alert(e?.message || "CSV export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!lastQuery || isExporting) return;
    setIsExporting(true);
    try {
      const result = await exportExcelMutation.mutateAsync({ query: lastQuery });
      downloadFromBase64(result.data, "query_results.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } catch (e: any) {
      alert(e?.message || "Excel export failed");
    } finally {
      setIsExporting(false);
    }
  };

  const restoreFromLog = (query: string) => {
    if (!textareaRef.current) return;
    textareaRef.current.value = query;
    const count = (query.match(/\n/g) || []).length + 1;
    if (linesRef.current) {
      linesRef.current.innerHTML = Array.from({ length: count }, (_, i) => i + 1).join("<br>");
    }
    updateCursor();
  };

  const renderTable = () => {
    if (!qpData?.columns?.length) return null;
    const previewRows = qpData.rows.slice(0, QP_PREVIEW_ROWS);
    return (
      <div className="qp-table-wrap">
        <table className="qp-table">
          <thead>
            <tr>{qpData.columns.map(c => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {previewRows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} title={String(cell ?? "")}>{cell ?? ""}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const dbLogs = logsQuery.data?.logs ?? [];
  const QP_LOGS_PAGE_SIZE = 10;
  const [logsPage, setLogsPage] = useState(1);
  const logsTotalPages = Math.max(1, Math.ceil(dbLogs.length / QP_LOGS_PAGE_SIZE));
  const paginatedLogs = dbLogs.slice((logsPage - 1) * QP_LOGS_PAGE_SIZE, logsPage * QP_LOGS_PAGE_SIZE);

  // Query Logs slicers
  const [logSlicerType, setLogSlicerType] = useState<string>("all");
  const [logSlicerUser, setLogSlicerUser] = useState<string>("all");
  const [logSlicerFrom, setLogSlicerFrom] = useState<string>("");
  const [logSlicerTo, setLogSlicerTo] = useState<string>("");

  // Derived unique values
  const uniqueLogTypes = Array.from(new Set(dbLogs.map(l => l.queryType).filter(Boolean)));
  const uniqueLogUsers = Array.from(new Set(dbLogs.map(l => l.executedBy || "").filter(Boolean)));

  // Filtered logs
  const filteredLogs = dbLogs.filter(log => {
    if (logSlicerType !== "all" && log.queryType !== logSlicerType) return false;
    if (logSlicerUser !== "all" && (log.executedBy || "") !== logSlicerUser) return false;
    if (logSlicerFrom) {
      const d = new Date(log.runAt);
      const f = new Date(logSlicerFrom);
      if (!isNaN(d.getTime()) && !isNaN(f.getTime()) && d < f) return false;
    }
    if (logSlicerTo) {
      const d = new Date(log.runAt);
      const t = new Date(logSlicerTo + "T23:59:59");
      if (!isNaN(d.getTime()) && !isNaN(t.getTime()) && d > t) return false;
    }
    return true;
  });
  const filteredLogsTotalPages = Math.max(1, Math.ceil(filteredLogs.length / QP_LOGS_PAGE_SIZE));
  const paginatedFilteredLogs = filteredLogs.slice((logsPage - 1) * QP_LOGS_PAGE_SIZE, logsPage * QP_LOGS_PAGE_SIZE);

  return (
    <div style={{ padding: "28px 20px", position: "relative" }}>
      {/* CONNECTED status — top right */}
      <div className="qp-status-bar">
        <span
          className="qp-status-dot"
          style={{ background: connected === null ? "#94a3b8" : connected ? "#22c55e" : "#ef4444" }}
        />
        <span className="qp-status-label">
          {connected === null ? "CONNECTING..." : connected ? "CONNECTED" : "DISCONNECTED"}
        </span>
      </div>

      {/* Page header */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#111", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
          </svg>
          Querypad
        </h1>
      </div>

      {/* SQL Editor */}
      <div className="qp-editor-wrap">
        <div className="qp-editor-header">
          <div className="qp-editor-tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
            </svg>
            SQL Query
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button className="qp-clear-btn" onClick={handleClear}>Clear</button>
            <button className="qp-run-btn" onClick={handleExecute} disabled={isRunning}>
              {isRunning ? (
                <span style={{ animation: "spin 0.8s linear infinite", display: "inline-block" }}>◎</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              )}
              {isRunning ? " Running..." : " Execute"}
            </button>
          </div>
        </div>
        <div className="qp-editor-body">
          <div className="qp-line-numbers" ref={linesRef}>1</div>
          <textarea
            ref={textareaRef}
            className="qp-textarea"
            spellCheck={false}
            placeholder="SELECT * FROM your_dataset.your_table LIMIT 10"
          />
        </div>
        <div className="qp-editor-footer">
          <span ref={curPosRef}>Ln 1, Col 1</span>
          <span className="qp-shortcut">Ctrl+Enter to execute</span>
        </div>
      </div>

      {/* Messages */}
      {msgState && (
        <div className={msgState.type === "success" ? "qp-msg-success" : "qp-msg-error"} style={{ marginTop: "16px" }}>
          {msgState.text}
        </div>
      )}

      {/* Results — white card with teal border */}
      {showResults && qpData && (
        <div className="qp-results-card" style={{ marginTop: "16px" }}>
          <div className="qp-results-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span className="qp-results-title">Results</span>
              <span className="qp-badge">{rowCount} rows</span>
              <span className="qp-badge qp-badge-time">{execTime}</span>
              <span style={{ fontSize: "0.72rem", color: "#374151", fontStyle: "italic" }}>
                Preview — first {QP_PREVIEW_ROWS} rows · Download for full data
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {isExporting && <span style={{ fontSize: "0.75rem", color: "#374151" }}>Exporting all rows…</span>}
              <button className="qp-dl-btn" onClick={handleExportCsv} disabled={isExporting || !lastQuery}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                CSV
              </button>
              <button className="qp-dl-btn" onClick={handleExportExcel} disabled={isExporting || !lastQuery}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Excel
              </button>
            </div>
          </div>
          {renderTable()}
        </div>
      )}

      {/* Query Logs — DB-persisted table */}
      <div className="qp-history-section">
        {/* Header row */}
        <div className="qp-logs-header">
          <div className="qp-logs-header-left">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span className="qp-logs-header-title">Query Logs</span>
            {logsQuery.isFetching && (
              <span style={{ fontSize: "0.7rem", color: "#94a3b8", marginLeft: "8px" }}>Loading…</span>
            )}
          </div>
          <button
            className="qp-logs-refresh-btn"
            onClick={() => logsQuery.refetch()}
            disabled={logsQuery.isFetching}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: logsQuery.isFetching ? "spin .7s linear infinite" : undefined }}>
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>

        {/* Slicers */}
        <div className="invex-slicers-row">
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">Type</label>
            <select
              className="invex-slicer-select"
              value={logSlicerType}
              onChange={e => { setLogSlicerType(e.target.value); setLogsPage(1); }}
            >
              <option value="all">All Types</option>
              {uniqueLogTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">Executed By</label>
            <select
              className="invex-slicer-select"
              value={logSlicerUser}
              onChange={e => { setLogSlicerUser(e.target.value); setLogsPage(1); }}
            >
              <option value="all">All Users</option>
              {uniqueLogUsers.map(u => <option key={u} value={u}>{u.replace('@gofynd.com', '')}</option>)}
            </select>
          </div>
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">From</label>
            <input
              type="date"
              className="invex-slicer-date"
              value={logSlicerFrom}
              onChange={e => { setLogSlicerFrom(e.target.value); setLogsPage(1); }}
            />
          </div>
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">To</label>
            <input
              type="date"
              className="invex-slicer-date"
              value={logSlicerTo}
              onChange={e => { setLogSlicerTo(e.target.value); setLogsPage(1); }}
            />
          </div>
          {(logSlicerType !== "all" || logSlicerUser !== "all" || logSlicerFrom || logSlicerTo) && (
            <button
              className="invex-slicer-clear"
              onClick={() => { setLogSlicerType("all"); setLogSlicerUser("all"); setLogSlicerFrom(""); setLogSlicerTo(""); setLogsPage(1); }}
            >
              ✕ Clear
            </button>
          )}
          <span className="invex-slicer-count">{filteredLogs.length} row{filteredLogs.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="qp-logs-table-wrap">
          <table className="qp-logs-table">
            <thead>
              <tr>
                <th>RUN AT</th>
                <th>TYPE</th>
                <th>TABLE NAME</th>
                <th>QUERY</th>
                <th>ROWS</th>
                <th>TIME</th>
                <th>EXECUTED BY</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", color: "#94a3b8", padding: "20px", fontSize: "0.82rem" }}>
                    {logsQuery.isLoading ? "Loading logs…" : "No queries match the current filters."}
                  </td>
                </tr>
              ) : (
                paginatedFilteredLogs.map((log) => (
                  <tr key={log.id} className="qp-logs-row" onClick={() => restoreFromLog(log.query)} title="Click to restore query">
                    <td className="qp-logs-ts">{formatRunAt(log.runAt)}</td>
                    <td><span style={queryTypeBadgeStyle(log.queryType)}>{log.queryType}</span></td>
                    <td className="qp-logs-table-name">
                      {log.tables.length > 0
                        ? log.tables.join(", ")
                        : <span style={{ color: "#94a3b8" }}>—</span>}
                    </td>
                    <td className="qp-logs-query">{log.query}</td>
                    <td className="qp-logs-num">{log.rowCount > 0 ? log.rowCount : "—"}</td>
                    <td className="qp-logs-num">{log.elapsed}</td>
                    <td className="qbd-user-cell">{log.executedBy ? log.executedBy.replace('@gofynd.com', '') : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filteredLogs.length > QP_LOGS_PAGE_SIZE && (
          <div className="qbd-pagination" style={{ marginTop: "10px" }}>
            <button
              className="qbd-page-btn"
              onClick={() => setLogsPage(p => Math.max(1, p - 1))}
              disabled={logsPage === 1}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              Prev
            </button>
            <span className="qbd-page-info">
              Page {logsPage} of {filteredLogsTotalPages}
            </span>
            <button
              className="qbd-page-btn"
              onClick={() => setLogsPage(p => Math.min(filteredLogsTotalPages, p + 1))}
              disabled={logsPage === filteredLogsTotalPages}
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
