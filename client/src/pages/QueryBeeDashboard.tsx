/**
 * QueryBee Dashboard
 * Pixel-perfect match to dashboard.html from the zip reference.
 * Sidebar: logo-row with only collapse-btn, 5 nav items with exact SVG icons,
 *          sidebar-bottom with fynd-logo-white.png (110px) + home-btn
 * Topbar: QueryBee SVG icon + brand text, search, profile icon
 * BQ Upload: hero-header (gradient) + hero-body (config-panel LEFT, dropzone-panel RIGHT)
 * History card: sortable columns, search, refresh
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "wouter";
import QuerypadPage from "./Querypad";
import PipelinesPage from "./Pipelines";
import { useQbUser } from "@/contexts/QbUserContext";
import DPReconPage from "./DPRecon";
import PODashboard from "./PODashboard";
import UserManagementPage from "./UserManagement";
import SplitterPage from "./Splitter";
import { trpc } from "@/lib/trpc";

// ── Direct download helper ───────────────────────────────────────────────────
// All Brand Ledger download endpoints stream the Excel file directly.
// The server sets X-Accel-Buffering: no + flushHeaders() so nginx keeps
// the connection alive while BigQuery runs — no polling needed.
async function downloadWithJob(
  endpoint: string,
  body: Record<string, string>,
  fallbackFilename: string,
  setProgress: (msg: string) => void
): Promise<void> {
  // Step 1: Start the job
  setProgress("Starting download…");
  const startRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => `HTTP ${startRes.status}`);
    throw new Error(text || `HTTP ${startRes.status}`);
  }
  const { jobId } = await startRes.json() as { jobId: string };
  if (!jobId) throw new Error("No jobId returned from server");

  // Step 2: Poll for completion (with retry on transient 503/502)
  const startTime = Date.now();
  let consecutiveErrors = 0;
  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    let statusRes: Response;
    try {
      statusRes = await fetch(
        `/api/brand-ledger/download-job/${jobId}/status`,
        { credentials: "include" }
      );
    } catch {
      consecutiveErrors++;
      if (consecutiveErrors >= 5) throw new Error("Status check failed: network error after 5 retries");
      continue;
    }
    if (!statusRes.ok) {
      consecutiveErrors++;
      if (consecutiveErrors >= 5) throw new Error(`Status check failed: HTTP ${statusRes.status} after 5 retries`);
      // Transient 503/502 — wait a bit longer and retry
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }
    consecutiveErrors = 0;
    const { status, errorMsg, progressMsg, progressStep } = await statusRes.json() as {
      status: string; errorMsg?: string; progressMsg?: string; progressStep?: number;
    };
    if (status === "error") throw new Error(errorMsg || "Job failed");
    const msg = progressMsg || `Generating report… (${elapsed}s)`;
    setProgress(JSON.stringify({ msg, step: progressStep ?? 0 }));
    if (status === "done") break;
  }

  // Step 3: Download the file
  setProgress("Downloading file…");
  const fileRes = await fetch(
    `/api/brand-ledger/download-job/${jobId}/file`,
    { credentials: "include" }
  );
  if (!fileRes.ok) throw new Error(`File download failed: HTTP ${fileRes.status}`);
  const blob = await fileRes.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const cd = fileRes.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename="([^"]+)"/);
  a.download = match?.[1] || fallbackFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * pollQueryJob — starts an async BQ query job, polls until done, returns the JSON result.
 * Endpoint should return {jobId} on POST.
 * Polls GET /api/brand-ledger/query-job/:jobId/status every 3s.
 * Fetches GET /api/brand-ledger/query-job/:jobId/result when done.
 */
async function pollQueryJob<T = Record<string, unknown>>(
  endpoint: string,
  body: Record<string, string>
): Promise<T> {
  // Step 1: Start the job
  const startRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!startRes.ok) {
    const text = await startRes.text().catch(() => `HTTP ${startRes.status}`);
    throw new Error(text || `HTTP ${startRes.status}`);
  }
  const { jobId } = await startRes.json() as { jobId: string };
  if (!jobId) throw new Error("No jobId returned from server");

  // Step 2: Poll for completion
  while (true) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(
      `/api/brand-ledger/query-job/${jobId}/status`,
      { credentials: "include" }
    );
    if (!statusRes.ok) throw new Error(`Status check failed: HTTP ${statusRes.status}`);
    const { status, errorMsg } = await statusRes.json() as { status: string; errorMsg?: string };
    if (status === "error") throw new Error(errorMsg || "Query job failed");
    if (status === "done") break;
  }

  // Step 3: Fetch the result
  const resultRes = await fetch(
    `/api/brand-ledger/query-job/${jobId}/result`,
    { credentials: "include" }
  );
  if (!resultRes.ok) throw new Error(`Result fetch failed: HTTP ${resultRes.status}`);
  return await resultRes.json() as T;
}

// ── Types ──────────────────────────────────────────────────────────────────────────────
type FileType = "csv" | "xlsx" | null;
type ValidationStatus = "idle" | "validating" | "done" | "error";
type UploadStatus = "idle" | "uploading" | "done" | "error";

interface TypeErrorSample { row: number; value: string; }
interface TypeError { column: string; expected_type: string; samples: TypeErrorSample[]; }

interface ValidationResult {
  ok: boolean;
  columns_valid: boolean;
  missing: string[];
  extra: string[];
  type_errors: TypeError[];
  schema: { name: string; type: string }[];
  total_rows: number;
  total_columns: number;
  error?: string;
}

interface HistoryRow {
  id: string;
  tableId: string;
  fileType: string;
  status: string;
  totalColumns: number;
  totalRows: number;
  uploadedAt: string;
  uploadedBy: string;
  fileUrl: string;
  fileName?: string;
  error?: string;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function QueryBeeDashboard() {
  const { qbUser } = useQbUser();
  const [collapsed, setCollapsed] = useState(true);
  const [activePage, setActivePage] = useState("data-upload");

  // Scope gating — fetch current user's scopes
  const { data: scopeData } = trpc.userMgmt.getMyScopes.useQuery();
  const isAdmin = scopeData?.isAdmin ?? false;
  // hasRecord = admin has explicitly configured this user's access
  // If no record exists, all sections are visible by default (open access)
  // Only restrict when admin has saved a specific scope list for this user
  const hasRecord = scopeData?.hasRecord ?? false;
  const userScopes: string[] = scopeData?.scopes ?? [];
  function hasScope(id: string): boolean {
    if (isAdmin) return true;        // admins always see everything
    if (!hasRecord) return true;     // no restriction configured → show all
    return userScopes.includes(id);  // restriction exists → check the list
  }

  // BQ Upload state
  const [tableId, setTableId] = useState("");
  const [fileType, setFileType] = useState<FileType>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [valStatus, setValStatus] = useState<ValidationStatus>("idle");
  const [valResult, setValResult] = useState<ValidationResult | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadMsg, setUploadMsg] = useState("");
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 5;
  const [historyLoading, setHistoryLoading] = useState(true);
  const [refreshSpinning, setRefreshSpinning] = useState(false);
  // ── BQ Upload slicer state ────────────────────────────────────────────────
  const [bqSlicerUser, setBqSlicerUser] = useState("");
  const [bqSlicerStatus, setBqSlicerStatus] = useState("");
  const [bqSlicerMonth, setBqSlicerMonth] = useState("");
  const [bqSlicerFrom, setBqSlicerFrom] = useState("");
  const [bqSlicerTo, setBqSlicerTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [configOpen, setConfigOpen] = useState(true);
  const [sortKey, setSortKey] = useState<string>("uploaded_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load history ──────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setRefreshSpinning(true);
    try {
      const res = await fetch("/api/bq/history");
      if (res.ok) {
        const data = await res.json();
        // Map snake_case API keys to camelCase HistoryRow
        const rows = (data.history || []).map((r: Record<string, unknown>) => ({
          id: r.id,
          tableId: r.table_id,
          fileType: r.file_type,
          status: r.status,
          totalColumns: r.total_columns,
          totalRows: r.total_rows,
          uploadedAt: r.uploaded_at,
          uploadedBy: r.uploaded_by,
          fileUrl: r.file_url || (r.has_file ? `/api/bq/download/${r.id}` : ""),
          fileName: r.file_name as string | undefined,
          error: r.error as string | undefined,
        }));
        setHistoryRows(rows);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
      setRefreshSpinning(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ── Auto-validate when file is set (mirrors Python flow: validate on file select) ────────────
  const runValidate = useCallback(async (f: File, tid: string, ft: FileType) => {
    if (!f || !tid.trim() || !ft) return;
    setValStatus("validating");
    setValResult(null);
    try {
      const fd = new FormData();
      fd.append("table_id", tid.trim());
      fd.append("file_type", ft);
      fd.append("file", f);
      const res = await fetch("/api/bq/validate", { method: "POST", body: fd });
      const data: ValidationResult = await res.json();
      setValResult(data);
      setValStatus("done");
    } catch (err) {
      setValResult({ ok: false, columns_valid: false, missing: [], extra: [], type_errors: [], schema: [], total_rows: 0, total_columns: 0, error: String(err) });
      setValStatus("error");
    }
  }, []);

  // ── File drop/select ────────────────────────────────────────────────────────────────────
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      setValStatus("idle");
      setValResult(null);
      runValidate(f, tableId, fileType);
    }
  }, [tableId, fileType, runValidate]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setValStatus("idle");
      setValResult(null);
      runValidate(f, tableId, fileType);
    }
  }, [tableId, fileType, runValidate]);

