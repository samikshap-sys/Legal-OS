/**
 * SplitterPage — Invoice Splitter (Simple Sync)
 * Upload .xlsx → POST /api/splitter/process → get JSON result directly
 * No SSE, no chunking. Fast and reliable.
 */
import { useState, useRef, useCallback, useEffect } from "react";

interface SummaryRow {
  num: number;
  invoiceNo: string;
  rows: number;
  numericSum: number | null;
  isSplit: boolean;
}

interface HistoryRecord {
  id: number;
  userEmail: string;
  userName: string;
  filename: string;
  status: string;
  invoiceCol: string;
  numericCol: string;
  totalInvoices: number;
  skippedRows: number;
  zipKey: string;
  summaryJson: string;
  bqQuery: string;
  logs: string;
  createdAt: number;
}

type PageState = "idle" | "processing" | "done" | "error";

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleString();
}
function fmtNum(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export default function SplitterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pageState, setPageState] = useState<PageState>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [dbId, setDbId] = useState<number | null>(null);

  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [bqQuery, setBqQuery] = useState<string>("");
  const [bqCopied, setBqCopied] = useState(false);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [skippedRows, setSkippedRows] = useState(0);
  const [invoiceCol, setInvoiceCol] = useState("");
  const [numericCol, setNumericCol] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const HIST_PAGE = 8;

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/splitter/history", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleFileSelect = (f: File | null) => {
    if (!f) return;
    if (!f.name.endsWith(".xlsx")) { alert("Only .xlsx files are accepted"); return; }
    setFile(f);
    setPageState("idle");
    setLogs([]);
    setSummary([]);
    setBqQuery("");
    setErrorMsg("");
    setDbId(null);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  const handleProcess = async () => {
    if (!file) return;
    setPageState("processing");
    setLogs([]);
    setSummary([]);
    setBqQuery("");
    setErrorMsg("");

    try {
      const fd = new FormData();
      fd.append("file", file, file.name);

      const res = await fetch("/api/splitter/process", {
        method: "POST",
        credentials: "include",
        body: fd,
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        setErrorMsg(data.error || `Server error: HTTP ${res.status}`);
        setLogs(data.logs || []);
        setPageState("error");
        loadHistory();
        return;
      }

      setDbId(data.dbId);
      setTotalInvoices(data.totalInvoices);
      setSkippedRows(data.skippedRows);
      setInvoiceCol(data.invoiceCol || "");
      setNumericCol(data.numericCol || "");
      setSummary(data.summary || []);
      setBqQuery(data.bqQuery || "");
      setLogs(data.logs || []);
      setPageState("done");
      loadHistory();
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Request failed");
      setPageState("error");
    }
  };

  const handleDownload = () => {
    if (!dbId) return;
    window.open(`/api/splitter/download-db/${dbId}`, "_blank");
  };

  const handleDownloadFromHistory = (id: number) => {
    window.open(`/api/splitter/download-db/${id}`, "_blank");
  };

  const filteredHistory = history.filter(r => {
    if (!historySearch) return true;
    const q = historySearch.toLowerCase();
    return r.filename.toLowerCase().includes(q) || r.userEmail.toLowerCase().includes(q) || r.userName.toLowerCase().includes(q);
  });
  const historyPages = Math.max(1, Math.ceil(filteredHistory.length / HIST_PAGE));
  const pagedHistory = filteredHistory.slice((historyPage - 1) * HIST_PAGE, historyPage * HIST_PAGE);

  return (
    <div className="spl-page">
      {/* Page Title */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1a1a2e", margin: 0, letterSpacing: "-0.3px" }}>
          Splitter
        </h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
          Upload an Excel file to split invoices by vendor or column
        </p>
      </div>

      {/* Upload Card */}
      <div className="spl-card">
        <div className="spl-card-header">
          <span className="spl-card-header-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </span>
          <span className="spl-card-title">Upload Invoice File</span>
        </div>

        <div
          className={`spl-dropzone${file ? " spl-has-file" : ""}${dragOver ? " spl-drag-over" : ""}`}
          onClick={() => pageState !== "processing" && fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {file ? (
            <div className="spl-file-selected">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <polyline points="9 15 11 17 15 13"/>
              </svg>
              <div>
                <div className="spl-file-name">{file.name}</div>
                <div className="spl-file-size">{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            </div>
          ) : (
            <div className="spl-dropzone-hint">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <p>Drag &amp; drop your <strong>.xlsx</strong> file here, or <span className="spl-browse-link">browse</span></p>
              <p className="spl-dropzone-sub">Max 50 MB · Excel format only</p>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={e => handleFileSelect(e.target.files?.[0] ?? null)} />

        <div className="spl-actions">
          <button
            className="spl-btn spl-btn-primary"
            onClick={handleProcess}
            disabled={!file || pageState === "processing"}
          >
            {pageState === "processing" ? (
              <>
                <svg className="spl-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                Processing…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
                Split Invoices
              </>
            )}
          </button>
          {file && pageState !== "processing" && (
            <button className="spl-btn spl-btn-ghost" onClick={() => { setFile(null); setPageState("idle"); setLogs([]); setSummary([]); setBqQuery(""); setErrorMsg(""); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10"/>
                <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
              </svg>
              New File
            </button>
          )}
        </div>
      </div>

      {/* Processing indicator */}
      {pageState === "processing" && (
        <div className="spl-processing-banner">
          <svg className="spl-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
          Processing your file… this may take a moment for large files.
        </div>
      )}

      {/* Error */}
      {pageState === "error" && errorMsg && (
        <div className="spl-error-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {errorMsg}
        </div>
      )}

      {/* Processing Log (shown after done or error) */}
      {logs.length > 0 && (
        <div className="spl-card">
          <div className="spl-card-header">
            <span className="spl-card-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
            </span>
            <span className="spl-card-title">Processing Log</span>
          </div>
          <div className="spl-log-box">
            {logs.map((line, i) => {
              const cls = line.startsWith("Error") || line.includes("❌") ? "err"
                : line.startsWith("✅") || line.startsWith("☁️") ? "ok"
                : line.startsWith("▶") || line.startsWith("📂") ? "step"
                : "";
              return (
                <div key={i} className={`spl-log-line${cls ? ` spl-log-${cls}` : ""}`}>
                  {line.startsWith("Error") || line.includes("❌") ? (
                    <span className="spl-log-icon">✗</span>
                  ) : line.startsWith("✅") ? (
                    <span className="spl-log-icon">✓</span>
                  ) : (
                    <span className="spl-log-icon">▸</span>
                  )}
                  {line}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Results */}
      {pageState === "done" && (
        <>
          {/* Stats bar */}
          <div className="spl-stats-row">
            <div className="spl-stat-card">
              <div className="spl-stat-value">{totalInvoices}</div>
              <div className="spl-stat-label">Invoices Split</div>
            </div>
            <div className="spl-stat-card">
              <div className="spl-stat-value">{skippedRows}</div>
              <div className="spl-stat-label">Rows Skipped</div>
            </div>
            <div className="spl-stat-card">
              <div className="spl-stat-value spl-stat-col">{invoiceCol || "—"}</div>
              <div className="spl-stat-label">Invoice Column</div>
            </div>
            {numericCol && (
              <div className="spl-stat-card">
                <div className="spl-stat-value spl-stat-col">{numericCol}</div>
                <div className="spl-stat-label">Numeric Column</div>
              </div>
            )}
            <div className="spl-stat-card spl-stat-download" onClick={handleDownload} style={{ cursor: "pointer" }}>
              <div className="spl-stat-value" style={{ color: "#7c3aed" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </div>
              <div className="spl-stat-label">Download ZIP</div>
            </div>
          </div>

          {/* Summary table */}
          {summary.length > 0 && (
            <div className="spl-card">
              <div className="spl-card-header">
                <span className="spl-card-header-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                </span>
                <span className="spl-card-title">Split Summary</span>
                <span className="spl-card-count">{summary.length} invoices</span>
              </div>
              <div className="spl-table-wrap">
                <table className="spl-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Invoice No</th>
                      <th>Rows</th>
                      {numericCol && <th>Sum ({numericCol})</th>}
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map(r => (
                      <tr key={r.num}>
                        <td className="spl-td-num">{r.num}</td>
                        <td className="spl-td-inv">{r.invoiceNo}</td>
                        <td className="spl-td-num">{r.rows}</td>
                        {numericCol && <td className="spl-td-num">{fmtNum(r.numericSum)}</td>}
                        <td>
                          {r.isSplit
                            ? <span className="spl-badge-split">&amp; Split</span>
                            : <span className="spl-badge-normal">Normal</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* BQ Query */}
          {bqQuery && (
            <div className="spl-card">
              <div className="spl-card-header">
                <span className="spl-card-header-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6"/>
                    <polyline points="8 6 2 12 8 18"/>
                  </svg>
                </span>
                <span className="spl-card-title">BigQuery Filter</span>
                <button
                  className="spl-copy-btn"
                  onClick={() => { navigator.clipboard.writeText(bqQuery); setBqCopied(true); setTimeout(() => setBqCopied(false), 2000); }}
                >
                  {bqCopied ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <div className="spl-bq-box">
                <pre className="spl-bq-pre">{bqQuery}</pre>
              </div>
            </div>
          )}
        </>
      )}

      {/* History */}
      <div className="spl-card" style={{ marginTop: "1.5rem" }}>
        <div className="spl-card-header">
          <span className="spl-card-header-icon">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </span>
          <span className="spl-card-title">Split History</span>
          <div className="spl-hist-search-wrap">
            <input
              className="spl-hist-search"
              type="text"
              placeholder="Search by file or user…"
              value={historySearch}
              onChange={e => { setHistorySearch(e.target.value); setHistoryPage(1); }}
            />
          </div>
          <button className="spl-refresh-btn" onClick={loadHistory} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
            </svg>
          </button>
        </div>
        <div className="spl-table-wrap">
          {historyLoading ? (
            <div className="spl-hist-empty">Loading history…</div>
          ) : pagedHistory.length === 0 ? (
            <div className="spl-hist-empty">No split jobs yet.</div>
          ) : (
            <table className="spl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>File</th>
                  <th>Split By</th>
                  <th>Invoices</th>
                  <th>Skipped</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {pagedHistory.map((r, i) => (
                  <tr key={r.id}>
                    <td className="spl-td-num">{(historyPage - 1) * HIST_PAGE + i + 1}</td>
                    <td className="spl-td-file" title={r.filename}>{r.filename}</td>
                    <td className="spl-td-user">
                      <div className="spl-user-cell">
                        <span className="spl-user-name">{r.userName || r.userEmail}</span>
                        <span className="spl-user-email">{r.userEmail}</span>
                      </div>
                    </td>
                    <td className="spl-td-num">{r.totalInvoices}</td>
                    <td className="spl-td-num">{r.skippedRows}</td>
                    <td>
                      <span className={`spl-status-badge spl-status-${r.status}`}>
                        {r.status === "done" ? "✓ Done" : r.status === "failed" ? "✗ Failed" : r.status}
                      </span>
                    </td>
                    <td className="spl-td-date">{fmtDate(r.createdAt)}</td>
                    <td>
                      {r.status === "done" && r.zipKey ? (
                        <button className="spl-dl-btn" onClick={() => handleDownloadFromHistory(r.id)} title="Download ZIP">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                          ZIP
                        </button>
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {historyPages > 1 && (
          <div className="spl-pagination">
            <button className="spl-page-btn" disabled={historyPage === 1} onClick={() => setHistoryPage(p => Math.max(1, p - 1))}>‹ Prev</button>
            <span className="spl-page-info">Page {historyPage} of {historyPages}</span>
            <button className="spl-page-btn" disabled={historyPage === historyPages} onClick={() => setHistoryPage(p => Math.min(historyPages, p + 1))}>Next ›</button>
          </div>
        )}
      </div>
    </div>
  );
}