  const removeFile = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setFile(null);
    setValStatus("idle");
    setValResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Select file type ──────────────────────────────────────────────────────
  const selectFileType = useCallback((ft: FileType) => {
    setFileType(ft);
    setFile(null);
    setValStatus("idle");
    setValResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Upload to BigQuery ────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!tableId.trim() || !fileType || !file) return;
    setUploadStatus("uploading");
    setUploadMsg("Validating schema & uploading…");
    try {
      const fd = new FormData();
      fd.append("table_id", tableId.trim());
      fd.append("file_type", fileType);
      fd.append("uploaded_by", qbUser?.email ?? "");
      fd.append("file", file);
      const res = await fetch("/api/bq/validate-and-upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.ok) {
        setUploadStatus("done");
        const rowCount = (data.total_rows ?? data.rows_loaded ?? 0).toLocaleString();
        const targetTable = data.table_id || tableId.trim();
        const fileName = file?.name || "";
        setUploadMsg(`✅ Successfully uploaded ${rowCount} rows from "${fileName}" to ${targetTable}`);
        loadHistory();
      } else {
        setUploadStatus("error");
        setUploadMsg(data.error || "Upload failed");
      }
    } catch (err) {
      setUploadStatus("error");
      setUploadMsg(String(err));
    }
  }, [tableId, fileType, file, loadHistory]);

  // ── Sort history ──────────────────────────────────────────────────────────
  const sortHistory = useCallback((key: string) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === "asc" ? "desc" : "asc");
        return key;
      }
      setSortDir("asc");
      return key;
    });
  }, []);

  // ── Filtered + sorted history ─────────────────────────────────────────────
  const filteredHistory = [...historyRows]
    .filter(r => {
      const q = historySearch.toLowerCase();
      if (q && !r.tableId?.toLowerCase().includes(q) && !r.uploadedBy?.toLowerCase().includes(q) && !r.status?.toLowerCase().includes(q)) return false;
      if (bqSlicerUser && (r.uploadedBy || "").replace("@gofynd.com", "") !== bqSlicerUser) return false;
      if (bqSlicerStatus && r.status !== bqSlicerStatus) return false;
      if (bqSlicerMonth) {
        const d = new Date(r.uploadedAt || "");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = String(d.getFullYear());
        if (`${yyyy}-${mm}` !== bqSlicerMonth) return false;
      }
      if (bqSlicerFrom) {
        const d = new Date(r.uploadedAt || "");
        if (d < new Date(bqSlicerFrom)) return false;
      }
      if (bqSlicerTo) {
        const d = new Date(r.uploadedAt || "");
        const toEnd = new Date(bqSlicerTo); toEnd.setHours(23, 59, 59, 999);
        if (d > toEnd) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const keyMap: Record<string, keyof HistoryRow> = {
        table_id: "tableId",
        file_type: "fileType",
        status: "status",
        total_columns: "totalColumns",
        total_rows: "totalRows",
        uploaded_at: "uploadedAt",
        uploaded_by: "uploadedBy",
      };
      const k = keyMap[sortKey] || "uploadedAt";
      const av = a[k] ?? "";
      const bv = b[k] ?? "";
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const paginatedHistory = filteredHistory.slice((historyPage - 1) * HISTORY_PAGE_SIZE, historyPage * HISTORY_PAGE_SIZE);

  // ── Step indicator ────────────────────────────────────────────────────────
  const step = !tableId.trim() ? 1 : !fileType ? 2 : !file ? 3 : 4;

  // ── Dropzone state ────────────────────────────────────────────────────────
  const dzClass = !fileType ? "dropzone" : file ? "dropzone has-file" : dragOver ? "dropzone ready dragging" : "dropzone ready";

  return (
    <div className="qbd-root">
      {/* ── Topbar — exact Legal Connect style ── */}
      <header style={{height:'62px',minHeight:'62px',background:'#111',display:'flex',alignItems:'center',padding:'0 20px 0 14px',gap:'0',flexShrink:0,zIndex:50}}>
        {/* Fynd logo */}
        <div style={{display:'flex',alignItems:'center',gap:'0',flexShrink:0}}>
          <img src="/manus-storage/fynd-logo_d3d75094.jpeg" alt="Fynd" style={{width:54,height:54,borderRadius:12,objectFit:'cover',display:'block'}} />
        </div>
        {/* Divider */}
        <div style={{width:'1px',height:'28px',background:'rgba(255,255,255,0.2)',margin:'0 14px',flexShrink:0}} />
        {/* Brand name */}
        <span style={{fontSize:'1.5rem',fontWeight:700,color:'#fff',letterSpacing:'-0.3px',flexShrink:0,marginRight:'20px'}}>QueryBee</span>
        {/* Search bar */}
        <div style={{flex:1,display:'flex',justifyContent:'center'}}>
          <div className="qbd-search-wrap" style={{background:'rgba(255,255,255,0.08)',border:'1px solid rgba(255,255,255,0.15)'}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="qbd-search-input"
              style={{color:'rgba(255,255,255,0.85)'}}
              type="text"
              placeholder="Search datasets, tables, queries…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        {/* User info on right */}
        {qbUser && (
          <div style={{display:'flex',alignItems:'center',gap:'10px',flexShrink:0,marginLeft:'20px'}}>
            <div style={{width:'32px',height:'32px',borderRadius:'50%',background:'#7C5CFC',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:'13px',flexShrink:0}}>
              {(qbUser.name || qbUser.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div style={{textAlign:'left',lineHeight:1.3}}>
              <div style={{fontSize:'13px',fontWeight:600,color:'#fff'}}>{qbUser.name || qbUser.email?.split('@')[0]}</div>
              <div style={{fontSize:'11px',color:'rgba(255,255,255,0.55)'}}>{qbUser.email}</div>
            </div>
          </div>
        )}
      </header>

      <div className="qbd-layout">
        {/* ── Sidebar ── */}
        <aside className={`qbd-sidebar${collapsed ? " qbd-collapsed" : ""}`} id="sidebar">
          {/* Nav */}
          <nav className="qbd-nav">
            {/* BQ Upload */}
            {hasScope("data-upload") && (
            <button
              className={`qbd-nav-item${activePage === "data-upload" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("data-upload")}
              title={collapsed ? "BQ Upload" : undefined}
            >
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </span>
              <span className="qbd-nav-label">BQ Upload</span>
            </button>
            )}

            {/* Invoices Download */}
            {hasScope("invoice-download") && (
            <button
              className={`qbd-nav-item${activePage === "invoice-download" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("invoice-download")}
              title={collapsed ? "Invoices Download" : undefined}
            >
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <polyline points="7 13 12 18 17 13"/>
                  <line x1="12" y1="18" x2="12" y2="9"/>
                </svg>
              </span>
              <span className="qbd-nav-label">Invoices Download</span>
            </button>
            )}

            {/* Pipelines */}
            {hasScope("pipelines") && (
            <button
              className={`qbd-nav-item${activePage === "pipelines" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("pipelines")}
              title={collapsed ? "Pipelines" : undefined}
            >
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="18" r="3"/>
                  <circle cx="6" cy="6" r="3"/>
                  <path d="M13 6h3a2 2 0 0 1 2 2v7"/>
                  <line x1="6" y1="9" x2="6" y2="21"/>
                </svg>
              </span>
              <span className="qbd-nav-label">Pipelines</span>
            </button>
            )}

            {/* Querypad */}
            {hasScope("querypad") && (
            <button
              className={`qbd-nav-item${activePage === "querypad" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("querypad")}
              title={collapsed ? "Querypad" : undefined}
            >
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6"/>
                  <polyline points="8 6 2 12 8 18"/>
                  <line x1="14" y1="4" x2="10" y2="20"/>
                </svg>
              </span>
              <span className="qbd-nav-label">Querypad</span>
            </button>
            )}

            {/* Invoice Expo */}
            {hasScope("invoice-supporting") && (
            <button
              className={`qbd-nav-item${activePage === "invoice-supporting" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("invoice-supporting")}
              title={collapsed ? "Invoice Export" : undefined}>
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </span>
              <span className="qbd-nav-label">Invoice Export</span>
            </button>
            )}

            {/* Brand Ledger */}
            {hasScope("bl-payable") && (
            <button
              className={`qbd-nav-item${activePage === "bl-payable" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("bl-payable")}
              title={collapsed ? "Brand Ledger" : undefined}
            >
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
              </span>
              <span className="qbd-nav-label">Brand Ledger</span>
            </button>
            )}
            {/* Cashfree Entry */}
            {hasScope("cashfree-entry") && (
            <button
              className={`qbd-nav-item${activePage === "cashfree-entry" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("cashfree-entry")}
              title={collapsed ? "Cashfree Entry" : undefined}
            >
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                  <path d="M2 17l10 5 10-5"/>
                  <path d="M2 12l10 5 10-5"/>
                </svg>
              </span>
              <span className="qbd-nav-label">Cashfree Entry</span>
            </button>
            )}

            {/* DP Recon */}
            {hasScope("dp-recon") && (
            <button
              className={`qbd-nav-item${activePage === "dp-recon" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("dp-recon")}
              title={collapsed ? "DP Recon" : undefined}
            >
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="3" width="15" height="13" rx="1" />
                  <path d="M16 8h4l3 5v3h-7V8z" />
                  <circle cx="5.5" cy="18.5" r="2.5" />
                  <circle cx="18.5" cy="18.5" r="2.5" />
                </svg>
              </span>
              <span className="qbd-nav-label">DP Recon</span>
            </button>
            )}

            {/* PO Dashboard */}
            {hasScope("po-dashboard") && (
            <button
              className={`qbd-nav-item${activePage === "po-dashboard" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("po-dashboard")}
              title={collapsed ? "PO Dashboard" : undefined}
            >
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </span>
              <span className="qbd-nav-label">PO Dashboard</span>
            </button>
            )}
            {/* Splitter */}
            {hasScope("splitter") && (
            <button
              className={`qbd-nav-item${activePage === "splitter" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("splitter")}
              title={collapsed ? "Splitter" : undefined}
            >
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                  <line x1="12" y1="12" x2="12" y2="18"/>
                </svg>
              </span>
              <span className="qbd-nav-label">Splitter</span>
            </button>
            )}

            {/* ── Divider ── */}
            <div style={{ margin: "8px 12px 4px", borderTop: "1px solid rgba(255,255,255,0.10)" }} />

            {/* User Management — always visible (admin sees full panel, others see read-only) */}
            <button
              className={`qbd-nav-item${activePage === "user-management" ? " qbd-active" : ""}`}
              onClick={() => setActivePage("user-management")}
              title={collapsed ? "User Management" : undefined}
            >
              <span className="qbd-nav-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </span>
              <span className="qbd-nav-label">User Management</span>
            </button>

            {/* BQ Connection — admin only */}
            {isAdmin && (
              <button
                className={`qbd-nav-item${activePage === "bq-connection" ? " qbd-active" : ""}`}
                onClick={() => setActivePage("bq-connection")}
                title={collapsed ? "BQ Connection" : undefined}
              >
                <span className="qbd-nav-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </span>
                <span className="qbd-nav-label">BQ Connection</span>
              </button>
            )}
          </nav>

          {/* Sidebar bottom — fynd-logo-white.png + home button */}
          <div className="qbd-sidebar-bottom">
            {!collapsed && (
              <img src="/manus-storage/fynd-logo-white_2efeb076.png" alt="Fynd" className="qbd-fynd-logo" id="fyndLogo" />
            )}
            <Link href="/querybee" className="qbd-home-btn" title="Home" style={collapsed ? { margin: "0 auto" } : {}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </Link>
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="qbd-main">

          {/* ══ PAGE: DATA UPLOAD ══ */}
          {activePage === "data-upload" && (
            <div className="qbd-page">
              {/* Page header */}
              <div className="qbd-page-header">
                <div className="qbd-page-header-left">
                  <h1 className="qbd-page-title">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    BQ File Upload
                  </h1>
                </div>
              </div>



              {/* Upload Hero Card */}
              <div className="qbd-upload-hero">
                {/* Gradient header band */}
                <div className="qbd-hero-header">
                  <div className="qbd-hero-title-group">
                    <p className="qbd-hero-title">Upload &amp; Validate Configuration</p>
                  </div>
                  {/* Steps */}
                  <div className="qbd-hero-steps" id="heroSteps">
                    <div className="qbd-hero-step">
                      <div className={`qbd-hero-step-num${step >= 1 ? (step > 1 ? " done" : " active") : ""}`} id="step1">1</div>
                      <span className="qbd-hero-step-label">Table ID</span>
                    </div>
                    <div className="qbd-hero-step-sep" />
                    <div className="qbd-hero-step">
                      <div className={`qbd-hero-step-num${step >= 2 ? (step > 2 ? " done" : " active") : ""}`} id="step2">2</div>
                      <span className="qbd-hero-step-label">File Type</span>
                    </div>
                    <div className="qbd-hero-step-sep" />
                    <div className="qbd-hero-step">
                      <div className={`qbd-hero-step-num${step >= 3 ? (step > 3 ? " done" : " active") : ""}`} id="step3">3</div>
                      <span className="qbd-hero-step-label">Drop File</span>
                    </div>
                    <div className="qbd-hero-step-sep" />
                    <div className="qbd-hero-step">
                      <div className={`qbd-hero-step-num${step >= 4 ? " active" : ""}`} id="step4">4</div>
                      <span className="qbd-hero-step-label">Upload</span>
                    </div>
                  </div>
                  <button className="qbd-hero-toggle-btn" onClick={() => setConfigOpen(o => !o)} title={configOpen ? "Collapse" : "Expand"}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {configOpen ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                    </svg>
                  </button>
                </div>

                {/* Two-column body */}
                {configOpen && (
                  <div className="qbd-hero-body" id="configBody">
                    {/* LEFT — config panel */}
                    <div className="qbd-config-panel">
                      {/* Table ID */}
                      <div className="qbd-field">
                        <label className="qbd-field-label" htmlFor="tableId">BigQuery Table ID <span className="qbd-req">*</span></label>
                        <input
                          className="qbd-text-input"
                          id="tableId"
                          type="text"
                          placeholder="project.dataset.table"
                          value={tableId}
                          onChange={e => setTableId(e.target.value)}
                          autoComplete="off"
                        />
                        <p className="qbd-field-hint">Full table path — used to fetch the expected column schema.</p>
                      </div>

                      {/* File type pills */}
                      <div className="qbd-field">
                        <label className="qbd-field-label">File Format <span className="qbd-req">*</span></label>
                        <div className="qbd-ft-toggle">
                          <div
                            className={`qbd-ft-pill${fileType === "csv" ? " selected" : ""}`}
                            onClick={() => selectFileType("csv")}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <line x1="9" y1="13" x2="15" y2="13"/>
                              <line x1="9" y1="17" x2="15" y2="17"/>
                            </svg>
                            CSV
                          </div>
                          <div
                            className={`qbd-ft-pill${fileType === "xlsx" ? " selected" : ""}`}
                            onClick={() => selectFileType("xlsx")}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                              <polyline points="14 2 14 8 20 8"/>
                              <rect x="8" y="13" width="8" height="6" rx="1"/>
                            </svg>
                            XLSX
                          </div>
                        </div>
                        <p className="qbd-field-hint">Max 2GB. XLSX is converted to CSV before loading.</p>
                      </div>



                      {/* Requirements box */}
                      <div className="qbd-req-box">
                        <div className="qbd-req-box-header">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--qbd-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                          </svg>
                          <span className="qbd-req-box-title">Requirements</span>
                        </div>
                        <ul className="qbd-req-list">
                          <li><strong>Direct load</strong> to BigQuery — fast &amp; efficient</li>
                          <li><strong>Column matching</strong> is case-insensitive, spaces/underscores normalized</li>
                          <li><strong>Extra columns</strong> not allowed — schema must match exactly</li>
                          <li><strong>XLSX</strong> converted in-browser before upload</li>
                        </ul>
                      </div>
                    </div>

                    {/* RIGHT — drop zone */}
                    <div className="qbd-dropzone-panel">
                      <p className="qbd-dropzone-label">Drop Zone</p>
                      <div
                        className={dzClass}
                        id="dropzone"
                        onDragOver={e => { e.preventDefault(); if (fileType) setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={fileType ? handleFileDrop : undefined}
                        onClick={() => fileType && !file && fileInputRef.current?.click()}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          id="fileInput"
                          accept={fileType === "csv" ? ".csv" : fileType === "xlsx" ? ".xlsx,.xls" : undefined}
                          style={{ display: "none" }}
                          onChange={handleFileSelect}
                        />
                        <div className="qbd-dz-icon-ring">
                          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="17 8 12 3 7 8"/>
                            <line x1="12" y1="3" x2="12" y2="15"/>
                          </svg>
                        </div>
                        {!file ? (
                          <>
                            <p className="qbd-dz-title">{!fileType ? "Select a file type first" : `Drop your ${fileType.toUpperCase()} file here`}</p>
                            <p className="qbd-dz-sub">{!fileType ? "Choose CSV or XLSX on the left, then drop your file here" : "or drag & drop your file"}</p>
                            {fileType && (
                              <span className="qbd-dz-browse-hint">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                  <polyline points="17 8 12 3 7 8"/>
                                  <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                Click to browse or drag &amp; drop
                              </span>
                            )}
                          </>
                        ) : (
                          <div id="fileChip">
                            <span className="qbd-file-chip">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                              <span>{file.name}</span>
                              <button className="qbd-file-chip-remove" title="Remove" onClick={removeFile}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                </svg>
                              </button>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Validation Panel — rich 3-section layout matching reference screenshots */}
                {valStatus !== "idle" && (
                  <div className="qbd-val-panel">
                    <div className="qbd-val-panel-header">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--qbd-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                      </svg>
                      <span className="qbd-val-panel-title">Validation Results</span>
                      {valStatus === "validating" && <div className="qbd-val-spinner" />}
                    </div>

                    {valStatus === "validating" && (
                      <div className="qbd-val-panel-body">
                        <div className="qbd-val-row pending">
                          <span className="qbd-val-row-icon pending">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                          </span>
                          <div><div className="qbd-val-row-label">Validating schema and data types…</div></div>
                        </div>
                      </div>
                    )}

                    {valStatus === "done" && valResult && (
                      <div className="qbd-val-panel-body">

                        {/* Server-level error */}
                        {valResult.error && !valResult.columns_valid && (
                          <div className="qbd-val-section">
                            <div className="qbd-val-block error">
                              <div className="qbd-val-block-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                              </div>
                              <div>
                                <div className="qbd-val-block-title">Error</div>
                                <div className="qbd-val-block-desc">{valResult.error}</div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Section 1: Column Validation */}
                        {(valResult.columns_valid !== undefined) && (
                          <>
                            <div className="qbd-val-section-label">COLUMN VALIDATION</div>
                            <div className="qbd-val-section">
                              {valResult.columns_valid ? (
                                <div className="qbd-val-block success">
                                  <div className="qbd-val-block-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                  </div>
                                  <div>
                                    <div className="qbd-val-block-title">All {valResult.total_columns} columns matched ✓</div>
                                    <div className="qbd-val-block-desc">Your file’s column names match the BigQuery schema — names were compared case-insensitively and spaces/underscores were treated as equivalent.</div>
                                  </div>
                                </div>
                              ) : (
                                <div className="qbd-val-block error">
                                  <div className="qbd-val-block-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                                    </svg>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div className="qbd-val-block-title">Column mismatch detected</div>
                                    {valResult.missing?.length > 0 && (
                                      <div className="qbd-val-block-desc">
                                        <strong>Missing ({valResult.missing.length}):</strong>{" "}
                                        <span className="qbd-val-error-chips inline">
                                          {valResult.missing.map(c => <span key={c} className="qbd-val-error-chip missing">{c}</span>)}
                                        </span>
                                      </div>
                                    )}
                                    {valResult.extra?.length > 0 && (
                                      <div className="qbd-val-block-desc">
                                        <strong>Extra ({valResult.extra.length}):</strong>{" "}
                                        <span className="qbd-val-error-chips inline">
                                          {valResult.extra.map(c => <span key={c} className="qbd-val-error-chip extra">{c}</span>)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* Section 2: Data Type Validation (only shown when columns are valid) */}
                        {valResult.columns_valid && (
                          <>
                            <div className="qbd-val-section-label">DATA TYPE VALIDATION</div>
                            <div className="qbd-val-section">
                              {valResult.type_errors?.length === 0 ? (
                                <div className="qbd-val-block success">
                                  <div className="qbd-val-block-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                  </div>
                                  <div>
                                    <div className="qbd-val-block-title">All values are the right type ✓</div>
                                    <div className="qbd-val-block-desc">We checked every value in every column — all {valResult.total_rows?.toLocaleString()} rows are compatible with BigQuery’s expected data types.</div>
                                  </div>
                                </div>
                              ) : (
                                <div className="qbd-val-block error">
                                  <div className="qbd-val-block-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div className="qbd-val-block-title">{valResult.type_errors.length} column(s) have type errors</div>
                                    {valResult.type_errors.map(te => (
                                      <div key={te.column} className="qbd-val-type-error-row">
                                        <span className="qbd-val-type-error-col">{te.column}</span>
                                        <span className="qbd-val-type-error-type">expected {te.expected_type}</span>
                                        <span className="qbd-val-type-error-samples">
                                          {te.samples.map((s, i) => (
                                            <span key={i} className="qbd-val-type-error-sample">row {s.row}: "{s.value}"</span>
                                          ))}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* Section 3: What To Do Next */}
                        {valResult.columns_valid && (
                          <>
                            <div className="qbd-val-section-label">WHAT TO DO NEXT</div>
                            <div className="qbd-val-section">
                              {valResult.ok ? (
                                <div className="qbd-val-block ready">
                                  <div className="qbd-val-block-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                                    </svg>
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div className="qbd-val-block-title">
                                      <span style={{ color: "#16a34a" }}>✅ Your file is ready — go ahead and upload!</span>
                                    </div>
                                    <div className="qbd-val-block-desc">Everything checks out. BigQuery will accept this file. Click <strong>Upload to BigQuery</strong> below to append the data.</div>
                                    <div className="qbd-val-ready-stats">
                                      <div className="qbd-val-ready-stat">
                                        <span className="qbd-val-ready-stat-num">{valResult.total_rows?.toLocaleString()}</span>
                                        <span className="qbd-val-ready-stat-lbl">ROWS TO LOAD</span>
                                      </div>
                                      <div className="qbd-val-ready-stat">
                                        <span className="qbd-val-ready-stat-num">{valResult.total_columns}</span>
                                        <span className="qbd-val-ready-stat-lbl">COLUMNS</span>
                                      </div>
                                      <div className="qbd-val-ready-stat">
                                        <span className="qbd-val-ready-stat-num table">{tableId.split(".").pop()}</span>
                                        <span className="qbd-val-ready-stat-lbl">TARGET TABLE</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="qbd-val-block warn">
                                  <div className="qbd-val-block-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                  </div>
                                  <div>
                                    <div className="qbd-val-block-title">Fix type errors before uploading</div>
                                    <div className="qbd-val-block-desc">The file has data type issues. BigQuery will reject rows with invalid values. Fix the highlighted cells and re-upload the file.</div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}

                      </div>
                    )}
                  </div>
                )}

                {/* Upload button */}
                <div className="qbd-upload-btn-row">
                  <button
                    className="qbd-upload-btn"
                    disabled={!tableId.trim() || !fileType || !file || uploadStatus === "uploading"}
                    onClick={handleUpload}
                  >
                    {uploadStatus === "uploading" ? (
                      <span className="qbd-spinner" />
                    ) : (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                    )}
                    Upload
                  </button>
                </div>

                {/* Upload result banner */}
                {(uploadStatus === "done" || uploadStatus === "error") && uploadMsg && (
                  <div className={`qbd-result-banner${uploadStatus === "done" ? " success" : " error"}`}>
                    <div className="qbd-result-banner-icon">
                      {uploadStatus === "done" ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                      )}
                    </div>
                    <div className="qbd-result-banner-body">
                      <div className="qbd-result-banner-title">
                        {uploadStatus === "done" ? "Upload Successful" : "Upload Failed"}
                      </div>
                      <div className="qbd-result-banner-sub">{uploadMsg.replace(/^✅\s*/, "")}</div>
                    </div>
                    <button
                      className="qbd-result-banner-close"
                      onClick={() => { setUploadStatus("idle"); setUploadMsg(""); }}
                      title="Dismiss"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* History Card */}
              <div className="invex-hist-card" style={{ marginTop: "28px" }}>
                <div className="invex-hist-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Upload History
                  </div>
                  <button
                    className={`qbd-refresh-btn${refreshSpinning ? " spinning" : ""}`}
                    onClick={loadHistory}
                    style={{ color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Refresh
                  </button>
                </div>
                <div className="invex-slicers-row">
                  <div className="invex-slicer-group">
                    <label className="invex-slicer-label">Month</label>
                    <input
                      type="month"
                      className="invex-slicer-date"
                      value={bqSlicerMonth}
                      onChange={e => { setBqSlicerMonth(e.target.value); setHistoryPage(1); }}
                    />
                  </div>
                  <div className="invex-slicer-group">
                    <label className="invex-slicer-label">Uploaded By</label>
                    <select
                      className="invex-slicer-select"
                      value={bqSlicerUser}
                      onChange={e => { setBqSlicerUser(e.target.value); setHistoryPage(1); }}
                    >
                      <option value="">All</option>
                      {Array.from(new Set(historyRows.map(r => (r.uploadedBy || "").replace("@gofynd.com", "")).filter(Boolean))).sort().map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="invex-slicer-group">
                    <label className="invex-slicer-label">Status</label>
                    <select
                      className="invex-slicer-select"
                      value={bqSlicerStatus}
                      onChange={e => { setBqSlicerStatus(e.target.value); setHistoryPage(1); }}
                    >
                      <option value="">All</option>
                      {Array.from(new Set(historyRows.map(r => r.status).filter(Boolean))).sort().map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div className="invex-slicer-group">
                    <label className="invex-slicer-label">From</label>
                    <input
                      type="date"
                      className="invex-slicer-date"
                      value={bqSlicerFrom}
                      onChange={e => { setBqSlicerFrom(e.target.value); setHistoryPage(1); }}
                    />
                  </div>
                  <div className="invex-slicer-group">
                    <label className="invex-slicer-label">To</label>
                    <input
                      type="date"
                      className="invex-slicer-date"
                      value={bqSlicerTo}
                      onChange={e => { setBqSlicerTo(e.target.value); setHistoryPage(1); }}
                    />
                  </div>
                  {(bqSlicerUser || bqSlicerStatus || bqSlicerMonth || bqSlicerFrom || bqSlicerTo) && (
                    <button
                      className="invex-slicer-clear"
                      onClick={() => { setBqSlicerUser(""); setBqSlicerStatus(""); setBqSlicerMonth(""); setBqSlicerFrom(""); setBqSlicerTo(""); setHistoryPage(1); }}
                    >✕ Clear</button>
                  )}
                  <span className="invex-slicer-count">{filteredHistory.length} row{filteredHistory.length !== 1 ? "s" : ""}</span>
                </div>
                <table className="invex-hist-table">
                    <thead>
                      <tr>
                        <th>Table Name</th>
                        <th>File Type</th>
                        <th>File Name</th>
                        <th>Status</th>
                        <th>Columns</th>
                        <th>Rows</th>
                        <th>Uploaded At</th>
                        <th>Uploaded By</th>
                      </tr>
                    </thead>
                    <tbody id="historyBody">
                      {historyLoading ? (
                        <>
                          {[1, 2].map(i => (
                            <tr key={i} className="qbd-skel-row">
                              <td><div className="qbd-skeleton" style={{ width: 160 }} /></td>
                              <td><div className="qbd-skeleton" style={{ width: 40 }} /></td>
                              <td><div className="qbd-skeleton" style={{ width: 140 }} /></td>
                              <td><div className="qbd-skeleton" style={{ width: 60 }} /></td>
                              <td><div className="qbd-skeleton" style={{ width: 40 }} /></td>
                              <td><div className="qbd-skeleton" style={{ width: 50 }} /></td>
                              <td><div className="qbd-skeleton" style={{ width: 120 }} /></td>
                              <td><div className="qbd-skeleton" style={{ width: 120 }} /></td>
                            </tr>
                          ))}
                        </>
                      ) : filteredHistory.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="invex-hist-empty">
                            {historyRows.length === 0 ? "No upload history yet." : "No rows match the selected filters."}
                          </td>
                        </tr>
                      ) : (
                        paginatedHistory.map(row => (
                          <tr key={row.id}>
                            <td className="mono">{row.tableId}</td>
                            <td><span className="qbd-file-type-chip">{row.fileType?.toUpperCase()}</span></td>
                            <td className="qbd-filename-cell" title={row.fileName || ""}>{row.fileName || <span style={{color:'#9ca3af'}}>—</span>}</td>
                            <td>
                              <span className={`qbd-badge${row.status === "success" ? " success" : " failed"}`}>
                                {row.status}
                              </span>
                            </td>
                            <td>
                              <span className="qbd-metric-cell">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                                </svg>
                                {row.totalColumns}
                              </span>
                            </td>
                            <td>
                              <span className="qbd-metric-cell">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>
                                </svg>
                                {row.totalRows?.toLocaleString()}
                              </span>
                            </td>
                            <td>{row.uploadedAt || '—'}</td>
                            <td className="qbd-user-cell">{row.uploadedBy ? row.uploadedBy.replace('@gofynd.com', '') : '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {/* Pagination controls */}
                  {!historyLoading && filteredHistory.length > HISTORY_PAGE_SIZE && (
                    <div className="qbd-pagination">
                      <button
                        className="qbd-page-btn"
                        onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                        disabled={historyPage === 1}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        Prev
                      </button>
                      <span className="qbd-page-info">
                        Page {historyPage} of {totalPages}
                      </span>
                      <button
                        className="qbd-page-btn"
                        onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                        disabled={historyPage === totalPages}
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
          )}

          {/* ══ PAGE: INVOICE DOWNLOAD ══ */}
          {activePage === "invoice-download" && (
            <InvoiceDownloadPage />
          )}

          {/* Pipelines — full 3-tab implementation */}
          {activePage === "pipelines" && (
            <div className="qbd-page" style={{ padding: 0 }}>
              <PipelinesPage />
            </div>
          )}

          {/* Invoice Expo */}
          {activePage === "invoice-supporting" && (
            <div className="qbd-page" style={{ padding: 0 }}>
              <InvoiceExpoPage />
            </div>
          )}

          {/* Querypad */}
          {activePage === "querypad" && (
            <div className="qbd-page" style={{ padding: 0 }}>
              <QuerypadPage />
            </div>
          )}

          {/* Brand Ledger — Payable */}
          {activePage === "bl-payable" && (
            <div className="qbd-page" style={{ padding: 0 }}>
              <BrandLedgerPayablePage />
            </div>
          )}

          {/* Cashfree Entry */}
          {activePage === "cashfree-entry" && (
            <div className="qbd-page" style={{ padding: 0 }}>
              <CashfreeEntryPage />
            </div>
          )}

          {/* DP Recon */}
          {activePage === "dp-recon" && (
            <div className="qbd-page" style={{ padding: 0 }}>
              <DPReconPage />
            </div>
          )}

          {/* PO Dashboard */}
          {activePage === "po-dashboard" && (
            <div className="qbd-page" style={{ padding: 0 }}>
              <PODashboard />
            </div>
          )}
          {/* Splitter */}
          {activePage === "splitter" && (
            <div className="qbd-page" style={{ padding: 0 }}>
              <SplitterPage />
            </div>
          )}

          {/* User Management */}
          {activePage === "user-management" && (
            <div className="qbd-page" style={{ padding: 0 }}>
              <UserManagementPage />
            </div>
          )}

          {/* BQ Connection — admin only */}
          {activePage === "bq-connection" && isAdmin && (
            <BqConnectionPage />
          )}
        </main>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// InvoiceDownloadPage — Invoices Download section
// Matches reference screenshots exactly:
//   - Header: "Invoices Download" + subtitle
//   - Hero card: gradient header "Request Invoice Download"
//   - Search By toggle: Invoice IDs | Month & Year
//   - Invoice IDs mode: textarea for comma-separated IDs
//   - Month & Year mode: month select + year select
//   - Download button
//   - Download History table: Created At, Request Type, Query, Invoice Count, Status, Actions
//   - 3 rows per page pagination
// ══════════════════════════════════════════════════════════════════════════════

interface InvDlHistoryRow {
  id: string;
  request_type: string;
  query: string;
  invoice_count: number | null;
  file_names: string[];
  status: string;
  file_key: string;
  error: string | null;
  created_at: string;
  downloaded_by: string;
}

function InvoiceDownloadPage() {
  const { qbUser } = useQbUser();
  const [searchBy, setSearchBy] = useState<"invoice_ids" | "month_year">("invoice_ids");
  const [invoiceIds, setInvoiceIds] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [downloading, setDownloading] = useState(false);
  const [dlProgress, setDlProgress] = useState<string | null>(null);
  const [dlError, setDlError] = useState<string | null>(null);
  const [dlSuccess, setDlSuccess] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [history, setHistory] = useState<InvDlHistoryRow[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [histRefresh, setHistRefresh] = useState(false);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const PAGE_SIZE = 3;
  // Invoice Download slicer state
  const [dlSlicerUser, setDlSlicerUser] = useState("");
  const [dlSlicerMonth, setDlSlicerMonth] = useState("");
  const [dlSlicerFrom, setDlSlicerFrom] = useState("");
  const [dlSlicerTo, setDlSlicerTo] = useState("");

  const MONTHS = [
    { val: "01", label: "January" }, { val: "02", label: "February" },
    { val: "03", label: "March" }, { val: "04", label: "April" },
    { val: "05", label: "May" }, { val: "06", label: "June" },
    { val: "07", label: "July" }, { val: "08", label: "August" },
    { val: "09", label: "September" }, { val: "10", label: "October" },
    { val: "11", label: "November" }, { val: "12", label: "December" },
  ];
  const YEARS = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));

  const loadHistory = useCallback(async () => {
    setHistRefresh(true);
    try {
      const res = await fetch("/api/invoice-download/history");
      if (res.ok) setHistory(await res.json());
    } catch {}
    setHistRefresh(false);
    setHistLoading(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleDownload = async () => {
    setDlError(null);
    setDlSuccess(null);
    setDlProgress(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    if (searchBy === "invoice_ids" && !invoiceIds.trim()) {
      setDlError("Please enter at least one Invoice ID.");
      return;
    }
    if (searchBy === "month_year" && !month) {
      setDlError("Please select a month.");
      return;
    }
    setDownloading(true);
    setDlProgress("Submitting request…");
    try {
       const body: Record<string, string> = { request_type: searchBy, downloaded_by: qbUser?.email ?? "" };
      if (searchBy === "invoice_ids") body.invoice_ids = invoiceIds.trim();
      else body.month_year = `${month}-${year}`;
      const res = await fetch("/api/invoice-download/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setDlError(data.error || "Request failed");
        setDownloading(false);
        setDlProgress(null);
        return;
      }

      const jobId = data.job_id;
      setDlProgress("Queued…");

      // Poll for job status every 1.5 seconds
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/invoice-download/status/${jobId}`);
          const status = await statusRes.json();

          setDlProgress(status.progress || "Processing…");

          if (status.status === "done") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setDownloading(false);
            setDlProgress(null);
            setDlSuccess(`${status.invoice_count} invoice(s) ready. Starting download…`);
            // Trigger file download
            const link = document.createElement("a");
            link.href = `/api/invoice-download/file/${status.download_id}`;
            link.click();
            setTimeout(loadHistory, 1500);
          } else if (status.status === "failed") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setDownloading(false);
            setDlProgress(null);
            setDlError(status.error || "Download failed");
            setTimeout(loadHistory, 1000);
          }
        } catch {
          // Network hiccup — keep polling
        }
      }, 1500);

    } catch (e: any) {
      setDlError(String(e?.message || "Network error"));
      setDownloading(false);
      setDlProgress(null);
    }
  };

  // Sort history
  const sortedHistory = [...history]
    .filter(r => {
      if (dlSlicerUser && (r.downloaded_by || "").replace("@gofynd.com", "") !== dlSlicerUser) return false;
      if (dlSlicerMonth) {
        const d = new Date(r.created_at || "");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = String(d.getFullYear());
        if (`${yyyy}-${mm}` !== dlSlicerMonth) return false;
      }
      if (dlSlicerFrom) {
        const d = new Date(r.created_at || "");
        if (d < new Date(dlSlicerFrom)) return false;
      }
      if (dlSlicerTo) {
        const d = new Date(r.created_at || "");
        const toEnd = new Date(dlSlicerTo); toEnd.setHours(23, 59, 59, 999);
        if (d > toEnd) return false;
      }
      return true;
    })
    .sort((a, b) => {
    const av = (a as any)[sortKey] ?? "";
    const bv = (b as any)[sortKey] ?? "";
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });
  const totalPages = Math.max(1, Math.ceil(sortedHistory.length / PAGE_SIZE));
  const paginatedHistory = sortedHistory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sortCol = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setPage(1);
  };

  return (
    <div className="qbd-page">
      {/* Page header */}
      <div className="qbd-page-header">
        <div className="qbd-page-header-left">
          <h1 className="qbd-page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <polyline points="7 13 12 18 17 13"/>
              <line x1="12" y1="18" x2="12" y2="9"/>
            </svg>
            Invoices Download
          </h1>
        </div>
      </div>

      {/* Request card */}
      <div className="qbd-upload-hero" style={{ marginBottom: 28 }}>
        {/* Gradient header */}
        <div className="qbd-hero-header" style={{ padding: "20px 28px" }}>
          <div className="qbd-hero-title-group" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: "rgba(255,255,255,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <polyline points="7 13 12 18 17 13"/>
                <line x1="12" y1="18" x2="12" y2="9"/>
              </svg>
            </div>
            <div>
              <p className="qbd-hero-title">Request Invoice Download</p>
            </div>
          </div>
        </div>

        {/* Form body */}
        <div style={{ padding: "24px 28px 28px" }}>
          {/* Search By toggle */}
          <div style={{ marginBottom: 20 }}>
            <label className="qbd-field-label">SEARCH BY</label>
            <div className="invdl-search-toggle">
              <button
                className={`invdl-toggle-btn${searchBy === "invoice_ids" ? " active" : ""}`}
                onClick={() => { setSearchBy("invoice_ids"); setDlError(null); setDlSuccess(null); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 7 }}>
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                Invoice IDs
              </button>
              <button
                className={`invdl-toggle-btn${searchBy === "month_year" ? " active" : ""}`}
                onClick={() => { setSearchBy("month_year"); setDlError(null); setDlSuccess(null); }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 7 }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Month &amp; Year
              </button>
            </div>
          </div>

          {/* Invoice IDs mode */}
          {searchBy === "invoice_ids" && (
            <div style={{ marginBottom: 20 }}>
              <label className="qbd-field-label">INVOICE IDS <span style={{ color: "#e53e3e" }}>*</span></label>
              <textarea
                className="invdl-textarea"
                placeholder={"INV-2025-001, INV-2025-002, INV-2025-003\n(comma-separated — one or many)"}
                value={invoiceIds}
                onChange={e => setInvoiceIds(e.target.value)}
                rows={4}
              />
              <div className="invdl-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Enter invoice IDs separated by commas. The system searches for files whose name contains each ID. Matching PDFs are bundled into a single zip.
              </div>
            </div>
          )}

          {/* Month & Year mode */}
          {searchBy === "month_year" && (
            <div style={{ marginBottom: 20 }}>
              <label className="qbd-field-label">MONTH &amp; YEAR <span style={{ color: "#e53e3e" }}>*</span></label>
              <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                <select
                  className="invdl-select"
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                >
                  <option value="">— Month —</option>
                  {MONTHS.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                </select>
                <select
                  className="invdl-select"
                  value={year}
                  onChange={e => setYear(e.target.value)}
                >
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="invdl-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                All invoices from the selected month &amp; year will be fetched. File names are matched against common date patterns (e.g. 04-2025, April_2025).
              </div>
            </div>
          )}

          {/* Progress indicator */}
          {dlProgress && downloading && (
            <div className="invdl-msg" style={{ marginBottom: 16, background: "#F0ECFF", borderColor: "#7C5CFC", color: "#7C5CFC", display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: "spin 1s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              {dlProgress}
            </div>
          )}

          {/* Error / Success messages */}
          {dlError && (
            <div className="invdl-msg error" style={{ marginBottom: 16 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {dlError}
            </div>
          )}
          {dlSuccess && (
            <div className="invdl-msg success" style={{ marginBottom: 16 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {dlSuccess}
            </div>
          )}

          {/* Download button */}
          <button
            className="invdl-download-btn"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                  <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                </svg>
                {dlProgress || "Processing…"}
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <polyline points="7 13 12 18 17 13"/>
                  <line x1="12" y1="18" x2="12" y2="9"/>
                </svg>
                Download
              </>
            )}
          </button>
        </div>
      </div>

      {/* Download History */}
      <div className="invex-hist-card" style={{ marginTop: "28px" }}>
        <div className="invex-hist-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Download History
          </div>
          <button className={`qbd-refresh-btn${histRefresh ? " spinning" : ""}`} onClick={loadHistory} disabled={histRefresh} style={{ color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
        </div>
        <div className="invex-slicers-row">
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">Month</label>
            <input
              type="month"
              className="invex-slicer-date"
              value={dlSlicerMonth}
              onChange={e => { setDlSlicerMonth(e.target.value); setPage(1); }}
            />
          </div>
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">Downloaded By</label>
            <select
              className="invex-slicer-select"
              value={dlSlicerUser}
              onChange={e => { setDlSlicerUser(e.target.value); setPage(1); }}
            >
              <option value="">All</option>
              {Array.from(new Set(history.map(r => (r.downloaded_by || "").replace("@gofynd.com", "")).filter(Boolean))).sort().map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">From</label>
            <input
              type="date"
              className="invex-slicer-date"
              value={dlSlicerFrom}
              onChange={e => { setDlSlicerFrom(e.target.value); setPage(1); }}
            />
          </div>
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">To</label>
            <input
              type="date"
              className="invex-slicer-date"
              value={dlSlicerTo}
              onChange={e => { setDlSlicerTo(e.target.value); setPage(1); }}
            />
          </div>
          {(dlSlicerUser || dlSlicerMonth || dlSlicerFrom || dlSlicerTo) && (
            <button
              className="invex-slicer-clear"
              onClick={() => { setDlSlicerUser(""); setDlSlicerMonth(""); setDlSlicerFrom(""); setDlSlicerTo(""); setPage(1); }}
            >✕ Clear</button>
          )}
          <span className="invex-slicer-count">{sortedHistory.length} row{sortedHistory.length !== 1 ? "s" : ""}</span>
        </div>
        <table className="invex-hist-table">
            <thead>
              <tr>
                <th>Created At</th>
                <th>Request Type</th>
                <th>Query</th>
                <th>Invoice Count</th>
                <th>Status</th>
                <th>Downloaded By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {histLoading ? (
                <>
                  {[1, 2, 3].map(i => (
                    <tr key={i} className="qbd-skel-row">
                      <td><div className="qbd-skeleton" style={{ width: 130 }} /></td>
                      <td><div className="qbd-skeleton" style={{ width: 90 }} /></td>
                      <td><div className="qbd-skeleton" style={{ width: 70 }} /></td>
                      <td><div className="qbd-skeleton" style={{ width: 50 }} /></td>
                      <td><div className="qbd-skeleton" style={{ width: 70 }} /></td>
                      <td><div className="qbd-skeleton" style={{ width: 100 }} /></td>
                      <td><div className="qbd-skeleton" style={{ width: 28, height: 28, borderRadius: 7 }} /></td>
                    </tr>
                  ))}
                </>
              ) : sortedHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="invex-hist-empty">
                    {history.length === 0 ? "No download history yet." : "No rows match the selected filters."}
                  </td>
                </tr>
              ) : (
                paginatedHistory.map(row => (
                  <tr key={row.id}>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#6b7280", fontSize: 13 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {row.created_at || "—"}
                      </span>
                    </td>
                    <td>
                      <span className="invdl-req-type-chip">
                        {row.request_type === "month_year" ? "Month / Year" : "Invoice IDs"}
                      </span>
                    </td>
                    <td className="mono">{row.query || "—"}</td>
                    <td>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#374151", fontSize: 13 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                        </svg>
                        {row.invoice_count != null ? row.invoice_count : "—"}
                      </span>
                    </td>
                    <td>
                      <span className={`qbd-badge${row.status === "success" ? " success" : row.status === "triggered" ? " triggered" : " failed"}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="qbd-user-cell">{row.downloaded_by ? row.downloaded_by.replace('@gofynd.com', '') : '—'}</td>
                    <td>
                      {row.file_key ? (
                        <a
                          href={`/api/invoice-download/file/${row.id}`}
                          className="qbd-dl-btn"
                          title="Download zip"
                          download
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                        </a>
                      ) : (
                        <span className="qbd-dl-btn disabled" title={row.error || "No file"}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                          </svg>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {/* Pagination */}
          {!histLoading && sortedHistory.length > PAGE_SIZE && (
            <div className="qbd-pagination">
              <button
                className="qbd-page-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                Prev
              </button>
              <span className="qbd-page-info">Page {page} of {totalPages}</span>
              <button
                className="qbd-page-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
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

// ══════════════════════════════════════════════════════════════════════════════
// InvoiceExpoPage — Invoice Expo (PDF Export)
// Mirrors finops-local/app.py lines 2615–2873:
//   GCS Extract → Drive Upload → BQ Cleanup → BQ Insert → Bolt1 → Bolt2
// ══════════════════════════════════════════════════════════════════════════════
interface InvExHistRow {
  id: string;
  monthYear: string;
  status: string;
  pdfCount: number | null;
  errorMsg: string | null;
  createdAt: string;
  executedBy?: string;
}

const MONTHS_IE = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const STEPS_IE = [
  { n: 1, label: "GCS Extract" },
  { n: 2, label: "Bucket Upload" },
  { n: 3, label: "BQ Cleanup" },
  { n: 4, label: "BQ Insert" },
  { n: 5, label: "Bolt1" },
  { n: 6, label: "Bolt2" },
];

function InvoiceExpoPage() {
  const { qbUser } = useQbUser();
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [failedStep, setFailedStep] = useState(0);
  const [logs, setLogs] = useState<Array<{ text: string; cls: string }>>([]); 
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [result, setResult] = useState<{ status: "success" | "failed" | "cancelled"; count?: number; error?: string } | null>(null);
  const [todayStats, setTodayStats] = useState<{ invoiceCount: number; invoices: Array<Record<string, string | null>> } | null>(null);
  const [todayStatsLoading, setTodayStatsLoading] = useState(false);
  const [todayStatsError, setTodayStatsError] = useState<string | null>(null);
  const [statsVisible, setStatsVisible] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [pdfsTodayCount, setPdfsTodayCount] = useState<number | null>(null);
  const [pdfsTodayLoading, setPdfsTodayLoading] = useState(true);
  const [history, setHistory] = useState<InvExHistRow[]>([]);
  const [histLoading, setHistLoading] = useState(true);
  const [histRefresh, setHistRefresh] = useState(false);
  const [histPage, setHistPage] = useState(1);
  const INVEX_PAGE_SIZE = 5;
  const [terminating, setTerminating] = useState(false);
  // Defaulter popup state
  const [defaulterOpen, setDefaulterOpen] = useState(false);
  const [defaulterRows, setDefaulterRows] = useState<Array<Record<string, string | null>>>([]); 
  const [defaulterLoading, setDefaulterLoading] = useState(false);
  const [defaulterError, setDefaulterError] = useState<string | null>(null);
  const [defaulterSearch, setDefaulterSearch] = useState("");
  // Track if at least one successful export has happened this session
  const [hasExportedSuccessfully, setHasExportedSuccessfully] = useState(false);

  // Sent Invoices popup state
  const [sentInvOpen, setSentInvOpen] = useState(false);
  const [sentInvRows, setSentInvRows] = useState<Array<Record<string, string | number | null>>>([]); 
  const [sentInvColumns, setSentInvColumns] = useState<string[]>([]);
  const [sentInvLoading, setSentInvLoading] = useState(false);
  const [sentInvError, setSentInvError] = useState<string | null>(null);
  const [sentInvTotal, setSentInvTotal] = useState(0);
  const [sentInvPage, setSentInvPage] = useState(1);
  const [sentInvDownloading, setSentInvDownloading] = useState(false);
  const SENT_INV_LIMIT = 50;

  // Invoice Expo history slicers
  const [slicerExecutedBy, setSlicerExecutedBy] = useState<string>("all");
  const [slicerMonth, setSlicerMonth] = useState<string>("all");
  const [slicerDateFrom, setSlicerDateFrom] = useState<string>("");
  const [slicerDateTo, setSlicerDateTo] = useState<string>("");

  // Derived unique values for dropdowns
  const uniqueExecutors = Array.from(new Set(history.map(r => r.executedBy || "").filter(Boolean)));
  const uniqueMonths = Array.from(new Set(history.map(r => r.monthYear || "").filter(Boolean)));

  // Filtered history
  const filteredInvexHistory = history.filter(row => {
    if (slicerExecutedBy !== "all" && (row.executedBy || "") !== slicerExecutedBy) return false;
    if (slicerMonth !== "all" && (row.monthYear || "") !== slicerMonth) return false;
    if (slicerDateFrom) {
      const rowDate = new Date(row.createdAt);
      const fromDate = new Date(slicerDateFrom);
      if (!isNaN(rowDate.getTime()) && !isNaN(fromDate.getTime()) && rowDate < fromDate) return false;
    }
    if (slicerDateTo) {
      const rowDate = new Date(row.createdAt);
      const toDate = new Date(slicerDateTo + "T23:59:59");
      if (!isNaN(rowDate.getTime()) && !isNaN(toDate.getTime()) && rowDate > toDate) return false;
    }
    return true;
  });

  // Invoice Expo history pagination
  const invexTotalPages = Math.max(1, Math.ceil(filteredInvexHistory.length / INVEX_PAGE_SIZE));
  const paginatedInvexHistory = filteredInvexHistory.slice((histPage - 1) * INVEX_PAGE_SIZE, histPage * INVEX_PAGE_SIZE);
  const logBoxRef = useRef<HTMLDivElement>(null);
  // Track current step in a ref so SSE event handlers can access latest value
  const currentStepRef = useRef(0);

  const loadHistory = useCallback(async () => {
    setHistRefresh(true);
    try {
      const res = await fetch("/api/invoice-expo/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
        setHistPage(1);
      }
    } catch { /* ignore */ }
    finally { setHistLoading(false); setHistRefresh(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Fetch live PDFs Sent Today count from BQ on mount
  useEffect(() => {
    setPdfsTodayLoading(true);
    fetch("/api/invoice-expo/pdfs-today")
      .then(r => r.json())
      .then((data: { ok: boolean; count: number | null }) => {
        if (data.ok) setPdfsTodayCount(data.count ?? null);
      })
      .catch(() => {})
      .finally(() => setPdfsTodayLoading(false));
  }, []);

  // Determine if Defaulter button should be enabled:
  // enabled if result is success OR if the most recent history row has status=success
  const mostRecentHistRow = history[0] ?? null;
  const defaulterEnabled = hasExportedSuccessfully || (mostRecentHistRow?.status === "success");

  const openDefaulter = async () => {
    setDefaulterOpen(true);
    setDefaulterLoading(true);
    setDefaulterError(null);
    setDefaulterRows([]);
    setDefaulterSearch("");
    try {
      const res = await fetch("/api/invoice-expo/defaulters");
      const data = await res.json();
      if (data.ok) {
        setDefaulterRows(data.defaulters || []);
      } else {
        setDefaulterError(data.error || "Failed to load defaulters");
      }
    } catch (err: any) {
      setDefaulterError(String(err.message || err));
    } finally {
      setDefaulterLoading(false);
    }
  };

  // Sent Invoices fetch handler
  const fetchSentInvoices = async (page: number) => {
    setSentInvLoading(true);
    setSentInvError(null);
    try {
      const res = await fetch(`/api/invoice-download/sent-invoices?page=${page}&limit=${SENT_INV_LIMIT}`);
      const data = await res.json();
      if (data.ok) {
        setSentInvRows(data.rows || []);
        setSentInvColumns(data.columns || []);
        setSentInvTotal(data.total || 0);
        setSentInvPage(page);
      } else {
        setSentInvError(data.error || "Failed to load sent invoices");
      }
    } catch (err: any) {
      setSentInvError(String(err.message || err));
    } finally {
      setSentInvLoading(false);
    }
  };

  const openSentInvoices = () => {
    setSentInvOpen(true);
    setSentInvRows([]);
    setSentInvColumns([]);
    setSentInvTotal(0);
    setSentInvPage(1);
    fetchSentInvoices(1);
  };

  const downloadSentInvoices = async () => {
    setSentInvDownloading(true);
    try {
      const res = await fetch("/api/invoice-download/sent-invoices/download");
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = `sent_invoices_${today}.xlsx`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Download failed: " + String(err.message || err));
    } finally {
      setSentInvDownloading(false);
    }
  };

  // Auto-scroll logs
  const scrollToBottom = useCallback(() => {
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  useEffect(() => { scrollToBottom(); }, [logs, uploadProgress, scrollToBottom]);

  // Shared SSE event processor
  const processEvent = useCallback((evt: Record<string, unknown>) => {
    if (evt.type === "step") {
      const n = evt.n as number;
      currentStepRef.current = n;
      setCurrentStep(n);
      setLogs(prev => [...prev, { text: `\u25b6 Step ${n}: ${evt.label}`, cls: "step" }]);
    } else if (evt.type === "progress") {
      setUploadProgress({ current: evt.current as number, total: evt.total as number, filename: evt.filename as string });
    } else if (evt.type === "detail") {
      const msg = evt.msg as string;
      const isErr = msg.startsWith("\u2717") || msg.startsWith("Error");
      const isOk  = msg.startsWith("\u2713") || (msg.startsWith("(") && msg.includes(")"));
      setLogs(prev => [...prev, { text: msg, cls: isErr ? "err" : isOk ? "ok" : "" }]);
    } else if (evt.type === "done") {
      setUploadProgress(null);
      if (evt.status === "success") {
        setResult({ status: "success", count: evt.count as number });
        setCurrentStep(7);
        currentStepRef.current = 7;
        setHasExportedSuccessfully(true);
        // Fetch today's invoice stats after successful Bolt2 completion
        setTodayStatsLoading(true);
        setTodayStatsError(null);
        setTodayStats(null);
        setStatsVisible(false);
        fetch("/api/invoice-expo/today-stats")
          .then(r => r.json())
          .then((data: { ok: boolean; invoiceCount: number; invoices: Array<Record<string, string | null>>; error?: string }) => {
            if (data.ok) {
              setTodayStats({ invoiceCount: data.invoiceCount, invoices: data.invoices });
              setTimeout(() => setStatsVisible(true), 100);
            } else {
              setTodayStatsError(data.error || "Failed to load today's stats");
            }
          })
          .catch((e: Error) => setTodayStatsError(String(e.message || e)))
          .finally(() => setTodayStatsLoading(false));
      } else if (evt.status === "cancelled") {
        setResult({ status: "cancelled", error: (evt.error as string) || "Terminated by user" });
        setFailedStep(currentStepRef.current || 1);
      } else {
        setResult({ status: "failed", error: evt.error as string });
        setFailedStep(currentStepRef.current || 1);
      }
      setRunning(false);
      setTerminating(false);
      loadHistory();
    } else if (evt.type === "no_job") {
      setRunning(false);
    }
  }, [loadHistory]);

  // Read an SSE stream and process events
  const readStream = useCallback(async (resp: Response) => {
    if (!resp.body) return;
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        try {
          const evt = JSON.parse(line.slice(5).trim());
          processEvent(evt);
        } catch { /* ignore malformed */ }
      }
    }
  }, [processEvent]);

  // On mount: check if a job is already running and reconnect if so
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusResp = await fetch("/api/invoice-expo/status");
        if (!statusResp.ok || cancelled) return;
        const status = await statusResp.json();
        if (!status.running || cancelled) return;

        setRunning(true);
        setCurrentStep(status.step || 1);
        currentStepRef.current = status.step || 1;
        setLogs([{ text: "\u21a9 Reconnected to running job \u2014 replaying logs\u2026", cls: "step" }]);

        const reconnectResp = await fetch("/api/invoice-expo/reconnect");
        if (!reconnectResp.ok || cancelled) return;
        await readStream(reconnectResp);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [readStream]);

  const handleExport = useCallback(async () => {
    if (running) return;
    const monthYear = `${month}-${year}`;
    setRunning(true);
    setCurrentStep(0);
    currentStepRef.current = 0;
    setFailedStep(0);
    setLogs([]);
    setResult(null);
    setUploadProgress(null);

    try {
      const resp = await fetch(`/api/invoice-expo/run?month_year=${encodeURIComponent(monthYear)}&executed_by=${encodeURIComponent(qbUser?.email ?? "")}`);
      if (!resp.ok || !resp.body) {
        if (resp.status === 409) {
          setLogs([{ text: "\u21a9 A job is already running \u2014 reconnecting\u2026", cls: "step" }]);
          const reconnectResp = await fetch("/api/invoice-expo/reconnect");
          if (reconnectResp.ok) {
            await readStream(reconnectResp);
          } else {
            setResult({ status: "failed", error: "Already running" });
            setRunning(false);
          }
          return;
        }
        setResult({ status: "failed", error: `Server error: ${resp.status}` });
        setRunning(false);
        return;
      }
      await readStream(resp);
    } catch (err: any) {
      setResult({ status: "failed", error: String(err.message || err) });
      setRunning(false);
    }
  }, [running, month, year, readStream]);

  const handleTerminate = useCallback(async () => {
    if (!running || terminating) return;
    setTerminating(true);
    try {
      await fetch("/api/invoice-expo/terminate", { method: "POST" });
    } catch { /* ignore */ }
  }, [running, terminating]);

  const handleReset = useCallback(() => {
    if (running) return;
    setLogs([]);
    setResult(null);
    setCurrentStep(0);
    currentStepRef.current = 0;
    setFailedStep(0);
    setUploadProgress(null);
    setTodayStats(null);
    setTodayStatsError(null);
    setStatsVisible(false);
    setInvoiceSearch("");
  }, [running]);

  const stepClass = (n: number) => {
    if ((result?.status === "failed" || result?.status === "cancelled") && failedStep > 0 && n === failedStep) return "failed";
    if (currentStep >= 7 || (result?.status === "success")) return "done";
    if (n < currentStep) return "done";
    if (n === currentStep) return "active";
    return "";
  };

  return (
    <div className="invex-page">
      <div className="invex-page-header">
        <h1 className="invex-page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <polyline points="8 13 12 17 16 13"/>
            <line x1="12" y1="17" x2="12" y2="9"/>
          </svg>
          Invoice Export
        </h1>
      </div>

      {/* Export card */}
      <div className="invex-card">
        <div className="invex-card-header">
          <span className="invex-card-header-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </span>
          <span className="invex-card-title">Export PDFs by Month</span>
        </div>
        <div className="invex-card-body">
          <div className="invex-form-row">
            <div className="invex-form-group">
              <label className="invex-form-label">Month</label>
              <select className="invex-select" value={month} onChange={e => setMonth(e.target.value)} disabled={running}>
                {MONTHS_IE.map((m, i) => (
                  <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
                ))}
              </select>
            </div>
            <div className="invex-form-group">
              <label className="invex-form-label">Year</label>
              <input
                className="invex-year-input"
                type="number"
                min="2020"
                max="2099"
                value={year}
                onChange={e => setYear(e.target.value)}
                disabled={running}
              />
            </div>
            {!running && (
              <button className="invex-export-btn" onClick={handleExport}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Export &amp; Upload to Valyx
              </button>
            )}
            {running && (
              <button
                className="invex-terminate-btn"
                onClick={handleTerminate}
                disabled={terminating}
              >
                {terminating
                  ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin .7s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Terminating\u2026</>
                  : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Terminate</>
                }
              </button>
            )}
            {!running && logs.length > 0 && (
              <button className="invex-reset-btn" onClick={handleReset}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10"/>
                  <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
                </svg>
                Reset
              </button>
            )}
          </div>

          {/* Step progress */}
          <div className="invex-steps">
              {STEPS_IE.map(s => (
                <div key={s.n} className={`invex-step ${stepClass(s.n)}`}>
                  <div className="invex-step-circle">
                    <div className="invex-step-fill" />
                    <span className="invex-step-num">{s.n}</span>
                  </div>
                  <span className="invex-step-label">{s.label}</span>
                </div>
              ))}
            </div>

          {/* Progress bar */}
          {running && uploadProgress && (
            <div className="invex-progress-bar-wrap">
              <div className="invex-progress-bar-track">
                <div
                  className="invex-progress-bar-fill"
                  style={{ width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%` }}
                />
              </div>
              <span className="invex-progress-bar-label">
                {uploadProgress.current} / {uploadProgress.total} PDFs uploaded
              </span>
            </div>
          )}

          {/* Live logs */}
          {(running || logs.length > 0) && (
            <div className="invex-log-box" ref={logBoxRef}>
              {logs.length === 0
                ? <span className="invex-log-empty">Connecting\u2026</span>
                : logs.map((l, i) => (
                    <span key={i} className={`invex-log-line ${l.cls}`}>{l.text}</span>
                  ))
              }
              {running && (
                <div className="invex-live-indicator">
                  <span className="invex-live-dot" />
                  {uploadProgress
                    ? <span className="invex-live-text">Uploading {uploadProgress.current}/{uploadProgress.total} \u2014 {uploadProgress.filename}</span>
                    : <span className="invex-live-text">Processing\u2026</span>
                  }
                </div>
              )}
            </div>
          )}

          {/* Result banner */}
          {result && (
            <div className={`invex-result-banner ${result.status === "cancelled" ? "failed" : result.status}`}>
              {result.status === "success"
                ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Success \u2014 {result.count} PDF(s) exported and uploaded to Valyx</>
                : result.status === "cancelled"
                  ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> Cancelled \u2014 {result.error}</>
                  : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Failed: {result.error}</>
              }
            </div>
          )}
        </div>
      </div>

      {/* Today's Invoice Stats — animated reveal after successful Bolt2 */}
      {result?.status === "success" && (
        <div className={`invex-today-stats-wrap${statsVisible ? " visible" : ""}`}>
          {todayStatsLoading && (
            <div className="invex-stats-loading">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin .8s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Loading today&apos;s invoice stats from BigQuery&hellip;
            </div>
          )}
          {todayStatsError && (
            <div className="invex-stats-error">&#9888; {todayStatsError}</div>
          )}
          {todayStats && (
            <>
              {/* KPI Flashcard */}
              <div className={`invex-kpi-card${statsVisible ? " pop-in" : ""}`}>
                <div className="invex-kpi-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                </div>
                <div className="invex-kpi-body">
                  <div className="invex-kpi-label">Total Invoices Sent Today</div>
                  <div className="invex-kpi-value">{todayStats.invoiceCount.toLocaleString()}</div>
                  <div className="invex-kpi-sub">Distinct invoice_no &middot; latest invoice_posted_at date</div>
                </div>
              </div>

              {/* Invoice List Table */}
              <div className={`invex-today-table-card${statsVisible ? " slide-up" : ""}`}>
                <div className="invex-today-table-header">
                  <span className="invex-today-table-title">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <path d="M3 9h18M9 21V9"/>
                    </svg>
                    Invoices Sent {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}&nbsp;&nbsp;{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="invex-today-table-count">{(() => { const q = invoiceSearch.toLowerCase(); return q ? todayStats.invoices.filter(r => Object.values(r).some(v => String(v ?? "").toLowerCase().includes(q))).length : todayStats.invoices.length; })()} rows</span>
                </div>
                <div className="invex-invoice-search-wrap">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="invex-invoice-search-icon">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    type="text"
                    className="invex-invoice-search"
                    placeholder="Search invoices…"
                    value={invoiceSearch}
                    onChange={e => setInvoiceSearch(e.target.value)}
                  />
                  {invoiceSearch && (
                    <button className="invex-invoice-search-clear" onClick={() => setInvoiceSearch("")} title="Clear search">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
                <div className="invex-today-table-scroll">
                  {todayStats.invoices.length === 0 ? (
                    <div className="invex-hist-empty">No invoices found for today.</div>
                  ) : (() => {
                    const q = invoiceSearch.toLowerCase();
                    const filtered = q ? todayStats.invoices.filter(r => Object.values(r).some(v => String(v ?? "").toLowerCase().includes(q))) : todayStats.invoices;
                    return filtered.length === 0 ? (
                      <div className="invex-hist-empty">No matching invoices for &ldquo;{invoiceSearch}&rdquo;.</div>
                    ) : (
                      <table className="invex-today-table">
                        <thead>
                          <tr>
                            {Object.keys(todayStats.invoices[0]).map(col => (
                              <th key={col}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((row, i) => (
                            <tr key={i}>
                              {Object.values(row).map((val, j) => (
                                <td key={j}>{val ?? "—"}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* History */}
      <div className="invex-hist-card" style={{ marginTop: "28px" }}>
        <div className="invex-hist-header">
          <span className="invex-hist-title">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
            Export History
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              className={`invex-defaulter-btn${defaulterEnabled ? " enabled" : " disabled"}`}
              onClick={defaulterEnabled ? openDefaulter : undefined}
              disabled={!defaulterEnabled}
              title={defaulterEnabled ? "View invoices not sent today" : "Run an export first to enable Defaulter"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              Defaulter
            </button>
            <button
              className="invex-defaulter-btn enabled"
              onClick={openSentInvoices}
              title="View invoices sent today (latest date in daily_invoice_logs)"
              style={{ background: "linear-gradient(135deg, #7C5CFC 0%, #9B7FFF 100%)", borderColor: "#7C5CFC", color: "#ffffff" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
              Sent Invoices
            </button>
          <button
            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}
            onClick={loadHistory}
            disabled={histRefresh}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ animation: histRefresh ? "spin .7s linear infinite" : undefined }}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Refresh
          </button>
          </div>
        </div>
        {/* Slicers */}
        <div className="invex-slicers-row">
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">Month</label>
            <select
              className="invex-slicer-select"
              value={slicerMonth}
              onChange={e => { setSlicerMonth(e.target.value); setHistPage(1); }}
            >
              <option value="all">All Months</option>
              {uniqueMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">Executed By</label>
            <select
              className="invex-slicer-select"
              value={slicerExecutedBy}
              onChange={e => { setSlicerExecutedBy(e.target.value); setHistPage(1); }}
            >
              <option value="all">All Users</option>
              {uniqueExecutors.map(u => <option key={u} value={u}>{u.replace('@gofynd.com', '')}</option>)}
            </select>
          </div>
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">From</label>
            <input
              type="date"
              className="invex-slicer-date"
              value={slicerDateFrom}
              onChange={e => { setSlicerDateFrom(e.target.value); setHistPage(1); }}
            />
          </div>
          <div className="invex-slicer-group">
            <label className="invex-slicer-label">To</label>
            <input
              type="date"
              className="invex-slicer-date"
              value={slicerDateTo}
              onChange={e => { setSlicerDateTo(e.target.value); setHistPage(1); }}
            />
          </div>
          {(slicerExecutedBy !== "all" || slicerMonth !== "all" || slicerDateFrom || slicerDateTo) && (
            <button
              className="invex-slicer-clear"
              onClick={() => { setSlicerExecutedBy("all"); setSlicerMonth("all"); setSlicerDateFrom(""); setSlicerDateTo(""); setHistPage(1); }}
            >
              ✕ Clear
            </button>
          )}
          <span className="invex-slicer-count">{filteredInvexHistory.length} row{filteredInvexHistory.length !== 1 ? "s" : ""}</span>
        </div>

        <table className="invex-hist-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Status</th>
              <th>PDFs Sent Today</th>
              <th>Started At</th>
              <th>Executed By</th>
            </tr>
          </thead>
          <tbody>
            {histLoading
              ? <tr><td colSpan={5} className="invex-hist-empty">Loading…</td></tr>
              : filteredInvexHistory.length === 0
                ? <tr><td colSpan={5} className="invex-hist-empty">{history.length === 0 ? "No export history yet." : "No rows match the selected filters."}</td></tr>
                : paginatedInvexHistory.map((row, idx) => (
                    <tr key={row.id}>
                      <td><span className="invex-mono">{row.monthYear}</span></td>
                      <td>
                        <span className={`invex-status-badge ${row.status}`}>
                          {row.status === "running" && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                              style={{ animation: "spin .7s linear infinite" }}>
                              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                            </svg>
                          )}
                          {row.status === "success" && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                          {row.status === "failed" && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          )}
                          {row.status === "cancelled" && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2"/>
                            </svg>
                          )}
                          {row.status}
                        </span>
                      </td>
                      <td>
                        {/* Only show live PDFs-today count for the most recent (first) row */}
                        {idx === 0 && histPage === 1
                          ? pdfsTodayLoading
                            ? <span style={{ color: "#94a3b8", fontSize: 12 }}>…</span>
                            : pdfsTodayCount !== null
                              ? pdfsTodayCount.toLocaleString()
                              : (row.pdfCount ?? "—")
                          : (row.pdfCount ?? "—")}
                      </td>
                      <td><span className="invex-mono">{(() => {
                        const d = new Date(row.createdAt);
                        if (isNaN(d.getTime())) return row.createdAt;
                        return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
                      })()}</span></td>
                      <td className="qbd-user-cell">{row.executedBy ? row.executedBy.replace('@gofynd.com', '') : '—'}</td>
                    </tr>
                  ))
            }
          </tbody>
        </table>
        {!histLoading && history.length > INVEX_PAGE_SIZE && (
          <div className="qbd-pagination">
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
              Page {histPage} of {invexTotalPages}
            </span>
            <button
              className="qbd-page-btn"
              onClick={() => setHistPage(p => Math.min(invexTotalPages, p + 1))}
              disabled={histPage === invexTotalPages}
            >
              Next
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Defaulter Popup Modal */}
      {sentInvOpen && (
        <div className="invex-defaulter-overlay" onClick={() => setSentInvOpen(false)}>
          <div className="invex-defaulter-modal" style={{ maxWidth: 1100, width: "96vw" }} onClick={e => e.stopPropagation()}>
            <div className="invex-defaulter-modal-header">
              <span className="invex-defaulter-modal-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Sent Invoices
                {!sentInvLoading && sentInvTotal > 0 && (
                  <span className="invex-defaulter-count">{sentInvTotal.toLocaleString()} record{sentInvTotal !== 1 ? 's' : ''}</span>
                )}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button
                  className="invex-defaulter-btn enabled"
                  onClick={downloadSentInvoices}
                  disabled={sentInvDownloading || sentInvLoading}
                  style={{ background: "linear-gradient(135deg, #174858 0%, #1e596b 100%)", borderColor: "#174858", fontSize: 12, color: "#ffffff" }}
                  title="Download all rows as Excel"
                >
                  {sentInvDownloading ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin .7s linear infinite" }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  )}
                  {sentInvDownloading ? "Downloading…" : "Download Excel"}
                </button>
                <button className="invex-defaulter-modal-close" onClick={() => setSentInvOpen(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            <div className="invex-defaulter-modal-sub">
              Invoices sent on the latest available date in <code style={{ fontSize: 11, background: "#f1f5f9", padding: "1px 5px", borderRadius: 4 }}>daily_invoice_logs</code>
              {!sentInvLoading && sentInvTotal > 0 && (
                <span style={{ marginLeft: 10, color: "#64748b", fontSize: 12 }}>
                  Showing {((sentInvPage - 1) * SENT_INV_LIMIT) + 1}–{Math.min(sentInvPage * SENT_INV_LIMIT, sentInvTotal)} of {sentInvTotal.toLocaleString()}
                </span>
              )}
            </div>
            <div className="invex-defaulter-modal-body">
              {sentInvLoading ? (
                <div className="invex-defaulter-loading">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ animation: "spin .7s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Loading sent invoices from BigQuery…
                </div>
              ) : sentInvError ? (
                <div className="invex-defaulter-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {sentInvError}
                </div>
              ) : sentInvRows.length === 0 ? (
                <div className="invex-defaulter-empty">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  <span>No sent invoices found for the latest date.</span>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="invex-defaulter-table" style={{ minWidth: 900 }}>
                    <thead>
                      <tr>
                        {sentInvColumns.map(col => (
                          <th key={col} style={{ whiteSpace: "nowrap", textTransform: "none", fontSize: 12 }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sentInvRows.map((row, i) => (
                        <tr key={i}>
                          {sentInvColumns.map(col => (
                            <td key={col} style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                              {row[col] === null || row[col] === undefined ? <span style={{ color: "#94a3b8", fontStyle: "italic" }}>—</span> : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {/* Pagination */}
            {!sentInvLoading && sentInvTotal > SENT_INV_LIMIT && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "12px 20px", borderTop: "1px solid #e2e8f0" }}>
                <button
                  className="invex-defaulter-btn enabled"
                  onClick={() => fetchSentInvoices(sentInvPage - 1)}
                  disabled={sentInvPage <= 1}
                  style={{ opacity: sentInvPage <= 1 ? 0.4 : 1, fontSize: 12, padding: "4px 12px" }}
                >
                  ← Prev
                </button>
                <span style={{ fontSize: 12, color: "#64748b" }}>
                  Page {sentInvPage} of {Math.ceil(sentInvTotal / SENT_INV_LIMIT)}
                </span>
                <button
                  className="invex-defaulter-btn enabled"
                  onClick={() => fetchSentInvoices(sentInvPage + 1)}
                  disabled={sentInvPage >= Math.ceil(sentInvTotal / SENT_INV_LIMIT)}
                  style={{ opacity: sentInvPage >= Math.ceil(sentInvTotal / SENT_INV_LIMIT) ? 0.4 : 1, fontSize: 12, padding: "4px 12px" }}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {defaulterOpen && (
        <div className="invex-defaulter-overlay" onClick={() => setDefaulterOpen(false)}>
          <div className="invex-defaulter-modal" onClick={e => e.stopPropagation()}>
            <div className="invex-defaulter-modal-header">
              <span className="invex-defaulter-modal-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Defaulter Invoices
                {!defaulterLoading && (
                  <span className="invex-defaulter-count">{defaulterRows.length} record{defaulterRows.length !== 1 ? 's' : ''}</span>
                )}
              </span>
              <button className="invex-defaulter-modal-close" onClick={() => setDefaulterOpen(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="invex-defaulter-modal-sub">Invoices with seller_id IS NULL — not present in downstream tables</div>
            {!defaulterLoading && !defaulterError && defaulterRows.length > 0 && (
              <div className="invex-defaulter-search-wrap">
                <input
                  className="invex-defaulter-search"
                  type="text"
                  placeholder="Search by invoice, customer..."
                  value={defaulterSearch}
                  onChange={e => setDefaulterSearch(e.target.value)}
                />
              </div>
            )}
            <div className="invex-defaulter-modal-body">
              {defaulterLoading ? (
                <div className="invex-defaulter-loading">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ animation: "spin .7s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                  </svg>
                  Loading defaulters from BigQuery…
                </div>
              ) : defaulterError ? (
                <div className="invex-defaulter-error">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {defaulterError}
                </div>
              ) : defaulterRows.length === 0 ? (
                <div className="invex-defaulter-empty">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span>No defaulters found — all invoices were sent successfully!</span>
                </div>
              ) : (() => {
                const filtered = defaulterRows.filter(r =>
                  Object.values(r).some(v => String(v ?? '').toLowerCase().includes(defaulterSearch.toLowerCase()))
                );
                return (
                  <table className="invex-defaulter-table">
                    <thead>
                      <tr>
                        <th>Invoice Reference</th>
                        <th>Customer Name</th>
                        <th>Seller ID</th>
                        <th>Source Table</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={4} style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>No results match your search.</td></tr>
                      ) : filtered.map((row, i) => (
                        <tr key={i}>
                          <td className="invex-defaulter-inv-ref">{row.Invoice_Reference ?? '—'}</td>
                          <td>{row.Customer_Name ?? '—'}</td>
                          <td>{row.seller_id ?? <span style={{ color: '#ef4444', fontStyle: 'italic' }}>NULL</span>}</td>
                          <td><span className="invex-defaulter-table-badge">{row.table_name ?? '—'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BrandLedgerPayablePage — Brand Ledger > Payable
// Source: fynd-db.Outstanding.12_claim_payable
// Display columns: company_id, order_id, shipment_id, type, recon_date, claimable_amt
// Download: all columns, no row limit
// ══════════════════════════════════════════════════════════════════════════════

interface PayableRow {
  company_id: string | null;
  order_id: string | null;
  shipment_id: string | null;
  type: string | null;
  recon_date: string | null;
  claimable_amt: string | number | null;
}

type PresetKey = "this-month" | "last-month" | "last-3m" | "fy26" | "custom";

function getPresetDates(preset: PresetKey): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  if (preset === "this-month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: fmt(from), to: fmt(to) };
  }
  if (preset === "last-month") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: fmt(from), to: fmt(to) };
  }
  if (preset === "last-3m") {
    const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: fmt(from), to: fmt(to) };
  }
  if (preset === "fy26") {
    // Indian FY26: Apr 1 2025 – Mar 31 2026
    return { from: "2025-04-01", to: "2026-03-31" };
  }
  return { from: "", to: "" };
}

interface ArRow {
  company_id: string | null;
  seller_name: string | null;
  business: string | null;
  channel: string | null;
  transaction_type: string | null;
  invoice_no: string | null;
  invoice_type: string | null;
  invoice_date: string | null;
  due_date: string | null;
  invoice_amount: string | number | null;
  outstanding_amount: string | number | null;
  company_level_due: string | number | null;
  days: string | number | null;
  aging_bucket: string | null;
  status: string | null;
  total_collections: string | number | null;
}
interface BagsRow {
  bag_id: string | null;
  fynd_order_id: string | null;
  settlement_type: string | null;
  recon_date: string | null;
  seller_net_collection: string | number | null;
}
interface PayoutRow {
  bag_id: string | null;
  company_id: string | null;
  company_name: string | null;
  brand_name: string | null;
  fynd_order_id: string | null;
  transaction_type: string | null;
  sales_channel: string | null;
  recon_status: string | null;
  store_state: string | null;
  recon_date: string | null;
  order_date: string | null;
  seller_net_collection: string | number | null;
  net_payout: string | number | null;
}
interface ClaimPayoutRow {
  company_id: string | null;
  company_name: string | null;
  fynd_order_id: string | null;
  current_shipment_id: string | null;
  transaction_type: string | null;
  recon_status: string | null;
  sales_channel: string | null;
  recon_date: string | null;
  claim_settle_date: string | null;
  Payment_Date: string | null;
  SF_UTR: string | null;
  payout_id: string | null;
  claimable_amt: string | number | null;
  non_claimable_amt: string | number | null;
  total_utr_paid: string | number | null;
}

function BrandLedgerPayablePage() {
  const { qbUser } = useQbUser();

  // Tab state: which sub-tab is active
  const [activeTab, setActiveTab] = useState<"receivable" | "claims" | "bags" | "payout" | "settled-claims" | "adjustments" | "receipts" | "summary">("receivable");

  // ── Activity Log state ──
  interface ActivityLogRow { id: number; userName: string; activityType: string; companyId: string; createdAt: string; }
  const [activityLogs, setActivityLogs] = useState<ActivityLogRow[]>([]);
  const [activityLogPage, setActivityLogPage] = useState(1);
  const [activityLogTotal, setActivityLogTotal] = useState(0);
  const [activityLogLoading, setActivityLogLoading] = useState(false);
  const ACTIVITY_PAGE_LIMIT = 5;
  // Brand Ledger Activity Log slicer state
  const [blLogSlicerUser, setBlLogSlicerUser] = useState("");
  const [blLogSlicerType, setBlLogSlicerType] = useState("");
  const [blLogSlicerFrom, setBlLogSlicerFrom] = useState("");
  const [blLogSlicerTo, setBlLogSlicerTo] = useState("");

  const fetchActivityLogs = useCallback(async (page = 1) => {
    setActivityLogLoading(true);
    try {
      const res = await fetch(`/api/brand-ledger/activity-log?page=${page}&limit=${ACTIVITY_PAGE_LIMIT}`, { credentials: "include" });
      const data = await res.json();
      if (data.success) {
        setActivityLogs(data.rows);
        setActivityLogTotal(data.total);
        setActivityLogPage(page);
      }
    } catch {/* silent */} finally {
      setActivityLogLoading(false);
    }
  }, []);

  useEffect(() => { fetchActivityLogs(1); }, [fetchActivityLogs]);

  const logActivity = useCallback(async (activityType: string, cid?: string) => {
    try {
      await fetch("/api/brand-ledger/activity-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user_name: qbUser?.name || qbUser?.email || "Unknown",
          activity_type: activityType,
          company_id: cid ?? "",
        }),
      });
      // Refresh log table (fire-and-forget)
      fetchActivityLogs(1);
    } catch {/* silent */}
  }, [qbUser, fetchActivityLogs]);

  // ── Shared filter state (single source of truth for both tabs) ──
  const [companyId, setCompanyId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activePreset, setActivePreset] = useState<PresetKey | null>(null);

  // ── Claims tab state ──
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PayableRow[] | null>(null);
  const [hasQueried, setHasQueried] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // ── KPI state — Claims ──
  const [kpi, setKpi] = useState<{ net_payable_claim: number; shipment_count: number } | null>(null);
  const [kpiLoading, setKpiLoading] = useState(false);

  // ── KPI state — Bags ──
  const [bagsKpi, setBagsKpi] = useState<{ payable_seller_sale: number; bag_count: number } | null>(null);
  const [bagsKpiLoading, setBagsKpiLoading] = useState(false);

  // ── Bags tab data state ──
  const [bagsRows, setBagsRows] = useState<BagsRow[] | null>(null);
  const [bagsLoading, setBagsLoading] = useState(false);
  const [bagsError, setBagsError] = useState<string | null>(null);
  const [bagsHasQueried, setBagsHasQueried] = useState(false);
  const [bagsDownloading, setBagsDownloading] = useState(false);

  // Pagination — Claims
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // Pagination — Bags
  const [bagsCurrentPage, setBagsCurrentPage] = useState(1);

  // ── KPI state — Receivable ──
  const [arKpi, setArKpi] = useState<{ net_receivable: number; record_count: number } | null>(null);
  const [arKpiLoading, setArKpiLoading] = useState(false);

  // ── Receivable tab data state ──
  const [arRows, setArRows] = useState<ArRow[] | null>(null);
  const [arLoading, setArLoading] = useState(false);
  const [arError, setArError] = useState<string | null>(null);
  const [arHasQueried, setArHasQueried] = useState(false);
  const [arDownloading, setArDownloading] = useState(false);

  // Pagination — Receivable
  const [arCurrentPage, setArCurrentPage] = useState(1);
  // ── KPI state — Payout ──
  const [payoutKpi, setPayoutKpi] = useState<{ seller_net_payout: number; bag_count: number } | null>(null);
  const [payoutKpiLoading, setPayoutKpiLoading] = useState(false);
  // ── Payout (Settled Bags) tab state ──
  const [payoutRows, setPayoutRows] = useState<PayoutRow[] | null>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState<string | null>(null);
  const [payoutHasQueried, setPayoutHasQueried] = useState(false);
  const [payoutDownloading, setPayoutDownloading] = useState(false);
  // Pagination — Payout
  const [payoutCurrentPage, setPayoutCurrentPage] = useState(1);
  // ── KPI state — Claim Payout ──
  const [claimPayoutKpi, setClaimPayoutKpi] = useState<{ net_claim_payout: number; row_count: number } | null>(null);
  const [claimPayoutKpiLoading, setClaimPayoutKpiLoading] = useState(false);
  // ── Claim Payouts tab state ──
  const [claimPayoutRows, setClaimPayoutRows] = useState<ClaimPayoutRow[] | null>(null);
  const [claimPayoutLoading, setClaimPayoutLoading] = useState(false);
  const [claimPayoutError, setClaimPayoutError] = useState<string | null>(null);
  const [claimPayoutHasQueried, setClaimPayoutHasQueried] = useState(false);
  const [claimPayoutDownloading, setClaimPayoutDownloading] = useState(false);
  // ── Summary tab state ──
  const [summaryDownloading, setSummaryDownloading] = useState(false);
  const [summaryProgress, setSummaryProgress] = useState<{ msg: string; step: number } | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryPreviewError, setSummaryPreviewError] = useState<string | null>(null);
  type SummaryKpis = {
    receivable: number; receivableRecords: number;
    payableSale: number; payableSaleRaw?: number; payableSaleBags: number;
    payableClaim: number; payableClaimShipments: number;
    payableTotal: number;
    hasAdjustments?: boolean; adjustmentAmount?: number; adjustmentCount?: number;
    hasReceipts?: boolean; receiptsAmount?: number; receiptsCount?: number; effectiveReceivable?: number;
    settledBags: number; settledBagCount: number;
    settledClaims: number; settledClaimCount: number;
    settledTotal: number;
    netBalance: number;
  };
  const [summaryData, setSummaryData] = useState<{
    companyName: string; dateLabel: string;
    kpis: SummaryKpis;
    receivablePreview: { columns: string[]; rows: (string | number | boolean | null)[][] };
  } | null>(null);
  // Pagination — Claim Payout
  const [claimPayoutCurrentPage, setClaimPayoutCurrentPage] = useState(1);
  // ── Manual Dispute tab state ──
  const [mdRows, setMdRows] = useState<(string | number | boolean | null)[][] | null>(null);
  const [mdColumns, setMdColumns] = useState<string[]>([]);
  const [mdLoading, setMdLoading] = useState(false);
  const [mdError, setMdError] = useState<string | null>(null);
  // ── Receipts tab state ──
  const [receiptsRows, setReceiptsRows] = useState<(string | number | boolean | null)[][] | null>(null);
  const [receiptsColumns, setReceiptsColumns] = useState<string[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);
  const [receiptsHasQueried, setReceiptsHasQueried] = useState(false);
  const [receiptsDownloading, setReceiptsDownloading] = useState(false);
  const [receiptsCurrentPage, setReceiptsCurrentPage] = useState(1);
  const RECEIPTS_PAGE_SIZE = 10;
  const [mdCurrentPage, setMdCurrentPage] = useState(1);
  const MD_PAGE_SIZE = 10;

  // Debounce ref for auto-fetch
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-current filter values (avoids stale closures in debounced callbacks)
  const latestFilters = useRef({ companyId: "", fromDate: "", toDate: "" });

  // Apply preset — immediately triggers fetch
  const applyPreset = (preset: PresetKey) => {
    setActivePreset(preset);
    const { from, to } = getPresetDates(preset);
    setFromDate(from);
    setToDate(to);
  };

  // ── Fetch Claims (preview + KPI) ──
  const fetchClaims = useCallback(async (cid: string, fd: string, td: string) => {
    setLoading(true);
    setKpiLoading(true);
    setError(null);
    setHasQueried(true);
    setCurrentPage(1);
    try {
      const data = await pollQueryJob<{ success: boolean; error?: string; columns?: string[]; rows?: (string | number | boolean | null)[][]; net_payable_claim?: number; shipment_count?: number }>(
        "/api/brand-ledger/payable/fetch",
        { company_id: cid, from_date: fd, to_date: td }
      );
      if (!data.success) throw new Error(data.error || "Query failed");
      const cols: string[] = data.columns || [];
      const rawRows: (string | number | boolean | null)[][] = data.rows || [];
      const mapped: PayableRow[] = rawRows.map((r) => {
        const obj: Record<string, string | number | boolean | null> = {};
        cols.forEach((c, i) => { obj[c] = r[i]; });
        return {
          company_id: String(obj["company_id"] ?? ""),
          order_id: String(obj["order_id"] ?? ""),
          shipment_id: String(obj["shipment_id"] ?? ""),
          type: String(obj["type"] ?? ""),
          recon_date: String(obj["recon_date"] ?? ""),
          claimable_amt: typeof obj["claimable_amt"] === "boolean" ? null : (obj["claimable_amt"] as string | number | null),
        };
      });
      setRows(mapped);
      if (data.net_payable_claim !== undefined) {
        setKpi({ net_payable_claim: data.net_payable_claim, shipment_count: data.shipment_count ?? 0 });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRows(null);
    } finally {
      setLoading(false);
      setKpiLoading(false);
    }
  }, []);

  // ── Fetch Bags (preview + KPI) ──
  const fetchBags = useCallback(async (cid: string, fd: string, td: string) => {
    setBagsLoading(true);
    setBagsKpiLoading(true);
    setBagsError(null);
    setBagsHasQueried(true);
    setBagsCurrentPage(1);
    try {
      const data = await pollQueryJob<{ success: boolean; error?: string; columns?: string[]; rows?: (string | number | boolean | null)[][]; payable_seller_sale?: number; bag_count?: number }>(
        "/api/brand-ledger/bags/fetch",
        { company_id: cid, from_date: fd, to_date: td }
      );
      if (!data.success) throw new Error(data.error || "Bags query failed");
      const cols: string[] = data.columns || [];
      const rawRows: (string | number | boolean | null)[][] = data.rows || [];
      const mapped: BagsRow[] = rawRows.map((r) => {
        const obj: Record<string, string | number | boolean | null> = {};
        cols.forEach((c, i) => { obj[c] = r[i]; });
        return {
          bag_id: String(obj["bag_id"] ?? ""),
          fynd_order_id: String(obj["fynd_order_id"] ?? ""),
          settlement_type: String(obj["settlement_type"] ?? ""),
          recon_date: String(obj["recon_date"] ?? ""),
          seller_net_collection: typeof obj["seller_net_collection"] === "boolean" ? null : (obj["seller_net_collection"] as string | number | null),
        };
      });
      setBagsRows(mapped);
      if (data.payable_seller_sale !== undefined) {
        setBagsKpi({ payable_seller_sale: data.payable_seller_sale, bag_count: data.bag_count ?? 0 });
      }
    } catch (e) {
      setBagsError(e instanceof Error ? e.message : String(e));
      setBagsRows(null);
    } finally {
      setBagsLoading(false);
      setBagsKpiLoading(false);
    }
  }, []);

  // ── Fetch Receivable (preview + KPI) ──
  const fetchReceivable = useCallback(async (cid: string, fd: string, td: string) => {
    setArLoading(true);
    setArKpiLoading(true);
    setArError(null);
    setArHasQueried(true);
    setArCurrentPage(1);
    try {
      const data = await pollQueryJob<{ success: boolean; error?: string; columns?: string[]; rows?: (string | number | boolean | null)[][]; net_receivable?: number; record_count?: number }>(
        "/api/brand-ledger/receivable/fetch",
        { company_id: cid, from_date: fd, to_date: td }
      );
      if (!data.success) throw new Error(data.error || "AR query failed");
      const previewData = data;
      const kpiData = data;
      const cols: string[] = previewData.columns || [];
      const rawRows: (string | number | boolean | null)[][] = previewData.rows || [];
      const mapped: ArRow[] = rawRows.map((r) => {
        const obj: Record<string, string | number | boolean | null> = {};
        cols.forEach((c, i) => { obj[c] = r[i]; });
        const toNum = (v: string | number | boolean | null) =>
          typeof v === "boolean" ? null : (v as string | number | null);
        return {
          company_id: String(obj["company_id"] ?? ""),
          seller_name: String(obj["seller_name"] ?? ""),
          business: obj["business"] != null ? String(obj["business"]) : null,
          channel: obj["channel"] != null ? String(obj["channel"]) : null,
          transaction_type: obj["transaction_type"] != null ? String(obj["transaction_type"]) : null,
          invoice_no: String(obj["invoice_no"] ?? ""),
          invoice_type: obj["invoice_type"] != null ? String(obj["invoice_type"]) : null,
          invoice_date: String(obj["invoice_date"] ?? ""),
          due_date: String(obj["due_date"] ?? ""),
          invoice_amount: toNum(obj["invoice_amount"]),
          outstanding_amount: toNum(obj["outstanding_amount"]),
          company_level_due: toNum(obj["company_level_due"]),
          days: toNum(obj["days"]),
          aging_bucket: obj["aging_bucket"] != null ? String(obj["aging_bucket"]) : null,
          status: obj["status"] != null ? String(obj["status"]) : null,
          total_collections: toNum(obj["total_collections"]),
        };
      });
      setArRows(mapped);
      if (kpiData.net_receivable !== undefined) {
        setArKpi({ net_receivable: kpiData.net_receivable ?? 0, record_count: kpiData.record_count ?? 0 });
      }
    } catch (e) {
      setArError(e instanceof Error ? e.message : String(e));
      setArRows(null);
    } finally {
      setArLoading(false);
      setArKpiLoading(false);
    }
  }, []);

  // ── Fetch Manual Dispute ──
  const fetchManualDispute = useCallback(async (cid: string, fd: string, td: string) => {
    setMdLoading(true);
    setMdError(null);
    try {
      const data = await pollQueryJob<{ success: boolean; error?: string; columns?: string[]; rows?: (string | number | boolean | null)[][] }>(
        "/api/brand-ledger/manual-dispute/fetch",
        { company_id: cid, from_date: fd, to_date: td }
      );
      if (!data.success) throw new Error(data.error || "Failed to load Adjustments data");
      setMdColumns(data.columns ?? []);
      setMdRows(data.rows ?? []);
      setMdCurrentPage(1);
    } catch (e: unknown) {
      setMdError(e instanceof Error ? e.message : String(e));
      setMdRows(null);
      setMdColumns([]);
    } finally {
      setMdLoading(false);
    }
  }, []);

  // ── Fetch Receipts (company_id only, no date range) ──
  const fetchReceipts = useCallback(async (cid: string) => {
    if (!cid.trim()) return;
    setReceiptsLoading(true);
    setReceiptsError(null);
    setReceiptsHasQueried(true);
    setReceiptsCurrentPage(1);
    try {
      const data = await pollQueryJob<{ success: boolean; error?: string; columns?: string[]; rows?: (string | number | boolean | null)[][] }>(
        "/api/brand-ledger/receipts/fetch",
        { company_id: cid }
      );
      if (!data.success) throw new Error(data.error || "Failed to load Receipts data");
      setReceiptsColumns(data.columns ?? []);
      setReceiptsRows(data.rows ?? []);
    } catch (e: unknown) {
      setReceiptsError(e instanceof Error ? e.message : String(e));
      setReceiptsRows(null);
      setReceiptsColumns([]);
    } finally {
      setReceiptsLoading(false);
    }
  }, []);

  // ── Fetch Payout (preview + KPI) ──
  const fetchPayout = useCallback(async (cid: string, fd: string, td: string) => {
    setPayoutLoading(true);
    setPayoutKpiLoading(true);
    setPayoutError(null);
    setPayoutHasQueried(true);
    setPayoutCurrentPage(1);
    try {
      const data = await pollQueryJob<{ success: boolean; error?: string; columns?: string[]; rows?: (string | number | boolean | null)[][]; seller_net_payout?: number; bag_count?: number }>(
        "/api/brand-ledger/payout/fetch",
        { company_id: cid, from_date: fd, to_date: td }
      );
      if (!data.success) throw new Error(data.error || "Payout query failed");
      const previewData = data;
      const kpiData = data;
      const cols: string[] = previewData.columns || [];
      const rawRows: (string | number | boolean | null)[][] = previewData.rows || [];
      const mapped: PayoutRow[] = rawRows.map((r) => {
        const obj: Record<string, string | number | boolean | null> = {};
        cols.forEach((c, i) => { obj[c] = r[i]; });
        const toNum = (v: string | number | boolean | null) =>
          typeof v === "boolean" ? null : (v as string | number | null);
        return {
          bag_id: obj["bag_id"] != null ? String(obj["bag_id"]) : null,
          company_id: obj["company_id"] != null ? String(obj["company_id"]) : null,
          company_name: obj["company_name"] != null ? String(obj["company_name"]) : null,
          brand_name: obj["brand_name"] != null ? String(obj["brand_name"]) : null,
          fynd_order_id: obj["fynd_order_id"] != null ? String(obj["fynd_order_id"]) : null,
          transaction_type: obj["transaction_type"] != null ? String(obj["transaction_type"]) : null,
          sales_channel: obj["sales_channel"] != null ? String(obj["sales_channel"]) : null,
          recon_status: obj["recon_status"] != null ? String(obj["recon_status"]) : null,
          store_state: obj["store_state"] != null ? String(obj["store_state"]) : null,
          recon_date: obj["recon_date"] != null ? String(obj["recon_date"]) : null,
          order_date: obj["order_date"] != null ? String(obj["order_date"]) : null,
          seller_net_collection: toNum(obj["seller_net_collection"]),
          net_payout: toNum(obj["Net_Payout"] ?? obj["net_payout"]),
        };
      });
      setPayoutRows(mapped);
      if (kpiData.seller_net_payout !== undefined) {
        setPayoutKpi({ seller_net_payout: kpiData.seller_net_payout ?? 0, bag_count: kpiData.bag_count ?? 0 });
      }
    } catch (e) {
      setPayoutError(e instanceof Error ? e.message : String(e));
      setPayoutRows(null);
    } finally {
      setPayoutLoading(false);
      setPayoutKpiLoading(false);
    }
  }, []);
  // ── Fetch Claim Payout (preview + KPI) ──
  const fetchClaimPayout = useCallback(async (cid: string, fd: string, td: string) => {
    setClaimPayoutLoading(true);
    setClaimPayoutKpiLoading(true);
    setClaimPayoutError(null);
    setClaimPayoutHasQueried(true);
    setClaimPayoutCurrentPage(1);
    try {
      const data = await pollQueryJob<{ success: boolean; error?: string; columns?: string[]; rows?: (string | number | boolean | null)[][]; net_claim_payout?: number; row_count?: number }>(
        "/api/brand-ledger/claim-payout/fetch",
        { company_id: cid, from_date: fd, to_date: td }
      );
      if (!data.success) throw new Error(data.error || "Claim payout query failed");
      const previewData = data;
      const kpiData = data;
      const cols: string[] = previewData.columns || [];
      const rawRows: (string | number | boolean | null)[][] = previewData.rows || [];
      const mapped: ClaimPayoutRow[] = rawRows.map((r) => {
        const obj: Record<string, string | number | boolean | null> = {};
        cols.forEach((c, i) => { obj[c] = r[i]; });
        const toStr = (v: string | number | boolean | null) => v != null ? String(v) : null;
        const toNum = (v: string | number | boolean | null) =>
          typeof v === "boolean" ? null : (v as string | number | null);
        return {
          company_id: toStr(obj["company_id"]),
          company_name: toStr(obj["company_name"]),
          fynd_order_id: toStr(obj["fynd_order_id"]),
          current_shipment_id: toStr(obj["current_shipment_id"]),
          transaction_type: toStr(obj["transaction_type"]),
          recon_status: toStr(obj["recon_status"]),
          sales_channel: toStr(obj["sales_channel"]),
          recon_date: toStr(obj["recon_date"]),
          claim_settle_date: toStr(obj["claim_settle_date"]),
          Payment_Date: toStr(obj["Payment_Date"]),
          SF_UTR: toStr(obj["SF_UTR"]),
          payout_id: toStr(obj["payout_id"]),
          claimable_amt: toNum(obj["claimable_amt"]),
          non_claimable_amt: toNum(obj["non_claimable_amt"]),
          total_utr_paid: toNum(obj["total_utr_paid"]),
        };
      });
      setClaimPayoutRows(mapped);
      if (kpiData.net_claim_payout !== undefined) {
        setClaimPayoutKpi({ net_claim_payout: kpiData.net_claim_payout ?? 0, row_count: kpiData.row_count ?? 0 });
      }
    } catch (e) {
      setClaimPayoutError(e instanceof Error ? e.message : String(e));
      setClaimPayoutRows(null);
    } finally {
      setClaimPayoutLoading(false);
      setClaimPayoutKpiLoading(false);
    }
  }, []);
  // ── Fetch Summary preview ──
  const fetchSummary = useCallback(async (cid: string, fd: string, td: string) => {
    if (!cid.trim()) return;
    setSummaryLoading(true);
    setSummaryPreviewError(null);
    try {
      const data = await pollQueryJob<{ success: boolean; error?: string; companyName?: string; dateLabel?: string; kpis?: SummaryKpis; receivablePreview?: { columns: string[]; rows: (string | number | boolean | null)[][] } }>(
        "/api/brand-ledger/summary/preview",
        { company_id: cid, from_date: fd, to_date: td }
      );
      if (!data.success) throw new Error(data.error || "Failed to load summary");
      setSummaryData({
        companyName: data.companyName ?? cid,
        dateLabel: data.dateLabel ?? "",
        kpis: data.kpis!,
        receivablePreview: data.receivablePreview ?? { columns: [], rows: [] },
      });
    } catch (err: unknown) {
      setSummaryPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  // ── Master fetch: fires tabs in staggered batches to avoid overwhelming the server ──
  // Batch 1 (0ms): Receivable + Claims
  // Batch 2 (2s): Bags + Payout
  // Batch 3 (4s): ClaimPayout + ManualDispute
  // Batch 4 (6s): Receipts + Summary
  const fetchAll = useCallback((cid: string, fd: string, td: string) => {
    // Batch 1 — immediate
    fetchReceivable(cid, fd, td);
    fetchClaims(cid, fd, td);
    // Batch 2 — after 2s
    setTimeout(() => { fetchBags(cid, fd, td); fetchPayout(cid, fd, td); }, 2000);
    // Batch 3 — after 4s
    setTimeout(() => { fetchClaimPayout(cid, fd, td); fetchManualDispute(cid, fd, td); }, 4000);
    // Batch 4 — after 6s
    setTimeout(() => { fetchReceipts(cid); fetchSummary(cid, fd, td); }, 6000);
  }, [fetchReceivable, fetchClaims, fetchBags, fetchPayout, fetchClaimPayout, fetchManualDispute, fetchReceipts, fetchSummary]);

  // Keep latestFilters ref in sync so debounced callbacks always read fresh values
  useEffect(() => {
    latestFilters.current = { companyId, fromDate, toDate };
  });

  // Single unified auto-fetch: fires whenever any filter changes
  // Uses a short debounce (300ms) so rapid typing doesn't spam BQ
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const hasFilter = companyId.trim() || fromDate || toDate;
    if (!hasFilter) return;
    debounceRef.current = setTimeout(() => {
      const { companyId: cid, fromDate: fd, toDate: td } = latestFilters.current;
      fetchAll(cid, fd, td);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [companyId, fromDate, toDate, fetchAll]);

  // Download full report — Claims
  const downloadReport = async () => {
    setDownloading(true);
    try {
      await downloadWithJob(
        "/api/brand-ledger/payable/download",
        { company_id: companyId, from_date: fromDate, to_date: toDate },
        `payable_claims_${companyId || "all"}_${fromDate || "start"}_to_${toDate || "end"}.xlsx`,
        () => {}
      );
      logActivity("Downloaded Payable Claims", companyId);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  };

  const PRESETS: { key: PresetKey; label: string }[] = [
    { key: "this-month", label: "This Month" },
    { key: "last-month", label: "Last Month" },
    { key: "last-3m", label: "Last 3M" },
    { key: "fy26", label: "FY26" },
  ];

  // Pagination helpers
  const totalPages = rows ? Math.ceil(rows.length / PAGE_SIZE) : 0;
  const pagedRows = rows ? rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) : [];

  return (
    <div className="bl-page">
      {/* Page header */}
      <div className="bl-page-header">
        <div>
          <div className="bl-page-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            Brand Ledger
          </div>
        </div>
      </div>

      {/* Always-visible KPI row — order: Net Receivable → Payable Seller Sale → Net Payable Claim */}
      <div className="bl-kpi-row">
        {/* Net Receivable — FIRST */}
        <div className="bl-kpi-card">
          <div className="bl-kpi-label">
            Net Receivable
            {arKpi && (
              <span className="bl-kpi-tooltip-icon" title={`Record Count: ${arKpi.record_count.toLocaleString("en-IN")} records`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </span>
            )}
          </div>
          {arKpiLoading ? (
            <div className="bl-kpi-loading">Loading…</div>
          ) : arKpi ? (
            <>
              <div className="bl-kpi-value">
                {arKpi.net_receivable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="bl-kpi-sub">{arKpi.record_count.toLocaleString("en-IN")} records</div>
            </>
          ) : (
            <div className="bl-kpi-empty">Apply filters to calculate</div>
          )}
        </div>

        {/* Payable Seller Sale — SECOND */}
        <div className="bl-kpi-card">
          <div className="bl-kpi-label">
            Payable Seller Sale
            {bagsKpi && (
              <span className="bl-kpi-tooltip-icon" title={`Bag Count: ${bagsKpi.bag_count.toLocaleString("en-IN")} bags`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </span>
            )}
          </div>
          {bagsKpiLoading ? (
            <div className="bl-kpi-loading">Loading…</div>
          ) : bagsKpi ? (
            <>
              <div className="bl-kpi-value">
                {bagsKpi.payable_seller_sale.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="bl-kpi-sub">{bagsKpi.bag_count.toLocaleString("en-IN")} bags</div>
            </>
          ) : (
            <div className="bl-kpi-empty">Apply filters to calculate</div>
          )}
        </div>
        {/* Net Payable Claim — THIRD */}
        <div className="bl-kpi-card">
          <div className="bl-kpi-label">
            Net Payable Claim
            {kpi && (
              <span className="bl-kpi-tooltip-icon" title={`Shipment Count: ${kpi.shipment_count.toLocaleString("en-IN")} unique shipments`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </span>
            )}
          </div>
          {kpiLoading ? (
            <div className="bl-kpi-loading">Loading…</div>
          ) : kpi ? (
            <>
              <div className="bl-kpi-value">
                {kpi.net_payable_claim.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="bl-kpi-sub">{kpi.shipment_count.toLocaleString("en-IN")} unique shipments</div>
            </>
          ) : (
            <div className="bl-kpi-empty">Apply filters to calculate</div>
          )}
        </div>
        {/* Seller Net Payout — FOURTH */}
        <div className="bl-kpi-card">
          <div className="bl-kpi-label">
            Seller Net Payout
            {payoutKpi && (
              <span className="bl-kpi-tooltip-icon" title={`Bag Count: ${payoutKpi.bag_count.toLocaleString("en-IN")} bags`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </span>
            )}
          </div>
          {payoutKpiLoading ? (
            <div className="bl-kpi-loading">Loading…</div>
          ) : payoutKpi ? (
            <>
              <div className="bl-kpi-value">
                {payoutKpi.seller_net_payout.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="bl-kpi-sub">{payoutKpi.bag_count.toLocaleString("en-IN")} bags</div>
            </>
          ) : (
            <div className="bl-kpi-empty">Apply filters to calculate</div>
          )}
        </div>
        {/* Net Claim Payout — FIFTH */}
        <div className="bl-kpi-card">
          <div className="bl-kpi-label">
            Net Claim Payout
            {claimPayoutKpi && (
              <span className="bl-kpi-tooltip-icon" title={`Records: ${claimPayoutKpi.row_count.toLocaleString("en-IN")}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="16" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </span>
            )}
          </div>
          {claimPayoutKpiLoading ? (
            <div className="bl-kpi-loading">Loading…</div>
          ) : claimPayoutKpi ? (
            <>
              <div className="bl-kpi-value">
                {claimPayoutKpi.net_claim_payout.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="bl-kpi-sub">{claimPayoutKpi.row_count.toLocaleString("en-IN")} records</div>
            </>
          ) : (
            <div className="bl-kpi-empty">Apply filters to calculate</div>
          )}
        </div>

      </div>

      {/* ── SHARED FILTER CARD — above tabs, drives both Claims and Bags ── */}
      <div className="bl-filter-card">
        <div className="bl-filter-row">
          {/* Company ID */}
          <div className="bl-filter-group">
            <label className="bl-filter-label">Company ID</label>
            <input
              type="text"
              className="bl-filter-input company-id"
              placeholder="e.g. 1234"
              value={companyId}
              onChange={e => setCompanyId(e.target.value)}
            />
          </div>

          {/* From date */}
          <div className="bl-filter-group">
            <label className="bl-filter-label">Recon Date From</label>
            <input
              type="date"
              className="bl-filter-input"
              value={fromDate}
              onChange={e => { setFromDate(e.target.value); setActivePreset("custom"); }}
            />
          </div>

          {/* To date */}
          <div className="bl-filter-group">
            <label className="bl-filter-label">Recon Date To</label>
            <input
              type="date"
              className="bl-filter-input"
              value={toDate}
              onChange={e => { setToDate(e.target.value); setActivePreset("custom"); }}
            />
          </div>

          {/* Quick presets */}
          <div className="bl-presets">
            {PRESETS.map(p => (
              <button
                key={p.key}
                className={`bl-preset-btn${activePreset === p.key ? " active" : ""}`}
                onClick={() => applyPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Apply */}
          <button
            className="bl-apply-btn"
            onClick={() => { fetchAll(companyId, fromDate, toDate); logActivity(`Searched for Company ID ${companyId || "(all)"}`, companyId); }}
            disabled={loading || bagsLoading}
          >
            {(loading || bagsLoading) ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "qbd-spin .7s linear infinite" }}>
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Querying…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                Apply Filters
              </>
            )}
          </button>
          {/* Reset */}
          <button
            className="bl-reset-btn"
            onClick={() => {
              setCompanyId("");
              setFromDate("");
              setToDate("");
              setActivePreset(null);
              setKpi(null);
              setBagsKpi(null);
              setArKpi(null);
              setRows(null);
              setBagsRows(null);
              setArRows(null);
              setError(null);
              setBagsError(null);
              setArError(null);
              setCurrentPage(1);
              setBagsCurrentPage(1);
              setArCurrentPage(1);
              setHasQueried(false);
              setBagsHasQueried(false);
              setArHasQueried(false);
              setPayoutKpi(null);
              setPayoutRows(null);
              setPayoutError(null);
              setPayoutCurrentPage(1);
              setPayoutHasQueried(false);
              setClaimPayoutKpi(null);
              setClaimPayoutRows(null);
              setClaimPayoutError(null);
              setClaimPayoutCurrentPage(1);
              setClaimPayoutHasQueried(false);
              setMdRows(null);
              setMdColumns([]);
              setMdError(null);
              setMdCurrentPage(1);
            }}
            disabled={loading || bagsLoading || arLoading || payoutLoading || claimPayoutLoading}
            title="Clear all filters and reset results"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/>
              <path d="M3.51 15a9 9 0 1 0 .49-3.51"/>
            </svg>
            Reset
          </button>
        </div>
      </div>

      {/* Data-range note */}
      <div style={{ margin: "0.6rem 0 0.25rem", padding: "0.45rem 0.85rem", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "0.72rem", color: "#64748b", lineHeight: 1.5 }}>
        <strong style={{ color: "#475569" }}>Note:</strong> Receivable data covers invoices from <strong>1 Apr 2025</strong> onwards. Payable Bags, Payable Claims, Adjustments, Settled Bags, and Settled Claims data covers transactions from <strong>1 Apr 2023</strong> onwards.
      </div>

      {/* Sub-navbar — order: Receivable → Receipts → Payable Bags → Payable Claims → Adjustments → Settled Bags → Settled Claims → Summary */}
      <div className="bl-subnav">
        <button
          className={`bl-subnav-item${activeTab === "receivable" ? " bl-subnav-active" : ""}`}
          onClick={() => setActiveTab("receivable")}
        >
          Receivable
        </button>
        <button
          className={`bl-subnav-item${activeTab === "receipts" ? " bl-subnav-active" : ""}`}
          onClick={() => setActiveTab("receipts")}
        >
          Receipts
        </button>
        <button
          className={`bl-subnav-item${activeTab === "bags" ? " bl-subnav-active" : ""}`}
          onClick={() => setActiveTab("bags")}
        >
          Payable Bags
        </button>
        <button
          className={`bl-subnav-item${activeTab === "claims" ? " bl-subnav-active" : ""}`}
          onClick={() => setActiveTab("claims")}
        >
          Payable Claims
        </button>
        <button
          className={`bl-subnav-item${activeTab === "adjustments" ? " bl-subnav-active" : ""}`}
          onClick={() => setActiveTab("adjustments")}
        >
          Adjustments
        </button>
        <button
          className={`bl-subnav-item${activeTab === "payout" ? " bl-subnav-active" : ""}`}
          onClick={() => setActiveTab("payout")}
        >
          Settled Bags
        </button>
        <button
          className={`bl-subnav-item${activeTab === "settled-claims" ? " bl-subnav-active" : ""}`}
          onClick={() => setActiveTab("settled-claims")}
        >
          Settled Claims
        </button>
        <button
          className={`bl-subnav-item${activeTab === "summary" ? " bl-subnav-active" : ""}`}
          onClick={() => setActiveTab("summary")}
        >
          Summary
        </button>
      </div>
      {/* ── CLAIMS TAB ── */}
      {activeTab === "claims" && (
        <>

      {/* Results card */}
      <div className="bl-results-card">
        <div className="bl-results-head">
          <div>
            <div className="bl-results-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="3" x2="9" y2="21"/>
              </svg>
              Payable Claims
              {rows !== null && (
                <span style={{ fontWeight: 400, fontSize: 12, color: "var(--qbd-gray-500)" }}>
                  &nbsp;({rows.length} rows shown)
                </span>
              )}
            </div>
            {hasQueried && rows !== null && (
              <div className="bl-preview-note">Showing first 20 rows — use Download Report for full data</div>
            )}
          </div>
          <button
            className="bl-download-btn"
            onClick={downloadReport}
            disabled={downloading}
            title="Download full report as Excel"
          >
            {downloading ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "qbd-spin .7s linear infinite" }}>
                  <polyline points="23 4 23 10 17 10"/>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Preparing…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download Report
              </>
            )}
          </button>
        </div>

         {/* Loading */}
        {loading && (
          <div className="bl-skeleton-loader">
            <div className="bl-skeleton-row" style={{ width: '100%' }} />
            <div className="bl-skeleton-row" style={{ width: '88%' }} />
            <div className="bl-skeleton-row" style={{ width: '75%' }} />
            <div className="bl-skeleton-row" style={{ width: '92%' }} />
            <div className="bl-skeleton-row" style={{ width: '80%' }} />
          </div>
        )}
        {/* Error */}
        {!loading && error && (
          <div className="bl-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span><strong>Query error:</strong> {error}</span>
          </div>
        )}

        {/* Empty — not yet queried */}
        {!loading && !error && !hasQueried && (
          <div className="bl-table-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2"/>
              <line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            <strong>No data loaded yet</strong>
            Enter a Company ID or select a date slicer above — data loads automatically.
          </div>
        )}

        {/* Empty — queried but no results */}
        {!loading && !error && hasQueried && rows !== null && rows.length === 0 && (
          <div className="bl-table-empty">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <strong>No records found</strong>
            Try adjusting your filters.
          </div>
        )}

        {/* Table */}
        {!loading && !error && rows !== null && rows.length > 0 && (
          <>
            <div className="bl-table-wrap">
              <table className="bl-table">
                <thead>
                  <tr>
                    <th>Company ID</th>
                    <th>Order ID</th>
                    <th>Shipment ID</th>
                    <th>Type</th>
                    <th>Recon Date</th>
                    <th>Claimable Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="mono">{row.company_id ?? "—"}</td>
                      <td className="mono">{row.order_id ?? "—"}</td>
                      <td className="mono">{row.shipment_id ?? "—"}</td>
                      <td>{row.type ?? "—"}</td>
                      <td>{row.recon_date ?? "—"}</td>
                      <td>
                        <span className="bl-amount">
                          {row.claimable_amt !== null && row.claimable_amt !== undefined && row.claimable_amt !== ""
                            ? Number(row.claimable_amt).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bl-pagination">
                <button
                  className="bl-page-btn"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  Prev
                </button>
                <span className="bl-page-info">
                  Page {currentPage} of {totalPages}
                  <span style={{ color: "var(--qbd-gray-500)", marginLeft: 6 }}>({rows.length} rows)</span>
                </span>
                <button
                  className="bl-page-btn"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </div>
        </>
      )}

      {/* ── MANUAL DISPUTE TAB ── */}
      {activeTab === "adjustments" && (
        <>
          <div className="bl-results-card">
            <div className="bl-results-head">
              <div>
                <div className="bl-results-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                  Manual Dispute
                  {mdRows !== null && (
                    <span style={{ fontWeight: 400, fontSize: 12, color: "var(--qbd-gray-500)" }}>
                      &nbsp;({mdRows.length} rows shown)
                    </span>
                  )}
                </div>
                {mdRows !== null && mdRows.length > 0 && (
                  <div style={{ fontSize: 12, color: "var(--qbd-gray-500)", marginTop: 2 }}>
                    Showing first 20 rows — use Download Report for full data
                  </div>
                )}
              </div>
              <button
                className="bl-download-btn"
                onClick={async () => {
                  try {
                    await downloadWithJob(
                      "/api/brand-ledger/manual-dispute/download",
                      { company_id: companyId, from_date: fromDate, to_date: toDate },
                      `manual_dispute_${companyId || "all"}.xlsx`,
                      () => {}
                    );
                    logActivity("Downloaded Adjustments", companyId);
                  } catch (e) {
                    alert("Download failed: " + (e instanceof Error ? e.message : String(e)));
                  }
                }}
              >
                Download Report
              </button>
            </div>
            {/* Table */}
            {mdLoading ? (
              <div className="bl-skeleton-wrap">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="bl-skeleton-row">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <div key={j} className="bl-skeleton-cell" style={{ width: j === 0 ? 60 : j === 1 ? 140 : j === 2 ? 100 : j === 3 ? 120 : j === 4 ? 80 : 100 }} />
                    ))}
                  </div>
                ))}
              </div>
            ) : mdError ? (
              <div className="bl-error-row">
                <span style={{ marginRight: 6 }}>⚠</span>
                <strong>Query error:</strong>&nbsp;{mdError}
              </div>
            ) : mdRows === null ? (
              <div className="bl-empty-state">Enter a Company ID above and click Apply Filters to load Adjustments data.</div>
            ) : mdRows.length === 0 ? (
              <div className="bl-empty-state">No records found for the selected filters.</div>
            ) : (
              <>
                <div className="bl-table-wrap">
                  <table className="bl-table">
                    <thead>
                      <tr>
                        {mdColumns.map(col => (
                          <th key={col}>{col.replace(/_/g, " ").toUpperCase()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mdRows
                        .slice((mdCurrentPage - 1) * MD_PAGE_SIZE, mdCurrentPage * MD_PAGE_SIZE)
                        .map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => (
                              <td key={ci}>{cell === null || cell === undefined ? "—" : String(cell)}</td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {mdRows.length > MD_PAGE_SIZE && (
                  <div className="bl-pagination">
                    <button
                      className="bl-page-btn"
                      disabled={mdCurrentPage === 1}
                      onClick={() => setMdCurrentPage(p => Math.max(1, p - 1))}
                    >
                      ‹ Prev
                    </button>
                    <span className="bl-page-info">
                      Page {mdCurrentPage} of {Math.ceil(mdRows.length / MD_PAGE_SIZE)}
                    </span>
                    <button
                      className="bl-page-btn"
                      disabled={mdCurrentPage >= Math.ceil(mdRows.length / MD_PAGE_SIZE)}
                      onClick={() => setMdCurrentPage(p => p + 1)}
                    >
                      Next ›
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── BAGS TAB ── */}
      {activeTab === "bags" && (
        <>


          {/* Results card */}
          <div className="bl-results-card">
            <div className="bl-results-head">
              <div>
                <div className="bl-results-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                  Payable Bags
                  {bagsRows !== null && (
                    <span style={{ fontWeight: 400, fontSize: 12, color: "var(--qbd-gray-500)" }}>
                      &nbsp;({bagsRows.length} rows shown)
                    </span>
                  )}
                </div>
                {bagsHasQueried && bagsRows !== null && (
                  <div className="bl-preview-note">Showing first 20 rows — use Download Report for full data</div>
                )}
              </div>
              <button
                className="bl-download-btn"
                onClick={async () => {
                  setBagsDownloading(true);
                  try {
                    await downloadWithJob(
                      "/api/brand-ledger/bags/download",
                      { company_id: companyId, from_date: fromDate, to_date: toDate },
                      `payable_bags_${companyId || "all"}_${fromDate || "start"}_to_${toDate || "end"}.xlsx`,
                      () => {}
                    );
                    logActivity("Downloaded Payable Bags", companyId);
                  } catch (e) {
                    alert("Download failed: " + (e instanceof Error ? e.message : String(e)));
                  } finally {
                    setBagsDownloading(false);
                  }
                }}
                disabled={bagsDownloading}
                title="Download full report as Excel"
              >
                {bagsDownloading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "qbd-spin .7s linear infinite" }}>
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Preparing…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download Report
                  </>
                )}
              </button>
            </div>

            {/* Loading */}
            {bagsLoading && (
              <div className="bl-skeleton-loader">
                <div className="bl-skeleton-row" style={{ width: '100%' }} />
                <div className="bl-skeleton-row" style={{ width: '88%' }} />
                <div className="bl-skeleton-row" style={{ width: '75%' }} />
                <div className="bl-skeleton-row" style={{ width: '92%' }} />
                <div className="bl-skeleton-row" style={{ width: '80%' }} />
              </div>
            )}

            {/* Error */}
            {!bagsLoading && bagsError && (
              <div className="bl-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span><strong>Query error:</strong> {bagsError}</span>
              </div>
            )}

            {/* Empty — not yet queried */}
            {!bagsLoading && !bagsError && !bagsHasQueried && (
              <div className="bl-table-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <strong>No data loaded yet</strong>
                Enter a Company ID or select a date slicer above — data loads automatically.
              </div>
            )}

            {/* Empty — queried but no results */}
            {!bagsLoading && !bagsError && bagsHasQueried && bagsRows !== null && bagsRows.length === 0 && (
              <div className="bl-table-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <strong>No records found</strong>
                Try adjusting your filters.
              </div>
            )}

            {/* Table */}
            {!bagsLoading && !bagsError && bagsRows !== null && bagsRows.length > 0 && (
              <>
                <div className="bl-table-wrap">
                  <table className="bl-table">
                    <thead>
                      <tr>
                        <th>Bag ID</th>
                        <th>Order ID</th>
                        <th>Settlement Type</th>
                        <th>Recon Date</th>
                        <th>Seller Net Collection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bagsRows.slice((bagsCurrentPage - 1) * PAGE_SIZE, bagsCurrentPage * PAGE_SIZE).map((row, idx) => (
                        <tr key={idx}>
                          <td className="mono">{row.bag_id ?? "—"}</td>
                          <td className="mono">{row.fynd_order_id ?? "—"}</td>
                          <td>{row.settlement_type ?? "—"}</td>
                          <td>{row.recon_date ?? "—"}</td>
                          <td>
                            <span className="bl-amount">
                              {row.seller_net_collection !== null && row.seller_net_collection !== undefined && row.seller_net_collection !== ""
                                ? Number(row.seller_net_collection).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Math.ceil(bagsRows.length / PAGE_SIZE) > 1 && (
                  <div className="bl-pagination">
                    <button
                      className="bl-page-btn"
                      onClick={() => setBagsCurrentPage(p => Math.max(1, p - 1))}
                      disabled={bagsCurrentPage === 1}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      Prev
                    </button>
                    <span className="bl-page-info">
                      Page {bagsCurrentPage} of {Math.ceil(bagsRows.length / PAGE_SIZE)}
                      <span style={{ color: "var(--qbd-gray-500)", marginLeft: 6 }}>({bagsRows.length} rows)</span>
                    </span>
                    <button
                      className="bl-page-btn"
                      onClick={() => setBagsCurrentPage(p => Math.min(Math.ceil(bagsRows.length / PAGE_SIZE), p + 1))}
                      disabled={bagsCurrentPage === Math.ceil(bagsRows.length / PAGE_SIZE)}
                    >
                      Next
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── RECEIVABLE TAB ── */}
      {activeTab === "receivable" && (
        <>

          <div className="bl-results-card">
            <div className="bl-results-head">
              <div>
                <div className="bl-results-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                  Receivable
                  {arRows !== null && (
                    <span style={{ fontWeight: 400, fontSize: 12, color: "var(--qbd-gray-500)" }}>
                      &nbsp;({arRows.length} rows shown)
                    </span>
                  )}
                </div>
                {arHasQueried && arRows !== null && (
                  <div className="bl-preview-note">Showing first 20 rows — use Download Report for full data</div>
                )}
              </div>
              <button
                className="bl-download-btn"
                onClick={async () => {
                  setArDownloading(true);
                  try {
                    await downloadWithJob(
                      "/api/brand-ledger/receivable/download",
                      { company_id: companyId, from_date: fromDate, to_date: toDate },
                      `receivable_${companyId || "all"}_${fromDate || "start"}_to_${toDate || "end"}.xlsx`,
                      () => {}
                    );
                    logActivity("Downloaded Receivable", companyId);
                  } catch (e) {
                    alert("Download failed: " + (e instanceof Error ? e.message : String(e)));
                  } finally {
                    setArDownloading(false);
                  }
                }}
                disabled={arDownloading}
                title="Download full report as Excel"
              >
                {arDownloading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "qbd-spin .7s linear infinite" }}>
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Preparing…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download Report
                  </>
                )}
              </button>
            </div>

            {/* Loading */}
            {arLoading && (
              <div className="bl-skeleton-loader">
                <div className="bl-skeleton-row" style={{ width: '100%' }} />
                <div className="bl-skeleton-row" style={{ width: '88%' }} />
                <div className="bl-skeleton-row" style={{ width: '75%' }} />
                <div className="bl-skeleton-row" style={{ width: '92%' }} />
                <div className="bl-skeleton-row" style={{ width: '80%' }} />
              </div>
            )}
            {/* Error */}
            {!arLoading && arError && (
              <div className="bl-table-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span><strong>Query error:</strong> {arError}</span>
              </div>
            )}
            {/* Empty — not yet queried */}
            {!arLoading && !arError && !arHasQueried && (
              <div className="bl-table-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <strong>No data loaded yet</strong>
                Enter a Company ID or select a date slicer above — data loads automatically.
              </div>
            )}
            {/* Empty — queried but no results */}
            {!arLoading && !arError && arHasQueried && arRows !== null && arRows.length === 0 && (
              <div className="bl-table-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <strong>No records found</strong>
                Try adjusting your filters.
              </div>
            )}
            {/* Table */}
            {!arLoading && !arError && arRows !== null && arRows.length > 0 && (
              <>
                <div className="bl-table-wrap">
                  <table className="bl-table">
                    <thead>
                      <tr>
                        <th>Company ID</th>
                        <th>Seller Name</th>
                        <th>Business</th>
                        <th>Channel</th>
                        <th>Invoice No</th>
                        <th>Invoice Date</th>
                        <th>Due Date</th>
                        <th>Invoice Amount</th>
                        <th>Outstanding Amount</th>
                        <th>Aging Bucket</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arRows.slice((arCurrentPage - 1) * PAGE_SIZE, arCurrentPage * PAGE_SIZE).map((row, idx) => (
                        <tr key={idx}>
                          <td className="mono">{row.company_id ?? "—"}</td>
                          <td>{row.seller_name ?? "—"}</td>
                          <td>{row.business ?? "—"}</td>
                          <td>{row.channel ?? "—"}</td>
                          <td className="mono">{row.invoice_no ?? "—"}</td>
                          <td>{row.invoice_date ?? "—"}</td>
                          <td>{row.due_date ?? "—"}</td>
                          <td>
                            <span className="bl-amount">
                              {row.invoice_amount !== null && row.invoice_amount !== undefined && row.invoice_amount !== ""
                                ? Number(row.invoice_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "—"}
                            </span>
                          </td>
                          <td>
                            <span className="bl-amount">
                              {row.outstanding_amount !== null && row.outstanding_amount !== undefined && row.outstanding_amount !== ""
                                ? Number(row.outstanding_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "—"}
                            </span>
                          </td>
                          <td>{row.aging_bucket ?? "—"}</td>
                          <td>{row.status ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Math.ceil(arRows.length / PAGE_SIZE) > 1 && (
                  <div className="bl-pagination">
                    <button
                      className="bl-page-btn"
                      onClick={() => setArCurrentPage(p => Math.max(1, p - 1))}
                      disabled={arCurrentPage === 1}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      Prev
                    </button>
                    <span className="bl-page-info">
                      Page {arCurrentPage} of {Math.ceil(arRows.length / PAGE_SIZE)}
                      <span style={{ color: "var(--qbd-gray-500)", marginLeft: 6 }}>({arRows.length} rows)</span>
                    </span>
                    <button
                      className="bl-page-btn"
                      onClick={() => setArCurrentPage(p => Math.min(Math.ceil(arRows.length / PAGE_SIZE), p + 1))}
                      disabled={arCurrentPage === Math.ceil(arRows.length / PAGE_SIZE)}
                    >
                      Next
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
      {/* ── BAGWISE DATA TAB ── */}
      {activeTab === "payout" && (
        <>

          {/* Results card */}
          <div className="bl-results-card">
            <div className="bl-results-head">
              <div>
                <div className="bl-results-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                  Settled Bags
                  {payoutRows !== null && (
                    <span style={{ fontWeight: 400, fontSize: 12, color: "var(--qbd-gray-500)" }}>
                      &nbsp;({payoutRows.length} rows shown)
                    </span>
                  )}
                </div>
                {payoutHasQueried && payoutRows !== null && (
                  <div className="bl-preview-note">Showing first 20 rows — use Download Report for full data</div>
                )}
              </div>
              <button
                className="bl-download-btn"
                onClick={async () => {
                  setPayoutDownloading(true);
                  try {
                    await downloadWithJob(
                      "/api/brand-ledger/payout/download",
                      { company_id: companyId, from_date: fromDate, to_date: toDate },
                      `payout_report_${companyId || "all"}_${fromDate || "start"}_to_${toDate || "end"}.xlsx`,
                      () => {}
                    );
                    logActivity("Downloaded Settled Bags", companyId);
                  } catch (e) {
                    alert("Download failed: " + (e instanceof Error ? e.message : String(e)));
                  } finally {
                    setPayoutDownloading(false);
                  }
                }}
                disabled={payoutDownloading}
                title="Download full report as Excel"
              >
                {payoutDownloading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "qbd-spin .7s linear infinite" }}>
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Preparing…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download Report
                  </>
                )}
              </button>
            </div>
            {/* Loading */}
            {payoutLoading && (
              <div className="bl-skeleton-loader">
                <div className="bl-skeleton-row" style={{ width: '100%' }} />
                <div className="bl-skeleton-row" style={{ width: '88%' }} />
                <div className="bl-skeleton-row" style={{ width: '75%' }} />
                <div className="bl-skeleton-row" style={{ width: '92%' }} />
                <div className="bl-skeleton-row" style={{ width: '80%' }} />
              </div>
            )}
            {/* Error */}
            {!payoutLoading && payoutError && (
              <div className="bl-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span><strong>Query error:</strong> {payoutError}</span>
              </div>
            )}
            {/* Empty — not yet queried */}
            {!payoutLoading && !payoutError && !payoutHasQueried && (
              <div className="bl-table-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <strong>No data loaded yet</strong>
                Enter a Company ID or select a date slicer above — data loads automatically.
              </div>
            )}
            {/* Empty — queried but no results */}
            {!payoutLoading && !payoutError && payoutHasQueried && payoutRows !== null && payoutRows.length === 0 && (
              <div className="bl-table-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <strong>No records found</strong>
                Try adjusting your filters.
              </div>
            )}
            {/* Table */}
            {!payoutLoading && !payoutError && payoutRows !== null && payoutRows.length > 0 && (
              <>
                <div className="bl-table-wrap">
                  <table className="bl-table">
                    <thead>
                      <tr>
                        <th>Bag ID</th>
                        <th>Company ID</th>
                        <th>Company Name</th>
                        <th>Brand</th>
                        <th>Order ID</th>
                        <th>Txn Type</th>
                        <th>Sales Channel</th>
                        <th>Recon Status</th>
                        <th>State</th>
                        <th>Recon Date</th>
                        <th>Order Date</th>
                        <th>Seller Net Collection</th>
                        <th>Net Payout</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payoutRows.slice((payoutCurrentPage - 1) * PAGE_SIZE, payoutCurrentPage * PAGE_SIZE).map((row, idx) => (
                        <tr key={idx}>
                          <td className="mono">{row.bag_id ?? "—"}</td>
                          <td className="mono">{row.company_id ?? "—"}</td>
                          <td>{row.company_name ?? "—"}</td>
                          <td>{row.brand_name ?? "—"}</td>
                          <td className="mono">{row.fynd_order_id ?? "—"}</td>
                          <td>{row.transaction_type ?? "—"}</td>
                          <td>{row.sales_channel ?? "—"}</td>
                          <td>{row.recon_status ?? "—"}</td>
                          <td>{row.store_state ?? "—"}</td>
                          <td>{row.recon_date ?? "—"}</td>
                          <td>{row.order_date ?? "—"}</td>
                          <td>
                            <span className="bl-amount">
                              {row.seller_net_collection !== null && row.seller_net_collection !== undefined && row.seller_net_collection !== ""
                                ? Number(row.seller_net_collection).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "—"}
                            </span>
                          </td>
                          <td>
                            <span className="bl-amount">
                              {row.net_payout !== null && row.net_payout !== undefined && row.net_payout !== ""
                                ? Number(row.net_payout).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                : "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {Math.ceil(payoutRows.length / PAGE_SIZE) > 1 && (
                  <div className="bl-pagination">
                    <button
                      className="bl-page-btn"
                      onClick={() => setPayoutCurrentPage(p => Math.max(1, p - 1))}
                      disabled={payoutCurrentPage === 1}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      Prev
                    </button>
                    <span className="bl-page-info">
                      Page {payoutCurrentPage} of {Math.ceil(payoutRows.length / PAGE_SIZE)}
                      <span style={{ color: "var(--qbd-gray-500)", marginLeft: 6 }}>({payoutRows.length} rows)</span>
                    </span>
                    <button
                      className="bl-page-btn"
                      onClick={() => setPayoutCurrentPage(p => Math.min(Math.ceil(payoutRows.length / PAGE_SIZE), p + 1))}
                      disabled={payoutCurrentPage === Math.ceil(payoutRows.length / PAGE_SIZE)}
                    >
                      Next
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {activeTab === "settled-claims" && (
        <>



          {/* Results card — matches Settled Bags design */}
          <div className="bl-results-card">
            <div className="bl-results-head">
              <div>
                <div className="bl-results-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                  Settled Claims
                  {claimPayoutRows !== null && (
                    <span style={{ fontWeight: 400, fontSize: 12, color: "var(--qbd-gray-500)" }}>
                      &nbsp;({claimPayoutRows.length} rows shown)
                    </span>
                  )}
                </div>
                {claimPayoutHasQueried && claimPayoutRows !== null && (
                  <div className="bl-preview-note">Showing first 20 rows — use Download Report for full data</div>
                )}
              </div>
              <button
                className="bl-download-btn"
                disabled={claimPayoutDownloading}
                onClick={async () => {
                  setClaimPayoutDownloading(true);
                  try {
                    await downloadWithJob(
                      "/api/brand-ledger/claim-payout/download",
                      { company_id: companyId, from_date: fromDate, to_date: toDate },
                      `settled_claims_${companyId || "all"}_${fromDate || "start"}_to_${toDate || "end"}.xlsx`,
                      () => {}
                    );
                    logActivity("Downloaded Settled Claims", companyId);
                  } catch (e) {
                    alert("Download failed: " + (e instanceof Error ? e.message : String(e)));
                  } finally {
                    setClaimPayoutDownloading(false);
                  }
                }}
                title="Download full report as Excel"
              >
                {claimPayoutDownloading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "qbd-spin .7s linear infinite" }}>
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Preparing…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download Report
                  </>
                )}
              </button>
            </div>

            {/* Loading */}
            {claimPayoutLoading && (
              <div className="bl-skeleton-loader">
                <div className="bl-skeleton-row" style={{ width: '100%' }} />
                <div className="bl-skeleton-row" style={{ width: '88%' }} />
                <div className="bl-skeleton-row" style={{ width: '75%' }} />
                <div className="bl-skeleton-row" style={{ width: '92%' }} />
                <div className="bl-skeleton-row" style={{ width: '80%' }} />
              </div>
            )}

            {/* Error */}
            {!claimPayoutLoading && claimPayoutError && (
              <div className="bl-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span><strong>Query error:</strong> {claimPayoutError}</span>
              </div>
            )}

            {/* Empty — not yet queried */}
            {!claimPayoutLoading && !claimPayoutError && !claimPayoutHasQueried && (
              <div className="bl-table-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <strong>No data loaded yet</strong>
                Enter a Company ID or select a date slicer above — data loads automatically.
              </div>
            )}

            {/* Empty — queried but no results */}
            {!claimPayoutLoading && !claimPayoutError && claimPayoutHasQueried && claimPayoutRows !== null && claimPayoutRows.length === 0 && (
              <div className="bl-table-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <strong>No records found</strong>
                Try adjusting your filters.
              </div>
            )}

            {/* Table */}
            {!claimPayoutLoading && !claimPayoutError && claimPayoutRows !== null && claimPayoutRows.length > 0 && (
              <>
                <div className="bl-table-wrap">
                  <table className="bl-table">
                    <thead>
                      <tr>
                        <th>Company ID</th>
                        <th>Company Name</th>
                        <th>Order ID</th>
                        <th>Shipment ID</th>
                        <th>Txn Type</th>
                        <th>Recon Status</th>
                        <th>Sales Channel</th>
                        <th>Payment Date</th>
                        <th>SF UTR</th>
                        <th style={{ textAlign: "right" }}>Claimable Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {claimPayoutRows.slice((claimPayoutCurrentPage - 1) * PAGE_SIZE, claimPayoutCurrentPage * PAGE_SIZE).map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.company_id ?? "—"}</td>
                          <td>{row.company_name ?? "—"}</td>
                          <td className="mono">{row.fynd_order_id ?? "—"}</td>
                          <td className="mono">{row.current_shipment_id ?? "—"}</td>
                          <td>{row.transaction_type ?? "—"}</td>
                          <td>{row.recon_status ?? "—"}</td>
                          <td>{row.sales_channel ?? "—"}</td>
                          <td>{row.Payment_Date ?? "—"}</td>
                          <td className="mono">{row.SF_UTR ?? "—"}</td>
                          <td style={{ textAlign: "right", fontWeight: 600, color: "#7C5CFC" }}>{row.claimable_amt != null ? Number(row.claimable_amt).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {claimPayoutRows.length > PAGE_SIZE && (
                  <div className="bl-pagination">
                    <button
                      className="bl-page-btn"
                      disabled={claimPayoutCurrentPage === 1}
                      onClick={() => setClaimPayoutCurrentPage(p => Math.max(1, p - 1))}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      Prev
                    </button>
                    <span className="bl-page-info">
                      Page {claimPayoutCurrentPage} of {Math.ceil(claimPayoutRows.length / PAGE_SIZE)}
                      <span style={{ color: "var(--qbd-gray-500)", marginLeft: 6 }}>({claimPayoutRows.length} rows)</span>
                    </span>
                    <button
                      className="bl-page-btn"
                      onClick={() => setClaimPayoutCurrentPage(p => Math.min(Math.ceil(claimPayoutRows.length / PAGE_SIZE), p + 1))}
                      disabled={claimPayoutCurrentPage === Math.ceil(claimPayoutRows.length / PAGE_SIZE)}
                    >
                      Next
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
      {/* ── RECEIPTS TAB ── */}
      {activeTab === "receipts" && (
        <>
          <div className="bl-results-card">
            <div className="bl-results-head">
              <div>
                <div className="bl-results-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="3" x2="9" y2="21"/>
                  </svg>
                  Receipts
                  {receiptsRows !== null && (
                    <span style={{ fontWeight: 400, fontSize: 12, color: "var(--qbd-gray-500)" }}>
                      &nbsp;({receiptsRows.length} rows shown)
                    </span>
                  )}
                </div>
                {receiptsHasQueried && receiptsRows !== null && receiptsRows.length > 0 && (
                  <div className="bl-preview-note">Showing first 20 rows — use Download Report for full data</div>
                )}
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                  Filtered by: status = Open, Invoice Date &ge; 2026-04-01, Invoice Type = Advance_Receipt / Receipt
                </div>
              </div>
              <button
                className="bl-download-btn"
                disabled={receiptsDownloading}
                onClick={async () => {
                  setReceiptsDownloading(true);
                  try {
                    await downloadWithJob(
                      "/api/brand-ledger/receipts/download",
                      { company_id: companyId },
                      `receipts_${companyId || "all"}.xlsx`,
                      () => {}
                    );
                    logActivity("Downloaded Receipts", companyId);
                  } catch (e) {
                    alert("Download failed: " + (e instanceof Error ? e.message : String(e)));
                  } finally {
                    setReceiptsDownloading(false);
                  }
                }}
                title="Download full Receipts report as Excel"
              >
                {receiptsDownloading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "qbd-spin .7s linear infinite" }}>
                      <polyline points="23 4 23 10 17 10"/>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                    Preparing…
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Download Report
                  </>
                )}
              </button>
            </div>

            {/* Loading */}
            {receiptsLoading && (
              <div className="bl-skeleton-loader">
                <div className="bl-skeleton-row" style={{ width: '100%' }} />
                <div className="bl-skeleton-row" style={{ width: '88%' }} />
                <div className="bl-skeleton-row" style={{ width: '75%' }} />
                <div className="bl-skeleton-row" style={{ width: '92%' }} />
                <div className="bl-skeleton-row" style={{ width: '80%' }} />
              </div>
            )}

            {/* Error */}
            {!receiptsLoading && receiptsError && (
              <div className="bl-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span><strong>Query error:</strong> {receiptsError}</span>
              </div>
            )}

            {/* Empty — not yet queried */}
            {!receiptsLoading && !receiptsError && !receiptsHasQueried && (
              <div className="bl-table-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2"/>
                  <line x1="2" y1="10" x2="22" y2="10"/>
                </svg>
                <strong>No data loaded yet</strong>
                Enter a Company ID above — data loads automatically.
              </div>
            )}

            {/* Empty — queried but no results */}
            {!receiptsLoading && !receiptsError && receiptsHasQueried && receiptsRows !== null && receiptsRows.length === 0 && (
              <div className="bl-table-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <strong>No records found</strong>
                No Receipts (Advance_Receipt / Receipt) found for this company.
              </div>
            )}

            {/* Table */}
            {!receiptsLoading && !receiptsError && receiptsRows !== null && receiptsRows.length > 0 && (
              <>
                <div className="bl-table-wrap">
                  <table className="bl-table">
                    <thead>
                      <tr>
                        {receiptsColumns.map((col, i) => {
                          const isNumeric = ["INVOICE_AMOUNT", "OUTSTANDING_AMOUNT", "COMPANY_LEVEL_DUE", "DAYS"].includes(col.toUpperCase());
                          return (
                            <th key={i} style={isNumeric ? { textAlign: "right" } : {}}>
                              {col.replace(/_/g, " ")}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {receiptsRows
                        .slice((receiptsCurrentPage - 1) * RECEIPTS_PAGE_SIZE, receiptsCurrentPage * RECEIPTS_PAGE_SIZE)
                        .map((row, ri) => (
                          <tr key={ri}>
                            {row.map((cell, ci) => {
                              const col = receiptsColumns[ci] ?? "";
                              const isNumeric = ["INVOICE_AMOUNT", "OUTSTANDING_AMOUNT", "COMPANY_LEVEL_DUE", "DAYS"].includes(col.toUpperCase());
                              const isAmt = ["INVOICE_AMOUNT", "OUTSTANDING_AMOUNT", "COMPANY_LEVEL_DUE"].includes(col.toUpperCase());
                              return (
                                <td key={ci} style={isNumeric ? { textAlign: "right", fontWeight: isAmt ? 600 : 400, color: isAmt ? "#7C5CFC" : undefined } : {}}>
                                  {cell === null || cell === undefined ? "—" : isAmt && typeof cell === "number" ? cell.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(cell)}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {receiptsRows.length > RECEIPTS_PAGE_SIZE && (
                  <div className="bl-pagination">
                    <button
                      className="bl-page-btn"
                      disabled={receiptsCurrentPage === 1}
                      onClick={() => setReceiptsCurrentPage(p => Math.max(1, p - 1))}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6"/>
                      </svg>
                      Prev
                    </button>
                    <span className="bl-page-info">
                      Page {receiptsCurrentPage} of {Math.ceil(receiptsRows.length / RECEIPTS_PAGE_SIZE)}
                      <span style={{ color: "var(--qbd-gray-500)", marginLeft: 6 }}>({receiptsRows.length} rows)</span>
                    </span>
                    <button
                      className="bl-page-btn"
                      onClick={() => setReceiptsCurrentPage(p => Math.min(Math.ceil(receiptsRows.length / RECEIPTS_PAGE_SIZE), p + 1))}
                      disabled={receiptsCurrentPage === Math.ceil(receiptsRows.length / RECEIPTS_PAGE_SIZE)}
                    >
                      Next
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
      {/* ── SUMMARY TAB ── */}
      {activeTab === "summary" && (
        <div style={{ marginTop: "1.5rem" }}>
          {/* ── Header bar ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "linear-gradient(135deg, #1e4d60 0%, #7C5CFC 50%, #3a7d94 100%)",
            borderRadius: "12px", padding: "1.25rem 1.5rem", marginBottom: "1.25rem",
            boxShadow: "0 4px 20px rgba(46,100,120,0.30)",
          }}>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "0.01em" }}>
                {summaryData ? `Payable & Receivable Ledger — ${summaryData.companyName}` : "Summary Report"}
              </div>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.78rem", marginTop: "0.2rem" }}>
                {summaryData ? `As of ${summaryData.dateLabel}` : "Apply filters above to load the summary"}
              </div>
            </div>
            {/* Download Workbook button removed */}
            {false && <button
              disabled={summaryDownloading || !companyId.trim()}
              style={{
                display: "flex", alignItems: "center", gap: "0.45rem",
                padding: "0.55rem 1.1rem", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600,
                cursor: summaryDownloading || !companyId.trim() ? "not-allowed" : "pointer",
                opacity: !companyId.trim() ? 0.5 : 1,
                border: "1px solid rgba(220,225,235,0.55)",
                background: summaryDownloading
                  ? "rgba(180,185,195,0.18)"
                  : "linear-gradient(135deg, rgba(210,215,228,0.22) 0%, rgba(240,243,250,0.28) 50%, rgba(200,208,224,0.20) 100%)",
                color: "#e8edf8",
                backdropFilter: "blur(8px)",
                boxShadow: summaryDownloading ? "none" : "0 1px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18)",
                transition: "all 0.2s ease",
                whiteSpace: "nowrap",
              }}
              onClick={async () => {
                setSummaryDownloading(true);
                setSummaryProgress({ msg: "Starting…", step: 0 });
                setSummaryError(null);
                try {
                  logActivity("Downloaded Workbook", companyId);
                  // Use downloadWithJob — same pattern as individual tab Download Report buttons.
                  // Backend returns {jobId} immediately, frontend polls status every 2s,
                  // then fetches the completed file from S3. No proxy timeout risk.
                  await downloadWithJob(
                    "/api/brand-ledger/consolidated/download",
                    { company_id: companyId, from_date: fromDate, to_date: toDate },
                    `brand_ledger_${companyId || "all"}_${fromDate || "start"}_to_${toDate || "end"}.xlsx`,
                    (raw: string) => {
                      try {
                        const parsed = JSON.parse(raw);
                        setSummaryProgress({ msg: parsed.msg, step: parsed.step ?? 0 });
                      } catch {
                        setSummaryProgress({ msg: raw, step: 0 });
                      }
                    }
                  );
                } catch (err: unknown) {
                  setSummaryError(err instanceof Error ? err.message : String(err));
                } finally {
                  setSummaryDownloading(false);
                  setSummaryProgress(null);
                }
              }}
            >
              {summaryDownloading ? (
                <>
                  <svg className="bl-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8d4ec" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  <span>{summaryProgress?.msg?.split("…")[0] || "Preparing"}…</span>
                </>
              ) : (
                <>
                  {/* Silver spreadsheet icon */}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8d4ec" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <line x1="3" y1="9" x2="21" y2="9"/>
                    <line x1="3" y1="15" x2="21" y2="15"/>
                    <line x1="9" y1="9" x2="9" y2="21"/>
                    <line x1="15" y1="9" x2="15" y2="21"/>
                  </svg>
                  <span style={{ background: "linear-gradient(90deg, #d0d8ec, #e8edf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Download Workbook</span>
                </>
              )}
            </button>}
          </div>

          {/* ── Animated progress bar (hidden) ── */}
          {false && summaryDownloading && summaryProgress && (
            <div style={{
              background: "linear-gradient(135deg, #0d2030 0%, #162d3e 100%)",
              border: "1px solid rgba(100,160,200,0.25)",
              borderRadius: "12px",
              padding: "1.1rem 1.4rem",
              marginBottom: "1.25rem",
              boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
            }}>
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.65rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.55rem" }}>
                  <svg className="bl-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5bc8f5" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  <span style={{ color: "#cce8ff", fontWeight: 600, fontSize: "0.85rem" }}>{summaryProgress?.msg}</span>
                </div>
                <span style={{ color: "rgba(180,210,240,0.55)", fontSize: "0.75rem", fontVariantNumeric: "tabular-nums" }}>
                  {Math.min(summaryProgress?.step ?? 0, 3)}/3
                </span>
              </div>
              {/* Progress track */}
              <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: "999px", height: "7px", overflow: "hidden", marginBottom: "0.85rem" }}>
                <div style={{
                  height: "100%",
                  borderRadius: "999px",
                  width: `${Math.round((Math.min(summaryProgress?.step ?? 0, 3) / 3) * 100)}%`,
                  background: "linear-gradient(90deg, #2196f3, #00bcd4)",
                  boxShadow: "0 0 10px rgba(33,150,243,0.55)",
                  transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)",
                }}/>
              </div>
              {/* Step chips — 3 stages matching single-query backend */}
              <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                {([
                  { label: "Fetching Data", subtitle: "Querying master table", doneAt: 2, activeFrom: 1 },
                  { label: "Building Sheets", subtitle: "Splitting into 7 sheets", doneAt: 3, activeFrom: 2 },
                  { label: "Finalising", subtitle: "Writing workbook", doneAt: 4, activeFrom: 3 },
                ] as { label: string; subtitle: string; doneAt: number; activeFrom: number }[]).map(({ label, subtitle, doneAt, activeFrom }) => {
                  const done   = (summaryProgress?.step ?? 0) >= doneAt;
                  const active = (summaryProgress?.step ?? 0) >= activeFrom && (summaryProgress?.step ?? 0) < doneAt;
                  return (
                    <div key={label} style={{
                      display: "flex", flexDirection: "column", gap: "0.1rem",
                      background: done ? "rgba(33,150,243,0.18)" : active ? "rgba(33,150,243,0.10)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${done ? "rgba(33,150,243,0.5)" : active ? "rgba(33,150,243,0.35)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: "10px", padding: "0.3rem 0.7rem",
                      transition: "all 0.35s ease",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                        {done ? (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#5bc8f5" strokeWidth="3.5"><polyline points="20 6 9 17 4 12"/></svg>
                        ) : active ? (
                          <svg className="bl-spin" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#5bc8f5" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        ) : (
                          <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "rgba(255,255,255,0.15)" }}/>
                        )}
                        <span style={{
                          color: done ? "#90caf9" : active ? "#b3d9f7" : "rgba(255,255,255,0.35)",
                          fontSize: "0.75rem", fontWeight: done || active ? 600 : 400,
                        }}>{label}</span>
                      </div>
                      <span style={{
                        color: done ? "rgba(144,202,249,0.6)" : active ? "rgba(179,217,247,0.55)" : "rgba(255,255,255,0.2)",
                        fontSize: "0.65rem", marginTop: "0.1rem", lineHeight: 1.3,
                      }}>{subtitle}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Error banners ── */}
          {(summaryError || summaryPreviewError) && (
            <div className="bl-error-banner" style={{ marginBottom: "1rem" }}>
              <p>{summaryError || summaryPreviewError}</p>
            </div>
          )}

          {/* ── Empty / loading states ── */}
          {!companyId.trim() && (
            <div className="bl-empty-state">Enter a Company ID above and apply filters to load the Summary.</div>
          )}
          {companyId.trim() && summaryLoading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem", padding: "3rem", color: "#7C5CFC" }}>
              <svg className="bl-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
              <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>Loading summary data…</span>
            </div>
          )}

          {/* ── Main dashboard ── */}
          {companyId.trim() && !summaryLoading && summaryData && (() => {
            const k = summaryData.kpis;
            const fmt = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
            const fmtNum = (n: number) => new Intl.NumberFormat("en-IN").format(n);
            return (
              <>
                {/* ── KPI Cards Row ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem", marginBottom: "1.25rem" }}>
                  {/* Receivable — drills to 'receivable' tab */}
                  <div
                    role="button"
                    tabIndex={0}
                    title="Click to view Receivable tab"
                    onClick={() => setActiveTab("receivable")}
                    onKeyDown={e => e.key === "Enter" && setActiveTab("receivable")}
                    style={{ background: "linear-gradient(135deg,#eef6f9,#daeef5)", border: "1px solid #b8dae6", borderRadius: "10px", padding: "1rem 1.25rem", borderTop: "3px solid #7C5CFC", boxShadow: "0 2px 8px rgba(46,100,120,0.10)", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s", outline: "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 18px rgba(46,100,120,0.18)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(46,100,120,0.10)"; }}
                  >
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#7C5CFC", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>Total Receivable</div>
                    <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#7C5CFC" }}>{fmt(k.hasReceipts ? (k.effectiveReceivable ?? k.receivable) : k.receivable)}</div>
                    <div style={{ fontSize: "0.72rem", color: "#5a8fa0", marginTop: "0.25rem" }}>
                      {k.hasReceipts ? (
                        <span title={`Gross: ${fmt(k.receivable)} — Less Receipts: ${fmt(k.receiptsAmount ?? 0)}`}>
                          {fmtNum(k.receivableRecords)} records <span style={{ color: "#b45309", fontStyle: "italic" }}>(net of receipts)</span>
                        </span>
                      ) : `${fmtNum(k.receivableRecords)} records`}
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "#7C5CFC", marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.25rem", opacity: 0.7 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      View Receivable
                    </div>
                  </div>
                  {/* Payable Sale — drills to 'payable-bags' tab */}
                  <div
                    role="button"
                    tabIndex={0}
                    title="Click to view Payable Bags tab"
                    onClick={() => setActiveTab("bags")}
                    onKeyDown={e => e.key === "Enter" && setActiveTab("bags")}
                    style={{ background: "linear-gradient(135deg,#eef6f9,#daeef5)", border: "1px solid #b8dae6", borderRadius: "10px", padding: "1rem 1.25rem", borderTop: "3px solid #3a7d94", boxShadow: "0 2px 8px rgba(46,100,120,0.10)", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s", outline: "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 18px rgba(46,100,120,0.18)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(46,100,120,0.10)"; }}
                  >
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#7C5CFC", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>Payable — Seller Sale</div>
                    <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#7C5CFC" }}>{fmt(k.payableSale)}</div>
                    <div style={{ fontSize: "0.72rem", color: "#5a8fa0", marginTop: "0.25rem" }}>{fmtNum(k.payableSaleBags)} bags</div>
                    <div style={{ fontSize: "0.65rem", color: "#7C5CFC", marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.25rem", opacity: 0.7 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      View Payable Bags
                    </div>
                  </div>
                  {/* Payable Claim — drills to 'payable-claims' tab */}
                  <div
                    role="button"
                    tabIndex={0}
                    title="Click to view Payable Claims tab"
                    onClick={() => setActiveTab("claims")}
                    onKeyDown={e => e.key === "Enter" && setActiveTab("claims")}
                    style={{ background: "linear-gradient(135deg,#eef6f9,#daeef5)", border: "1px solid #b8dae6", borderRadius: "10px", padding: "1rem 1.25rem", borderTop: "3px solid #4a95ad", boxShadow: "0 2px 8px rgba(46,100,120,0.10)", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s", outline: "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 18px rgba(46,100,120,0.18)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(46,100,120,0.10)"; }}
                  >
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#7C5CFC", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>Payable — Claim</div>
                    <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#7C5CFC" }}>{fmt(k.payableClaim)}</div>
                    <div style={{ fontSize: "0.72rem", color: "#5a8fa0", marginTop: "0.25rem" }}>{fmtNum(k.payableClaimShipments)} shipments</div>
                    <div style={{ fontSize: "0.65rem", color: "#7C5CFC", marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.25rem", opacity: 0.7 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      View Payable Claims
                    </div>
                  </div>
                  {/* Payable Total — drills to 'payable-bags' tab */}
                  <div
                    role="button"
                    tabIndex={0}
                    title="Click to view Payable Bags tab"
                    onClick={() => setActiveTab("bags")}
                    onKeyDown={e => e.key === "Enter" && setActiveTab("bags")}
                    style={{ background: "linear-gradient(135deg,#7C5CFC,#4a95ad)", border: "none", borderRadius: "10px", padding: "1rem 1.25rem", boxShadow: "0 4px 14px rgba(46,100,120,0.30)", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s", outline: "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 22px rgba(46,100,120,0.40)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 14px rgba(46,100,120,0.30)"; }}
                  >
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>Total Payable by Fynd</div>
                    <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#fff" }}>{fmt(k.payableTotal)}</div>
                    <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.65)", marginTop: "0.25rem" }}>Sale + Claim</div>
                    <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.75)", marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      View Payable Bags
                    </div>
                  </div>
                </div>

                {/* ── Settlement + Net Balance Row ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.85rem", marginBottom: "1.25rem" }}>
                  {/* Settled Bags — drills to 'settled-bags' tab */}
                  <div
                    role="button"
                    tabIndex={0}
                    title="Click to view Settled Bags tab"
                    onClick={() => setActiveTab("payout")}
                    onKeyDown={e => e.key === "Enter" && setActiveTab("payout")}
                    style={{ background: "linear-gradient(135deg,#eef6f9,#daeef5)", border: "1px solid #b8dae6", borderRadius: "10px", padding: "1rem 1.25rem", borderTop: "3px solid #7C5CFC", boxShadow: "0 2px 8px rgba(46,100,120,0.10)", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s", outline: "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 18px rgba(46,100,120,0.18)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(46,100,120,0.10)"; }}
                  >
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#7C5CFC", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>Settled Bags</div>
                    <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#7C5CFC" }}>{fmt(k.settledBags)}</div>
                    <div style={{ fontSize: "0.72rem", color: "#5a8fa0", marginTop: "0.25rem" }}>{fmtNum(k.settledBagCount)} bags</div>
                    <div style={{ fontSize: "0.65rem", color: "#7C5CFC", marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.25rem", opacity: 0.7 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      View Settled Bags
                    </div>
                  </div>
                  {/* Settled Claims — drills to 'settled-claims' tab */}
                  <div
                    role="button"
                    tabIndex={0}
                    title="Click to view Settled Claims tab"
                    onClick={() => setActiveTab("settled-claims")}
                    onKeyDown={e => e.key === "Enter" && setActiveTab("settled-claims")}
                    style={{ background: "linear-gradient(135deg,#eef6f9,#daeef5)", border: "1px solid #b8dae6", borderRadius: "10px", padding: "1rem 1.25rem", borderTop: "3px solid #3a7d94", boxShadow: "0 2px 8px rgba(46,100,120,0.10)", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s", outline: "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 18px rgba(46,100,120,0.18)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(46,100,120,0.10)"; }}
                  >
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#7C5CFC", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>Settled Claims</div>
                    <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#7C5CFC" }}>{fmt(k.settledClaims)}</div>
                    <div style={{ fontSize: "0.72rem", color: "#5a8fa0", marginTop: "0.25rem" }}>{fmtNum(k.settledClaimCount)} records</div>
                    <div style={{ fontSize: "0.65rem", color: "#7C5CFC", marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.25rem", opacity: 0.7 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      View Settled Claims
                    </div>
                  </div>
                  {/* Total Settled — drills to 'settled-bags' tab */}
                  <div
                    role="button"
                    tabIndex={0}
                    title="Click to view Settled Bags tab"
                    onClick={() => setActiveTab("payout")}
                    onKeyDown={e => e.key === "Enter" && setActiveTab("payout")}
                    style={{ background: "linear-gradient(135deg,#7C5CFC,#4a95ad)", border: "none", borderRadius: "10px", padding: "1rem 1.25rem", boxShadow: "0 4px 14px rgba(46,100,120,0.30)", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s", outline: "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 22px rgba(46,100,120,0.40)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 14px rgba(46,100,120,0.30)"; }}
                  >
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>Total Settled</div>
                    <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#fff" }}>{fmt(k.settledTotal)}</div>
                    <div style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.65)", marginTop: "0.25rem" }}>Bags + Claims</div>
                    <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.75)", marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      View Settled Bags
                    </div>
                  </div>
                  {/* Net Balance — drills to 'receivable' tab */}
                  <div
                    role="button"
                    tabIndex={0}
                    title="Click to view Receivable tab"
                    onClick={() => setActiveTab("receivable")}
                    onKeyDown={e => e.key === "Enter" && setActiveTab("receivable")}
                    style={{ background: "linear-gradient(135deg,#eef6f9,#daeef5)", border: "1px solid #b8dae6", borderRadius: "10px", padding: "1rem 1.25rem", borderTop: "3px solid #4a95ad", boxShadow: "0 2px 8px rgba(46,100,120,0.10)", cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s", outline: "none" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 18px rgba(46,100,120,0.18)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(46,100,120,0.10)"; }}
                  >
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#7C5CFC", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>Net Balance</div>
                    <div style={{ fontSize: "1.35rem", fontWeight: 700, color: "#7C5CFC" }}>{fmt(k.netBalance)}</div>
                    <div style={{ fontSize: "0.72rem", color: "#5a8fa0", marginTop: "0.25rem" }}>{k.hasReceipts ? "Eff. Receivable − Payable" : "Receivable − Payable"}</div>
                    <div style={{ fontSize: "0.65rem", color: "#7C5CFC", marginTop: "0.5rem", display: "flex", alignItems: "center", gap: "0.25rem", opacity: 0.7 }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                      View Receivable
                    </div>
                  </div>
                </div>

                {/* ── Receipts deduction note ── */}
                {k.hasReceipts && (
                  <div style={{ background: "#fff8f0", border: "1px solid #fcd9a0", borderRadius: "10px", padding: "0.85rem 1.1rem", marginBottom: "1.25rem", display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "#92400e", marginBottom: "0.25rem" }}>Receipts Applied to Receivable</div>
                      <div style={{ fontSize: "0.78rem", color: "#78350f" }}>
                        Gross Receivable: <strong>{fmt(k.receivable)}</strong>
                        &nbsp;&mdash;&nbsp;Less Receipts: <strong style={{ color: "#b45309" }}>{fmt(k.receiptsAmount ?? 0)}</strong> ({fmtNum(k.receiptsCount ?? 0)} records)
                        &nbsp;&mdash;&nbsp;Effective Receivable: <strong style={{ color: "#7C5CFC" }}>{fmt(k.effectiveReceivable ?? k.receivable)}</strong>
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#92400e", marginTop: "0.2rem", fontStyle: "italic" }}>Receipts tab (status=Open, Invoice Date ≥ 2026-04-01, Invoice Type = Advance_Receipt / Receipt)</div>
                    </div>
                  </div>
                )}
                {/* ── Two-column breakdown ── */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
                  {/* Payable breakdown */}
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                    <div style={{ background: "linear-gradient(90deg,#7C5CFC,#4a95ad)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                      <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.82rem" }}>Total Outstanding Payable by Fynd</span>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={{ padding: "0.6rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</th>
                          <th style={{ padding: "0.6rem 1rem", textAlign: "right", color: "#64748b", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount</th>
                          <th style={{ padding: "0.6rem 1rem", textAlign: "right", color: "#64748b", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "0.65rem 1rem", color: "#334155" }}>
                            Seller Sale
                            {k.hasAdjustments && <span style={{ marginLeft: "0.4rem", fontSize: "0.68rem", color: "#64748b", fontStyle: "italic" }}>(gross)</span>}
                          </td>
                          <td style={{ padding: "0.65rem 1rem", textAlign: "right", fontWeight: 600, color: k.hasAdjustments ? "#64748b" : "#7C5CFC", textDecoration: k.hasAdjustments ? "line-through" : "none" }}>{fmt(k.payableSaleRaw ?? k.payableSale)}</td>
                          <td style={{ padding: "0.65rem 1rem", textAlign: "right", color: "#64748b" }}>{fmtNum(k.payableSaleBags)} bags</td>
                        </tr>
                        {k.hasAdjustments && (
                          <>
                            <tr style={{ borderTop: "1px solid #f1f5f9", background: "#fff8f0" }}>
                              <td style={{ padding: "0.65rem 1rem", color: "#b45309", fontStyle: "italic", fontSize: "0.85rem" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                  Adjustments (Dispute)
                                </span>
                                <div style={{ fontSize: "0.68rem", color: "#92400e", marginTop: "0.1rem" }}>{fmtNum(k.adjustmentCount ?? 0)} records</div>
                              </td>
                              <td style={{ padding: "0.65rem 1rem", textAlign: "right", fontWeight: 600, color: "#b45309" }}>{fmt(k.adjustmentAmount ?? 0)}</td>
                              <td style={{ padding: "0.65rem 1rem" }}></td>
                            </tr>
                            <tr style={{ borderTop: "1px solid #f1f5f9", background: "#f0faf8" }}>
                              <td style={{ padding: "0.65rem 1rem", color: "#7C5CFC", fontWeight: 600, fontSize: "0.85rem" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C5CFC" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                  Effective Seller Sale
                                </span>
                              </td>
                              <td style={{ padding: "0.65rem 1rem", textAlign: "right", fontWeight: 700, color: "#7C5CFC" }}>{fmt(k.payableSale)}</td>
                              <td style={{ padding: "0.65rem 1rem" }}></td>
                            </tr>
                          </>
                        )}
                        <tr style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "0.65rem 1rem", color: "#334155" }}>Claim</td>
                          <td style={{ padding: "0.65rem 1rem", textAlign: "right", fontWeight: 600, color: "#3a7d94" }}>{fmt(k.payableClaim)}</td>
                          <td style={{ padding: "0.65rem 1rem", textAlign: "right", color: "#64748b" }}>{fmtNum(k.payableClaimShipments)} shipments</td>
                        </tr>
                        <tr style={{ borderTop: "2px solid #e2e8f0", background: "#eef6f9" }}>
                          <td style={{ padding: "0.65rem 1rem", fontWeight: 700, color: "#7C5CFC" }}>Total</td>
                          <td style={{ padding: "0.65rem 1rem", textAlign: "right", fontWeight: 700, color: "#7C5CFC" }}>{fmt(k.payableTotal)}</td>
                          <td style={{ padding: "0.65rem 1rem" }}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Settlement breakdown */}
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                    <div style={{ background: "linear-gradient(90deg,#7C5CFC,#4a95ad)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.82rem" }}>Settlement Summary</span>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={{ padding: "0.6rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</th>
                          <th style={{ padding: "0.6rem 1rem", textAlign: "right", color: "#64748b", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Amount</th>
                          <th style={{ padding: "0.6rem 1rem", textAlign: "right", color: "#64748b", fontWeight: 600, fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "0.65rem 1rem", color: "#334155" }}>Settled Bags</td>
                          <td style={{ padding: "0.65rem 1rem", textAlign: "right", fontWeight: 600, color: "#7C5CFC" }}>{fmt(k.settledBags)}</td>
                          <td style={{ padding: "0.65rem 1rem", textAlign: "right", color: "#64748b" }}>{fmtNum(k.settledBagCount)} bags</td>
                        </tr>
                        <tr style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "0.65rem 1rem", color: "#334155" }}>Settled Claims</td>
                          <td style={{ padding: "0.65rem 1rem", textAlign: "right", fontWeight: 600, color: "#3a7d94" }}>{fmt(k.settledClaims)}</td>
                          <td style={{ padding: "0.65rem 1rem", textAlign: "right", color: "#64748b" }}>{fmtNum(k.settledClaimCount)} records</td>
                        </tr>
                        <tr style={{ borderTop: "2px solid #e2e8f0", background: "#eef6f9" }}>
                          <td style={{ padding: "0.65rem 1rem", fontWeight: 700, color: "#7C5CFC" }}>Total</td>
                          <td style={{ padding: "0.65rem 1rem", textAlign: "right", fontWeight: 700, color: "#7C5CFC" }}>{fmt(k.settledTotal)}</td>
                          <td style={{ padding: "0.65rem 1rem" }}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ── Receivable Preview Table ── */}
                {summaryData.receivablePreview.rows.length > 0 && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                    <div style={{ background: "linear-gradient(90deg,#7C5CFC,#4a95ad)", padding: "0.75rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                        <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.82rem" }}>Total Outstanding Receivable from {summaryData.companyName}</span>
                      </div>
                      <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "0.72rem" }}>Preview — first {summaryData.receivablePreview.rows.length} rows</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                        <thead>
                          <tr style={{ background: "#eef6f9" }}>
                            {summaryData.receivablePreview.columns.map((col, i) => (
                              <th key={i} style={{ padding: "0.55rem 0.85rem", textAlign: "left", color: "#7C5CFC", fontWeight: 600, fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", borderBottom: "2px solid #b8dae6" }}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {summaryData.receivablePreview.rows.map((row, ri) => (
                            <tr key={ri} style={{ borderTop: "1px solid #f1f5f9", background: ri % 2 === 0 ? "#fff" : "#f4f9fb" }}>
                              {row.map((cell, ci) => (
                                <td key={ci} style={{ padding: "0.5rem 0.85rem", color: "#334155", whiteSpace: "nowrap" }}>{cell === null || cell === undefined ? "—" : String(cell)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ padding: "0.6rem 1rem", background: "#eef6f9", borderTop: "1px solid #b8dae6", fontSize: "0.72rem", color: "#7C5CFC", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span>Showing preview — download Excel for full dataset</span>
                      <span style={{ fontWeight: 700 }}>Total Outstanding: {fmt(k.receivable)}</span>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* ── Activity Log ─────────────────────────────────────────────── */}
      {(() => {
        const blLogFiltered = activityLogs.filter(row => {
          if (blLogSlicerUser && row.userName !== blLogSlicerUser) return false;
          if (blLogSlicerType && row.activityType !== blLogSlicerType) return false;
          if (blLogSlicerFrom) {
            const d = new Date(row.createdAt);
            if (d < new Date(blLogSlicerFrom)) return false;
          }
          if (blLogSlicerTo) {
            const d = new Date(row.createdAt);
            const toEnd = new Date(blLogSlicerTo); toEnd.setHours(23, 59, 59, 999);
            if (d > toEnd) return false;
          }
          return true;
        });
        return (
          <div className="invex-hist-card" style={{ marginTop: "28px" }}>
            <div className="invex-hist-header">
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 700, fontSize: "0.95rem", color: "#fff" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Brand Ledger Logs
              </div>
              <button
                onClick={() => fetchActivityLogs(1)}
                className="qbd-refresh-btn"
                style={{ color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                Refresh
              </button>
            </div>
            <div className="invex-slicers-row">
              <div className="invex-slicer-group">
                <label className="invex-slicer-label">Name</label>
                <select
                  className="invex-slicer-select"
                  value={blLogSlicerUser}
                  onChange={e => setBlLogSlicerUser(e.target.value)}
                >
                  <option value="">All</option>
                  {Array.from(new Set(activityLogs.map(r => r.userName).filter(Boolean))).sort().map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div className="invex-slicer-group">
                <label className="invex-slicer-label">Activity Type</label>
                <select
                  className="invex-slicer-select"
                  value={blLogSlicerType}
                  onChange={e => setBlLogSlicerType(e.target.value)}
                >
                  <option value="">All</option>
                  {Array.from(new Set(activityLogs.map(r => r.activityType).filter(Boolean))).sort().map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="invex-slicer-group">
                <label className="invex-slicer-label">From</label>
                <input
                  type="date"
                  className="invex-slicer-date"
                  value={blLogSlicerFrom}
                  onChange={e => setBlLogSlicerFrom(e.target.value)}
                />
              </div>
              <div className="invex-slicer-group">
                <label className="invex-slicer-label">To</label>
                <input
                  type="date"
                  className="invex-slicer-date"
                  value={blLogSlicerTo}
                  onChange={e => setBlLogSlicerTo(e.target.value)}
                />
              </div>
              {(blLogSlicerUser || blLogSlicerType || blLogSlicerFrom || blLogSlicerTo) && (
                <button
                  className="invex-slicer-clear"
                  onClick={() => { setBlLogSlicerUser(""); setBlLogSlicerType(""); setBlLogSlicerFrom(""); setBlLogSlicerTo(""); }}
                >✕ Clear</button>
              )}
              <span className="invex-slicer-count">{blLogFiltered.length} row{blLogFiltered.length !== 1 ? "s" : ""}</span>
            </div>
            <table className="invex-hist-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Activity Type</th>
                  <th>Company ID</th>
                  <th>Logged At</th>
                </tr>
              </thead>
              <tbody>
                {activityLogLoading ? (
                  <tr><td colSpan={4} className="invex-hist-empty">Loading…</td></tr>
                ) : blLogFiltered.length === 0 ? (
                  <tr><td colSpan={4} className="invex-hist-empty">{activityLogs.length === 0 ? "No activity recorded yet." : "No rows match the selected filters."}</td></tr>
                ) : (
                  blLogFiltered.map(row => (
                    <tr key={row.id}>
                      <td>{row.userName || "—"}</td>
                      <td>
                        <span className="invex-status-badge running" style={{ background: "#edf5f7", color: "#1e596b", border: "1px solid #a8cdd6" }}>{row.activityType}</span>
                      </td>
                      <td>{row.companyId || "—"}</td>
                      <td><span className="invex-mono">{new Date(row.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {/* Pagination */}
            {activityLogTotal > ACTIVITY_PAGE_LIMIT && (
              <div className="qbd-pagination">
                <button
                  className="qbd-page-btn"
                  onClick={() => fetchActivityLogs(activityLogPage - 1)}
                  disabled={activityLogPage <= 1}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  Prev
                </button>
                <span className="qbd-page-info">Page {activityLogPage} of {Math.ceil(activityLogTotal / ACTIVITY_PAGE_LIMIT)}</span>
                <button
                  className="qbd-page-btn"
                  onClick={() => fetchActivityLogs(activityLogPage + 1)}
                  disabled={activityLogPage >= Math.ceil(activityLogTotal / ACTIVITY_PAGE_LIMIT)}
                >
                  Next
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// CashfreeEntryPage — Upload raw Cashfree report, process through 10-step
// pipeline, preview results, download processed XLSX.
// Theme: steel-blue-teal (#1e596b / #174858) + white, subtle glassmorphism, animated
//        pipeline tracker with step chips.
// ══════════════════════════════════════════════════════════════════════════════

interface PipelineStep {
  step: number;
  total: number;
  label: string;
  detail: string;
}

const CF_STEPS = [
  { step: 0,  label: "Reading file" },
  { step: 1,  label: "Clean FAILED/REJECTED rows" },
  { step: 2,  label: "Normalise Transfer IDs" },
  { step: 3,  label: "Duplicate check" },
  { step: 4,  label: "Subtotal reconciliation" },
  { step: 5,  label: "Write transfer report" },
  { step: 6,  label: "Enrich account statement" },
  { step: 7,  label: "Build Summary sheet" },
  { step: 8,  label: "Build tally entry sheet" },
  { step: 9,  label: "Finalise & save" },
  { step: 10, label: "Complete" },
];

function CashfreeEntryPage() {
  const [dragOver, setDragOver]       = useState(false);
  const [file, setFile]               = useState<File | null>(null);
  const [processing, setProcessing]   = useState(false);
  const [steps, setSteps]             = useState<PipelineStep[]>([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const [error, setError]             = useState<string | null>(null);
  const [done, setDone]               = useState(false);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [previewCols, setPreviewCols] = useState<string[]>([]);
  const [outputName, setOutputName]   = useState<string>("");
  // pivotData kept for potential future use but not rendered in UI
  const [_pivotData, setPivotData]     = useState<import('@/lib/cashfreeProcessor').PivotDataRow[]>([]);
  // Store the processed workbook in a ref so we can download it without re-processing
  const workbookRef = useRef<import('xlsx').WorkBook | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const detailRef    = useRef<HTMLDivElement>(null);

  const reset = () => {
    setFile(null); setProcessing(false); setSteps([]); setCurrentStep(-1);
    setError(null); setDone(false);
    setPreviewRows([]); setPreviewCols([]); setOutputName("");
    setPivotData([]);
    workbookRef.current = null;
  };

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".xlsx")) {
      setError("Only .xlsx files are accepted.");
      return;
    }
    reset();
    setFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
    e.target.value = "";
  };

  const startProcessing = async () => {
    if (!file) return;
    setProcessing(true); setSteps([]); setCurrentStep(0); setError(null);
    setDone(false); setPreviewRows([]); setPreviewCols([]);
    workbookRef.current = null;

    // ── Fully client-side processing — no server, no SSE, no timeouts ──
    // SheetJS reads the file, all 10 steps run in the browser, workbook is
    // generated in memory and downloaded directly. Zero network dependency.
    try {
      const { processCashfree } = await import("@/lib/cashfreeProcessor");
      const result = await processCashfree(file, (progress) => {
        setCurrentStep(progress.step);
        setSteps(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(s => s.step === progress.step);
          const entry: PipelineStep = {
            step: progress.step,
            total: progress.total,
            label: progress.label,
            detail: progress.detail,
          };
          if (idx >= 0) updated[idx] = entry; else updated.push(entry);
          return updated;
        });
      });

      workbookRef.current = result.workbook;
      setPreviewRows(result.previewRows);
      setPreviewCols(result.previewCols);
      setPivotData(result.pivotData ?? []);
      // Generate output filename from input filename
      const baseName = file.name.replace(/\.xlsx$/i, "");
      setOutputName(`${baseName}_processed.xlsx`);
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? "Processing failed. Please check the file format.");
    } finally {
      setProcessing(false);
    }
  };

  // Auto-scroll detail log
  useEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = detailRef.current.scrollHeight;
  }, [steps]);

  const downloadFile = () => {
    if (!workbookRef.current) return;
    import("@/lib/cashfreeProcessor").then(({ downloadWorkbook }) => {
      downloadWorkbook(workbookRef.current!, outputName || "cashfree_processed.xlsx");
    });
  };

  const completedSteps = steps.map(s => s.step);
  const [previewPage, setPreviewPage] = useState(0);
  const CF_PAGE_SIZE = 10;
  const previewTotalPages = Math.max(1, Math.ceil(previewRows.length / CF_PAGE_SIZE));
  const pagedRows = previewRows.slice(previewPage * CF_PAGE_SIZE, (previewPage + 1) * CF_PAGE_SIZE);

  // Reset preview page when new results come in
  useEffect(() => { setPreviewPage(0); }, [previewRows]);

  const dzClass = ["dropzone", "ready", dragOver ? "dragging" : "", file ? "has-file" : ""].filter(Boolean).join(" ");

  return (
    <div style={{ padding: "28px 20px 52px" }}>
      {/* Page header */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#111", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2"/>
            <line x1="2" y1="10" x2="22" y2="10"/>
            <line x1="6" y1="15" x2="10" y2="15"/>
            <line x1="14" y1="15" x2="18" y2="15"/>
          </svg>
          CashFree Entry
        </h1>
      </div>
      {/* ── BQ-Upload-style hero card ── */}
      <div className="qbd-upload-hero" style={{ marginBottom: "1.5rem" }}>
        {/* Gradient header band */}
        <div className="qbd-hero-header">
          <div className="qbd-hero-title-group">
            <p className="qbd-hero-title">Cashfree Entry — Process &amp; Export</p>
          </div>
          <div className="qbd-hero-steps">
            <div className="qbd-hero-step">
              <div className={`qbd-hero-step-num${file ? (processing || done ? " done" : " active") : ""}`}>1</div>
              <span className="qbd-hero-step-label">Drop File</span>
            </div>
            <div className="qbd-hero-step-sep" />
            <div className="qbd-hero-step">
              <div className={`qbd-hero-step-num${processing ? " active" : done ? " done" : ""}`}>2</div>
              <span className="qbd-hero-step-label">Process</span>
            </div>
            <div className="qbd-hero-step-sep" />
            <div className="qbd-hero-step">
              <div className={`qbd-hero-step-num${done ? " active" : ""}`}>3</div>
              <span className="qbd-hero-step-label">Download</span>
            </div>
          </div>
        </div>

        {/* Two-column body */}
        <div className="qbd-hero-body">
          {/* LEFT — info panel */}
          <div className="qbd-config-panel">
            <div className="qbd-req-box">
              <div className="qbd-req-box-header">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--qbd-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span className="qbd-req-box-title">What this does</span>
              </div>
              <ul className="qbd-req-list">
                <li><strong>Cleans</strong> FAILED / REJECTED rows from transfer report</li>
                <li><strong>Normalises</strong> Transfer IDs and removes duplicates</li>
                <li><strong>Reconciles</strong> transfer report vs account statement totals</li>
                <li><strong>Builds</strong> Summary pivot + tally entry journal rows</li>
                <li><strong>Outputs</strong> a 4-sheet XLSX ready for Tally import</li>
              </ul>
            </div>

            {/* Process / Reset buttons */}
            <div style={{ display: "flex", gap: "0.65rem", marginTop: "1rem" }}>
              <button
                onClick={startProcessing}
                disabled={!file || processing}
                style={{
                  flex: 1,
                  padding: "0.65rem 1rem",
                  background: !file || processing ? "#94a3b8" : "linear-gradient(135deg,#174858,#1e596b)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.88rem",
                  cursor: !file || processing ? "not-allowed" : "pointer",
                  boxShadow: !file || processing ? "none" : "0 2px 8px rgba(30,89,107,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                }}
              >
                {processing ? (
                  <><span style={{ display: "inline-block", width: "12px", height: "12px", border: "2px solid #fff", borderTopColor: "transparent", borderRadius: "50%", animation: "cf-spin 0.7s linear infinite" }} /> Processing…</>
                ) : "▶ Process File"}
              </button>
              {(file || done) && (
                <button
                  onClick={reset}
                  style={{ padding: "0.65rem 1rem", background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: "8px", cursor: "pointer", fontSize: "0.88rem", fontWeight: 500 }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* RIGHT — dropzone */}
          <div className="qbd-dropzone-panel">
            <p className="qbd-dropzone-label">Drop Zone</p>
            <div
              className={dzClass}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => !processing && fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: "none" }} onChange={onFileInput} />
              <div className="qbd-dz-icon-ring">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              {!file ? (
                <>
                  <p className="qbd-dz-title">Drop your Cashfree .xlsx file here</p>
                  <p className="qbd-dz-sub">or drag &amp; drop your file</p>
                  <span className="qbd-dz-browse-hint">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Click to browse or drag &amp; drop
                  </span>
                </>
              ) : (
                <div id="cfFileChip">
                  <span className="qbd-file-chip">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                    <span>{file.name}</span>
                    <button className="qbd-file-chip-remove" title="Remove" onClick={e => { e.stopPropagation(); reset(); }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "0.85rem 1.1rem", marginBottom: "1.25rem", color: "#dc2626", fontSize: "0.875rem", display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
          <span style={{ fontSize: "1rem" }}>⚠️</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "1.1rem", lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── Animated pipeline tracker — always visible ── */}
      <div style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "1.5rem",
        marginBottom: "1.5rem",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
          {processing && (
            <span style={{
              display: "inline-block",
              width: "14px", height: "14px",
              border: "2px solid #1e596b",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "cf-spin 0.7s linear infinite",
            }} />
          )}
          {done && <span style={{ color: "#1e596b", fontSize: "1.1rem" }}>✅</span>}
          {!processing && !done && (
            <span style={{ display: "inline-block", width: "14px", height: "14px", borderRadius: "50%", background: "#e2e8f0" }} />
          )}
          <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "0.95rem" }}>
            {done ? "Processing Complete" : processing ? `Processing… Step ${currentStep} / 10` : "Pipeline Tracker"}
          </span>
        </div>

        {/* Step chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.25rem" }}>
          {CF_STEPS.map(({ step, label }) => {
            const isCompleted = completedSteps.includes(step);
            const isActive    = step === currentStep && processing;
            const isPending   = !isCompleted && !isActive;
            return (
              <div
                key={step}
                style={{
                  display: "flex", alignItems: "center", gap: "0.4rem",
                  padding: "0.35rem 0.75rem",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: isActive || isCompleted ? 600 : 400,
                  background: isCompleted ? "#edf5f7" : isActive ? "rgba(30,89,107,0.1)" : "#f8fafc",
                  border: `1px solid ${isCompleted ? "#a8cdd6" : isActive ? "#1e596b" : "#e2e8f0"}`,
                  color: isCompleted ? "#174858" : isActive ? "#1e596b" : "#94a3b8",
                  transition: "all 0.3s",
                  boxShadow: isActive ? "0 0 0 3px rgba(30,89,107,0.15)" : "none",
                  animation: isActive ? "cf-pulse 1.2s ease-in-out infinite" : "none",
                }}
              >
                {isCompleted && <span style={{ fontSize: "0.75rem" }}>✓</span>}
                {isActive && (
                  <span style={{
                    display: "inline-block", width: "8px", height: "8px",
                    borderRadius: "50%", background: "#1e596b",
                    animation: "cf-dot 0.9s ease-in-out infinite",
                  }} />
                )}
                {isPending && <span style={{ fontSize: "0.7rem", color: "#cbd5e1" }}>○</span>}
                {step === 0 ? "Read" : step === 10 ? "Done" : `${step}. ${label}`}
              </div>
            );
          })}
        </div>

        {/* Detail log */}
        <div
          ref={detailRef}
          style={{
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            maxHeight: "200px",
            overflowY: "auto",
            fontFamily: "monospace",
            fontSize: "0.78rem",
            color: "#334155",
          }}
        >
          {steps.length === 0 && <span style={{ color: "#94a3b8" }}>Upload a file and click Process File to begin…</span>}
          {steps.map((s, i) => (
            <div key={i} style={{ marginBottom: "0.3rem", display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
              <span style={{ color: "#1e596b", fontWeight: 700, minWidth: "60px" }}>Step {s.step}:</span>
              <span style={{ color: "#475569" }}>{s.label}</span>
              {s.detail && <span style={{ color: "#94a3b8" }}>— {s.detail}</span>}
            </div>
          ))}
          {processing && (
            <div style={{ color: "#1e596b", marginTop: "0.25rem" }}>
              <span style={{ animation: "cf-blink 1s step-start infinite" }}>▌</span>
              {" "}Running…
            </div>
          )}
        </div>
      </div>

      {/* ── Download + Dataframe Preview ── */}
      {done && workbookRef.current && (
        <div style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          marginBottom: "1.5rem",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}>
          {/* Header with download button */}
          <div style={{
            background: "linear-gradient(135deg, #174858 0%, #1e596b 100%)",
            padding: "1rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <span style={{ fontWeight: 700, color: "#fff", fontSize: "0.95rem" }}>
                Transfer Report Preview
              </span>
              <span style={{
                background: "rgba(255,255,255,0.18)",
                color: "#e0f2f7",
                fontSize: "0.72rem",
                fontWeight: 600,
                padding: "0.15rem 0.55rem",
                borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.25)",
              }}>
                {previewRows.length} rows
              </span>
            </div>
            <button
              onClick={downloadFile}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.55rem 1.25rem",
                background: "rgba(255,255,255,0.15)",
                border: "1.5px solid rgba(255,255,255,0.5)",
                borderRadius: "8px",
                color: "#fff",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.28)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
              title={`Download ${outputName || "cashfree_processed.xlsx"}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download Excel
            </button>
          </div>
          {/* Dataframe preview table */}
          {previewRows.length > 0 && (
            <div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                  <thead>
                    <tr style={{ background: "#f0f7f9", borderBottom: "2px solid #a8cdd6" }}>
                      {previewCols.map((col, i) => (
                        <th key={i} style={{
                          padding: "0.6rem 0.85rem",
                          textAlign: "left",
                          fontWeight: 700,
                          color: "#174858",
                          whiteSpace: "nowrap",
                          fontSize: "0.72rem",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          borderRight: "1px solid #d1e8ed",
                        }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row, ri) => (
                      <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#f5fbfc", borderBottom: "1px solid #e8f4f7" }}>
                        {previewCols.map((col, ci) => (
                          <td key={ci} style={{
                            padding: "0.5rem 0.85rem",
                            color: "#334155",
                            whiteSpace: "nowrap",
                            borderRight: "1px solid #edf6f8",
                            maxWidth: "220px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}>
                            {row[col] == null ? "" : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {previewTotalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1.25rem", borderTop: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                    Showing rows {previewPage * CF_PAGE_SIZE + 1}–{Math.min((previewPage + 1) * CF_PAGE_SIZE, previewRows.length)} of {previewRows.length}
                  </span>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button
                      onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
                      disabled={previewPage === 0}
                      style={{ padding: "0.3rem 0.75rem", borderRadius: "6px", border: "1px solid #e2e8f0", background: previewPage === 0 ? "#f1f5f9" : "#fff", color: previewPage === 0 ? "#94a3b8" : "#1e596b", cursor: previewPage === 0 ? "default" : "pointer", fontWeight: 600, fontSize: "0.78rem" }}
                    >
                      ← Prev
                    </button>
                    <span style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem", color: "#475569" }}>
                      {previewPage + 1} / {previewTotalPages}
                    </span>
                    <button
                      onClick={() => setPreviewPage(p => Math.min(previewTotalPages - 1, p + 1))}
                      disabled={previewPage === previewTotalPages - 1}
                      style={{ padding: "0.3rem 0.75rem", borderRadius: "6px", border: "1px solid #e2e8f0", background: previewPage === previewTotalPages - 1 ? "#f1f5f9" : "#fff", color: previewPage === previewTotalPages - 1 ? "#94a3b8" : "#1e596b", cursor: previewPage === previewTotalPages - 1 ? "default" : "pointer", fontWeight: 600, fontSize: "0.78rem" }}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
              <div style={{ padding: "0.5rem 1.25rem", background: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: "0.72rem", color: "#94a3b8" }}>
                Showing transfer report data — {previewRows.length} rows total. Download Excel for all 4 sheets.
              </div>
            </div>
          )}
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes cf-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes cf-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(30,89,107,0.15); }
          50%       { box-shadow: 0 0 0 6px rgba(30,89,107,0.08); }
        }
        @keyframes cf-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes cf-blink {
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BqConnectionPage — Admin-only BigQuery OAuth connection settings
// Shows current connection status and a "Connect Google Account" button.
// The owner clicks Connect, completes Google OAuth, then pastes the refresh
// token into Secrets as BQ_OAUTH_REFRESH_TOKEN.
// ══════════════════════════════════════════════════════════════════════════════

function BqConnectionPage() {
  const [status, setStatus] = useState<{
    configured: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasRefreshToken: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetch("/api/bq-oauth/status", { credentials: "include" })
      .then(r => r.json())
      .then(d => setStatus(d))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  function handleConnect() {
    setConnecting(true);
    const origin = window.location.origin;
    window.location.href = `/api/bq-oauth/start?origin=${encodeURIComponent(origin)}`;
  }

  const allGood = status?.configured;
  const missingClient = !status?.hasClientId || !status?.hasClientSecret;
  const missingToken = status?.hasClientId && status?.hasClientSecret && !status?.hasRefreshToken;

  return (
    <div className="qbd-page">
      <div className="qbd-page-header">
        <div className="qbd-page-header-left">
          <h1 className="qbd-page-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            BQ Connection
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 0 2rem" }}>
        {/* Status card */}
        <div style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "1.5rem",
          marginBottom: "1.5rem",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "1rem", color: "#111" }}>
            Connection Status
          </div>

          {loading ? (
            <div style={{ color: "#6b7280", fontSize: "0.9rem" }}>Checking status…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {/* Client ID */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: status?.hasClientId ? "#22c55e" : "#ef4444",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: "0.875rem", color: "#374151" }}>
                  <strong>BQ_OAUTH_CLIENT_ID</strong> — {status?.hasClientId ? "✓ Set" : "✗ Not set"}
                </span>
              </div>
              {/* Client Secret */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: status?.hasClientSecret ? "#22c55e" : "#ef4444",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: "0.875rem", color: "#374151" }}>
                  <strong>BQ_OAUTH_CLIENT_SECRET</strong> — {status?.hasClientSecret ? "✓ Set" : "✗ Not set"}
                </span>
              </div>
              {/* Refresh Token */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: status?.hasRefreshToken ? "#22c55e" : "#f59e0b",
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: "0.875rem", color: "#374151" }}>
                  <strong>BQ_OAUTH_REFRESH_TOKEN</strong> — {status?.hasRefreshToken ? "✓ Connected" : "⚠ Not connected yet"}
                </span>
              </div>

              {/* Overall status banner */}
              <div style={{
                marginTop: "0.5rem",
                padding: "0.75rem 1rem",
                borderRadius: 8,
                background: allGood ? "#f0fdf4" : "#fefce8",
                border: `1px solid ${allGood ? "#bbf7d0" : "#fde68a"}`,
                color: allGood ? "#166534" : "#92400e",
                fontSize: "0.875rem",
                fontWeight: 500,
              }}>
                {allGood
                  ? "✅ BigQuery is connected. All QueryBee users are using your Google account's BQ rights."
                  : missingClient
                    ? "⚠️ Add BQ_OAUTH_CLIENT_ID and BQ_OAUTH_CLIENT_SECRET in Secrets first, then connect."
                    : "⚠️ Click \"Connect Google Account\" below to complete the setup."}
              </div>
            </div>
          )}
        </div>

        {/* Connect button card */}
        <div style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "1.5rem",
          marginBottom: "1.5rem",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "0.5rem", color: "#111" }}>
            Connect Google Account
          </div>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "1.25rem", lineHeight: 1.6 }}>
            Click the button below to sign in with your Google account. You will be redirected to Google's
            consent screen. After granting access, you will receive a refresh token — copy it and save it
            as <code style={{ background: "#f3f4f6", padding: "0.1rem 0.35rem", borderRadius: 4 }}>BQ_OAUTH_REFRESH_TOKEN</code> in Secrets.
          </p>
          <button
            onClick={handleConnect}
            disabled={connecting || missingClient || loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              background: connecting || missingClient ? "#9ca3af" : "#4285F4",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "0.6rem 1.25rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: connecting || missingClient ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {connecting ? "Redirecting to Google…" : "Connect Google Account"}
          </button>
        </div>

        {/* Setup instructions */}
        <div style={{
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          padding: "1.5rem",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontWeight: 600, fontSize: "0.95rem", marginBottom: "1rem", color: "#111" }}>
            One-Time Setup Instructions
          </div>
          <ol style={{ paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <li style={{ fontSize: "0.875rem", color: "#374151", lineHeight: 1.6 }}>
              Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: "#4285F4" }}>GCP Console → APIs &amp; Services → Credentials</a>.
            </li>
            <li style={{ fontSize: "0.875rem", color: "#374151", lineHeight: 1.6 }}>
              Create an <strong>OAuth 2.0 Client ID</strong> (type: <em>Web application</em>).
            </li>
            <li style={{ fontSize: "0.875rem", color: "#374151", lineHeight: 1.6 }}>
              Add <code style={{ background: "#e2e8f0", padding: "0.1rem 0.35rem", borderRadius: 4 }}>{window.location.origin}/api/bq-oauth/callback</code> as an <strong>Authorized Redirect URI</strong>.
            </li>
            <li style={{ fontSize: "0.875rem", color: "#374151", lineHeight: 1.6 }}>
              Copy the Client ID and Client Secret into Secrets as <code style={{ background: "#e2e8f0", padding: "0.1rem 0.35rem", borderRadius: 4 }}>BQ_OAUTH_CLIENT_ID</code> and <code style={{ background: "#e2e8f0", padding: "0.1rem 0.35rem", borderRadius: 4 }}>BQ_OAUTH_CLIENT_SECRET</code>.
            </li>
            <li style={{ fontSize: "0.875rem", color: "#374151", lineHeight: 1.6 }}>
              Click <strong>"Connect Google Account"</strong> above, sign in, and copy the refresh token shown.
            </li>
            <li style={{ fontSize: "0.875rem", color: "#374151", lineHeight: 1.6 }}>
              Save the refresh token as <code style={{ background: "#e2e8f0", padding: "0.1rem 0.35rem", borderRadius: 4 }}>BQ_OAUTH_REFRESH_TOKEN</code> in Secrets. Done!
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
