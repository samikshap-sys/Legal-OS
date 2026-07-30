/**
 * Legal Connect Dashboard
 * Exact replica of finops_v1/finops_legal/fynd-legal-portal.html
 * Live data from Google Sheets via tRPC
 */

import React, { useEffect, useState } from "react";
// PDF generation is now server-side via /api/lc/pdf/dashboard
import "../legal-dashboard.css";
import { trpc } from "@/lib/trpc"
import { useLcUser } from "@/contexts/LcUserContext";
import { FyndHeartIcon } from "./LegalConnect";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";

import { Bar, Doughnut } from "react-chartjs-2";
import { Link } from "wouter";
import LegalUserManagement from "./LegalUserManagement";

function getDriveImageUrl(url: string): string {
  if (!url) return '';
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w120`;
  return url;
}

ChartJS.register(
  ArcElement, BarElement, CategoryScale, LinearScale,
  Title, Tooltip, Legend, ChartDataLabels
);

// ── Sidebar nav items ──────────────────────────────────────────────────────
type Page = "dashboard" | "tracker" | "requests" | "workflows" | "team" | "templates" | "requests-logs" | "fynds-ipr" | "litigation" | "user-management";

// Admin emails — only these users can update status and delete workflow cards
const LC_ADMIN_EMAILS = new Set([
  'ninadmandavkar@gofynd.com',
  'aditisinha@gofynd.com',
  'samikshap@gofynd.com',
  'farheenansari@gofynd.com',
]);

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard",      icon: "fa-gauge-high" },
  { id: "tracker",   label: "Live Tracker",   icon: "fa-table-list" },
  { id: "requests",  label: "Requests",       icon: "fa-inbox" },
  { id: "workflows", label: "Workflows",      icon: "fa-rotate" },
  { id: "templates", label: "Downloads",      icon: "fa-folder-open" },
];

// ── Status pill ────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const cls =
    status === "Open"    ? "lc-pill lc-p-o"  :
    status === "Closed"  ? "lc-pill lc-p-cl" :
    status === "On Hold" ? "lc-pill lc-p-h"  :
    "lc-pill lc-p-x";
  return <span className={cls}>{status || "—"}</span>;
}

const CHART_COLORS = {
  orange:    "#092045",
  dark:      "#1C1C1E",
  amber:     "#D97706",
  teal:      "#0d6e6e",
  tealLight: "#14b8a6",
  slate:     "#64748b",
  red:       "#ef4444",
  green:     "#16a34a",
  purple:    "#7c3aed",
  blue:      "#2563eb",
};

const PALETTE_6 = [CHART_COLORS.orange, CHART_COLORS.dark, CHART_COLORS.amber, CHART_COLORS.teal, CHART_COLORS.blue, CHART_COLORS.purple];

// Orange-black gradient palette for multi-bar charts
const OB_PALETTE = [
  "#092045", "#1C1C1E", "#D97706", "#3D1A0A", "#FF7043",
  "#4A2010", "#E8440A", "#2A2A2A", "#FF8C42", "#0D0D0D",
];

// Rich multicolour palette — 15 distinct colours for per-bar colouring
const MULTI_PALETTE = [
  "#092045", // orange
  "#2563eb", // blue
  "#16a34a", // green
  "#D97706", // amber
  "#7c3aed", // purple
  "#0d6e6e", // teal
  "#ef4444", // red
  "#0891b2", // cyan
  "#ca8a04", // yellow-dark
  "#be185d", // pink
  "#1C1C1E", // near-black
  "#059669", // emerald
  "#9333ea", // violet
  "#ea580c", // deep-orange
  "#0369a1", // sky-dark
];
// Helper: cycle through MULTI_PALETTE for n items
const multiColors = (n: number) => Array.from({ length: n }, (_, i) => MULTI_PALETTE[i % MULTI_PALETTE.length]);

// Status colour map for aging/amount charts
const STATUS_COLOR: Record<string, string> = {
  "Open": "#092045",
  "Under Discussion": "#D97706",
  "Partial Recovery": "#FF7043",
  "Closed": "#1C1C1E",
};
const statusColor = (s: string) => STATUS_COLOR[s] || "#9aa0ab";

const COMMON_TOOLTIP = { backgroundColor: "#202124", titleColor: "#fff", bodyColor: "rgba(255,255,255,0.75)", padding: 10, cornerRadius: 8 };
const COMMON_LEGEND  = { position: "bottom" as const, labels: { padding: 14, font: { size: 12, weight: "500" as const }, boxWidth: 18, boxHeight: 10, color: "#5f6368" } };
const COMMON_DATALABELS_HIDDEN = { datalabels: { display: false } };

function toBarData(counts: Record<string, number>, topN = 8) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
}

function toDoughnutData(counts: Record<string, number>, colors: string[]) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return {
    labels: entries.map(([k]) => k),
    datasets: [{
      data: entries.map(([, v]) => v),
      backgroundColor: entries.map((_, i) => colors[i % colors.length]),
      borderColor: "#ffffff",
      borderWidth: 2,
      hoverOffset: 6,
    }],
  };
}

function SmallCard({ title, chip, children }: { title: string; chip?: string; children: React.ReactNode }) {
  return (
    <div className="lc-card" style={{ marginBottom: 0 }}>
      <div className="lc-card-hd">
        <span className="lc-card-title">{title}</span>
        {chip && <span className="lc-chip">{chip}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Dashboard page ─────────────────────────────────────────────────────────
function DashboardPage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const { data: kpis, isLoading: kLoading, refetch: refetchKpis } = trpc.legal.kpis.useQuery();
  const { data: statusData } = trpc.legal.chartStatus.useQuery();
  const { data: docData }    = trpc.legal.chartDoctypes.useQuery();
  const { data: regionData } = trpc.legal.chartRegionStatus.useQuery();
  const { data: recent }     = trpc.legal.recent.useQuery();
  const [refreshing, setRefreshing] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetchKpis();
    setRefreshing(false);
  };

  const downloadDashboardPdf = async () => {
    setPdfLoading(true);
    try {
      // Server-side PDF generation via Puppeteer — avoids all html2canvas CORS/taint issues
      const res = await fetch('/api/lc/pdf/dashboard', {
        method: 'GET',
        credentials: 'include',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || `Server returned ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `legal-dashboard-${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed', err);
      alert(`PDF generation failed: ${(err as Error)?.message || 'Please try again.'}`);
    } finally {
      setPdfLoading(false);
    }
  };

  const downloadDashboardCsv = () => {
    const lines: string[] = [];
    // KPI summary
    lines.push('Dashboard KPI Summary');
    lines.push('Metric,Value');
    lines.push(`Total Records,${kpis?.total ?? ''}`);
    lines.push(`Open,${kpis?.open_count ?? ''}`);
    lines.push(`Closed,${kpis?.closed_count ?? ''}`);
    lines.push(`On Hold,${kpis?.on_hold_count ?? ''}`);
    lines.push(`Pending,${kpis?.pending_count ?? ''}`);
    lines.push(`Reviewers,${kpis?.reviewer_count ?? ''}`);
    lines.push('');
    // Status breakdown
    if (statusData?.length) {
      lines.push('Status Breakdown');
      lines.push('Status,Count');
      statusData.forEach(r => lines.push(`${r.status},${r.cnt}`));
      lines.push('');
    }
    // Document types
    if (docData?.length) {
      lines.push('Top Document Types');
      lines.push('Document Type,Count');
      docData.forEach(r => lines.push(`"${r.label.replace(/"/g,'""')}",${r.cnt}`));
      lines.push('');
    }
    // Region/status breakdown
    if (regionData?.length) {
      lines.push('Region Status Breakdown');
      lines.push('Region,Status,Count');
      regionData.forEach(r => lines.push(`"${(r.region||'').replace(/"/g,'""')}",${r.status},${r.cnt}`));
      lines.push('');
    }
    // Recent contracts
    if (recent?.length) {
      lines.push('Recent Contracts');
      lines.push('Counter Party,Document Type,Description,Business Segment,Request Date,Status,Reviewer');
      recent.forEach(r => lines.push(
        `"${(r.Brand_Name||'').replace(/"/g,'""')}","${(r.Document_type||'').replace(/"/g,'""')}","${(r.Description_Docs||'').replace(/"/g,'""')}","${(r.Business_Segment||'').replace(/"/g,'""')}",${r.Request_Date||''},${r.Current_Status||''},"${(r.Reviewer||'').replace(/"/g,'""')}"`
      ));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'legal-dashboard-kpis.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Donut chart — navy/cream palette: Closed=darkest navy, On Hold=slate navy, Pending=cream accent, Open=navy
  const STATUS_DONUT_COLOR: Record<string, string> = {
    Open:    "#092045",  // primary navy
    Closed:  "#030B18",  // near-black navy (anchors dominant slice)
    "On Hold": "#3B5A85", // slate navy
    Pending: "#F6E5BC",  // cream accent
  };
  const donutData = statusData ? {
    labels: statusData.map(r => r.status),
    datasets: [{
      data: statusData.map(r => Number(r.cnt)),
      backgroundColor: statusData.map(r => STATUS_DONUT_COLOR[r.status] || "#D9C9A0"),
      borderColor: "#ffffff",
      borderWidth: 3,
      hoverOffset: 8,
    }],
  } : null;

  const donutTotal = statusData ? statusData.reduce((a, b) => a + Number(b.cnt), 0) : 0;

  const donutOptions: any = {
    responsive: true,
    maintainAspectRatio: true,
    cutout: "58%",
    plugins: {
      legend: { position: "bottom", labels: { padding: 16, font: { size: 13, weight: "500" }, boxWidth: 20, boxHeight: 12, color: "#5f6368",
        generateLabels: (chart: any) => chart.data.labels.map((label: string, i: number) => ({
          text: label,
          fillStyle: chart.data.datasets[0].backgroundColor[i],
          strokeStyle: '#fff',
          lineWidth: 1,
          index: i,
        })),
      }},
      tooltip: { backgroundColor: "#202124", titleColor: "#fff", bodyColor: "rgba(255,255,255,0.75)", padding: 10, cornerRadius: 8,
        callbacks: { label: (ctx: any) => ` ${ctx.label}: ${ctx.raw} contracts (${Math.round(ctx.raw / donutTotal * 100)}%)` } },
      // Show percentage only on segments; count accessible via tooltip
      datalabels: { color: "#fff", font: { size: 12, weight: "700" },
        formatter: (value: number) => { const pct = Math.round(value / donutTotal * 100); return pct >= 5 ? `${pct}%` : ""; },
        anchor: "center", align: "center", textAlign: "center" },
    },
  };

  // Region stacked bar
  const regions = regionData ? Array.from(new Set(regionData.map(r => r.region))) : [];
  const pickCnt = (reg: string, st: string) => {
    const row = regionData?.find(r => r.region === reg && r.status === st);
    return row ? row.cnt : 0;
  };
  const regionBarData = regions.length ? {
    labels: regions,
    datasets: [
      { label: "Open",    data: regions.map(r => pickCnt(r, "Open")),    backgroundColor: "#092045", borderRadius: 4, barThickness: 22 },
      { label: "Closed",  data: regions.map(r => pickCnt(r, "Closed")),  backgroundColor: "#030B18", borderRadius: 4, barThickness: 22 },
      { label: "On Hold", data: regions.map(r => pickCnt(r, "On Hold")), backgroundColor: "#3B5A85", borderRadius: 4, barThickness: 22 },
    ],
  } : null;

  const regionBarOptions: any = {
    indexAxis: "y", responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: "top", labels: { padding: 16, font: { size: 12, weight: "500" }, boxWidth: 20, boxHeight: 12, color: "#5f6368" } },
      tooltip: { backgroundColor: "#202124", titleColor: "#fff", bodyColor: "rgba(255,255,255,0.75)", padding: 10, cornerRadius: 8, mode: "index" },
      datalabels: { color: "#fff", font: { size: 11, weight: "600" }, formatter: (v: number) => v > 0 ? v : "", anchor: "center", align: "center", clamp: true },
    },
    scales: {
      x: { stacked: true, grid: { color: "rgba(0,0,0,0.05)" }, ticks: { font: { size: 11 }, color: "#5f6368" }, border: { display: false }, beginAtZero: true },
      y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, color: "#5f6368" }, border: { display: false } },
    },
  };

  // Doc types bar
  const barPalette = ["#092045","#051329","#FF7043","#FF8A65","#FFAB91","#1C1C1E"];
  const docBarData = docData ? {
    labels: docData.map(r => r.label),
    datasets: [{
      label: "Contracts",
      data: docData.map(r => Number(r.cnt)),
      backgroundColor: barPalette.slice(0, docData.length),
      borderRadius: 6, barThickness: 44,
    }],
  } : null;

  const docBarOptions: any = {
    responsive: true, maintainAspectRatio: false,
    layout: { padding: { top: 24 } },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: "#202124", titleColor: "#fff", bodyColor: "rgba(255,255,255,0.75)", padding: 10, cornerRadius: 8 },
      datalabels: { anchor: "end", align: "end", offset: 2, color: "#092045", font: { size: 13, weight: "700" }, formatter: (v: number) => v },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#5f6368" }, border: { display: false } },
      y: { grid: { color: "rgba(0,0,0,0.05)" }, ticks: { font: { size: 11 }, color: "#5f6368", maxTicksLimit: 6 }, border: { display: false }, beginAtZero: true },
    },
  };

  return (
    <div className="lc-pg-content">
      {/* Page header */}
      <div className="lc-ph-row">
        <h1 className="lc-ph-h">Dashboard</h1>
        <div className="lc-ph-actions">
          <button className={`lc-btn-refresh${refreshing ? " spinning" : ""}`} onClick={handleRefresh}>
            <i className="fa-solid fa-rotate"></i> Refresh
          </button>
          <button className="lc-btn-refresh" onClick={downloadDashboardPdf} title="Download Dashboard as PDF" disabled={pdfLoading} style={pdfLoading ? { opacity: 0.7, cursor: 'not-allowed' } : {}}>
            <i className={`fa-solid ${pdfLoading ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i>
            {pdfLoading ? ' Generating…' : ' Download PDF'}
          </button>
          <button className="lc-btn-submit" onClick={() => onNavigate('requests')}>
            <i className="fa-solid fa-plus"></i> Submit Request
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="lc-kpi-row">
        <div className="lc-kpi">
          <div className="lc-kpi-lbl">TOTAL RECORDS</div>
          <div className="lc-kpi-val">{kLoading ? "…" : kpis?.total ?? "—"}</div>
          <div className="lc-kpi-sub">Always live</div>
        </div>
        <div className="lc-kpi">
          <div className="lc-kpi-lbl">CLOSED</div>
          <div className="lc-kpi-val">{kLoading ? "…" : kpis?.closed_count ?? "—"}</div>
          <div className="lc-kpi-sub">Resolved</div>
        </div>
        <div className="lc-kpi">
          <div className="lc-kpi-lbl">ON HOLD</div>
          <div className="lc-kpi-val">{kLoading ? "…" : kpis?.on_hold_count ?? "—"}</div>
          <div className="lc-kpi-sub">Awaiting action</div>
        </div>
        <div className="lc-kpi">
          <div className="lc-kpi-lbl">PENDING</div>
          <div className="lc-kpi-val">{kLoading ? "…" : kpis?.pending_count ?? "—"}</div>
          <div className="lc-kpi-sub">Awaiting response</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="lc-charts-row">
        <div className="lc-card">
          <div className="lc-card-hd">
            <span className="lc-card-title">Contract Status Breakdown</span>
            <span className="lc-chip">{donutTotal} RECORDS</span>
          </div>
          <div className="lc-card-sub">Distribution across all active records</div>
          <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {donutData ? <Doughnut data={donutData} options={donutOptions} /> : <div className="lc-loading">Loading…</div>}
          </div>
        </div>
        <div className="lc-card">
          <div className="lc-card-hd">
            <span className="lc-card-title">Agreement Status by Region</span>
            <span className="lc-chip lc-chip-live">LIVE</span>
          </div>
          <div className="lc-card-sub">Open vs Closed vs On Hold per region</div>
          <div style={{ height: 280 }}>
            {regionBarData ? <Bar data={regionBarData} options={regionBarOptions} /> : <div className="lc-loading">Loading…</div>}
          </div>
        </div>
      </div>

      {/* Requests by Document Type chart removed per user request */}
    </div>
  );
}

// ── Fynd's IPR page (Trade Mark Sheet, moved off the Dashboard) ────────────
function IPRPage() {
  const { data: tmRows } = trpc.legal.tmSheetRows.useQuery();
  const [tmPage, setTmPage] = useState(1);
  const TM_PAGE_SIZE = 7;

  return (
    <div className="lc-pg-content">
      {/* Page header */}
      <div className="lc-ph-row">
        <h1 className="lc-ph-h">Fynd's IPR</h1>
      </div>

      {/* ── Trademark Sheet Table ─────────────────────────────────────── */}
      <div className="lc-card" style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
        <div className="lc-card-hd">
          <span className="lc-card-title">Trade Mark Sheet</span>
          {tmRows && <span className="lc-chip">{tmRows.length} RECORDS</span>}
        </div>
        <div className="lc-card-sub">Registered &amp; in-process trademarks — up to Valid Upto</div>
        {!tmRows ? (
          <div className="lc-loading">Loading…</div>
        ) : (() => {
          const tmTotalPages = Math.max(1, Math.ceil(tmRows.length / TM_PAGE_SIZE));
          const tmPageRows = tmRows.slice((tmPage - 1) * TM_PAGE_SIZE, tmPage * TM_PAGE_SIZE);
          return (
            <>
              <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
                <table className="tm-sheet-table">
                  <thead>
                    <tr>
                      <th>Trademark Name</th>
                      <th>Trademark Image</th>
                      <th>Nature</th>
                      <th>Class</th>
                      <th>Status</th>
                      <th>Application No.</th>
                      <th>Certificate Sr. No.</th>
                      <th>Certificate Start Date</th>
                      <th>Valid Upto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tmPageRows.map((row, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{row['Trademark Name'] || '—'}</td>
                        <td style={{ textAlign: 'center', minWidth: 90 }}>
                          {row['Trademark Image'] ? (
                            <img
                              src={getDriveImageUrl(row['Trademark Image'])}
                              alt={row['Trademark Name'] || 'TM'}
                              style={{ maxHeight: 40, maxWidth: 80, objectFit: 'contain', display: 'block', margin: '0 auto' }}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : <span style={{ color: '#9aa0ab', fontSize: '0.8rem' }}>No image</span>}
                        </td>
                        <td>{row['Nature'] || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{row['Class'] || '—'}</td>
                        <td>
                          <span className={`tm-status-pill tm-status-${(row['Status'] || '').toLowerCase().replace(/\s+/g,'-')}`}>
                            {row['Status'] || '—'}
                          </span>
                        </td>
                        <td>{row['Application No.'] || '—'}</td>
                        <td>{row['Certificate Sr. No.'] || '—'}</td>
                        <td>{row['Certificate Start Date'] || '—'}</td>
                        <td style={{ fontWeight: 500, color: '#1C1C1E' }}>{row['Valid Upto'] || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {tmTotalPages > 1 && (
                <div className="lc-pg-nav" style={{ marginTop: '0.75rem', justifyContent: 'flex-end' }}>
                  <button className="lc-pg-btn" disabled={tmPage <= 1} onClick={() => setTmPage(p => p - 1)}>
                    <i className="fa-solid fa-chevron-left"></i>
                  </button>
                  <span className="lc-pg-info">Page {tmPage} of {tmTotalPages}</span>
                  <button className="lc-pg-btn" disabled={tmPage >= tmTotalPages} onClick={() => setTmPage(p => p + 1)}>
                    <i className="fa-solid fa-chevron-right"></i>
                  </button>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ── Litigation page (Claims By Fynd / Claims Against Fynd) ─────────────────
const LIT_KNOWN_STATUSES = new Set([
  'closed', 'partial-recovery', 'under-discussion', 'arbitration-initiated',
  'demand-notice-sent', 'negotiation', '1st-reply-to-notice', '2nd-reply-to-notice', '3rd-reply-to-notice',
]);

function LitStatusPill({ status }: { status: string }) {
  if (!status) return <span style={{ color: '#9aa0ab' }}>—</span>;
  const slug = status.toLowerCase().trim().replace(/\s+/g, '-');
  const cls = LIT_KNOWN_STATUSES.has(slug) ? `lit-status-${slug}` : 'lit-status-default';
  return <span className={`lit-status-pill ${cls}`}>{status}</span>;
}

function LitigationPage() {
  const { data: byFyndRows }      = trpc.legal.claimsByFyndRows.useQuery();
  const { data: againstFyndRows } = trpc.legal.claimsAgainstFyndRows.useQuery();

  return (
    <div className="lc-pg-content">
      {/* Page header */}
      <div className="lc-ph-row">
        <h1 className="lc-ph-h">Litigation</h1>
      </div>

      {/* ── Claims By Fynd ───────────────────────────────────────────── */}
      <div className="lc-card" style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
        <div className="lc-card-hd">
          <span className="lc-card-title">Claims By Fynd</span>
          {byFyndRows && <span className="lc-chip">{byFyndRows.length} CLAIMS</span>}
        </div>
        <div className="lc-card-sub">Claims raised by Fynd against counterparties</div>
        {!byFyndRows ? (
          <div className="lc-loading">Loading…</div>
        ) : byFyndRows.length === 0 ? (
          <div style={{ color: '#9aa0ab', fontSize: '0.85rem', padding: '1rem 0' }}>No claims on record.</div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table className="tm-sheet-table">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Date of Default</th>
                  <th>Cause of Action</th>
                  <th>Net Recoverable Amount</th>
                  <th>Matter Handled by</th>
                  <th>Contract Termination Date</th>
                  <th>Demand Notice Date</th>
                  <th>Legal Notice Date</th>
                  <th>Arbitration Notice Date</th>
                  <th>Ageing (Days)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {byFyndRows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row['Company Name'] || '—'}</td>
                    <td>{row['Date of Default'] || '—'}</td>
                    <td>{row['Cause of Action'] || '—'}</td>
                    <td style={{ fontWeight: 500, color: '#1C1C1E' }}>{row['Net Recoverable Amount'] || '—'}</td>
                    <td>{row['Matter Handled by'] || '—'}</td>
                    <td>{row['Contract Termination Date'] || '—'}</td>
                    <td>{row['Demand Notice Date'] || '—'}</td>
                    <td>{row['Legal Notice Date'] || '—'}</td>
                    <td>{row['Arbitration Notice Date'] || '—'}</td>
                    <td>{row['Ageing Analysis'] || '—'}</td>
                    <td><LitStatusPill status={row['Status']} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Claims Against Fynd ──────────────────────────────────────── */}
      <div className="lc-card" style={{ overflowX: "auto" }}>
        <div className="lc-card-hd">
          <span className="lc-card-title">Claims Against Fynd</span>
          {againstFyndRows && <span className="lc-chip">{againstFyndRows.length} CLAIMS</span>}
        </div>
        <div className="lc-card-sub">Claims raised against Fynd by counterparties</div>
        {!againstFyndRows ? (
          <div className="lc-loading">Loading…</div>
        ) : againstFyndRows.length === 0 ? (
          <div style={{ color: '#9aa0ab', fontSize: '0.85rem', padding: '1rem 0' }}>No claims on record.</div>
        ) : (
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table className="tm-sheet-table">
              <thead>
                <tr>
                  <th>Company Name</th>
                  <th>Amount in Dispute</th>
                  <th>Cause of Action</th>
                  <th>Account Manager</th>
                  <th>Matter Handled By</th>
                  <th>Notice Received On</th>
                  <th>Arbitration Notice Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {againstFyndRows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{row['Company Name'] || '—'}</td>
                    <td style={{ fontWeight: 500, color: '#1C1C1E' }}>{row['Amount in Dispute'] || '—'}</td>
                    <td>{row['Cause of Action'] || '—'}</td>
                    <td>{row['Account Manager'] || '—'}</td>
                    <td>{row['Matter Handled By'] || '—'}</td>
                    <td>{row['Notice Received On'] || '—'}</td>
                    <td>{row['Arbitration Notice Date'] || '—'}</td>
                    <td><LitStatusPill status={row['Status']} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Live Tracker page ──────────────────────────────────────────────────────
function TrackerPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [segment, setSegment] = useState("");
  const [docType, setDocType] = useState("");
  const [custType, setCustType] = useState("");
  const [trkPage, setTrkPage] = useState(1);

  const filters = { status, segment, docType, customerType: custType, search };

  // Reset page when any filter changes
  React.useEffect(() => { setTrkPage(1); }, [search, status, segment, docType, custType]);
  const { data: rows, isLoading, refetch } = trpc.legal.contracts.useQuery(filters);
  const { data: opts } = trpc.legal.filterOptions.useQuery();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const open   = rows ? rows.filter(r => r.Current_Status === "Open").length : 0;
  const closed = rows ? rows.filter(r => r.Current_Status === "Closed").length : 0;
  const hold   = rows ? rows.filter(r => r.Current_Status === "On Hold").length : 0;
  const total  = rows ? rows.length : 0;

  const COLS = [
    { key: "Request_Date",     label: "Request Date"  },
    { key: "Brand_Name",       label: "2nd Party"     },
    { key: "Customer_Type",    label: "Customer Type" },
    { key: "Business_Segment", label: "Segment"       },
    { key: "Document_type",    label: "Doc Type"      },
    { key: "Current_Status",   label: "Status"        },
    { key: "End_Date",         label: "End Date"      },
    { key: "Deal_Value",       label: "Deal Value"    },
    { key: "Ageing",           label: "Ageing"        },
    { key: "Reviewer",         label: "Reviewer"      },
    { key: "Signed_Doc_Link",  label: "Signed Doc"    },
  ];

  const downloadTrackerCsv = () => {
    if (!rows?.length) return;
    const headers = COLS.map(c => c.label);
    const csvRows = rows.map(r =>
      COLS.map(c => {
        const v = String((r as any)[c.key] ?? '');
        return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    );
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'live-tracker.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lc-pg-content">
      {/* Page header */}
      <div className="lc-ph-row">
        <h1 className="lc-ph-h">Live Contract Tracker</h1>
        <div className="lc-ph-actions">
          <button className={`lc-btn-refresh${refreshing ? " spinning" : ""}`} onClick={handleRefresh}>
            <i className="fa-solid fa-rotate"></i> Refresh
          </button>
          <button className="lc-btn-refresh" onClick={downloadTrackerCsv} disabled={!rows?.length} title="Download all records as CSV">
            <i className="fa-solid fa-download"></i> Download CSV
          </button>
        </div>
      </div>

      {/* KPI cards — white bg, colored values, top accent bar */}
      <div className="trk-kpi-row">
        <div className="trk-kpi">
          <div className="trk-kpi-lbl">Total Records</div>
          <div className="trk-kpi-val" style={{color:"#416dff"}}>{isLoading ? "…" : total}</div>
          <div className="trk-kpi-sub">Always live</div>
        </div>
        <div className="trk-kpi">
          <div className="trk-kpi-lbl">Open</div>
          <div className="trk-kpi-val" style={{color:"#d97706"}}>{isLoading ? "…" : open}</div>
          <div className="trk-kpi-sub">{total ? ((open / total) * 100).toFixed(0) : 0}% of total</div>
        </div>
        <div className="trk-kpi">
          <div className="trk-kpi-lbl">Closed</div>
          <div className="trk-kpi-val" style={{color:"#059669"}}>{isLoading ? "…" : closed}</div>
          <div className="trk-kpi-sub">{total ? ((closed / total) * 100).toFixed(0) : 0}% resolved</div>
        </div>
        <div className="trk-kpi">
          <div className="trk-kpi-lbl">On Hold</div>
          <div className="trk-kpi-val" style={{color:"#0891b2"}}>{isLoading ? "…" : hold}</div>
          <div className="trk-kpi-sub">Awaiting action</div>
        </div>
      </div>

      {/* Search + filters row */}
      <div className="trk-meta-row">
        <div className="trk-search-wrap">
          <i className="fa-solid fa-magnifying-glass trk-search-ico"></i>
          <input
            className="trk-search-in"
            placeholder="Search by party, doc type, segment…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="trk-filter-group">
          <select className="trk-fsel" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Statuses</option>
            <option>Open</option>
            <option>Closed</option>
            <option>On Hold</option>
          </select>
          <select className="trk-fsel" value={segment} onChange={e => setSegment(e.target.value)}>
            <option value="">Segments</option>
            {opts?.segments.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="trk-fsel" value={docType} onChange={e => setDocType(e.target.value)}>
            <option value="">Doc Types</option>
            {opts?.docTypes.map(d => <option key={d}>{d}</option>)}
          </select>
          <select className="trk-fsel" value={custType} onChange={e => setCustType(e.target.value)}>
            <option value="">Cust Types</option>
            {opts?.customerTypes.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Table in white card */}
      <div className="trk-table-card">
        {/* Table header — matches Request Logs design */}
        <div className="rl-table-header">
          <div className="rl-table-title">
            <i className="fa-solid fa-table-list" style={{marginRight:8,color:"#092045"}}></i>
            Live Contract Tracker
          </div>
          <span className="rl-record-count">{!isLoading && rows ? `${rows.length} records` : ''}</span>
        </div>
        <div className="trk-scroll-x">
          <table className="trk-tbl">
            <thead>
              <tr>{COLS.map(c => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={COLS.length} className="trk-empty-cell">Loading…</td></tr>
              ) : !rows?.length ? (
                <tr><td colSpan={COLS.length} className="trk-empty-cell">No records match the selected filters.</td></tr>
              ) : (() => {
                const TRK_PAGE_SIZE = 15;
                const trkTotalPages = Math.max(1, Math.ceil(rows.length / TRK_PAGE_SIZE));
                const pagedRows = rows.slice((trkPage - 1) * TRK_PAGE_SIZE, trkPage * TRK_PAGE_SIZE);
                return pagedRows.map((r: any, i: number) => {
                  const s  = r.Current_Status || "";
                  const pc = s === "Open" ? "trk-p-o" : s === "Closed" ? "trk-p-cl" : s === "On Hold" ? "trk-p-h" : "trk-p-x";
                  return (
                    <tr key={i}>
                      {COLS.map(c => {
                        if (c.key === "Current_Status") return <td key={c.key} style={{whiteSpace:'nowrap'}}><span className={`trk-pill ${pc}`}>{s || "—"}</span></td>;
                        if (c.key === "Signed_Doc_Link") {
                          // Prefer the Drive URL from column Q (Remarks/Email Thread), fall back to col P filename
                          const driveUrl = String((r as any).Drive_Doc_URL || "");
                          const filename = String((r as any).Signed_Doc_Link || "");
                          const isValidUrl = (s: string) => s.startsWith('http://') || s.startsWith('https://');

                          if (isValidUrl(driveUrl)) {
                            // Column Q has a real Drive URL — open it directly
                            return (
                              <td key={c.key} style={{textAlign:'center'}}>
                                <a
                                  href={driveUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={filename || driveUrl}
                                  className="trk-dl-btn"
                                >
                                  <i className="fa-solid fa-file-arrow-down"></i>
                                </a>
                              </td>
                            );
                          }

                          if (!filename) return <td key={c.key} style={{textAlign:'center', color:'#bbb'}}>—</td>;

                          // No URL available — show a disabled icon with the filename as tooltip
                          return (
                            <td key={c.key} style={{textAlign:'center'}}>
                              <span
                                title={filename}
                                className="trk-dl-btn"
                                style={{opacity: 0.35, cursor: 'default'}}
                              >
                                <i className="fa-solid fa-file-pdf"></i>
                              </span>
                            </td>
                          );
                        }
                        if (c.key === "Document_type") {
                          const v = String((r as any)[c.key] || "");
                          return <td key={c.key} style={{whiteSpace:'nowrap'}} title={v}>{v || "—"}</td>;
                        }
                        const v  = String((r as any)[c.key] || "");
                        const vs = v.length > 40 ? v.substring(0, 40) + "…" : v;
                        return <td key={c.key} title={v}>{vs || "—"}</td>;
                      })}
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {rows && rows.length > 15 && (() => {
          const TRK_PAGE_SIZE = 15;
          const trkTotalPages = Math.max(1, Math.ceil(rows.length / TRK_PAGE_SIZE));
          return (
            <div className="qbd-pagination" style={{ padding: "10px 16px" }}>
              <button className="qbd-page-btn" disabled={trkPage === 1} onClick={() => setTrkPage(p => p - 1)}>← Prev</button>
              <span className="qbd-page-info">Page {trkPage} of {trkTotalPages} &nbsp;·&nbsp; {rows.length} records</span>
              <button className="qbd-page-btn" disabled={trkPage === trkTotalPages} onClick={() => setTrkPage(p => p + 1)}>Next →</button>
            </div>
          );
        })()}
        <div className="trk-row-count">
          {rows ? `Showing ${Math.min(15, rows.length - (trkPage - 1) * 15)} of ${rows.length} records` : ""}
        </div>
      </div>
    </div>
  );
}

// ── Team page ──────────────────────────────────────────────────────────────
const TEAM_META: Record<string, { gradient: string; initials: string; role: string; email: string }> = {
  Farheen:  { gradient: "linear-gradient(135deg,#092045,#051329)", initials: "FA", role: "Head of Legal",           email: "farheen.ansari@gofynd.com" },
  Aditi:    { gradient: "linear-gradient(135deg,#3B5A85,#092045)", initials: "AS", role: "Legal Associate",          email: "aditi.sinha@gofynd.com" },
  Samiksha: { gradient: "linear-gradient(135deg,#092045,#6B87AB)", initials: "SP", role: "Legal Associate",          email: "samiksha.parekh@gofynd.com" },
  Sreshta:  { gradient: "linear-gradient(135deg,#1C1C1E,#092045)", initials: "SR", role: "Legal Associate",          email: "sreshtha@gofynd.com" },
};

function TeamPage() {
  const { data: statsData, isLoading, refetch } = trpc.legal.teamStats.useQuery(
    undefined,
    { refetchInterval: 24 * 60 * 60 * 1000 } // auto-refresh every 24h
  );

  if (isLoading) {
    return (
      <div className="lc-pg-content">
        <div className="lc-loading">Loading team stats…</div>
      </div>
    );
  }

  const members = statsData?.members ?? [];
  const lastUpdated = statsData?.lastUpdated ?? null;
  const grandTotal = members.reduce((s, m) => s + m.total, 0);

  return (
    <div className="lc-pg-content">
      {/* Header */}
      <div className="lc-ph-row">
        <h1 className="lc-ph-h">The Legal Team</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {lastUpdated && (
            <span style={{ fontSize: '0.72rem', color: '#9AA0AB' }}>
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </span>
          )}
          <button className="lc-btn-refresh" onClick={() => refetch()}>
            <i className="fa-solid fa-rotate"></i> Refresh
          </button>
        </div>
      </div>

      {/* Team Activity Table */}
      <div className="team-activity-card">
        <div className="team-act-hd">
          <span className="team-act-ico">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </span>
          <span className="team-act-title">TEAM ACTIVITY</span>
        </div>
        <table className="team-table">
          <thead>
            <tr>
              <th>REVIEWER</th>
              <th>TOTAL</th>
              <th>OPEN</th>
              <th>CLOSED</th>
              <th>ON HOLD</th>
              <th>RESOLVED</th>
              <th>WORKLOAD</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const meta = TEAM_META[m.member] || { gradient: "linear-gradient(135deg,#092045,#051329)", initials: m.member.substring(0, 2).toUpperCase(), role: "Legal Team", email: "" };
              const resolvedPct = m.total > 0 ? Math.round((m.closed_count / m.total) * 100) : 0;
              const workloadPct = grandTotal > 0 ? Math.round((m.total / grandTotal) * 100) : 0;
              return (
                <tr key={m.member}>
                  <td>
                    <div className="team-rev-cell">
                      <div className="team-av-sm" style={{ background: meta.gradient }}>{meta.initials}</div>
                      <span className="team-rev-name">{m.member === "Farheen" ? "Farheen Ansari" : m.member === "Aditi" ? "Aditi Sinha" : m.member === "Samiksha" ? "Samiksha Parekh" : m.member}</span>
                    </div>
                  </td>
                  <td className="team-td-blue">{m.total}</td>
                  <td className="team-td-blue">{m.open_count}</td>
                  <td>{m.closed_count}</td>
                  <td>{m.on_hold_count}</td>
                  <td className="team-td-resolved">{resolvedPct}%</td>
                  <td>
                    <div className="team-wl-cell">
                      <div className="team-wl-bar-wrap">
                        <div className="team-wl-bar-fill" style={{ width: `${workloadPct}%` }} />
                      </div>
                      <span className="team-wl-pct">{workloadPct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Member Cards */}
      <div className="team-cards-grid">
        {members.map(m => {
          const meta = TEAM_META[m.member] || { gradient: "linear-gradient(135deg,#092045,#051329)", initials: m.member.substring(0, 2).toUpperCase(), role: "Legal Team", email: "" };
          const resolvedPct = m.total > 0 ? Math.round((m.closed_count / m.total) * 100) : 0;
          const workloadPct = grandTotal > 0 ? Math.round((m.total / grandTotal) * 100) : 0;
          const openRate    = m.total > 0 ? Math.round((m.open_count / m.total) * 100) : 0;
          const fullName    = m.member === "Farheen" ? "Farheen Ansari" : m.member === "Aditi" ? "Aditi Sinha" : m.member === "Samiksha" ? "Samiksha Parekh" : m.member;
          return (
            <div key={m.member} className="team-member-card">
              {/* Card header */}
              <div className="team-mc-hd">
                <div className="team-av-lg" style={{ background: meta.gradient }}>{meta.initials}</div>
                <div className="team-mc-info">
                  <div className="team-mc-name">{fullName}</div>
                  <div className="team-mc-role">{meta.role}</div>
                  <div className="team-mc-email">{meta.email}</div>
                </div>
              </div>
              <div className="team-mc-resolved">
                <span className="team-mc-res-num">{resolvedPct}</span>
                <span className="team-mc-res-label">% resolved</span>
              </div>

              {/* Status breakdown */}
              <div className="team-mc-section-label">STATUS BREAKDOWN</div>
              <div className="team-mc-bar-wrap">
                {m.total > 0 && (
                  <>
                    <div className="team-mc-bar-closed" style={{ width: `${Math.round((m.closed_count / m.total) * 100)}%` }} />
                    <div className="team-mc-bar-open"   style={{ width: `${Math.round((m.open_count   / m.total) * 100)}%` }} />
                    <div className="team-mc-bar-hold"   style={{ width: `${Math.round((m.on_hold_count / m.total) * 100)}%` }} />
                  </>
                )}
              </div>
              <div className="team-mc-legend">
                <span className="team-mc-leg-item closed">{m.closed_count} Closed</span>
                <span className="team-mc-leg-item open">{m.open_count} Open</span>
                <span className="team-mc-leg-item hold">{m.on_hold_count} On Hold</span>
              </div>

              {/* Stat boxes */}
              <div className="team-mc-stats">
                <div className="team-mc-stat">
                  <div className="team-mc-stat-val">{m.total}</div>
                  <div className="team-mc-stat-lbl">TOTAL</div>
                </div>
                <div className="team-mc-stat">
                  <div className="team-mc-stat-val">{workloadPct}%</div>
                  <div className="team-mc-stat-lbl">WORKLOAD</div>
                </div>
                <div className="team-mc-stat">
                  <div className="team-mc-stat-val">{openRate}%</div>
                  <div className="team-mc-stat-lbl">OPEN RATE</div>
                </div>
                <div className="team-mc-stat">
                  <div className="team-mc-stat-val">{m.avg_ageing_days != null ? `${m.avg_ageing_days}d` : "—"}</div>
                  <div className="team-mc-stat-lbl">AVG AGE</div>
                </div>
              </div>

              {/* Top doc type */}
              {m.top_doc_type && (
                <div className="team-mc-top-doc">
                  <span className="team-mc-top-doc-badge">{m.top_doc_type}</span>
                  <span className="team-mc-top-doc-lbl">TOP DOC TYPE</span>
                </div>
              )}

              {/* Workload share bar */}
              <div className="team-mc-wl-row">
                <span className="team-mc-wl-label">Workload share</span>
                <span className="team-mc-wl-pct">{workloadPct}%</span>
              </div>
              <div className="team-mc-wl-bar-wrap">
                <div className="team-mc-wl-bar-fill" style={{ width: `${workloadPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Templates page (document library with multi-select download) ─────────────
type TemplateDoc = { name: string; size: string; url: string };
type TemplateCard = {
  id: string;
  name: string;
  icon: string; // emoji or SVG string
  docs: TemplateDoc[];
};

const INDIA_AGREEMENT_CARDS: TemplateCard[] = [
  {
    id: "nda",
    name: "Non Disclore Agreement",
    icon: "fa-scale-balanced",
    docs: [
      { name: "Mutual NDA Fynd x Other Party.docx", size: "3.7 MB", url: "legal-templates/nda.docx" },
    ],
  },
  {
    id: "msa",
    name: "Fynd Commerce MSA (For Enterprise Client)",
    icon: "fa-building-columns",
    docs: [
      { name: "MSA _ Fynd Commerce _ Enterprise Clients.docx", size: "4.1 MB", url: "legal-templates/msa-enterprise.docx" },
    ],
  },
  {
    id: "service",
    name: "Service Agreement (Fynd X Reliance)",
    icon: "fa-scroll",
    docs: [
      { name: "Service Agreement _ Fynd X RBL (Fynd Commerce Service).docx", size: "229 KB", url: "legal-templates/service-rbl.docx" },
    ],
  },
  {
    id: "vendor",
    name: "Vendor Agreement (Fynd as Service Receiver)",
    icon: "fa-handshake",
    docs: [
      { name: "MSA _ Fynd X Service Provider (Non-SAAS).docx", size: "485 KB", url: "legal-templates/vendor-nonsaas.docx" },
      { name: "MSA _ Fynd X Service Provider (SAAS).docx", size: "683 KB", url: "legal-templates/vendor-saas.docx" },
    ],
  },
  {
    id: "3rdparty",
    name: "3rd Party Contract Resources Agreement",
    icon: "fa-user-group",
    docs: [
      { name: "MSA_ Contractual Resource Template.docx", size: "6.8 MB", url: "legal-templates/3rdparty-resource.docx" },
    ],
  },
  {
    id: "referral",
    name: "Referral Partnership (SOW)",
    icon: "fa-clipboard-list",
    docs: [
      { name: "Referral Partnership SOW.docx", size: "736 KB", url: "legal-templates/referral-sow.docx" },
    ],
  },
  {
    id: "api",
    name: "API/Integration Partner Agreement",
    icon: "fa-plug",
    docs: [
      { name: "API_Integration_Agreement_Mutual_With_Schedules.docx", size: "4.7 MB", url: "legal-templates/api-integration.docx" },
    ],
  },
  {
    id: "purchase",
    name: "Purchase Agreement (for GAAS- Fynd as Seller)",
    icon: "fa-cart-shopping",
    docs: [
      { name: "1. MSA GaaS_ Fynd X Purchaser.docx", size: "1.2 MB", url: "legal-templates/purchase-gaas.docx" },
    ],
  },
  {
    id: "supplier",
    name: "Supplier Agreement (for GAAS- Fynd as Purchaser)",
    icon: "fa-box",
    docs: [
      { name: "2. MSA GaaS _ Fynd X Supplier.docx", size: "613 KB", url: "legal-templates/supplier-gaas.docx" },
    ],
  },
  {
    id: "kiosk",
    name: "Fynd Kiosk Agreement",
    icon: "fa-desktop",
    docs: [
      { name: "Fynd Kiosk Sale Agreement.docx", size: "484 KB", url: "legal-templates/kiosk-sale.docx" },
      { name: "Kiosk Sale Warranty Certificate.docx", size: "8.3 MB", url: "legal-templates/kiosk-warranty.docx" },
    ],
  },
  {
    id: "reseller",
    name: "Reseller Partnership Agreement",
    icon: "fa-link",
    docs: [
      { name: "Reseller Partner Agreement - Fynd.docx", size: "4.1 MB", url: "legal-templates/reseller.docx" },
    ],
  },
];

const INDIA_KYC_CARDS: TemplateCard[] = [
  {
    id: "kyc-docs",
    name: "KYC Documents / Licenses / Certificates",
    icon: "fa-id-card",
    docs: [
      { name: "COI_SRTL.pdf",                        size: "412 KB",  url: "/manus-storage/COI_SRTLpdf_3aab0537.pdf" },
      { name: "List of Directors.docx",               size: "3.3 MB",  url: "/manus-storage/ListofDirectors_54b56c76.docx" },
      { name: "MOA_SRTL.pdf",                         size: "278 KB",  url: "/manus-storage/MOA_SRTL_79a5d8bf.pdf" },
      { name: "List of Shareholders (Revised).docx",  size: "166 KB",  url: "/manus-storage/ListofShareholder_Revised_5db1bf71.docx" },
      { name: "AOA_SRTL.pdf",                         size: "497 KB",  url: "/manus-storage/AOA_SRTL_73b25a10.pdf" },
    ],
  },
];

// Middle East / UK — no documents yet; same structure as India, ready to fill in later.
const MEA_AGREEMENT_CARDS: TemplateCard[] = [];
const MEA_KYC_CARDS: TemplateCard[] = [];
const UK_AGREEMENT_CARDS: TemplateCard[] = [];
const UK_KYC_CARDS: TemplateCard[] = [];

type DocRegion = "india" | "mea" | "uk";
const DOC_REGIONS: { id: DocRegion; label: string; flag: string; agreements: TemplateCard[]; kyc: TemplateCard[] }[] = [
  { id: "india", label: "India",       flag: "🇮🇳", agreements: INDIA_AGREEMENT_CARDS, kyc: INDIA_KYC_CARDS },
  { id: "mea",   label: "Middle East", flag: "🇦🇪", agreements: MEA_AGREEMENT_CARDS,   kyc: MEA_KYC_CARDS },
  { id: "uk",    label: "UK",          flag: "🇬🇧", agreements: UK_AGREEMENT_CARDS,    kyc: UK_KYC_CARDS },
];

function TemplatesPage() {
  // Two-level nav: region (flag) → doc type (Agreements | KYC Documents)
  type DocTab = "agreements" | "kyc";
  const [region, setRegion] = useState<DocRegion>("india");
  const [docTab, setDocTab] = useState<DocTab>("agreements");
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<Set<string>>(new Set());

  const getDownloadUrl = trpc.legal.getDownloadUrl.useMutation();

  const activeRegion = DOC_REGIONS.find(r => r.id === region)!;
  const cardsForTab = docTab === "kyc" ? activeRegion.kyc : activeRegion.agreements;
  const card = cardsForTab.find(c => c.id === activeCard) ?? null;

  const switchRegion = (r: DocRegion) => {
    setRegion(r);
    setDocTab("agreements");
    setActiveCard(null);
    setSelected(new Set());
  };

  const switchDocTab = (t: DocTab) => {
    setDocTab(t);
    setActiveCard(null);
    setSelected(new Set());
  };

  const handleCardClick = (id: string) => {
    if (activeCard === id) {
      setActiveCard(null);
      setSelected(new Set());
    } else {
      setActiveCard(id);
      setSelected(new Set());
    }
  };

  const toggleDoc = (url: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const toggleAll = () => {
    if (!card) return;
    if (selected.size === card.docs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(card.docs.map(d => d.url)));
    }
  };

  const downloadFile = async (storageUrl: string, name: string) => {
    setDownloading(prev => new Set(prev).add(storageUrl));
    try {
      // Strip leading /manus-storage/ to get the raw storage key
      const key = storageUrl.replace(/^\/manus-storage\//, "");
      // Use the server-side download proxy — fetches bytes server-side
      // and sends back with Content-Disposition: attachment
      const downloadUrl = `/api/download?key=${encodeURIComponent(key)}&name=${encodeURIComponent(name)}`;
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download failed", e);
    } finally {
      setDownloading(prev => { const s = new Set(prev); s.delete(storageUrl); return s; });
    }
  };

  const downloadSelected = async () => {
    if (!card) return;
    const docs = card.docs.filter(d => selected.has(d.url));
    for (const d of docs) {
      await downloadFile(d.url, d.name);
    }
  };

  return (
    <div className="lc-pg-content">
      <div className="lc-ph-row">
        <h1 className="lc-ph-h">Downloads</h1>
      </div>

      {/* Region tabs (flags) */}
      <div className="doc-region-nav">
        {DOC_REGIONS.map(r => (
          <button
            key={r.id}
            className={`doc-region-btn${region === r.id ? " doc-region-btn-active" : ""}`}
            onClick={() => switchRegion(r.id)}
          >
            <span className="doc-region-flag">{r.flag}</span>
            <span>{r.label}</span>
          </button>
        ))}
      </div>

      {/* Doc-type sub-navbar */}
      <div className="doc-subnav">
        <button className={`doc-subnav-btn${docTab === "agreements" ? " doc-subnav-active" : ""}`} onClick={() => switchDocTab("agreements")}><i className="fa-solid fa-file-lines"></i> Agreements</button>
        <button className={`doc-subnav-btn${docTab === "kyc" ? " doc-subnav-active" : ""}`} onClick={() => switchDocTab("kyc")}><i className="fa-solid fa-id-card"></i> KYC Documents</button>
      </div>

      {cardsForTab.length === 0 ? (
        <div className="doc-empty-state">
          <div className="doc-empty-icon">{activeRegion.flag}</div>
          <div className="doc-empty-title">{docTab === "kyc" ? "KYC Documents" : "Agreements"} — {activeRegion.label}</div>
          <div className="doc-empty-sub">Documents will be added here soon.</div>
        </div>
      ) : (
        <div className="tmpl-grid">
          {cardsForTab.map(t => (
            <div
              key={t.id}
              className={`tmpl-card${activeCard === t.id ? " tmpl-card-active" : ""}`}
              onClick={() => handleCardClick(t.id)}
            >
              <div className="tmpl-card-ico"><i className={`fa-solid ${t.icon}`}></i></div>
              <div className="tmpl-card-nm">{t.name}</div>
            </div>
          ))}
        </div>
      )}
      {/* Document panel */}
      {card && (
        <div className="tmpl-panel">
          <div className="tmpl-panel-hd">
            <span className="tmpl-panel-ico"><i className={`fa-solid ${card.icon}`}></i></span>
            <span className="tmpl-panel-title">{card.name}</span>
            <button className="tmpl-panel-close" onClick={() => { setActiveCard(null); setSelected(new Set()); }}>✕</button>
          </div>
          <div className="tmpl-panel-meta">
            <span className="tmpl-file-count">{card.docs.length} file{card.docs.length !== 1 ? "s" : ""}</span>
            <label className="tmpl-select-all">
              <input
                type="checkbox"
                checked={selected.size === card.docs.length && card.docs.length > 0}
                onChange={toggleAll}
              />
              <span>Select all</span>
            </label>
          </div>
          <div className="tmpl-doc-list">
            {card.docs.map(doc => (
              <div key={doc.url} className={`tmpl-doc-row${selected.has(doc.url) ? " tmpl-doc-selected" : ""}`}>
                <input
                  type="checkbox"
                  className="tmpl-doc-chk"
                  checked={selected.has(doc.url)}
                  onChange={() => toggleDoc(doc.url)}
                />
                <span className={`tmpl-doc-badge${doc.name.toLowerCase().endsWith('.pdf') ? ' tmpl-doc-badge-pdf' : ''}`}>{doc.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'DOC'}</span>
                <div className="tmpl-doc-info">
                  <div className="tmpl-doc-name">{doc.name}</div>
                  <div className="tmpl-doc-size">{doc.size}</div>
                </div>
                <button
                  className="tmpl-dl-btn"
                  title="Download"
                  disabled={downloading.has(doc.url)}
                  onClick={(e) => { e.stopPropagation(); downloadFile(doc.url, doc.name); }}
                >
                  {downloading.has(doc.url) ? "…" : "↓"}
                </button>
              </div>
            ))}
          </div>
          {selected.size > 0 && (
            <div className="tmpl-bulk-bar">
              <span className="tmpl-bulk-count">{selected.size} file{selected.size !== 1 ? "s" : ""} selected</span>
              <button className="tmpl-bulk-dl" onClick={downloadSelected}>
                ↓ Download Selected
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Requests page (form wired to BigQuery) ────────────────────────────────
function RequestsPage() {
  const { lcUser } = useLcUser();
  const { data: opts } = trpc.legal.formOptions.useQuery();

  const [name, setName]               = useState("");
  const [email, setEmail]             = useState("");
  const [dept, setDept]               = useState("");
  const [type, setType]               = useState("");
  const [counterParty, setCounterParty] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [ipProduct, setIpProduct]     = useState("");
  const [bizSegment, setBizSegment]   = useState("");
  const [pnlOwner, setPnlOwner]       = useState("");
  const [region, setRegion]           = useState("");
  const [priority, setPriority]       = useState("Normal (48 hrs)");
  const [deadline, setDeadline]       = useState("");
  const [desc, setDesc]               = useState("");
  const [docLink, setDocLink]         = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  const clearForm = () => {
    setName(""); setEmail(""); setDept(""); setType("");
    setCounterParty(""); setCustomerType(""); setIpProduct("");
    setBizSegment(""); setPnlOwner(""); setRegion("");
    setPriority("Normal (48 hrs)"); setDeadline("");
    setDesc(""); setDocLink("");
    setSubmittedId(null); setError(null);
  };

  const submitMutation = trpc.legal.submitRequest.useMutation({
    onSuccess: (data) => { setSubmittedId(data.request_id); clearForm(); setSubmittedId(data.request_id); },
    onError: (err) => setError(err.message || "Failed to submit request. Please try again."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setSubmittedId(null);
    submitMutation.mutate({ name, email, dept, type, counterParty, customerType, ipProduct, bizSegment, pnlOwner, region, priority, deadline, description: desc, docLink, requestedBy: lcUser?.name || lcUser?.email || '' });
  };

  const dynSelect = (vals: string[] | undefined, value: string, onChange: (v: string) => void, required = false) => (
    <select required={required} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select…</option>
      {(vals || []).map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  );

  return (
    <div className="lc-pg-content" style={{ maxWidth: '100%' }}>
      <div className="req-page-header">
        <h1 className="lc-ph-h" style={{ marginBottom: 0 }}>New Request</h1>
      </div>

      <div className="req-form-card">
        <div className="req-card-hd">
          <span className="req-card-title">New Request</span>
          <span className="chip ch-p">CONFIDENTIAL</span>
        </div>

        {submittedId && (
          <div className="req-ok-banner" style={{ marginBottom: '1.25rem' }}>
            ✅ Request <strong>{submittedId}</strong> submitted. The Legal team will reach out within 48 business hours.
          </div>
        )}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "0.85rem 1.1rem", color: "#dc2626", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="req-fgrid">

            {/* Row 1: Requestor Name + Email */}
            <div className="req-fg">
              <label>Requestor Name *</label>
              <input type="text" placeholder="Name of requestor" required value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="req-fg">
              <label>Email *</label>
              <input type="email" placeholder="you@gofynd.com" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            {/* Row 2: Department + Request Type */}
            <div className="req-fg">
              <label>Department *</label>
              <select required value={dept} onChange={e => setDept(e.target.value)}>
                <option value="">Select department</option>
                {["Engineering","Product","Marketing","Finance","HR / People","Operations","Business Development","Customer Success","Other"].map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="req-fg">
              <label>Request Type *</label>
              <select required value={type} onChange={e => setType(e.target.value)}>
                <option value="">Select type</option>
                {["Contract Review","NDA Drafting / Review","Vendor Agreement","IP / Trademark Query","Privacy / Data Protection","Compliance Advisory","Employment / HR Matter","Dispute Support","General Legal Query"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Row 3: Counter Party Legal Name + Customer Type */}
            <div className="req-fg">
              <label>Counter Party Legal Name *</label>
              <input type="text" placeholder="Legal name of the counterparty" required value={counterParty} onChange={e => setCounterParty(e.target.value)} />
            </div>
            <div className="req-fg">
              <label>Customer Type *</label>
              {dynSelect(opts?.customer_types, customerType, setCustomerType, true)}
            </div>

            {/* Row 4: IP / Product + Business Segment */}
            <div className="req-fg">
              <label>IP / Product *</label>
              {dynSelect(opts?.ip_products, ipProduct, setIpProduct, true)}
            </div>
            <div className="req-fg">
              <label>Business Segment *</label>
              {dynSelect(opts?.business_segments, bizSegment, setBizSegment, true)}
            </div>

            {/* Row 5: PNL Owner + Region */}
            <div className="req-fg">
              <label>PNL Owner *</label>
              {dynSelect(opts?.pnl_owners, pnlOwner, setPnlOwner, true)}
            </div>
            <div className="req-fg">
              <label>Region *</label>
              {dynSelect(opts?.regions, region, setRegion, true)}
            </div>

            {/* Row 6: Priority + Deadline */}
            <div className="req-fg">
              <label>Priority</label>
              <select value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="Normal (48 hrs)">Normal (48 hrs)</option>
                <option value="High (24 hrs)">High (24 hrs)</option>
                <option value="Urgent (same day)">Urgent (same day)</option>
              </select>
            </div>
            <div className="req-fg">
              <label>Deadline</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
            </div>

            {/* Row 7: Description (full width) */}
            <div className="req-fg full">
              <label>Description *</label>
              <textarea
                placeholder="Describe your legal matter — include context, parties involved, and what you need from the Legal team."
                required
                rows={5}
                value={desc}
                onChange={e => setDesc(e.target.value)}
              />
            </div>

            {/* Row 8: Supporting Documents (full width) */}
            <div className="req-fg full">
              <label>Supporting Documents</label>
              <input type="text" placeholder="Paste a Drive / SharePoint link" value={docLink} onChange={e => setDocLink(e.target.value)} />
            </div>

          </div>
          <div className="req-f-acts">
            <button type="button" className="btn-ghost-req" onClick={clearForm}>Clear</button>
            <button type="submit" className="btn-submit-req" disabled={submitMutation.isPending}>
              {submitMutation.isPending ? "Submitting…" : "Submit Request →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Workflow helpers ───────────────────────────────────────────────────────
const STAGES = [
  { id: 'request-raised',     label: 'Request Raised'        },
  { id: 'under-legal-review', label: 'Under Legal Review'    },
  { id: 'pending-business',   label: 'Pending from Business' },
  { id: 'pending-finance',    label: 'Pending from Finance'  },
  { id: 'pending-client',     label: 'Pending from Client'   },
  { id: 'on-hold',            label: 'On Hold'               },
  { id: 'sent-for-signature', label: 'Sent for Signature'    },
  { id: 'executed',           label: 'Executed'              },
];
const STAGE_IDS = STAGES.map(s => s.id);

function normaliseWfStatus(s: string): string {
  const map: Record<string, string> = {
    'submitted': 'request-raised',
    'under-review': 'under-legal-review',
    'draft-ready': 'pending-client',
    'awaiting-approval': 'pending-client',
    'awaiting-response': 'pending-client',
    'pending-counter-parties': 'pending-client',
    'completed': 'executed',
    // aliases written by the Edit modal (with "from" in slug)
    'pending-from-business': 'pending-business',
    'pending-from-finance':  'pending-finance',
    'pending-from-client':   'pending-client',
    // human-readable variants from BigQuery legacy data
    'Pending From Business': 'pending-business',
    'Pending From Finance':  'pending-finance',
    'Pending From Client':   'pending-client',
    'Request Raised':        'request-raised',
    'Under Legal Review':    'under-legal-review',
    'On Hold':               'on-hold',
    'Executed':              'executed',
  };
  return map[s] || s;
}

function fmtTs(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    'request-raised':        ['ch-p', 'Request Raised'],
    'under-legal-review':    ['ch-c', 'Under Legal Review'],
    'pending-business':      ['ch-o', 'Pending from Business'],
    'pending-finance':       ['ch-o', 'Pending from Finance'],
    'pending-client':        ['ch-o', 'Pending from Client'],
    'on-hold':               ['ch-g', 'On Hold'],
    'sent-for-signature':    ['ch-o', 'Sent for Signature'],
    'executed':              ['ch-g', 'Executed ✓'],
    'rejected':              ['ch-r', 'Rejected'],
    'submitted':             ['ch-p', 'Request Raised'],
    'under-review':          ['ch-c', 'Under Legal Review'],
    'awaiting-response':     ['ch-o', 'Pending from Client'],
    'completed':             ['ch-g', 'Executed ✓'],
    // aliases from Edit modal (with "from" in slug)
    'pending-from-business': ['ch-o', 'Pending from Business'],
    'pending-from-finance':  ['ch-o', 'Pending from Finance'],
    'pending-from-client':   ['ch-o', 'Pending from Client'],
    // human-readable variants from legacy BQ data
    'Pending From Business': ['ch-o', 'Pending from Business'],
    'Pending From Finance':  ['ch-o', 'Pending from Finance'],
    'Pending From Client':   ['ch-o', 'Pending from Client'],
    'Request Raised':        ['ch-p', 'Request Raised'],
    'Under Legal Review':    ['ch-c', 'Under Legal Review'],
    'On Hold':               ['ch-g', 'On Hold'],
    'Executed':              ['ch-g', 'Executed ✓'],
  };
  const [cls, lbl] = map[status] || ['ch-p', status];
  return <span className={`chip ${cls}`}>{lbl}</span>;
}

function PriChip({ priority }: { priority: string }) {
  if (!priority || priority.startsWith('Normal')) return <span className="chip ch-c">{priority || 'Normal (48 hrs)'}</span>;
  if (priority.startsWith('High')) return <span className="chip ch-o">High Priority</span>;
  return <span className="chip ch-r">Urgent</span>;
}

interface WfRequest {
  request_id: string;
  requester_name: string;
  requester_email: string;
  department: string;
  request_type: string;
  priority: string;
  deadline: string;
  description: string;
  doc_link: string;
  submitted_at: string;
  current_status: string;
  status_note: string;
  history_json: string;
  requested_by: string;
  status_updated_by: string;
  counter_party: string;
  customer_type: string;
  ip_product: string;
  biz_segment: string;
  pnl_owner: string;
  region: string;
  is_confidential: boolean;
  updated_at: string;
}

function WfTimeline({ status, historyJson }: { status: string; historyJson: string }) {
  const history: Array<{ status: string; ts: string; note: string }> = (() => {
    try { return JSON.parse(historyJson || '[]'); } catch { return []; }
  })();

  const tsMap: Record<string, string> = {};
  history.forEach(h => {
    const sid = normaliseWfStatus(h.status);
    if (sid && h.ts && !tsMap[sid]) tsMap[sid] = h.ts;
  });

  const normStatus = normaliseWfStatus(status);
  const curIdx = STAGE_IDS.indexOf(normStatus);

  return (
    <div className="wf-timeline">
      {STAGES.map((s, i) => {
        const cls = i < curIdx ? 'wf-done' : i === curIdx ? 'wf-active' : '';
        const dot = cls === 'wf-done' ? '✓' : '';
        return (
          <div key={s.id} className={`wf-step ${cls}`}>
            <div className="wf-dot">{dot}</div>
            <div className="wf-slbl">{s.label}</div>
            {tsMap[s.id] && <div className="wf-sts">{fmtTs(tsMap[s.id])}</div>}
          </div>
        );
      })}
    </div>
  );
}

function WfCard({ wf, onUpdate }: { wf: WfRequest; onUpdate: () => void }) {
  const { lcUser } = useLcUser();
  const [panelOpen, setPanelOpen] = useState(false);
  const [selStatus, setSelStatus] = useState(wf.current_status);
  const [note, setNote] = useState(wf.status_note || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isAdmin = !!(lcUser && LC_ADMIN_EMAILS.has(lcUser.email));

  const updateMutation = trpc.legal.updateRequestStatus.useMutation({
    onSuccess: () => { setSaving(false); setPanelOpen(false); onUpdate(); },
    onError: () => setSaving(false),
  });

  const deleteMutation = trpc.legal.deleteRequest.useMutation({
    onSuccess: () => { setDeleting(false); setConfirmDelete(false); onUpdate(); },
    onError: () => { setDeleting(false); setConfirmDelete(false); },
  });

  const submitted = wf.submitted_at ? new Date(wf.submitted_at) : new Date();
  const dateStr = submitted.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = submitted.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const isActive = wf.current_status !== 'executed' && wf.current_status !== 'rejected' && wf.current_status !== 'completed';

  const handleSave = () => {
    setSaving(true);
    const history: Array<{ status: string; ts: string; note: string }> = (() => {
      try { return JSON.parse(wf.history_json || '[]'); } catch { return []; }
    })();
    const updated = [...history, { status: selStatus, ts: new Date().toISOString(), note: note || '' }];
    updateMutation.mutate({
      id: wf.request_id,
      status: selStatus,
      note,
      history_json: JSON.stringify(updated),
      statusUpdatedBy: lcUser?.name || lcUser?.email || '',
    });
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    deleteMutation.mutate({ id: wf.request_id });
  };

  return (
    <div className="wf-card" id={`card-${wf.request_id}`}>
      <div className="wf-top">
        <div>
          <div className="wf-id-badge">{wf.request_id}</div>
          <div className="wf-nm">{wf.requester_name || '—'}</div>
          <div className="wf-dept">{wf.department || ''} · {wf.requester_email || ''}</div>
        </div>
        <div className="wf-meta-right">
          <StatusChip status={wf.current_status} />
          <PriChip priority={wf.priority} />
          {!!wf.is_confidential && <span className="chip ch-r">🔒 Confidential</span>}
          <div className="wf-date">{dateStr} · {timeStr}</div>
          {wf.deadline && <div className="wf-date">Due: {wf.deadline}</div>}
          {isAdmin && (
            <button
              className="btn-wf-delete"
              onClick={handleDelete}
              disabled={deleting}
              title={confirmDelete ? 'Click again to confirm delete' : 'Delete this request'}
              style={confirmDelete ? { background: '#dc2626', color: '#fff' } : {}}
            >
              {deleting ? '⏳' : confirmDelete ? '⚠️ Confirm Delete' : '🗑️ Delete'}
            </button>
          )}
        </div>
      </div>
      <div className="wf-type-row">Request Type: <span>{wf.request_type || '—'}</span></div>
      {wf.counter_party && (
        <div className="wf-counter-party">Counter Party: <strong>{wf.counter_party}</strong></div>
      )}
      <div className="wf-tags-row">
        {wf.customer_type && <div className="wf-tag"><b>Customer Type:</b> {wf.customer_type}</div>}
        {wf.ip_product && <div className="wf-tag"><b>IP/Product:</b> {wf.ip_product}</div>}
        {wf.biz_segment && <div className="wf-tag"><b>Business Segment:</b> {wf.biz_segment}</div>}
        {wf.pnl_owner && <div className="wf-tag"><b>PNL Owner:</b> {wf.pnl_owner}</div>}
        {wf.region && <div className="wf-tag"><b>Region:</b> {wf.region}</div>}
      </div>
      {wf.description && <div className="wf-desc">{wf.description}</div>}
      <div className="wf-user-row">
        {wf.requested_by && (
          <div className="wf-user-badge">
            <i className="fa-solid fa-user-pen"></i>
            Requested by: <span>{wf.requested_by}</span>
          </div>
        )}
        {wf.status_updated_by && (
          <div className="wf-user-badge">
            <i className="fa-solid fa-user-check"></i>
            Status updated by: <span>{wf.status_updated_by}</span>
          </div>
        )}
      </div>
      <WfTimeline status={wf.current_status} historyJson={wf.history_json} />
      <div className="wf-actions">
        {isActive && isAdmin && (
          <button className="btn-toggle-upd" onClick={() => setPanelOpen(o => !o)}>Update Status</button>
        )}
        {wf.status_note && <div className="wf-note-txt">{wf.status_note}</div>}
        {wf.doc_link && <a href={wf.doc_link} target="_blank" rel="noreferrer" style={{ fontSize: '0.67rem', color: 'var(--accent)' }}>Attached Doc</a>}
      </div>
      {isActive && isAdmin && panelOpen && (
        <div className="wf-update-panel open">
          <div className="wf-uprow">
            <select value={selStatus} onChange={e => setSelStatus(e.target.value)}>
              {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              <option value="rejected">Rejected</option>
            </select>
            <input
              type="text"
              placeholder="Add a note (optional)…"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
            <button className="btn-upd" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save Update'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Workflows page (live from BigQuery) ────────────────────────────────────
function WorkflowsPage() {
  const { data: allRequests, isLoading, refetch } = trpc.legal.getRequests.useQuery();
  const [search, setSearch]   = useState('');
  const [stFilter, setStFilter] = useState('');
  const [prFilter, setPrFilter] = useState('');
  const [page, setPage]       = useState(1);
  const [perPage, setPerPage] = useState(5);

  const all = allRequests || [];

  // KPI counts
  const norm = (w: WfRequest) => normaliseWfStatus(w.current_status);
  const total    = all.length;
  const newReq   = all.filter(w => norm(w) === 'request-raised').length;
  const inRev    = all.filter(w => norm(w) === 'under-legal-review').length;
  const pending  = all.filter(w => ['pending-business','pending-finance','pending-client'].includes(norm(w))).length;
  const onHold   = all.filter(w => norm(w) === 'on-hold').length;
  const executed = all.filter(w => norm(w) === 'executed').length;

  // Filter
  const filtered = all.filter(w => {
    if (stFilter && w.current_status !== stFilter) return false;
    if (prFilter && w.priority !== prFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(
        (w.requester_name  || '').toLowerCase().includes(q) ||
        (w.department      || '').toLowerCase().includes(q) ||
        (w.request_type    || '').toLowerCase().includes(q) ||
        (w.request_id      || '').toLowerCase().includes(q)
      )) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage   = Math.min(page, totalPages);
  const start      = (safePage - 1) * perPage;
  const paged      = filtered.slice(start, start + perPage);

  return (
    <div className="lc-pg-content">
      <div className="lc-ph-row">
        <h1 className="lc-ph-h">Workflows</h1>
        <div className="lc-ph-actions">
          <button className="lc-btn-refresh" onClick={() => refetch()}>
            <i className="fa-solid fa-rotate"></i> Refresh
          </button>
        </div>
      </div>

      {/* KPI row */}
      <div className="wf-kpi-row">
        <div className="kpi k-blue"><div className="kpi-lbl">Total Requests</div><div className="kpi-val vp">{total}</div><div className="kpi-delta">All time</div></div>
        <div className="kpi k-amber"><div className="kpi-lbl">Request Raised</div><div className="kpi-val vo">{newReq}</div><div className="kpi-delta">Awaiting pickup</div></div>
        <div className="kpi k-teal"><div className="kpi-lbl">Under Legal Review</div><div className="kpi-val vc">{inRev}</div><div className="kpi-delta">Being processed</div></div>
        <div className="kpi k-purple"><div className="kpi-lbl">Awaiting Response</div><div className="kpi-val" style={{ color: 'var(--kpi-purple)' }}>{pending}</div><div className="kpi-delta">Pending from stakeholders</div></div>
        <div className="kpi k-blue"><div className="kpi-lbl">On Hold</div><div className="kpi-val vp">{onHold}</div><div className="kpi-delta">Paused</div></div>
        <div className="kpi k-green"><div className="kpi-lbl">Executed</div><div className="kpi-val vg">{executed}</div><div className="kpi-delta">Completed</div></div>
      </div>

      {/* Toolbar */}
      <div className="wf-toolbar">
        <input
          className="wf-search-in"
          placeholder="Search by name, department, type, ID…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select className="wf-filter-sel" value={stFilter} onChange={e => { setStFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          <option value="rejected">Rejected</option>
        </select>
        <select className="wf-filter-sel" value={prFilter} onChange={e => { setPrFilter(e.target.value); setPage(1); }}>
          <option value="">All Priorities</option>
          <option value="Normal (48 hrs)">Normal</option>
          <option value="High (24 hrs)">High</option>
          <option value="Urgent (same day)">Urgent</option>
        </select>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="wf-empty"><div className="wf-empty-ico" style={{ fontSize: '1.5rem', opacity: 0.3 }}>⏳</div><div className="wf-empty-txt">Loading…</div></div>
      ) : filtered.length === 0 ? (
        <div className="wf-empty">
          <div className="wf-empty-ico">📋</div>
          <div className="wf-empty-txt">{all.length ? 'No requests match your filters.' : 'No requests yet.\nSubmit a legal request and it will appear here.'}</div>
        </div>
      ) : (
        <>
          <div className="wf-list">
            {paged.map(wf => (
              <WfCard key={wf.request_id} wf={wf} onUpdate={() => refetch()} />
            ))}
          </div>

          {/* Pagination */}
          <div className="wf-pagination">
            <div className="pg-info">Showing {start + 1}–{Math.min(safePage * perPage, filtered.length)} of {filtered.length}</div>
            <div className="pg-controls">
              <button className="pg-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1}>‹ Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} className={`pg-btn${p === safePage ? ' pg-active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="pg-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>Next ›</button>
            </div>
            <div className="pg-size">
              <span>Per page:</span>
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}>
                {[5, 10, 20, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main dashboard layout ──────────────────────────────────────────────────
// ── Request Logs page (admin only) ──────────────────────────────────────
const RL_COLS = [
  { key: "request_id",       label: "Request ID" },
  { key: "requester_name",   label: "Requester" },
  { key: "requester_email",  label: "Email" },
  { key: "department",       label: "Department" },
  { key: "request_type",     label: "Type" },
  { key: "counter_party",    label: "Counter Party" },
  { key: "customer_type",    label: "Customer Type" },
  { key: "ip_product",       label: "IP / Product" },
  { key: "biz_segment",      label: "Business Segment" },
  { key: "pnl_owner",        label: "PNL Owner" },
  { key: "region",           label: "Region" },
  { key: "priority",         label: "Priority" },
  { key: "current_status",   label: "Status" },
  { key: "submitted_at",     label: "Submitted At" },
  { key: "deadline",         label: "Deadline" },
  { key: "requested_by",     label: "Requested By" },
  { key: "status_updated_by",label: "Updated By" },
  { key: "is_confidential",  label: "Confidential" },
];

const RL_PAGE_SIZE = 15;

// ── Blank form state for create/edit ──────────────────────────────────────
const BLANK_FORM = {
  request_id:      '',
  requester_name:  '',
  requester_email: '',
  department:      '',
  request_type:    '',
  counter_party:   '',
  customer_type:   '',
  ip_product:      '',
  biz_segment:     '',
  pnl_owner:       '',
  region:          '',
  priority:        'Normal (48 hrs)',
  deadline:        '',
  description:     '',
  doc_link:        '',
  current_status:  'request-raised',
  is_confidential: false,
};

function RequestsLogsPage() {
  const { lcUser } = useLcUser();
  const isAdmin = !!(lcUser && LC_ADMIN_EMAILS.has(lcUser.email));

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [counterPartyFilter, setCounterPartyFilter] = useState("");
  const [bizSegmentFilter, setBizSegmentFilter] = useState("");
  const [pnlOwnerFilter, setPnlOwnerFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [requestedByFilter, setRequestedByFilter] = useState("");
  const [page, setPage] = useState(1);

  // Modal state
  const [modalOpen, setModalOpen]   = useState(false);
  const [editMode, setEditMode]     = useState(false); // false = create, true = edit
  const [form, setForm]             = useState({ ...BLANK_FORM });
  const [modalErr, setModalErr]     = useState<string | null>(null);
  const [modalOk, setModalOk]       = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.legal.getRequestsLogs.useQuery();
  const { data: opts } = trpc.legal.formOptions.useQuery();
  const rows = data?.rows ?? [];

  const utils = trpc.useUtils();

  const createMutation = trpc.legal.submitRequest.useMutation({
    onSuccess: (d) => {
      setModalOk(`Request ${d.request_id} created successfully.`);
      setModalErr(null);
      utils.legal.getRequestsLogs.invalidate();
      utils.legal.getRequests.invalidate();
      setTimeout(() => { setModalOpen(false); setModalOk(null); setForm({ ...BLANK_FORM }); }, 1800);
    },
    onError: (e) => { setModalErr(e.message || 'Failed to create request.'); setModalOk(null); },
  });

  const updateMutation = trpc.legal.updateRequest.useMutation({
    onSuccess: () => {
      setModalOk('Request updated successfully.');
      setModalErr(null);
      utils.legal.getRequestsLogs.invalidate();
      utils.legal.getRequests.invalidate();
      setTimeout(() => { setModalOpen(false); setModalOk(null); setForm({ ...BLANK_FORM }); }, 1800);
    },
    onError: (e) => { setModalErr(e.message || 'Failed to update request.'); setModalOk(null); },
  });

  const openCreate = () => {
    setForm({ ...BLANK_FORM });
    setEditMode(false);
    setModalErr(null); setModalOk(null);
    setModalOpen(true);
  };

  const openEdit = (r: typeof rows[number]) => {
    setForm({
      request_id:      r.request_id      || '',
      requester_name:  r.requester_name  || '',
      requester_email: r.requester_email || '',
      department:      r.department      || '',
      request_type:    r.request_type    || '',
      counter_party:   r.counter_party   || '',
      customer_type:   r.customer_type   || '',
      ip_product:      r.ip_product      || '',
      biz_segment:     r.biz_segment     || '',
      pnl_owner:       r.pnl_owner       || '',
      region:          r.region          || '',
      priority:        r.priority        || 'Normal (48 hrs)',
      deadline:        r.deadline        || '',
      description:     r.description     || '',
      doc_link:        r.doc_link        || '',
      current_status:  r.current_status  || 'request-raised',
      is_confidential: r.is_confidential ?? false,
    });
    setEditMode(true);
    setModalErr(null); setModalOk(null);
    setModalOpen(true);
  };

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalErr(null); setModalOk(null);
    if (editMode) {
      updateMutation.mutate({
        request_id:      form.request_id,
        requester_name:  form.requester_name,
        requester_email: form.requester_email,
        department:      form.department,
        request_type:    form.request_type,
        counter_party:   form.counter_party,
        customer_type:   form.customer_type,
        ip_product:      form.ip_product,
        biz_segment:     form.biz_segment,
        pnl_owner:       form.pnl_owner,
        region:          form.region,
        priority:        form.priority,
        deadline:        form.deadline,
        description:     form.description,
        doc_link:        form.doc_link,
        current_status:  form.current_status,
        is_confidential: form.is_confidential,
      });
    } else {
      createMutation.mutate({
        name:           form.requester_name,
        email:          form.requester_email,
        dept:           form.department,
        type:           form.request_type,
        counterParty:   form.counter_party,
        customerType:   form.customer_type,
        ipProduct:      form.ip_product,
        bizSegment:     form.biz_segment,
        pnlOwner:       form.pnl_owner,
        region:         form.region,
        priority:       form.priority,
        deadline:       form.deadline,
        description:    form.description,
        docLink:        form.doc_link,
        requestedBy:    lcUser?.name || lcUser?.email || '',
        isConfidential: form.is_confidential,
      });
    }
  };

  const setF = (k: keyof typeof BLANK_FORM, v: string | boolean) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const dynSel = (vals: string[] | undefined, key: keyof typeof BLANK_FORM) => (
    <select value={String(form[key])} onChange={e => setF(key, e.target.value)}>
      <option value="">Select…</option>
      {(vals || []).map(v => <option key={v} value={v}>{v}</option>)}
    </select>
  );

  // KPI counts
  const total    = rows.length;
  const open     = rows.filter(r => (r.current_status || "").toLowerCase() === "open").length;
  const closed   = rows.filter(r => (r.current_status || "").toLowerCase() === "closed").length;
  const pending  = rows.filter(r => (r.current_status || "").toLowerCase().startsWith("pending")).length;

  // Unique values for filter dropdowns
  const depts          = Array.from(new Set(rows.map(r => r.department).filter(Boolean))).sort();
  const counterParties = Array.from(new Set(rows.map(r => r.counter_party).filter(Boolean))).sort();
  const bizSegments    = Array.from(new Set(rows.map(r => r.biz_segment).filter(Boolean))).sort();
  const pnlOwners      = Array.from(new Set(rows.map(r => r.pnl_owner).filter(Boolean))).sort();
  const regions        = Array.from(new Set(rows.map(r => r.region).filter(Boolean))).sort();
  const requestedBys   = Array.from(new Set(rows.map(r => r.requested_by).filter(Boolean))).sort();

  // Filtered rows
  const q = search.toLowerCase();
  const filtered = rows.filter(r => {
    const matchSearch      = !q ||
      (r.requester_name || "").toLowerCase().includes(q) ||
      (r.requester_email || "").toLowerCase().includes(q) ||
      (r.request_id || "").toLowerCase().includes(q) ||
      (r.department || "").toLowerCase().includes(q) ||
      (r.request_type || "").toLowerCase().includes(q);
    const matchStatus      = !statusFilter      || (r.current_status || "").toLowerCase() === statusFilter.toLowerCase();
    const matchDept        = !deptFilter        || r.department    === deptFilter;
    const matchCounterParty= !counterPartyFilter|| r.counter_party === counterPartyFilter;
    const matchBizSegment  = !bizSegmentFilter  || r.biz_segment   === bizSegmentFilter;
    const matchPnlOwner    = !pnlOwnerFilter    || r.pnl_owner     === pnlOwnerFilter;
    const matchRegion      = !regionFilter      || r.region        === regionFilter;
    const matchRequestedBy = !requestedByFilter || r.requested_by  === requestedByFilter;
    return matchSearch && matchStatus && matchDept && matchCounterParty && matchBizSegment && matchPnlOwner && matchRegion && matchRequestedBy;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / RL_PAGE_SIZE));
  const paginated  = filtered.slice((page - 1) * RL_PAGE_SIZE, page * RL_PAGE_SIZE);

  // Reset page on filter/search change
  React.useEffect(() => { setPage(1); }, [search, statusFilter, deptFilter, counterPartyFilter, bizSegmentFilter, pnlOwnerFilter, regionFilter, requestedByFilter]);

  const statusPill = (s: string) => {
    const sl = (s || "").toLowerCase();
    const cls = sl === "open" ? "trk-p-o" : sl === "closed" ? "trk-p-cl" : sl === "on hold" ? "trk-p-h" : "trk-p-x";
    return <span className={`trk-pill ${cls}`}>{s || "—"}</span>;
  };

  const downloadRlCsv = () => {
    if (!rows.length) return;
    const headers = RL_COLS.map(c => c.label);
    const csvRows = rows.map(r =>
      RL_COLS.map(c => {
        const v = c.key === 'is_confidential' ? (r.is_confidential ? 'Yes' : 'No') : String((r as any)[c.key] ?? '');
        return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(',')
    );
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'request-logs.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="lc-pg-content">
      {/* Header */}
      <div className="lc-ph-row">
        <h1 className="lc-ph-h">Request Logs</h1>
        <div className="lc-ph-actions">
          <button className="lc-btn-refresh" onClick={() => refetch()}>
            <i className="fa-solid fa-rotate"></i> Refresh
          </button>
          <button className="lc-btn-refresh" onClick={downloadRlCsv} disabled={!rows.length} title="Download all request logs as CSV">
            <i className="fa-solid fa-download"></i> Download CSV
          </button>
          {isAdmin && (
            <button className="rl-create-btn" onClick={openCreate}>
              <i className="fa-solid fa-plus"></i> Create Request
            </button>
          )}
        </div>
      </div>

      {/* KPI cards — same trk-kpi-row style as Live Tracker */}
      <div className="trk-kpi-row">
        <div className="trk-kpi">
          <div className="trk-kpi-lbl">Total Requests</div>
          <div className="trk-kpi-val" style={{color:"#416dff"}}>{isLoading ? "…" : total}</div>
          <div className="trk-kpi-sub">Always live</div>
        </div>
        <div className="trk-kpi">
          <div className="trk-kpi-lbl">Open</div>
          <div className="trk-kpi-val" style={{color:"#d97706"}}>{isLoading ? "…" : open}</div>
          <div className="trk-kpi-sub">{total ? ((open / total) * 100).toFixed(0) : 0}% of total</div>
        </div>
        <div className="trk-kpi">
          <div className="trk-kpi-lbl">Closed</div>
          <div className="trk-kpi-val" style={{color:"#059669"}}>{isLoading ? "…" : closed}</div>
          <div className="trk-kpi-sub">{total ? ((closed / total) * 100).toFixed(0) : 0}% resolved</div>
        </div>
        <div className="trk-kpi">
          <div className="trk-kpi-lbl">Pending</div>
          <div className="trk-kpi-val" style={{color:"#0891b2"}}>{isLoading ? "…" : pending}</div>
          <div className="trk-kpi-sub">Awaiting response</div>
        </div>
      </div>

      {/* Row 1: Search bar */}
      <div className="rl-search-row">
        <div className="rl-search-wrap">
          <i className="fa-solid fa-magnifying-glass rl-search-ico"></i>
          <input
            className="rl-search-in"
            placeholder="Search by name, email, request ID, department, type…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="rl-search-clear" onClick={() => setSearch("")}>✕</button>}
        </div>
      </div>

      {/* Row 2: First 3 filters */}
      <div className="rl-filter-row">
        <select className="rl-fsel" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="on hold">On Hold</option>
          <option value="pending">Pending</option>
        </select>
        <select className="rl-fsel" value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d}>{d}</option>)}
        </select>
        <select className="rl-fsel" value={counterPartyFilter} onChange={e => setCounterPartyFilter(e.target.value)}>
          <option value="">All Counter Parties</option>
          {counterParties.map(v => <option key={v}>{v}</option>)}
        </select>
      </div>

      {/* Row 3: Next 4 filters */}
      <div className="rl-filter-row">
        <select className="rl-fsel" value={bizSegmentFilter} onChange={e => setBizSegmentFilter(e.target.value)}>
          <option value="">All Business Segments</option>
          {bizSegments.map(v => <option key={v}>{v}</option>)}
        </select>
        <select className="rl-fsel" value={pnlOwnerFilter} onChange={e => setPnlOwnerFilter(e.target.value)}>
          <option value="">All PNL Owners</option>
          {pnlOwners.map(v => <option key={v}>{v}</option>)}
        </select>
        <select className="rl-fsel" value={regionFilter} onChange={e => setRegionFilter(e.target.value)}>
          <option value="">All Regions</option>
          {regions.map(v => <option key={v}>{v}</option>)}
        </select>
        <select className="rl-fsel" value={requestedByFilter} onChange={e => setRequestedByFilter(e.target.value)}>
          <option value="">All Requested By</option>
          {requestedBys.map(v => <option key={v}>{v}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rl-table-card">
        <div className="rl-table-header">
          <div className="rl-table-title">
            <i className="fa-solid fa-table-list" style={{marginRight:8,color:"#092045"}}></i>
            Request Logs
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
            <span className="rl-record-count">{!isLoading && `${filtered.length} records`}</span>
            {filtered.length < rows.length && !isLoading && (
              <span style={{fontSize:'0.72rem',color:'#9ca3af'}}>(filtered from {rows.length} total)</span>
            )}
          </div>
        </div>
        <div className="rl-scroll-x">
          <table className="rl-tbl">
            <thead>
              <tr>
                {RL_COLS.map(c => <th key={c.key}>{c.label}</th>)}
                {isAdmin && <th style={{width:70}}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={RL_COLS.length + (isAdmin ? 1 : 0)} className="rl-empty-cell">Loading…</td></tr>
              ) : !filtered.length ? (
                <tr><td colSpan={RL_COLS.length + (isAdmin ? 1 : 0)} className="rl-empty-cell">No records match the selected filters.</td></tr>
              ) : paginated.map((r, i) => (
                <tr key={i}>
                  {RL_COLS.map(c => {
                    if (c.key === "current_status") return <td key={c.key}>{statusPill(r.current_status)}</td>;
                    if (c.key === "is_confidential") return <td key={c.key} style={{textAlign:"center"}}>{r.is_confidential ? <span className="rl-conf-yes">Yes</span> : <span className="rl-conf-no">No</span>}</td>;
                    const v  = String((r as any)[c.key] ?? "");
                    const vs = v.length > 36 ? v.substring(0, 36) + "…" : v;
                    return <td key={c.key} title={v}>{vs || <span className="rl-dash">—</span>}</td>;
                  })}
                  {isAdmin && (
                    <td>
                      <button className="rl-edit-btn" onClick={() => openEdit(r)} title="Edit this request">
                        <i className="fa-solid fa-pen-to-square"></i> Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div className="rl-pagination">
          <button className="rl-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className="rl-page-info">Page {page} of {totalPages} &nbsp;·&nbsp; {filtered.length} records</span>
          <button className="rl-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="rl-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="rl-modal">
            <div className="rl-modal-hd">
              <div className="rl-modal-hd-title">
                <i className={editMode ? "fa-solid fa-pen-to-square" : "fa-solid fa-plus"}></i>
                {editMode ? `Edit Request — ${form.request_id}` : 'Create New Request'}
              </div>
              <button className="rl-modal-close" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <div className="rl-modal-body">
              {modalErr && <div className="rl-modal-err">⚠️ {modalErr}</div>}
              {modalOk  && <div className="rl-modal-ok">✅ {modalOk}</div>}
              <form id="rl-modal-form" onSubmit={handleModalSubmit}>
                <div className="rl-modal-fgrid">

                  {/* Requester Name + Email */}
                  <div className="rl-modal-fg">
                    <label>Requester Name *</label>
                    <input type="text" required value={form.requester_name} onChange={e => setF('requester_name', e.target.value)} placeholder="Full name" />
                  </div>
                  <div className="rl-modal-fg">
                    <label>Email *</label>
                    <input type="email" required value={form.requester_email} onChange={e => setF('requester_email', e.target.value)} placeholder="name@gofynd.com" />
                  </div>

                  {/* Department + Request Type */}
                  <div className="rl-modal-fg">
                    <label>Department *</label>
                    <select required value={form.department} onChange={e => setF('department', e.target.value)}>
                      <option value="">Select department</option>
                      {["Engineering","Product","Marketing","Finance","HR / People","Operations","Business Development","Customer Success","Other"].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="rl-modal-fg">
                    <label>Request Type *</label>
                    <select required value={form.request_type} onChange={e => setF('request_type', e.target.value)}>
                      <option value="">Select type</option>
                      {["Contract Review","NDA Drafting / Review","Vendor Agreement","IP / Trademark Query","Privacy / Data Protection","Compliance Advisory","Employment / HR Matter","Dispute Support","General Legal Query"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Counter Party + Customer Type */}
                  <div className="rl-modal-fg">
                    <label>Counter Party</label>
                    <input type="text" value={form.counter_party} onChange={e => setF('counter_party', e.target.value)} placeholder="Legal name of counterparty" />
                  </div>
                  <div className="rl-modal-fg">
                    <label>Customer Type</label>
                    {dynSel(opts?.customer_types, 'customer_type')}
                  </div>

                  {/* IP / Product + Business Segment */}
                  <div className="rl-modal-fg">
                    <label>IP / Product</label>
                    {dynSel(opts?.ip_products, 'ip_product')}
                  </div>
                  <div className="rl-modal-fg">
                    <label>Business Segment</label>
                    {dynSel(opts?.business_segments, 'biz_segment')}
                  </div>

                  {/* PNL Owner + Region */}
                  <div className="rl-modal-fg">
                    <label>PNL Owner</label>
                    {dynSel(opts?.pnl_owners, 'pnl_owner')}
                  </div>
                  <div className="rl-modal-fg">
                    <label>Region</label>
                    {dynSel(opts?.regions, 'region')}
                  </div>

                  {/* Priority + Deadline */}
                  <div className="rl-modal-fg">
                    <label>Priority</label>
                    <select value={form.priority} onChange={e => setF('priority', e.target.value)}>
                      <option value="Normal (48 hrs)">Normal (48 hrs)</option>
                      <option value="High (24 hrs)">High (24 hrs)</option>
                      <option value="Urgent (same day)">Urgent (same day)</option>
                    </select>
                  </div>
                  <div className="rl-modal-fg">
                    <label>Deadline</label>
                    <input type="date" value={form.deadline} onChange={e => setF('deadline', e.target.value)} />
                  </div>

                  {/* Status (edit only) */}
                  {editMode && (
                    <div className="rl-modal-fg">
                      <label>Status</label>
                      <select value={form.current_status} onChange={e => setF('current_status', e.target.value)}>
                        {['request-raised','under-legal-review','pending-from-business','pending-from-finance','pending-from-client','on-hold','executed'].map(s => (
                          <option key={s} value={s}>{s.replace(/-/g,' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Confidential */}
                  <div className="rl-modal-fg" style={{justifyContent:'center'}}>
                    <label>Confidential</label>
                    <label style={{display:'flex',alignItems:'center',gap:'.5rem',cursor:'pointer',marginTop:'.2rem'}}>
                      <input type="checkbox" checked={form.is_confidential} onChange={e => setF('is_confidential', e.target.checked)} style={{width:'auto',accentColor:'#092045'}} />
                      <span style={{fontSize:'.85rem',color:'#374151'}}>Mark as confidential</span>
                    </label>
                  </div>

                  {/* Description */}
                  <div className="rl-modal-fg full">
                    <label>Description {!editMode && '*'}</label>
                    <textarea
                      required={!editMode}
                      rows={4}
                      value={form.description}
                      onChange={e => setF('description', e.target.value)}
                      placeholder="Describe the legal matter…"
                    />
                  </div>

                  {/* Doc Link */}
                  <div className="rl-modal-fg full">
                    <label>Supporting Documents</label>
                    <input type="text" value={form.doc_link} onChange={e => setF('doc_link', e.target.value)} placeholder="Paste a Drive / SharePoint link" />
                  </div>

                </div>
              </form>
            </div>
            <div className="rl-modal-ft">
              <button className="rl-modal-btn-cancel" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
              <button
                className="rl-modal-btn-save"
                type="submit"
                form="rl-modal-form"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) ? (
                  <><i className="fa-solid fa-spinner fa-spin"></i> Saving…</>
                ) : editMode ? (
                  <><i className="fa-solid fa-floppy-disk"></i> Save Changes</>
                ) : (
                  <><i className="fa-solid fa-plus"></i> Create Request</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LegalDashboard() {
  const { lcUser, lcLogout } = useLcUser();
  // Allow URL param ?page=dashboard to set initial page (used by server-side PDF generation)
  const initialPage = (new URLSearchParams(window.location.search).get('page') as Page | null) || 'requests';
  const [activePage, setActivePage] = useState<Page>(initialPage);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  // Expose navigation so child pages can navigate
  const navTo = (p: Page) => setActivePage(p);

  const isAdmin = !!(lcUser && LC_ADMIN_EMAILS.has(lcUser.email));

  // All @gofynd.com users have access to all sidebar sections — no user management gating
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const hasScope = (_scopeId: string) => true;

  const pageComponents: Record<Page, React.ReactElement> = {
    dashboard:       <DashboardPage onNavigate={navTo} />,
    tracker:         <TrackerPage />,
    requests:        <RequestsPage />,
    workflows:       <WorkflowsPage />,
    team:            <TeamPage />,
    templates:       <TemplatesPage />,
    "requests-logs": <RequestsLogsPage />,
    "fynds-ipr":     <IPRPage />,
    litigation:      <LitigationPage />,
    "user-management": <LegalUserManagement />,
  };

  return (
    <div className="lc-shell">
      {/* Topbar — Boltic-style */}
      <header className="lc-topbar">
        {/* Left: Fynd heart logo + divider + app name */}
        <div className="lc-tb-left">
          <div className="lc-tb-brand">
            {/* Fynd logo — original image, inverted to white on dark bg */}
            <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAgEAlgCWAAD/7QAsUGhvdG9zaG9wIDMuMAA4QklNA+0AAAAAABAAlgAAAAEAAQCWAAAAAQAB/+GJU2h0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8APD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4KPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgOS4xLWMwMDIgNzkuYTZhNjM5NiwgMjAyNC8wMy8xMi0wNzo0ODoyMyAgICAgICAgIj4KICAgPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICAgICAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgICAgICAgICAgeG1sbnM6ZGM9Imh0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvIgogICAgICAgICAgICB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iCiAgICAgICAgICAgIHhtbG5zOnhtcEdJbWc9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9nL2ltZy8iCiAgICAgICAgICAgIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIgogICAgICAgICAgICB4bWxuczpzdFJlZj0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlUmVmIyIKICAgICAgICAgICAgeG1sbnM6c3RFdnQ9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZUV2ZW50IyIKICAgICAgICAgICAgeG1sbnM6c3RNZnM9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9NYW5pZmVzdEl0ZW0jIgogICAgICAgICAgICB4bWxuczppbGx1c3RyYXRvcj0iaHR0cDovL25zLmFkb2JlLmNvbS9pbGx1c3RyYXRvci8xLjAvIgogICAgICAgICAgICB4bWxuczpwZGY9Imh0dHA6Ly9ucy5hZG9iZS5jb20vcGRmLzEuMy8iPgogICAgICAgICA8ZGM6Zm9ybWF0PmltYWdlL2pwZWc8L2RjOmZvcm1hdD4KICAgICAgICAgPGRjOnRpdGxlPgogICAgICAgICAgICA8cmRmOkFsdD4KICAgICAgICAgICAgICAgPHJkZjpsaSB4bWw6bGFuZz0ieC1kZWZhdWx0Ij5MaW5rZWRJbiBjb3ZlcjwvcmRmOmxpPgogICAgICAgICAgICA8L3JkZjpBbHQ+CiAgICAgICAgIDwvZGM6dGl0bGU+CiAgICAgICAgIDx4bXA6TWV0YWRhdGFEYXRlPjIwMjUtMDEtMzBUMTI6MDg6NTcrMDU6MzA8L3htcDpNZXRhZGF0YURhdGU+CiAgICAgICAgIDx4bXA6TW9kaWZ5RGF0ZT4yMDI1LTAxLTMwVDA2OjM4OjU5WjwveG1wOk1vZGlmeURhdGU+CiAgICAgICAgIDx4bXA6Q3JlYXRlRGF0ZT4yMDI1LTAxLTMwVDEyOjA4OjU3KzA1OjMwPC94bXA6Q3JlYXRlRGF0ZT4KICAgICAgICAgPHhtcDpDcmVhdG9yVG9vbD5BZG9iZSBJbGx1c3RyYXRvciAyOC41IChNYWNpbnRvc2gpPC94bXA6Q3JlYXRvclRvb2w+CiAgICAgICAgIDx4bXA6VGh1bWJuYWlscz4KICAgICAgICAgICAgPHJkZjpBbHQ+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8eG1wR0ltZzp3aWR0aD4yNTY8L3htcEdJbWc6d2lkdGg+CiAgICAgICAgICAgICAgICAgIDx4bXBHSW1nOmhlaWdodD4yMjg8L3htcEdJbWc6aGVpZ2h0PgogICAgICAgICAgICAgICAgICA8eG1wR0ltZzpmb3JtYXQ+SlBFRzwveG1wR0ltZzpmb3JtYXQ+CiAgICAgICAgICAgICAgICAgIDx4bXBHSW1nOmltYWdlPi85ai80QUFRU2taSlJnQUJBZ0VBbGdDV0FBRC83UUFzVUdodmRHOXphRzl3SURNdU1BQTRRa2xOQSswQUFBQUFBQkFBbGdBQUFBRUEmI3hBO0FRQ1dBQUFBQVFBQi8rSVFDRWxEUTE5UVVrOUdTVXhGQUFFQkFBQVArR0Z3Y0d3Q0VBQUFiVzUwY2xKSFFpQllXVm9nQitrQUFRQVMmI3hBO0FCSUFKUUFVWVdOemNFRlFVRXdBQUFBQVFWQlFUQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBUGJXQUFFQUFBQUEweTFoY0hCc0FBQUEmI3hBO0FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBU1pHVnpZd0FBQVZ3QUFBQmkmI3hBO1pITmpiUUFBQWNBQUFBU2NZM0J5ZEFBQUJsd0FBQUFqZDNSd2RBQUFCb0FBQUFBVWNsaFpXZ0FBQnBRQUFBQVVaMWhaV2dBQUJxZ0EmI3hBO0FBQVVZbGhaV2dBQUJyd0FBQUFVY2xSU1F3QUFCdEFBQUFnTVlXRnlad0FBRHR3QUFBQWdkbU5uZEFBQUR2d0FBQUF3Ym1ScGJnQUEmI3hBO0R5d0FBQUErWTJoaFpBQUFEMndBQUFBc2JXMXZaQUFBRDVnQUFBQW9kbU5uY0FBQUQ4QUFBQUE0WWxSU1F3QUFCdEFBQUFnTVoxUlMmI3hBO1F3QUFCdEFBQUFnTVlXRmlad0FBRHR3QUFBQWdZV0ZuWndBQUR0d0FBQUFnWkdWell3QUFBQUFBQUFBSVJHbHpjR3hoZVFBQUFBQUEmI3hBO0FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUEmI3hBO0FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFHMXNkV01BQUFBQUFBQUFKZ0FBQUF4b2NraFNBQUFBRkFBQUFkaHJiMHRTQUFBQURBQUEmI3hBO0FleHVZazVQQUFBQUVnQUFBZmhwWkFBQUFBQUFFZ0FBQWdwb2RVaFZBQUFBRkFBQUFoeGpjME5hQUFBQUZnQUFBakJrWVVSTEFBQUEmI3hBO0hBQUFBa1p1YkU1TUFBQUFGZ0FBQW1KbWFVWkpBQUFBRUFBQUFuaHBkRWxVQUFBQUdBQUFBb2hsYzBWVEFBQUFGZ0FBQXFCeWIxSlAmI3hBO0FBQUFFZ0FBQXJabWNrTkJBQUFBRmdBQUFzaGhjZ0FBQUFBQUZBQUFBdDUxYTFWQkFBQUFIQUFBQXZKb1pVbE1BQUFBRmdBQUF3NTYmI3hBO2FGUlhBQUFBQ2dBQUF5UjJhVlpPQUFBQURnQUFBeTV6YTFOTEFBQUFGZ0FBQXp4NmFFTk9BQUFBQ2dBQUF5UnlkVkpWQUFBQUpBQUEmI3hBO0ExSmxia2RDQUFBQUZBQUFBM1ptY2taU0FBQUFGZ0FBQTRwdGN3QUFBQUFBRWdBQUE2Qm9hVWxPQUFBQUVnQUFBN0owYUZSSUFBQUEmI3hBO0RBQUFBOFJqWVVWVEFBQUFHQUFBQTlCbGJrRlZBQUFBRkFBQUEzWmxjMWhNQUFBQUVnQUFBclprWlVSRkFBQUFFQUFBQStobGJsVlQmI3hBO0FBQUFFZ0FBQS9od2RFSlNBQUFBR0FBQUJBcHdiRkJNQUFBQUVnQUFCQ0psYkVkU0FBQUFJZ0FBQkRSemRsTkZBQUFBRUFBQUJGWjAmI3hBO2NsUlNBQUFBRkFBQUJHWndkRkJVQUFBQUZnQUFCSHBxWVVwUUFBQUFEQUFBQkpBQVRBQkRBRVFBSUFCMUFDQUFZZ0J2QUdvQWFjN3MmI3hBO3Qrd0FJQUJNQUVNQVJBQkdBR0VBY2dCbkFHVUFMUUJNQUVNQVJBQk1BRU1BUkFBZ0FGY0FZUUJ5QUc0QVlRQlRBSG9BN1FCdUFHVUEmI3hBO2N3QWdBRXdBUXdCRUFFSUFZUUJ5QUdVQWRnQnVBUDBBSUFCTUFFTUFSQUJNQUVNQVJBQXRBR1lBWVFCeUFIWUFaUUJ6QUdzQTVnQnkmI3hBO0FHMEFTd0JzQUdVQWRRQnlBR1VBYmdBdEFFd0FRd0JFQUZZQTVBQnlBR2tBTFFCTUFFTUFSQUJNQUVNQVJBQWdBR0VBSUFCakFHOEEmI3hBO2JBQnZBSElBYVFCTUFFTUFSQUFnQUdFQUlBQmpBRzhBYkFCdkFISUFUQUJEQUVRQUlBQmpBRzhBYkFCdkFISUFRUUJEQUV3QUlBQmomI3hBO0FHOEFkUUJzQUdVQWRRQnlJQThBVEFCREFFUUFJQVpGQmtRR1NBWkdCaWtFR2dRK0JEc0VUQVErQkVBRVBnUXlCRGdFT1FBZ0FFd0EmI3hBO1F3QkVJQThBVEFCREFFUUFJQVhtQmRFRjRnWFZCZUFGMlY5cGduSUFUQUJEQUVRQVRBQkRBRVFBSUFCTkFPQUFkUUJHQUdFQWNnQmwmI3hBO0FHSUFiZ0Q5QUNBQVRBQkRBRVFFSmdReUJEVUVRZ1E5QkQ0RU9RQWdCQllFR2dBdEJEUUVPQVJCQkQ4RU93UTFCRGtBUXdCdkFHd0EmI3hBO2J3QjFBSElBSUFCTUFFTUFSQUJNQUVNQVJBQWdBR01BYndCMUFHd0FaUUIxQUhJQVZ3QmhBSElBYmdCaEFDQUFUQUJEQUVRSk1Ba0MmI3hBO0NSY0pRQWtvQUNBQVRBQkRBRVFBVEFCREFFUUFJQTRxRGpVQVRBQkRBRVFBSUFCbEFHNEFJQUJqQUc4QWJBQnZBSElBUmdCaEFISUEmI3hBO1lnQXRBRXdBUXdCRUFFTUFid0JzQUc4QWNnQWdBRXdBUXdCRUFFd0FRd0JFQUNBQVF3QnZBR3dBYndCeUFHa0FaQUJ2QUVzQWJ3QnMmI3hBO0FHOEFjZ0FnQUV3QVF3QkVBNGdEc3dQSEE4RUR5UU84QTdjQUlBTy9BN2dEekFPOUE3Y0FJQUJNQUVNQVJBQkdBT1FBY2dCbkFDMEEmI3hBO1RBQkRBRVFBVWdCbEFHNEFhd0JzQUdrQUlBQk1BRU1BUkFCTUFFTUFSQUFnQUdFQUlBQkRBRzhBY2dCbEFITXdxekRwTVB3QVRBQkQmI3hBO0FFUjBaWGgwQUFBQUFFTnZjSGx5YVdkb2RDQkJjSEJzWlNCSmJtTXVMQ0F5TURJMUFBQllXVm9nQUFBQUFBQUE4MUVBQVFBQUFBRVcmI3hBO3pGaFpXaUFBQUFBQUFBQ0Qzd0FBUGIvLy8vKzdXRmxhSUFBQUFBQUFBRXEvQUFDeE53QUFDcmxZV1ZvZ0FBQUFBQUFBS0RnQUFCRUwmI3hBO0FBREl1V04xY25ZQUFBQUFBQUFFQUFBQUFBVUFDZ0FQQUJRQUdRQWVBQ01BS0FBdEFESUFOZ0E3QUVBQVJRQktBRThBVkFCWkFGNEEmI3hBO1l3Qm9BRzBBY2dCM0FId0FnUUNHQUlzQWtBQ1ZBSm9BbndDakFLZ0FyUUN5QUxjQXZBREJBTVlBeXdEUUFOVUEyd0RnQU9VQTZ3RHcmI3hBO0FQWUErd0VCQVFjQkRRRVRBUmtCSHdFbEFTc0JNZ0U0QVQ0QlJRRk1BVklCV1FGZ0FXY0JiZ0YxQVh3Qmd3R0xBWklCbWdHaEFha0ImI3hBO3NRRzVBY0VCeVFIUkFka0I0UUhwQWZJQitnSURBZ3dDRkFJZEFpWUNMd0k0QWtFQ1N3SlVBbDBDWndKeEFub0NoQUtPQXBnQ29nS3MmI3hBO0FyWUN3UUxMQXRVQzRBTHJBdlVEQUFNTEF4WURJUU10QXpnRFF3TlBBMW9EWmdOeUEzNERpZ09XQTZJRHJnTzZBOGNEMHdQZ0Erd0QmI3hBOytRUUdCQk1FSUFRdEJEc0VTQVJWQkdNRWNRUitCSXdFbWdTb0JMWUV4QVRUQk9FRThBVCtCUTBGSEFVckJUb0ZTUVZZQldjRmR3V0cmI3hBO0JaWUZwZ1cxQmNVRjFRWGxCZllHQmdZV0JpY0dOd1pJQmxrR2FnWjdCb3dHblFhdkJzQUcwUWJqQnZVSEJ3Y1pCeXNIUFFkUEIyRUgmI3hBO2RBZUdCNWtIckFlL0I5SUg1UWY0Q0FzSUh3Z3lDRVlJV2dodUNJSUlsZ2lxQ0w0STBnam5DUHNKRUFrbENUb0pUd2xrQ1hrSmp3bWsmI3hBO0Nib0p6d25sQ2ZzS0VRb25DajBLVkFwcUNvRUttQXF1Q3NVSzNBcnpDd3NMSWdzNUMxRUxhUXVBQzVnTHNBdklDK0VMK1F3U0RDb00mI3hBO1F3eGNESFVNamd5bkRNQU0yUXp6RFEwTkpnMUFEVm9OZEEyT0Rha053dzNlRGZnT0V3NHVEa2tPWkE1L0Rwc090ZzdTRHU0UENROGwmI3hBO0QwRVBYZzk2RDVZUHN3L1BEK3dRQ1JBbUVFTVFZUkIrRUpzUXVSRFhFUFVSRXhFeEVVOFJiUkdNRWFvUnlSSG9FZ2NTSmhKRkVtUVMmI3hBO2hCS2pFc01TNHhNREV5TVRReE5qRTRNVHBCUEZFK1VVQmhRbkZFa1VhaFNMRkswVXpoVHdGUklWTkJWV0ZYZ1ZteFc5RmVBV0F4WW0mI3hBO0Zra1diQmFQRnJJVzFoYjZGeDBYUVJkbEY0a1hyaGZTRi9jWUd4aEFHR1VZaWhpdkdOVVkraGtnR1VVWmF4bVJHYmNaM1JvRUdpb2EmI3hBO1VScDNHcDRheFJyc0d4UWJPeHRqRzRvYnNodmFIQUljS2h4U0hIc2NveHpNSFBVZEhoMUhIWEFkbVIzREhld2VGaDVBSG1vZWxCNismI3hBO0h1a2ZFeDgrSDJrZmxCKy9IK29nRlNCQklHd2dtQ0RFSVBBaEhDRklJWFVob1NIT0lmc2lKeUpWSW9JaXJ5TGRJd29qT0NObUk1UWomI3hBO3dpUHdKQjhrVFNSOEpLc2syaVVKSlRnbGFDV1hKY2NsOXlZbkpsY21oeWEzSnVnbkdDZEpKM29ucXlmY0tBMG9QeWh4S0tJbzFDa0cmI3hBO0tUZ3BheW1kS2RBcUFpbzFLbWdxbXlyUEt3SXJOaXRwSzUwcjBTd0ZMRGtzYml5aUxOY3REQzFCTFhZdHF5M2hMaFl1VEM2Q0xyY3UmI3hBOzdpOGtMMW92a1MvSEwvNHdOVEJzTUtRdzJ6RVNNVW94Z2pHNk1mSXlLakpqTXBzeTFETU5NMFl6ZnpPNE0vRTBLelJsTko0MDJEVVQmI3hBO05VMDFoelhDTmYwMk56WnlOcTQyNlRja04yQTNuRGZYT0JRNFVEaU1PTWc1QlRsQ09YODV2RG41T2pZNmREcXlPdTg3TFR0ck82bzcmI3hBOzZEd25QR1U4cER6alBTSTlZVDJoUGVBK0lENWdQcUErNEQ4aFAyRS9vai9pUUNOQVpFQ21RT2RCS1VGcVFheEI3a0l3UW5KQ3RVTDMmI3hBO1F6cERmVVBBUkFORVIwU0tSTTVGRWtWVlJacEYza1lpUm1kR3EwYndSelZIZTBmQVNBVklTMGlSU05kSkhVbGpTYWxKOEVvM1NuMUsmI3hBO3hFc01TMU5MbWt2aVRDcE1ja3k2VFFKTlNrMlRUZHhPSlU1dVRyZFBBRTlKVDVOUDNWQW5VSEZRdTFFR1VWQlJtMUhtVWpGU2ZGTEgmI3hBO1V4TlRYMU9xVS9aVVFsU1BWTnRWS0ZWMVZjSldEMVpjVnFsVzkxZEVWNUpYNEZndldIMVl5MWthV1dsWnVGb0hXbFphcGxyMVcwVmImI3hBO2xWdmxYRFZjaGx6V1hTZGRlRjNKWGhwZWJGNjlYdzlmWVYrellBVmdWMkNxWVB4aFQyR2lZZlZpU1dLY1l2QmpRMk9YWSt0a1FHU1UmI3hBO1pPbGxQV1dTWmVkbVBXYVNadWhuUFdlVForbG9QMmlXYU94cFEybWFhZkZxU0dxZmF2ZHJUMnVuYS85c1YyeXZiUWh0WUcyNWJoSnUmI3hBO2EyN0VieDV2ZUcvUmNDdHdobkRnY1RweGxYSHdja3R5cG5NQmMxMXp1SFFVZEhCMHpIVW9kWVYxNFhZK2RwdDIrSGRXZDdONEVYaHUmI3hBO2VNeDVLbm1KZWVkNlJucWxld1I3WTN2Q2ZDRjhnWHpoZlVGOW9YNEJmbUord244amY0Ui81WUJIZ0tpQkNvRnJnYzJDTUlLU2d2U0QmI3hBO1Y0TzZoQjJFZ0lUamhVZUZxNFlPaG5LRzE0YzdoNStJQklocGlNNkpNNG1aaWY2S1pJcktpekNMbG92OGpHT015bzB4alppTi80NW0mI3hBO2pzNlBObytla0FhUWJwRFdrVCtScUpJUmtucVM0NU5OazdhVUlKU0tsUFNWWDVYSmxqU1duNWNLbDNXWDRKaE1tTGlaSkptUW1meWEmI3hBO2FKclZtMEticjV3Y25JbWM5NTFrbmRLZVFKNnVueDJmaTUvNm9HbWcyS0ZIb2JhaUpxS1dvd2FqZHFQbXBGYWt4NlU0cGFtbUdxYUwmI3hBO3B2Mm5icWZncUZLb3hLazNxYW1xSEtxUHF3S3JkYXZwckZ5czBLMUVyYml1TGE2aHJ4YXZpN0FBc0hXdzZyRmdzZGF5UzdMQ3N6aXomI3hBO3JyUWx0SnkxRTdXS3RnRzJlYmJ3dDJpMzRMaFp1Tkc1U3JuQ3VqdTZ0YnN1dTZlOElieWJ2Ulc5ajc0S3ZvUysvNzk2di9YQWNNRHMmI3hBO3dXZkI0OEpmd3R2RFdNUFV4RkhFenNWTHhjakdSc2JEeDBISHY4Zzl5THpKT3NtNXlqakt0OHMyeTdiTU5jeTF6VFhOdGM0MnpyYlAmI3hBO044KzQwRG5RdXRFODBiN1NQOUxCMDBUVHh0UkoxTXZWVHRYUjFsWFcyTmRjMStEWVpOam8yV3paOGRwMjJ2dmJnTndGM0lyZEVOMlcmI3hBOzNoemVvdDhwMzYvZ051Qzk0VVRoek9KVDR0dmpZK1ByNUhQay9PV0U1ZzNtbHVjZjU2bm9NdWk4NlVicDBPcGI2dVhyY092NzdJYnQmI3hBO0VlMmM3aWp1dE85QTc4endXUERsOFhMeC8vS004eG56cC9RMDlNTDFVUFhlOW0zMisvZUsrQm40cVBrNCtjZjZWL3JuKzNmOEIveVkmI3hBOy9Tbjl1djVML3R6L2JmLy9jR0Z5WVFBQUFBQUFBd0FBQUFKbVpnQUE4cWNBQUExWkFBQVQwQUFBQ2x0MlkyZDBBQUFBQUFBQUFBRUEmI3hBO0FRQUFBQUFBQUFBQkFBQUFBUUFBQUFBQUFBQUJBQUFBQVFBQUFBQUFBQUFCQUFCdVpHbHVBQUFBQUFBQUFEWUFBSzRVQUFCUjdBQUEmI3hBO1E5Y0FBTENrQUFBbVpnQUFEMXdBQUZBTkFBQlVPUUFDTXpNQUFqTXpBQUl6TXdBQUFBQUFBQUFBYzJZek1nQUFBQUFBQVF4Q0FBQUYmI3hBOzN2Ly84eVlBQUFlVEFBRDlrUC8vKzZMLy8vMmpBQUFEM0FBQXdHNXRiVzlrQUFBQUFBQUFCaEFBQUtCTy9XSnRZZ0FBQUFBQUFBQUEmI3hBO0FBQUFBQUFBQUFBQUFBQUFkbU5uY0FBQUFBQUFBd0FBQUFKbVpnQURBQUFBQW1abUFBTUFBQUFDWm1ZQUFBQUNNek0wQUFBQUFBSXomI3hBO016UUFBQUFBQWpNek5BRC83Z0FPUVdSdlltVUFaTUFBQUFBQi85c0FoQUFHQkFRRUJRUUdCUVVHQ1FZRkJna0xDQVlHQ0FzTUNnb0wmI3hBO0Nnb01FQXdNREF3TURCQU1EZzhRRHc0TUV4TVVGQk1USEJzYkd4d2ZIeDhmSHg4Zkh4OGZBUWNIQncwTURSZ1FFQmdhRlJFVkdoOGYmI3hBO0h4OGZIeDhmSHg4Zkh4OGZIeDhmSHg4Zkh4OGZIeDhmSHg4Zkh4OGZIeDhmSHg4Zkh4OGZIeDhmSHg4Zkh4Ly93QUFSQ0FEa0FRQUQmI3hBO0FSRUFBaEVCQXhFQi84UUJvZ0FBQUFjQkFRRUJBUUFBQUFBQUFBQUFCQVVEQWdZQkFBY0lDUW9MQVFBQ0FnTUJBUUVCQVFBQUFBQUEmI3hBO0FBQUJBQUlEQkFVR0J3Z0pDZ3NRQUFJQkF3TUNCQUlHQndNRUFnWUNjd0VDQXhFRUFBVWhFakZCVVFZVFlTSnhnUlF5a2FFSEZiRkMmI3hBO0k4RlMwZUV6Rm1Md0pIS0M4U1ZETkZPU29ySmpjOEkxUkNlVG83TTJGMVJrZE1QUzRnZ21nd2tLR0JtRWxFVkdwTFJXMDFVb0d2TGomI3hBOzg4VFU1UFJsZFlXVnBiWEYxZVgxWm5hR2xxYTJ4dGJtOWpkSFYyZDNoNWVudDhmWDUvYzRTRmhvZUlpWXFMakkyT2o0S1RsSldXbDUmI3hBO2labXB1Y25aNmZrcU9rcGFhbnFLbXFxNnl0cnEraEVBQWdJQkFnTUZCUVFGQmdRSUF3TnRBUUFDRVFNRUlSSXhRUVZSRTJFaUJuR0ImI3hBO2tUS2hzZkFVd2RIaEkwSVZVbUp5OFRNa05FT0NGcEpUSmFKanNzSUhjOUkxNGtTREYxU1RDQWtLR0JrbU5rVWFKMlIwVlRmeW83UEQmI3hBO0tDblQ0L09FbEtTMHhOVGs5R1YxaFpXbHRjWFY1ZlZHVm1aMmhwYW10c2JXNXZaSFYyZDNoNWVudDhmWDUvYzRTRmhvZUlpWXFMakkmI3hBOzJPajRPVWxaYVhtSm1hbTV5ZG5wK1NvNlNscHFlb3FhcXJySzJ1cjYvOW9BREFNQkFBSVJBeEVBUHdEMVRpcnNWZGlyc1ZkaXJzVmQmI3hBO2lyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnovd0RQcjZ0L3lxbldSY2hqQjZsanpDTHpKLzArQ253L3RDdlVZUXQwK0pkWFQxdFYmI3hBOzFGck9HWUJKeVZoRUNweFVsdVhKVTRpUGkyd1VKVDVVeEFvVWdtMHVuRjVBd1NlTm9uSTVCWFVxU0Qzb2NLRXowZlZ0VWpQbzJUMjYmI3hBO01VWjNNOGRxcS91bGR5UFVtRkdQSG9LMVkwVUFuamlxL3dEeERyRWl2SjYwUVZBQWYzVnVwTmRoUmFBbnB2VDZjS3JUcit0QWtHV0wmI3hBO1lFbjRJRDBOUDVjYlduZnB6V1NDZlZoMlRuOWkzNmRQRHIvazljYldsS2JXZFVsdDJXU1NNeHlBb3dDUWhxRWI5QnlHeDY0ZUlvNFEmI3hBO2c3T0N5ZWYvQUVya0lGVmk1aks4K253OFE1QVB4VTI4TUpuTG9qZ0RjdHBaOHJscmRpME1UMGhNbkJIYU1rZ0VxSGI0dWxRdktuamgmI3hBO0U1STRJdnQzL25HODEvSmZ5N3NCUVhnb0JUcGZUanRsVWpaYkFLZWxZRXV4VjJLdXhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjImI3hBO0t1eFYyS3V4VjJLdXhWMkt2Ti8rY2lwWGkvSnpYNVVOSGpheVpUMW9SZndFZGNNZWFEeWZFYVNTVG03ZVMzbHVaSldVdEtnWDRXYXAmI3hBO1BLc2JuNHZZcjlPVE5NUXB0ZXl4MVQwa1J1NGVLSW1uVWRVSHRrVXRXOTdkUlhQMXFDUXdYQ21xeVEvdWlwb1I4UERqVGJ3d0VBN0YmI3hBO05zbDgwUlJRZVlOV3RWa0sybHZmWFNRUWZXZUlSWTVuVmVLVWFuRmVuZkdNSWpldDBTTWoxU2MyTnFRM0VxQ0IzdVlkelNvb0tlMlQmI3hBO3NNYUttbGhPdnhMTGIxNkVOTEVmSHhPQm10U3hlZVExbmdTcHFTenFnM0hMWWJmNTdZcW8zTnVZSk9CZEpOZ1EwYks0KzlTY1ZVc1UmI3hBO1B1TC9BSnh1L3dESkwrWGYranovQUtqcDhpV1QwdkFyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnNWZGkmI3hBO3JzVmRpcnpiL25JMUMvNU5lWUVXZ0xHeUFMRUtLbS9nRzdHZ0h6T1NqelJMaytNOU10OU1kN3lXKzFCSXAxa3BTUkk1UzFBVHpxd2wmI3hBO0RWMyt6OSs0eStNSUhuS3ZnMFNuTWNvMzhXN3kwOHV1cXFOVlVTSVNHS1cxRjZEK1JFcjg2bkplRmovbi9ZV0hpNVA1bjJoTHJxM3MmI3hBO0lRdjFTOCt0Y3E4LzNiUjhhZFB0ZGE1WGtqRWZTYitEYmpsSS9VSytMSXRYMVNlYld0VnViVzVXS3oxRzR1THN3dWJTUStuT1RMUmcmI3hBO1pXQmZnS2NhMTVmQ056dlNEYmFoVzFiVi9WNW5VS3lnbXAvMGFuUFlWcUpLSG9LTjkyU3BBS21OVDFkQ3pyZXJ6b0FYcmI4bUNua28mI3hBO1p1ZFNPVzFQRGIyeDJYZEw1OVd2WjQvVGxNYkwyL2RSQWphbXpCYWpiRktEeFE3RlgzRi96amQvNUpmeTcvMGVmOVIwK1JMSjZYZ1YmI3hBOzJLdXhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjJLdXhWNXQvd0E1R3VxZmsxNWdka0VpcWJJbU5xaFcmI3hBO0F2NE5qeEt0USt4eVVPYkdYSjhSVzkxR2h1WEZ4TlppVmxIbzI0SlFvUTFRZVVxTjhPd0FQTDNQak0weEhKQnl6VFRTR1daMmtrYjcmI3hBO1R1U3pIdHVUa1VvdlNQMFlieGYwbVpoWkRrWmZxd1F5a2hUd0M4eUZGWG9DZXczb2VtQXBWcnFPekpZMjBFc2EwSEgxWmtrMzdrOFkmI3hBOzQrbzdkc2xSUnhCREdKdzNINGFpdjdTa2JlOWNGTGFwQjYwRWl5cDZaWWJnUDZicnY4TzZ2eUgzajN3MHRyREJKeDVWV24rdXRmRHAmI3hBO1d1Tkx4TGZUYjIrOGYxd1VtMXhpa1FGdmgrR2grMHA2KzFkOFNGRW4yOS96amVhL2t2NWRQL01iL3dCUjgrUkxKNlhnVjJLdXhWMksmI3hBO3V4VjJLdXhWMkt1eFY0eWZ6bzg5K1lCcldyZVF2TE5ycVBsWFEyZUo5UzFHNitxdmR5UVZhYjZxdEN2QlZwUm5JKy9ZS3FlaGZuZjUmI3hBOzc4OXhtNi9McnlpcytuV3NISyt2ZFluK3JSdGRrQW0xdG1Ua0pDdjh4b1BIanRWVm1Ya0Q4MWRKODArVmRRMW02Z2swaTgwRjVvUE0mI3hBO1duVDFhUzBtdGxMU2pZVmRhQWtFRDI2ZzRxazNsSDg5UjVydkxIOUUrVGRmYlI3K2YwWWRja3Q0MXRBblBnWldjU044Q2tiMHhWNmomI3hBO2lyUWRDN0lHQmRhY2xCM0ZlbFJpckcvTi9uelN2TEIwVVhNY2wwZGIxaTEwS0VXNVJ2U3VMem53YVhreTBWZUh4VTM5c1ZaTGlyc1YmI3hBO2RpcnNWZGlyelA4QTV5VC9BUEpLK1l2K2pML3FQZ3ljT2JHZko4T3hTb2lTOHZ0Rms0bjAwa0hRMUZXTzM4Y25JYnNZblpiSkpFeFomI3hBOy90TzNiZ0VVYmRRRUlIWDJ5S1dvdStCSVpCSmUzaTZkRFBkTEs4VW80UnNwaFJEeFBRcndjdnNPcHc4UjcwY0E3a3FrdkpHZGlFakMmI3hBO25rQVBUaTJEL0pSdjRHbTNhbUJrdFc2a1VVQWo2QWJ4eG5wODF4VlN4UTdGWFlxKzR2OEFuRzcvQU1rdjVkLzZQUDhBcU9ueUpaUFMmI3hBOzhDdXhWMkt1eFYyS3V4VjJLdXhWMkt2bDd5UjVlMUR6ai96anVmeSswbTRqdFBOdmxtL20vVEdoM1R2RDlZQ1hjczMxZWIwMlIxamwmI3hBO0VvWGwwNUxTbzZoVmtubEhSL05PdWVlL0wzbWU0OHNqOHUvTHZrcXhsczdxT2VWa055cnhrdkJHZ0tSZlZvM1BQMUdHL1dwT3lxcmYmI3hBO0kxL0JyUGxyODZmTU5pck5vK3AzR29mbys3SW9rNncyVEl6eCtLazdnKy9qaXFYYVArWHV2djhBODQrL3BhSHpQcTk5Rk41Wm1raTgmI3hBO3VNWURhSDFMTmdJMVVSaVFoSzFRY3ExQTY0cXhMenY1NDh0ZVk3SHlEWmFOZGk3bjBqeWY1amoxRUtyQVJTdjVkWkRFeElBNXFZRzUmI3hBO0FkTnZFWXFpdFM4ci93Q0dkRC9MSFYvSk1VdHA1bzh4ZVhkUUYzTkJJN1MzZHhKb3l6UmN1UmFySk0zN3Z3TlBBVVZTaTFqL0FDalgmI3hBOy9sVVRlVjJQK01QMDdwQTh4cisvOVQxVEt2MWo2MXorRVNDNHI2ZitUeXA4T0t2c3JGWFlxN0ZYWXE3Rlhtbi9BRGtpck4rUy9tRlUmI3hBO0JabU5rRlVDcEpOL0JRQVpQSHpZVDVQaU96dDQrTnliaFVyRXlLVWtaVmJrYTlGTTBESHB2UUduZW1UbHphNGxEWExXcENla09FaWcmI3hBO0xJaWc4U1IxYmtaSksvUlFZS1pyWUtrbW1SS1FpNnhHTkZNQkRDbk53eHEyNXIxcUJzUU9uYkZLbHdmK1UvZGlydUQvQU1wKzdGWGMmI3hBO0gvbFAzWXE3Zy84QUtmdXhWM0IvNVQ5Mkt2dUgvbkc3L3dBa3Y1ZC82UFArbzZmSWxrOUx3SzdGWFlxN0ZYWXE3RlhZcTdGWFlxODYmI3hBOy9NYjhwVjF6VUl2TlhsYTgvd0FQZWZiSmY5RjFlSVVqdUZBcDZGNGdCRWtiRGFwQkk5d0tZcXhTSDh1L3psOCt6cFkvbW5xRm5ZK1YmI3hBO0xaeEpObytpTTZOcURxYXFzOGxTUkVwM3BYZndCb3dWZTBhZHB0aHBsaEJwK24yOGRwWTJxQ0szdG9WQ1JvaTdCVlViQVlxMXFkdmUmI3hBO1hHbTNkdlpYUnNieWFHU08ydlFpeW1HVmxJU1VSdjhBQy9CaUc0dHNlK0t2UGZMZjVQYWxhZWVMVHpqNW44MVhQbVhVOU5obWgwdUomI3hBO3JXQ3lnZ2E1QldhVDByZjRDN3F4Qk5BVDNyUVVWWmY1cTg3K1UvS2R2QmNlWTlUaDB5QzVjeHdTVGtnTzZpcEFvRDJ4VmpLZm56K1MmI3hBO3FNN0o1cDA5V2tOWEtsZ1dQaWFMdmlxLy9sZjM1TmY5VFpZLzhFMy9BRFRpcnY4QWxmMzVOZjhBVTJXUC9CTi96VGlyTDlBOHdhTjUmI3hBO2cwbURWOUZ1NDc3VExubjlYdW9pU2orbTdSdlN0T2pvUmlxWVlxN0ZXS2ZtbjVVMUh6WDVGMURRZE9hRmJ5NmUxZU0zTHlSUkVXOTMmI3hBO0ZPd1o0bGVSYXJFUUNvclhIN0YrMTg2bi9uRVh6L0plWEV6M3VpcEhMTDZrU0dlOW1LTFVuaVdNTWZMcUFTMWE1TVMyMzNZY1BjcFMmI3hBOy93RE9JUDVnckl3aHZkRGxqSUFWNUpyNUc4YThWaVllM1hIaVhoVzJmL09JbjVtMjhva0dwYUtTSzAvMGk4SFVFZFJiQTk4QmtrQkcmI3hBO3pmOEFPSy81b3lBajlJNk9nTkFRTHErT3cvMXJkdXVOcHBTZi9uRTM4eW5KSnY4QVJlUnBWdnJGNFRVRGM3MngrMTFPTnJTei9vVW4mI3hBOzh5dityam8zL0krNi93Q3lYRzFwMy9RcFA1bGY5WEhSditSOTEvMlM0MnRPL3dDaFNmeksvd0Nyam8zL0FDUHV2K3lYRzFwc2Y4NGwmI3hBO2ZtVVArbGhvcC81NzNmOEEyUzQydFBvajhwdktHcCtUL3dBdjlMOHU2bkpETmZXUnVETkpiTTd4SDFybVdaZUxPc2JmWmtGYXIxeUomI3hBO1N5N0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXErYS8rYzN2K1VXOHRmOEFNZE4veVp4Vjg1ZVNQeXA4eWViZE52ZFgmI3hBO2duc2RKME93SWpuMWpWN2dXZG42elU0d3JLd2FybXRhZEIzSXFLcXA4My9PT2Y1aHdYTjJkUmZUdEwwaTBqaWxIbUcrdkk0ZE1tV2YmI3hBOys2OUM1TzBuTDViZDZWRlZXSStlUElIbVR5VnFrZGhyY0tBWEVZbnNyMjNjVFd0ekMzU1NDVmRuWDhSaXI3Yi9BT2NYM1NQOGh2TGMmI3hBO2tqQkVRWDdPN0dnQUdvWEJKSk9LcW8vNXlPL0wwM1RIMHRUR2dyZEN5L3hWOVRjNk9aalFVK3RnbmJrZU5TdnY5bmZGVy84QW9ZejgmI3hBO3ZQclJQRFVUb1MzWDFJK2FSWnlIUnhOMHA5YkcxT1cxYWUvMmQ4VmVubzZTSXNrYkIwY0JrZFRVRUhjRUVZcTNpcnNWZGlyc1ZkaXImI3hBO3NWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZTblY5ZnRiU05ZNFdXYTdscDZFWUk0MUk1QWsxNmNSWDVlMitLdGFOWlhFWCtrWGs3U1hNeDUmI3hBO3VDZHVsS1U2Q2xlZ3AvQUtwcUdUbWR4V2cvamlybEswTkQzUDY4VmVSNkwrYm41Z1gwMTdFL2xOWGEyUU15UlRVYUJnVjVwYzFMY0cmI3hBO0E5UUFOeEo0Vi9hb3FyTE5BOCs2cnJXcTJNQ2VYYnkwMHU5amVkTlR1RmRFOUlLVEdTcFFjR2NqN0xrR2hCRmQrS3JNT1M4anZ2UWYmI3hBO3h4VnlzbFdvUjEzKzRZcWxGMzVtc0xlU09BUlN6SzRvWll3bkJhQTdubXlNUlZhZkNEMStkRlVYWTZ6WjNzaGpRT2tnM0N5QUFrRHImI3hBO1NoT0t2bm4vQUp6ZS93Q1VXOHRmOHgwMy9KbkZYbE55c1IvSlg4c0x2VW9wYm55Zlo2N2ZEelBGYjduNHJtTmtWdUpVaDJ0L1dDYmomI3hBO3I3akZXZGVlTG55MVBwbXQ2cDVnMWpSZFEvTHI5Rm0xL0wzUnRPTWd1SWJobFBvZW5iSXltS1dOa3BQSkxYdytFRXJpcnpqOHg0cnkmI3hBOzMvSW44c0lOU0RMZUY5V210WTVmN3dXa2t5R01pdTRSaFFyN1V4Vjc1K1ZjVnhML0FNNGZUeFc2czF4Sm8ydkxDcVY1RnpOZUJRdE8mI3hBOzllbUtwTnJGdExxZjVNZmxtOWxCZGFsK1hkdGFRcjU0MDdSV0F1WkdTS0phc2lEbTZSM0t5bVpGTmUvYmtxcU9zNzYrYjh1ZnpJMVAmI3hBO1diZVhTdnkwdTdGNGZLR2s2a2tjTTBmR0ZvZ0lZSTFSb28zbDRla3BOYS9GMUpZcXZYdnlzU1ZQeXg4b0pNckxLdWlhY0pGY0VNR0YmI3hBO3BHQ0dCM3JYRldVWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RlVERG91bVc4b21odHg2bzJERWxxQ29PM0lrZHNWUnAmI3hBO3J5RzIyKytLdTM1SGJhZzN4VktkZTBPODFXTkZ0dFp2dEdlTU9CSlltM3F4WjBZTXd1SWJoU1ZDRlJ0U2pOVUhhaXFDL3dBSjZyUi8mI3hBOytkbjFRRmdRS2ZWUGg1Qk54VzNQVGh0OHppcW5iZVR0Wmd0QkNmTjJyU3lCR1QxM0ZpV3FlZEdvYmJxdkphVi9sSGkxVldRV0Z0TmEmI3hBOzJrTnZOY3kza2tVYW85M09JeEpLUnNXY1JMR25JOStLZ1lxZ05YL1RVdnFRMmNOSXlLQnl5QUd1eEpxYTdVNmZmNFlxczh2K1dyUFMmI3hBO0xORlJPZHdBU3prbGlHZXBZOG1KTE14SkxPeDVNU1NldUtvbURSb2JYVVByVnNlRWI4aEpBZnNna2JNbjh2eTZmZGlyNTgvNXplLzUmI3hBO1JieTEvd0F4MDMvSm5GWHpqK1hmNW5heDVObnVMWVJSNnI1YzFFZW5ySGw2NytLMXVVTkFUeE5lRWdvT0xnVkh1TnNWWjBOUi93Q2MmI3hBO2FQTC9BUHp0T2l3NmxybXIxTWxoNVMxSmVObmJ6TnV2MWlYaCs5amg3RDFHNWQvSEZYbUhuUHp0NWs4NWE1THJXdjNiWFYzSjhNYUQmI3hBOzRZb1l4OW1LR01iSWkrQStacWFuRlgzRi93QTR1QUg4aWZMSU80UDE2by83ZUZ4aXFocnY1YStidktHclhQbVQ4cEd0NHZyekY5WDgmI3hBO29YaEs2ZmNTSC9kOXZRb0lKZkVCbFUrM1FxdTBQOHR2Ti9uTFZiYnpGK2JmMWQwc1dENlQ1T3REejArQ1JSVDE3bmR4UElld0xNb0gmI3hBO3pvRlhyZ0FBb05nT2d4VjJLb0c2MVVRVHRGNlhMalRldE9vcjRZcW95NjZzY0x5R0VrS3Bhbkx3K2pGV3JmWGxtQUt3a0FpbytMK3omI3hBO0ZVUU5TSi8zVi93MzltS3J4Zk1mOTEvOE4vWmlxNFhUbi9kZi9EZjJZcXU5ZC81QjkvOEFaaXJmcXlmeUQ3LzdNVmNaWkIrd1B2OEEmI3hBOzdNVldtNGtIKzZ4L3dYOW1LdEc3Y2Y3ci93Q0cvc3hWYWI1aC91di9BSWIrekZXNGIweVNoT0ZLMTNyWG9LK0dLb25GWFlxN0ZYWXEmI3hBOzdGWG4yci9tcEZvWG1qelRhYXhFRjBQeTdwK24zdnJRSXozRE5mVFNSTUNDM0VnRlZwUUR2aXEzL2xiVnBZZVlQTTJuYXhFeFRTOVImI3hBO3RkTjBhMXNJSnJtOHUzdUxKTHQxRVVmTXNWcXhxQUFGRytLb1Z2emswbVR6UHBja0Y1REg1Um4wYlVkVDFDNm5qa2puaGxzSjQ0WFImI3hBOzFhakl5Rm5Wa0tjdVhURlUwZy9PYnlROWhmM2R3OTVZUHA2Mjd5V041WlhNRjNJdDQzQzFhQ0IwNXplczRLcHdCMzYweFZTYjg3dkomI3hBO0NReDhocUF2M3V6cDUwZjZoYy9YMXVoRjY2eHRhaFBVSE9QNGxhbkUrUFhGWG1QNXdhbCtYUDV1YVZwRm9mTVZ6NWR0TFFYbW93NmwmI3hBO2Q2WGNOYnpDMWkvMHFGSGRyY0dTQlFlYXFUdUtkY1ZlZmVVLytjVnRCODBTM2R2WWVkYnEydmJKWTVMaXh2OEFRcHJPNEVVNEppbEUmI3hBO2MxMHBNYjhUUmg0WXF4blFmeUs4djMraFBxVjk1b3ZMTzYvU00ybDJ1bndhSlBkeTNVME1raWo2cHduWDF2Z2hMdnhGRTZFK0tyTS8mI3hBO0svOEF6aURvM21mU1YxVFNQUGJTVy9xU1FTeHk2UThNMFUwTGNKWVpvcExwWFIwWVVLa1lxK2x2eXQ4aS93Q0JQSW1tZVZQcjM2Ui8mI3hBO1Izci9BT21lbDZIUDE3aVNmKzc1eThlUHE4ZnRIcFhGV1ZZcTdGWFlxN0ZXUDZzNmkvY0U3MFg5UXhRbCtvM1VNVmsvSnQzUmxVVTYmI3hBO2sxR0txbWxORjlRdG5EaHVhQmd5a0VGVzNVZ2p4Rk1VcGlraTBHK0tGZEpCaWxWV1RGVjRsTmNWYjljZzRxMGJrMXhWVGE1eFZTYTUmI3hBO0hqaXFtYmhUWGZGVlN4bFZydEJYZmY4QVZpcWE0cTdGWFlxN0ZYWXE4dS9NWDhqL0FQR090Mzkrbm1HNjBtMDFXeWh0TlNzcmVLTngmI3hBO05MWnU4bHBJenNhK21qeVZlTWZib054aXFGMW44Z2JXL3dCS3M1VzFKYnp6VERmUHFtbzZ0cU1MVFEzMXhORDZFaXkyOFVzQmppQ2MmI3hBO1ZpU054d0NqcnZWVkREL25ISFQ1Tk9qc0xuVlFJbjB6VWJDN0ZyYXBBRE5xRnhIY0NhSlE1Q3JFWWdvVnVSWWRXeFZPOVIvTFB6bHImI3hBO3VuVER6RDVyU2JWWWJpeHZORWx0TEwwYlMwdU5PazlWSm10M21rTXJ5dC9lZnZBS2JMVEZWRFQvQU1uTlJQbTJ6ODRheHJjZDFyNjYmI3hBO2l1b2FoOVh0VERidkhEWXZaUVc4S0dXUms0Q1FzWFptNWVBeFZMdFIvd0NjZWJmVS9LMmgrWHIzV1Q2R2tmcG92TkhCeGFRNnc4c2kmI3hBO0ZRWkR4OUJwUjQ4cWRxNHF5RDhzdnlyYnlocUYvcWQxY1djOTdld3hXcXJZV2h0SWxpaExOeWIxSmJtVjNrWnF0OGZFVTJYRlVxaS8mI3hBO0pqWE5QZTNtMGZ6SEhGTG8ycVhXcWVXVnVMSVNyYnJxQW1GNWJYSEdhTXpwSjYvd3NPTEpUdmlyTWZJUGs1dksybFhjRnhlZnBEVXQmI3hBO1V2cmpWTlV2QkdJVWt1cnBnWDlPSU0vQkZWVlZWNUhwMXhWa3VLdXhWMkt1eFYyS3NVOHdTOGRUa0FxV290RkFyWDRSaXFVTGJoMm0mI3hBOyt2cWs0WWNJMC92RjRGYU55VWdMMUpGTngzcnZzcW1BblVLaDVFa2cxRlBmNTRVSWlPZGVDbXByVTdVK1h2aXFyTnFGcGEyc2wxY3omI3hBO0xCYndxMGswMHBDSWlJS3N6TXhBQUE2azRxOHYvTmV5c1BORnJhNmhwK3NXdHhwOE1Vc0QramQyeW1KM0liMVkzbGxpak5RbkYvM2kmI3hBO2tBZnRyempZSldTYVByZGhwdGhlNlA1eXM3ZTdaVnRsdFRkUk5wOEZ0Y1NYRE1ZbWZpem1FeW9zUlZSeTlNTHgvbFZaQjVZdEwzUy8mI3hBO01kenFXcitkWWRYc3pETkRhMnJ5SW5wcThpT3ZJSy9CakdzTGZIeDVHcDdERldjTGV3U3hDV0tRU1J0OWwwSVlINUVIRkNtMXlsRysmI3hBO0k3RHc5OEtvYVM2UHB1VmFocHN6ZlpHL2ZmQXFVQ2JVNWJnU3JldWtLRU8xdUVpQU96QW81SWM4YWtFY1NEVmVwQnBpbE92THNzelgmI3hBO3NmcVA2cXNaQ3NncDRFOFRTblFHZzcrUGppcktzVmRpcnNWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVlkmI3hBO2Y1bXRMV2ZWZVUwY2J0RnhlSXV2SXEzQXB5V29ORHhZaXZnVGhRaEhSZUtIbUNTTit2aWZiRlZ4VkFzWkVnSklOUlE3Ym4yeFZYVGomI3hBOzZhbm1LMU5SdjdlMkt0M1ZwWlh0akphWGtjZHphM0N0SFBieXJ6UjBZQUZXVmdRUWNWUyswOGtlU3JVU2ZWdEVzWVBYWVBNWXJlTk8mI3hBO1RLS0FuaW94VnFMeUI1Qmh0M2dpOHZhYkhESTRra2pTMWlWV2FqaXBBWGZhUmg4aVJnVnVmeU41R21TSVM2RHA3aUJXU0d0dEZWRmUmI3hBO0lRc0ZQSFlHTlFwOWdNVlRDenN0UHNMRkxPeGlpdGJXSGFHM2lYZ2lna2s4VlVVRzV3cTFNNlJRdk5LYVJBVXFPcE5lZ3IzMndLbGEmI3hBO0s5M1BMT1haSVNGQWlMTnhBVUVEZ29IR3RXcVdwVStPd0FVb3VPTk9Eam1BQXUzWHhIdGhRaS9MOXRFTmFpbVVnU0JYQnBYY0ZkeDAmI3hBOzlnY1ZaaGdTN0ZYWXE3RlhZcTdGWFlxN0ZYWXE3RldEL21wK1kwM2tmVDdHNmlzVnZqZVN0RVVhUXg4ZUs4cTFDdFhOejJOMlVOWk8mI3hBO1VUTGg0UmZLMnZKUGhlY2Y5RFFYL3dEMUw4WC9BRWt0L3dCVTg2SC9BRUh4L3dCVVArbC9hMWZtUEozL0FFTkJmLzhBVXZ4ZjlKTGYmI3hBOzlVOGY5QjhmOVVQK2wvYXY1anlkL3dCRFFYLy9BRkw4WC9TUzMvVlBIL1FmSC9WRC9wZjJyK1k4bnIva0x6Uko1cDhwMk92U1c0dFgmI3hBO3ZQVnJBckZ3dnBUUEY5b2hhMTRWNlp5ZmFXakdtenl4QThYRFcvdkFQNlcrRXJGc2d6QlpPeFYyS3V4Vmorc2FQZlhOODhzS0FvUW8mI3hBO0JMQWRCaWhDSHkvcVpDL3UxMkcveER4T0ZYSHkvcVpDajAxMkZQdER4eFZzYURxZ1VEZ3V4UDdROXNWVkJvdXBoUVBUSFUvdEQrdUsmI3hBO3FnMGpVdUlIcGl0VCswUDY0cTMraWRTNGtjQi93US9yZ1ZvNlJxWEVqMHgxL21IOWNLckRvMnBsU1BURmFqOW9ZcXMxYlFMMjZXMkUmI3hBO1VDMWlMQnFzbytGdVBUN3NDVmc4djZtQTM3dGR4UWZFUEhDaHc4djZtQTM3dGR4VDdROFJpcUwwalI3NjJ2NDVwVUFSUTFTR0I2cVImI3hBO2lxVlQ2bkpFd1ZXNVN5RXJFdkxxYUUrUFlDdUtxMW04c2NUczB4bGtZcVpYTENsYWJBRHNCZ1ZIUjNEY1FTZGlTT285c1ZSS3k5SysmI3hBO0dLWGxXaWZtcCtZdDVjM3NVbmxpS1VXaUZwa2lMUnRic3JxU2s1ZG1BZmdYQVRZbmp6Nk9BRldYYUg1MjFuVjlTdEVYeTlQYTZSZHgmI3hBO3RQSHFVN0ZmM2ZFbU9zUlJTak1SOWxqV2hCMzM0cXNvZVlBVjJwOUdLRkNXNklBM0c0cU54aXFCdWRhOUdkSS9UZDFjbXNpbE9LZ1YmI3hBOzNQSmdTTnFiQTlmQ3RGS00wZSs5ZStWQ0dVMEpvM2ZiRlhtMy9PVHYvSEMwWC9tS2svNU41MkhzaC9lei9xajczSDFISVBNdEI4dGUmI3hBO1ZyRHlwQjVsOHlyY1h6Nm5POXJvK2oyYmlKNURFUUpKWGtveG9DZUlBSGg0N2RGcWRYbm5uT0hEVWVBWEtVdDZ2a0FHb1JBRmxrMnQmI3hBO2ZsejVIMEZKOVV1TGZVOVFEMjBkMm5sdU1CTG15amY3YjNzeWVvRVZlaTFBUFhyUWthN1Q5cTZuT1JBSEhIMUVlSi9ESS8wQnRiSXcmI3hBO0EzWWI1NThyYVBZV1dsZVlQTDgwa3VnNjRzaHQ0WjZldmJ5d2tMTERJUnNhRTdIL0FHenQrenRaa25LZUxLQU11T3Jya1FlUkRDY1EmI3hBO054eUw2Ry9Jdi95Vm1pZjlIWC9VWE5uQmUwZitQWlA4My9jeGNyRDlJWjVta2JIWXE3RlhZcTdGWFlxN0ZYWXE3RlhZcTdGWFlxN0YmI3hBO1hZcTdGWFlxN0ZXS0R5NWYrcVg5TmFrTUFlUTc3L3J4UXVYUU5TQ240RnJVRURrUGZDdEt5YU5xS3FLb0sxUDdROXNWUWV0ZVU5WTEmI3hBO0ZJeGI2cGVhVTZLUjZsazF2VWtzaDVNSjRwbEpYZ1FOcVVZKzFBbFJIa3ZYL2ovNTJMVWh5REJTRGFiY2dtNHJDZjVOdm1jVlVvUEkmI3hBOzNtT0sxRUo4ejZwTElFWkJNLzFFdFU4cUhlMzZqa3ZYK1VlTFZWVGUxMFRVNExLRzNrbWU3bGlVSzl6TVl4SklRQU9iK21zYVZQOEEmI3hBO2txTVVLYytrNnR4SWlnRFBTaXNXVGlLazFPNTZqRktGMC95amVXVVNReHhxRlFsaXhma1NTU3pNV2FyTXpFa3N4M1k3bkZDWWFOb3QmI3hBOzlaMzZ6T0FzTkc1THlCM0kySThNVXZOLytjbmYrT0Zvdi9NVkoveWJ6c1BaRCs5bi9WSDN1UHFPUVlQNWRqbjEzeVhvUTh2U3BKNXEmI3hBOzhtM2s5NnVsUDl1ZUtXVkp4SkV2KzdPRFJBRkFhOWY4bXU1MVJHSFVaUEZGWWM4UkhpN2lBUlI3cnZuKzFyanVCWE1Jdi9HK2xYOTcmI3hBO3FFbmxyUUwwK2VmTWtUMldvUXl5RjdXSXlnaWRvVjVjeVc2L3ZLS255RzlYOG5UaEdJelpJL2xzUjRvMFBVYTVYMCtXNVR4ZzhodVUmI3hBO2wvTVg2bG8vbHJ5NzVOVzZqdTlVMGczVTJxdkFlVVVVdHk0WVFodjJtU2hEZUg2c3Zzcml5NXNtb294aGs0UkcrWkE2L0hveG5zQUgmI3hBO3VuNUYvd0Rrck5FLzZPditvdWJPTDlvLzhleWY1djhBdVl1VGgra004elNOanNWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnMmI3hBO1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJ4Yi9uSjMvamhhTC96RlNmOEFKdk93OWtQNzJmOEFWSDN1UHFPUWZQOEEmI3hBO1kzMTVZWGtONVpUUGIzVURCNFpveVZaV0hjRVozT1RIR2NUR1F1SmNZR21jNmgrZFBtaTYwNlNDRzFzYkRVYmhQVHZOYXRJZlN2SlYmI3hBOy9hcklEc1dvT1JBK1ZNMDJMMmZ3eG1DVEtVQnloSTNFZkJzT1V2UHlhN25ONDFQclQ4aS8vSldhSi8wZGY5UmMyZVhlMGY4QWoyVC8mI3hBO0FEZjl6RnpzUDBobm1hUnNkaXJzVmRpcUhXRndoVXFQdGxoUjJHM0xrTi80ZE8zVEZGSWFUU1ZrY3VaWmdTVFVMTTZqd0d3OXNiV24mI3hBO0xwS3JRaWFZa2RqTXhINGpHMXBqK2wrYmZMZXFhMjJpMlY1ZE5meHZkSXdrdDd5S0Iyc0pQUXVoRGN5d0pCTVlwaUViZzV3clRJLzAmI3hBO2NhLzNzbFA5Zi9tM0JhYWEvUnhyL2V5VS93Q01uL051TnJUZjZPMzNsbHAvci84QU51Tm9wVGswNmZsRjZjcmNlZjc3bElhOE9MZlomI3hBO292WGx4NjlxNUlWUnY0ZmozS1EzSnAwM3BQNmNqK3J4UHBocER4NVUycVF0YVZ5SzB1WFRqVUZwSk5pRFQxRFFrZjdFWXJTSlcyakMmI3hBO2NmaSsxNm4yM0o1YytmMnExcFh0MHB0MDJ4Q1piL2o4ZnRkRGJSd3hyR2hjcXRBQzhqeU5zU2QyY3N4Njl6aXF5TzJDTkhJZVhLT00mI3hBO3gwOVIyV2hvU1NHKzBmaDJZNzlmRTRLM3RVVGhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3BacnZsalFOZmhpaDFteGp2b29HTHhKS0MmI3hBO1FyRVVKRkNPMlpPbTFtWEFTY2NqRW51UVlnODBsLzVWTitYSC9WZ3RmK0JiK3VaZjh0NnovVkpNZkRqM08vNVZOK1hIL1ZndGYrQmImI3hBOyt1UDh0NnovQUZTUytISHVkL3lxYjh1UCtyQmEvd0RBdC9YSCtXOVovcWtsOE9QY3lMU2RKMDNTTlBpMC9UYmRMV3lnNWVsQkhzcTgmI3hBOzJMdFN2aXpFNWdaODg4c3pPWjRwSHF5QXBGNVVsMkt1eFYyS3BBZFl1K1JISWJId0dGQzI2MW04anQ1blJoeVJHWmFnZFFDUmdTdnMmI3hBO3RWdlpyZUdWM0g3eEttZ0EzNUVZcWsyaitSL0t1aytZSi9NRmhhU1JhcmN0Y3ZKSzF6ZFN4aHIyVVRYSmpnbGxlQ015eUtHYmdneFYmI3hBO2s0dXBUKzMrQS9waXE4WEVuODUrNGYweFZjSjIvblA0ZjB4VjNydC9PZncvcGlyUnVEL09mdy9waXJSdVcvblA0ZjB4VllieC93Q2YmI3hBOzhCL1RGVmh2cFA1L3dIOU1WVy9YNWlRdk90ZHVnNzRxci9wcXk4Vys3RldwZGNzSWtaNUdLb29xV3BpcW5hK1l0UHVWTHhlb1VVMEwmI3hBO0ZhYitHNXhWRWpVcmNpdnhmY1A2NHF1Ri9DZXpmaC9YRlcvcnNYZzM0ZjF4VjMxdVB3UDRmMXhWdjYzSDRIOFA2NHE3NjNINEg4UDYmI3hBOzRxMTljaThEK0g5Y1ZhTjlDT3pmaC9YRldqcUVBN04rSDljVmEvU1Z2VDlyN2gvWEZWU0M4aG5ZcWxhZ1YzeFZXeFYyS3V4VjJLdXgmI3hBO1ZoTWs0RWpDaDZudjcvTENoUXU3cVc1ZDRMTk5ucnprSnFvWHZ1UitPQktQdFhFRnZIYjFMQ01mYUpHNVkxUFR0dnRpcUxXWmZob0smI3hBO2JlT0ZDdXNvSUdCVXUxYnpkNWEwYWFLRFZ0VXRyR2VaUzBVVThxSXpBYmZDckdwclRieDdZcFJOcHIralhrc2NGcGYyOXhQTkF0M0YmI3hBO0ZGS2p1MXU5T015cXBKTVpxS04weFZFTmRSQ1VRbVJmV0s4eEhVY3VJTkMxT3RLbkZYR2NVT0tGSTNJQVB5OGNLcVgxdGFtb0oyUGYmI3hBOzJ4VlJXOVRsdUNSUTkvYjVZcTZDN1ZwNHh2dXdIWHhPS29PUzQ0Vlk5S21uU3YzWXFnMlNYVVY5UXpySEVHNHFWbzMyRzR1QnZUa0smI3hBO0VWUFE5ajB3SlRaQXNhb0ZDcXRLcW9Jb0JVOU1VSWxIUEJUVVVKUGNlMkZWWkhQR3RSMThSZ1ZWVnppcThNY1ZiNW5GVmhrUGppbFQmI3hBO2VVZ2tWL0VZb1VwSmlEMUhRSHFNS3BONXIwNjYxZlFMclRyZThheG11bytNZDFFeFZsS3VEMVVxMURTaDM2WXF3dTAvTHp6ZmJXTmkmI3hBO2tYblMrZ2FKRERkL0ViZ05SaklySVoyWTgrVEFPN0E4aCt5S2lpcjBieU5aWEZoWngyVnhleWFoTEJFUkplVHR5a2tKZXRXcVdQZW4mI3hBO1hBcktjVXV4VjJLdXhWMkt2T0d2N2E1ZERiT1o0Sm1lczhOSkl3RUpERXN1MzJ2aG9EV3ZzRFJWRld0dEJibVRpcDV5SDQ1R0k1a0EmI3hBO2txcElIUmE3ZjFKT0ZDTy9kOGhRRUNnNyt3OXNWVjE0VVdnUFR4OS9saXFscXVzYVZvK250cUdwVEMyczQyamplVmdXQWFhVllveFImI3hBO1FUOFR1cTlPK0JYbEhuelZmeTc4eE5CNWl0Zk1WcVlZeGJ3emVwSGRTSkhMQ1pqYlAvb3dXVlhIMXlTc2JVNUtRUVVweXhTaGRTMHYmI3hBOzhxTlY4dlJqVFBOMGkyNzNFSDZXMUNFTkk3UjI4RVVEUkZFaTRRbHVLdFZsRkNmNWZoeFZQdEFtL0tQeWpyVjNxdHA1ZzRQcXl6TkQmI3hBO2JUR1AwVmlRK3E2Mi9DRkhNY1NvT0tsMkNyU24ycWxWNkZwK3A2YnFkZ2w5WVRMYzJrNjhvWjQycWpBTlEwUHpHS0Z4S1Vhb1BUYmYmI3hBOzNIdGhWQlhkeEhiaEdkWHBJM3ByeEhJMUlKSjdBQUFWcVQ3ZFNCZ1ZMbDAyMm5ua2xuVDFRMGl6UXJNcVA2WmpWU2dqSlVOc3ljK1ImI3hBO0pQSTdHbEFGS05zVWhGMERFT0V6TUpaVllCUzVXaTFCL2FvcWovYUdLb1o3UFUydTJkcDE5QUVGWTFoSVkwNUJnenM3QWcxQkZGRksmI3hBO2RUaWhGaTNlTGpHRUlDcW9DMHBRVUZBQUFLWVZSSHBTQUpWU0tqYmIzT0txNlJ2d1VsVFFrOXZsaXJETlhzZnpvUG1hK3VORXZkSFQmI3hBO3k0SVIranJPN2ptTXhuRWE3VE1pL0NqUzhxbFdQdzdVQitJQlVERGJmODVHM0Y3YWZXcmp5M1oyU1N4bTZOajlhTWpSODBNZ3BjUnomI3hBO0EvQ0dBQ2xUdjlyYkZLTTBlRC9uSWlHOXRJdFJ1UExGenA1a2crdTNDcGVyY0NJcXYxajAwVXJHV1U4dUZhQTkrTmFCVkRSd2Y4NUsmI3hBO1c5dkVxeStWN3E0YjRycDdrM25FUHlJQ3dDQ09Iakh3Q2JQeWJueVBMaVZWVlZxTi93QTVKK29nbWo4b0JLL3ZDbjZTSnBYZWdKOE0mI3hBO1ZabDVmSG1qOURRZjRtVzBYWEt5Zld4cDNxL1ZmN3h2VDlQMXYzbjkzeDVWL2FyMndvUmt5U1Y2SG9QMVlxaExwdlRnYVFnbmdwSVUmI3hBO2NRekVWUEZlUlZlUjl6VEZVcy9STUdveHJKZlcvcVJ0RVlKNFdacDRDSktHUkNyOFVrK3pzV1hwNGNqVUpUN3lUWVdGaGN5MjFuYkomI3hBO2FMNlhOb1k0MWpTcFlDb0MwQjJVYjB4VmwyS3V4VjJLdXhWMktzRWxDZXErNSswZTN2OEFQQ2hVWXhlcTNFdFNwNmdmMXhWV0pqNUMmI3hBO2hOS0RxQjREM3hWWERKUmFFOU45dTlmbmlxcVRHeXFEdU80SUZOamdWZHd0aWdCalVyeTVBRlJUa053Zm5pcmpIYkZPUHByeEpMRmUmI3hBO0lwWFkxeFZiSXNEclJrVmdPZ0tnOVJ4UDRiWVZXRDBsUXFQaEFId2dBQWRjVlFXcHpTMnRvWmxXcnVlRWZJQWdNUVNHY2NsSlVVN2ImI3hBOy9yd0pRVUVjdHcvcTNyR2dYOTJnQTZnZHhzQU1WUkVmcEYvaUxVbzNRRHdQdmhRdGpnaG11SVF4WUVTS1ZZQVZCcVBmRlhQOXR2bWMmI3hBO1ZiY25sVTdtZy9VTVZWQTJ5ZkwrSnhWRUkvd0R3cWY0WXFyUnY4SitZL2ppcXVrbXh4VlVXWEFyWHE3akNxaThtS3FNci9FZm5pcWgmI3hBO2VUTGJSZXZNQ1YyVkY3czFQd0dCS1VSUnkzQmttbGtZcEk1WkZKcUFEdFJCc0ZVY1FOaHYxTzlUaXFOM0VTanNDUUI4Z0JoUW0vbGomI3hBOy9lMlgyalAvQUJJWXFHUzRFdXhWMkt1eFYyS3NaZnkzZHM3TjZzZTVKL2E3L1JoUTV2TGQyV0pFc2U1cisxL1RGVi8rSDd1djk3SDAmI3hBO0g4M1lmTEZWUWFIZFVIN3lQWWY1WGo4c1ZYL29hNW9QM2liZjYzOU1WYi9SRnpRRDFFL0grbUt0L29pNXBUMUUvSCttQlZwMGU1b1ImI3hBOzZpZmovVEZWcDBTNm9mM2liai9LL3BoVlpxbWdYRjZrQ2lTTWVreExWNWJnOGR0aDdZRXFmK0hMdXY4QWV4OUNQMnU0K1dGRFMrVzcmI3hBO3NIKzlqNkVmdGR4OHNWWFErWGJxT2FPUXl4a0l3WWdjdXhyNFlxbjMxS3ovQU44Ui93REFML1RBbHMyZG94cTBFWlBpVlgrbUt1TnAmI3hBO2FtbFlZelRZZkNPbjNZcTM5VnRxQWVpbEIwSEVZcTc2dGJVcDZTVThPSXhWMzFhMy93QjlKL3dJeFYzMWEzLzMwbi9BakZYZlZyZi8mI3hBO0FIMG4vQWpGWGZWcmIvZlNmOENNVmNiYTJKcVlrSjhlSXhWYkpaMmNnQWtnamNMOW5raW1uM2pGV3phV2hBQmhqSUhRRlJ0K0dLdSsmI3hBO3AybE9Qb1I4YTFweFdsZnV4VnJqWjJxbDZSd0tTcWx2aFFFc1FxaXUzVmpRWXFoZFVhVzZzSklkTzFGTEc2WXgrbmRoWTV1SUxCdnMmI3hBO1A4SjVxcEdLcEdtbGZtYXR1QzNtSFRIdXpJN1BYVEpSQnc5TXJHaUlMdjFGK004M0xTTjRDbUtybTB6OHk1TFYwT3Y2YkRjbVlsSlkmI3hBOzlObEtyQnNRdkY3cHF2c1J5clNoNllxaHJ3K2ZsZTJzNHZNbWlXK29zVVpyZWF5a2thUW1JRjBSUmR4Tng5UVNNaDQxNEFBMUlMR3cmI3hBO1lwbVBFQWVIdjZJdGtscHFOckhZeGZXOVF0NXA0bVcxdXJsR1dOR3VoUlhRTHliZ3hmOEFZNUVqcGo0TTdyaFBLK1hUdjkzbXRoRlomI3hBO0JLMTVGUUFrTWEveXFXLzRqWEFxL2lmQTRxc25hU09HUjQ0ekxLcWxraXFGNUVBMFhrZGhYRlVwc2RZMXVlS2RyblFwN1NTTGg2Y2ImI3hBO1QycitxVysxd0tTRUFML2w4YTRWVEM4czdlK3RUYjNLdDZiRkdJUjJqWU1qQjFJZU1xd0laUWRqaXFEazh0NlpJbkIzdXl0UVIvcHQmI3hBOzUxSFFnK3I3WXFtRnZCSGJ3ckZHWEtMV2hrZDVHM05kM2NzeDY5emlxcGlyc1ZkaXJzVmRpcXJnVjJLdXhWMkt1eFYyS3V4VjJLdXgmI3hBO1YyS3V4VjJLdXhWQ2F0bytsYXhZUzZkcTFuRGYyRTNIMXJTNFJaWW40TUhYa2pBcWFNb08rS3NlMW55NytYV2dXY210M1dnV1NMYk4mI3hBO2J2NnNGaWtzb2VFZWpiY1FpRnF4aCtLZnlnOXN2MDJubG1tSVJxejNta0UwR0hlYXZ6czF5eUVhNmRvRFdiekRsYmpWU1Z1WlZIWGgmI3hBO1pSRXlnVXFRN3NGem85RjdQNHAvWGs0cTU4SElmNTUyK0EzYVpaVDNKQmNmbkIrWldzckNtajJWdlkvWGIzMGROWkI2enpsYUF3b3omI3hBOy9BNm9hbVdWUUZIaU8rZEhzTFI0Yk9TVXBjTWJsMHJ6N3hmOE1lYkh4WkhraHZJK2ozRUhtL1NOVHVidVMva20xdTRzVXU1R0wrcUwmI3hBO08wbDlTVkNkK0VrMHJsUmxuYU9jUzA4NFJIQ0Jpakt1N2lrS0h2QUFSQWIzNXA1UC93QW85cWYvQUlIamY5UnFaaHgvdllmOUNuKzgmI3hBO0xMcC9uUGFPQytHY2U1Q0h1Tk90NTM1dTB5bWdXa2M4MFMwQkorekc2aXUvWEZWZU9OVVJVV3BDZ0tDeExHZzIzWmlTVDduRld5b0kmI3hBO29jVlVmcVZ0OFZFNDhpUzNGbUc1M0oyUFhGV3haMjRia0F3TzlhTXdCclRjaXUvVEZWMzFhTC9LL3dDQ2IrdUt1K3JSZjVYL0FBVGYmI3hBOzF4VlRPbjJqTVdaT1JiWWxtWTdlRzU2ZTJLcTNwUjdIaUtxS0ErQTIyL0RGVndBQW9PbUt1b01WYTRMNFlxM2lyc1ZkaXJzVmRpcnMmI3hBO1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcVIzdmx6eS9MSmUzdW9hZGF2TmZRL1Y3NjZsNGd2RFRpRVppTmhTbjRlMlpVTmJtaUl4akkmI3hBO2dSTmdkeFltSVh4NlY1ZnQ3cTF1NHJLMWl1Tk9oTnJaeUtVVXhSTlNzYWRLRHA5L3ZrWmFyS1l5aVpHcEd6NWxQQ0VOWmFKNVVoaTAmI3hBOzliTzB0NDR0TWxsbTA1VmxwNmNrdkwxV0FESHJ5YnJrNTYzTkl5SmxmR0FKZWRja2NJVlY4cytYNWJhV0ZMR040SmI0NmxLcXlzUWImI3hBO3ptSlBWcUQxNWIwNmUyUDUzTFlQRnVJOEgrYnlwZUVKNG5MZ3ZQN1ZCeXA0OTh4R1RlS3V4VjJLdXhWMkt1eFYyS3V4VjJLdXhWMksmI3hBO3V4VjJLdXhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjJLb1BWdFkwclI3Q1RVTlZ1NHJHeGlvSmJtZHhIR3ZJaFJWbTJHNXhWSnImI3hBO2I4eS95K3VmUzlEekRZU0dkWW5oQXVJNnNzOGhoaW9LL3R5RGlQZkZWYlZ2Tkhrd2pXZE8xUzh0blhSN2RMalc3YVljbGhna1htankmI3hBO3FRUnhJV3VLcERaZVd2eVZtMUt5MDIwMGpSMnZyN1R2clZuYXBheFZtMDl4NmZQandvMGRIcDhYaWZIRlZHeTBiOGk3MWROdjdUU3QmI3hBO0VsSG1PU1JkTnVFdElhM2NrZko1QUc0VmFuQmlhNHFuV2w2MytYT2pXTnpKcGN0anA5bU5UT21YWnRvMWlRNm56RVJoY0lvckp5b3UmI3hBO0tzcHhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjJLdXhWMkt1eFYyS3V4VjJLdXhWMktxVnhOYXhJR3UmI3hBO1hTTkNhQnBDRkZmOWxpcUZHb2FGR09RdWJWQWdBQjV4aWlydU8vUVlxOEU4OGY4QUtUZm5wLzREbGgvMUNTWXFtdmszL3dBbTU1Qy8mI3hBOzgxL0Yvd0FuWThWWS93RGw1L3lpdjVEL0FQTWRxWC9KbTZ4VjExL3lpR3QvK2JWZi91cFI0cStsY1ZkaXJzVmRpcnNWZGlyc1ZkaXImI3hBO3NWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcW5QYlc5d29TZUpKbFU4Z3NpaGdEU2xhSDU0cW9ObysmI3hBO2tNcFZyRzNaV0ZHVXhJUVFleDJ4VkNTK1c5R25rdnBialM3R2ViVkkxZzFPV1NDTm11b2tCVkk1eVYvZUtxbWdWcWpGVktLMDhzMjkmI3hBO3pCZncyK214WFZwQjlTdGJwQkVza1Z1dS93Qlhqa0Fxa1k0L1lHM3RpcTIxMGJ5dmJ3MkVWdHB1bTI4V2xNejZaRWtjS2kxYVFNR2EmI3hBO0FLdElpd0xWNFVydmlxdC9oclFYZ2VMOUUyRFc4MTEra1hUMEl5ajNoWVA5YUk0VU0zSWN2VSsxWGV1S3BzZ1lJb1kxWUFjajRuRlcmI3hBOzhWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJzVmRpcnNWZGlyc1ZkaXJ6TFV2OEEmI3hBO29YSDY1SitrZjhMZlhQV3VQVjliNmo2bnJWYjZ6eXI4WExsWG5YdjF4VnUzL3dDaGN2cXNmMWYvQUF0OVQ5U1QwZlQrbytoNnZFZXAmI3hBO3hwOEhQaFN0TjZZcTlCMGo5RmZvdTEvUkhvZm92MGwrcGZWZVBvZWxUNFBUNGZEeHAwcGlxTHhWMkt1eFYyS3V4VjJLdXhWMkt1eFYmI3hBOzJLdXhWMkt1eFYvLzJRPT08L3htcEdJbWc6aW1hZ2U+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICA8L3JkZjpBbHQ+CiAgICAgICAgIDwveG1wOlRodW1ibmFpbHM+CiAgICAgICAgIDx4bXBNTTpJbnN0YW5jZUlEPnhtcC5paWQ6MGE1OTU2MTItY2NlYS00Y2QwLWIzNjktNTNjZWRmYTZiMWZhPC94bXBNTTpJbnN0YW5jZUlEPgogICAgICAgICA8eG1wTU06RG9jdW1lbnRJRD54bXAuZGlkOmM1ZmFhYzA1LWVlNGYtNGQzMi04YzY2LTIxYzg4YzU0ZGYzNDwveG1wTU06RG9jdW1lbnRJRD4KICAgICAgICAgPHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD51dWlkOjVEMjA4OTI0OTNCRkRCMTE5MTRBODU5MEQzMTUwOEM4PC94bXBNTTpPcmlnaW5hbERvY3VtZW50SUQ+CiAgICAgICAgIDx4bXBNTTpSZW5kaXRpb25DbGFzcz5wcm9vZjpwZGY8L3htcE1NOlJlbmRpdGlvbkNsYXNzPgogICAgICAgICA8eG1wTU06RGVyaXZlZEZyb20gcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICA8c3RSZWY6aW5zdGFuY2VJRD51dWlkOjQ3NWIxOWNmLTVjN2YtZmY0Yy05OGJiLTU5YThlYjY0MDY0Zjwvc3RSZWY6aW5zdGFuY2VJRD4KICAgICAgICAgICAgPHN0UmVmOmRvY3VtZW50SUQ+eG1wLmRpZDoyNWIzOWVkYS1lYjBkLTRjMjUtOTU1Mi0xNGZjZGE4NjVlOWU8L3N0UmVmOmRvY3VtZW50SUQ+CiAgICAgICAgICAgIDxzdFJlZjpvcmlnaW5hbERvY3VtZW50SUQ+dXVpZDo1RDIwODkyNDkzQkZEQjExOTE0QTg1OTBEMzE1MDhDODwvc3RSZWY6b3JpZ2luYWxEb2N1bWVudElEPgogICAgICAgICAgICA8c3RSZWY6cmVuZGl0aW9uQ2xhc3M+cHJvb2Y6cGRmPC9zdFJlZjpyZW5kaXRpb25DbGFzcz4KICAgICAgICAgPC94bXBNTTpEZXJpdmVkRnJvbT4KICAgICAgICAgPHhtcE1NOkhpc3Rvcnk+CiAgICAgICAgICAgIDxyZGY6U2VxPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmFjdGlvbj5zYXZlZDwvc3RFdnQ6YWN0aW9uPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6aW5zdGFuY2VJRD54bXAuaWlkOmYzNTgzNTFmLWU1ODYtNDlkYy04OTBkLThmMDc0MWFjMmMxMDwvc3RFdnQ6aW5zdGFuY2VJRD4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OndoZW4+MjAyNS0wMS0xNlQxODowOToyOCswNTozMDwvc3RFdnQ6d2hlbj4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OnNvZnR3YXJlQWdlbnQ+QWRvYmUgSWxsdXN0cmF0b3IgMjguMSAoTWFjaW50b3NoKTwvc3RFdnQ6c29mdHdhcmVBZ2VudD4KICAgICAgICAgICAgICAgICAgPHN0RXZ0OmNoYW5nZWQ+Lzwvc3RFdnQ6Y2hhbmdlZD4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6YWN0aW9uPnNhdmVkPC9zdEV2dDphY3Rpb24+CiAgICAgICAgICAgICAgICAgIDxzdEV2dDppbnN0YW5jZUlEPnhtcC5paWQ6MGE1OTU2MTItY2NlYS00Y2QwLWIzNjktNTNjZWRmYTZiMWZhPC9zdEV2dDppbnN0YW5jZUlEPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6d2hlbj4yMDI1LTAxLTMwVDEyOjA4OjU3KzA1OjMwPC9zdEV2dDp3aGVuPgogICAgICAgICAgICAgICAgICA8c3RFdnQ6c29mdHdhcmVBZ2VudD5BZG9iZSBJbGx1c3RyYXRvciAyOC41IChNYWNpbnRvc2gpPC9zdEV2dDpzb2Z0d2FyZUFnZW50PgogICAgICAgICAgICAgICAgICA8c3RFdnQ6Y2hhbmdlZD4vPC9zdEV2dDpjaGFuZ2VkPgogICAgICAgICAgICAgICA8L3JkZjpsaT4KICAgICAgICAgICAgPC9yZGY6U2VxPgogICAgICAgICA8L3htcE1NOkhpc3Rvcnk+CiAgICAgICAgIDx4bXBNTTpNYW5pZmVzdD4KICAgICAgICAgICAgPHJkZjpTZXE+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RNZnM6bGlua0Zvcm0+RW1iZWRCeVJlZmVyZW5jZTwvc3RNZnM6bGlua0Zvcm0+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpyZWZlcmVuY2UgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMS5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICAgICA8L3N0TWZzOnJlZmVyZW5jZT4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RNZnM6bGlua0Zvcm0+RW1iZWRCeVJlZmVyZW5jZTwvc3RNZnM6bGlua0Zvcm0+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpyZWZlcmVuY2UgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMi5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICAgICA8L3N0TWZzOnJlZmVyZW5jZT4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RNZnM6bGlua0Zvcm0+RW1iZWRCeVJlZmVyZW5jZTwvc3RNZnM6bGlua0Zvcm0+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpyZWZlcmVuY2UgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMS5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICAgICA8L3N0TWZzOnJlZmVyZW5jZT4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RNZnM6bGlua0Zvcm0+RW1iZWRCeVJlZmVyZW5jZTwvc3RNZnM6bGlua0Zvcm0+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpyZWZlcmVuY2UgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMi5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICAgICA8L3N0TWZzOnJlZmVyZW5jZT4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RNZnM6bGlua0Zvcm0+RW1iZWRCeVJlZmVyZW5jZTwvc3RNZnM6bGlua0Zvcm0+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpyZWZlcmVuY2UgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMS5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICAgICA8L3N0TWZzOnJlZmVyZW5jZT4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RNZnM6bGlua0Zvcm0+RW1iZWRCeVJlZmVyZW5jZTwvc3RNZnM6bGlua0Zvcm0+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpyZWZlcmVuY2UgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMi5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICAgICA8L3N0TWZzOnJlZmVyZW5jZT4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RNZnM6bGlua0Zvcm0+RW1iZWRCeVJlZmVyZW5jZTwvc3RNZnM6bGlua0Zvcm0+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpyZWZlcmVuY2UgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMS5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICAgICA8L3N0TWZzOnJlZmVyZW5jZT4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RNZnM6bGlua0Zvcm0+RW1iZWRCeVJlZmVyZW5jZTwvc3RNZnM6bGlua0Zvcm0+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpyZWZlcmVuY2UgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMi5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICAgICA8L3N0TWZzOnJlZmVyZW5jZT4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RNZnM6bGlua0Zvcm0+RW1iZWRCeVJlZmVyZW5jZTwvc3RNZnM6bGlua0Zvcm0+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpyZWZlcmVuY2UgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMS5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICAgICA8L3N0TWZzOnJlZmVyZW5jZT4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RNZnM6bGlua0Zvcm0+RW1iZWRCeVJlZmVyZW5jZTwvc3RNZnM6bGlua0Zvcm0+CiAgICAgICAgICAgICAgICAgIDxzdE1mczpyZWZlcmVuY2UgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMi5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICAgICA8L3N0TWZzOnJlZmVyZW5jZT4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgIDwvcmRmOlNlcT4KICAgICAgICAgPC94bXBNTTpNYW5pZmVzdD4KICAgICAgICAgPHhtcE1NOkluZ3JlZGllbnRzPgogICAgICAgICAgICA8cmRmOkJhZz4KICAgICAgICAgICAgICAgPHJkZjpsaSByZGY6cGFyc2VUeXBlPSJSZXNvdXJjZSI+CiAgICAgICAgICAgICAgICAgIDxzdFJlZjpmaWxlUGF0aD4vVXNlcnMvc2liYW5naXNhaG9vL0Rlc2t0b3AvV29yay9GeW5kL0Z5bmQgT25lL0RlY2svcGlwZSAxLnBuZzwvc3RSZWY6ZmlsZVBhdGg+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0UmVmOmZpbGVQYXRoPi9Vc2Vycy9zaWJhbmdpc2Fob28vRGVza3RvcC9Xb3JrL0Z5bmQvRnluZCBPbmUvRGVjay9waXBlIDIucG5nPC9zdFJlZjpmaWxlUGF0aD4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMS5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICA8L3JkZjpsaT4KICAgICAgICAgICAgICAgPHJkZjpsaSByZGY6cGFyc2VUeXBlPSJSZXNvdXJjZSI+CiAgICAgICAgICAgICAgICAgIDxzdFJlZjpmaWxlUGF0aD4vVXNlcnMvc2liYW5naXNhaG9vL0Rlc2t0b3AvV29yay9GeW5kL0Z5bmQgT25lL0RlY2svcGlwZSAyLnBuZzwvc3RSZWY6ZmlsZVBhdGg+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0UmVmOmZpbGVQYXRoPi9Vc2Vycy9zaWJhbmdpc2Fob28vRGVza3RvcC9Xb3JrL0Z5bmQvRnluZCBPbmUvRGVjay9waXBlIDEucG5nPC9zdFJlZjpmaWxlUGF0aD4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMi5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICA8L3JkZjpsaT4KICAgICAgICAgICAgICAgPHJkZjpsaSByZGY6cGFyc2VUeXBlPSJSZXNvdXJjZSI+CiAgICAgICAgICAgICAgICAgIDxzdFJlZjpmaWxlUGF0aD4vVXNlcnMvc2liYW5naXNhaG9vL0Rlc2t0b3AvV29yay9GeW5kL0Z5bmQgT25lL0RlY2svcGlwZSAxLnBuZzwvc3RSZWY6ZmlsZVBhdGg+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICAgICA8cmRmOmxpIHJkZjpwYXJzZVR5cGU9IlJlc291cmNlIj4KICAgICAgICAgICAgICAgICAgPHN0UmVmOmZpbGVQYXRoPi9Vc2Vycy9zaWJhbmdpc2Fob28vRGVza3RvcC9Xb3JrL0Z5bmQvRnluZCBPbmUvRGVjay9waXBlIDIucG5nPC9zdFJlZjpmaWxlUGF0aD4KICAgICAgICAgICAgICAgPC9yZGY6bGk+CiAgICAgICAgICAgICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0iUmVzb3VyY2UiPgogICAgICAgICAgICAgICAgICA8c3RSZWY6ZmlsZVBhdGg+L1VzZXJzL3NpYmFuZ2lzYWhvby9EZXNrdG9wL1dvcmsvRnluZC9GeW5kIE9uZS9EZWNrL3BpcGUgMS5wbmc8L3N0UmVmOmZpbGVQYXRoPgogICAgICAgICAgICAgICA8L3JkZjpsaT4KICAgICAgICAgICAgICAgPHJkZjpsaSByZGY6cGFyc2VUeXBlPSJSZXNvdXJjZSI+CiAgICAgICAgICAgICAgICAgIDxzdFJlZjpmaWxlUGF0aD4vVXNlcnMvc2liYW5naXNhaG9vL0Rlc2t0b3AvV29yay9GeW5kL0Z5bmQgT25lL0RlY2svcGlwZSAyLnBuZzwvc3RSZWY6ZmlsZVBhdGg+CiAgICAgICAgICAgICAgIDwvcmRmOmxpPgogICAgICAgICAgICA8L3JkZjpCYWc+CiAgICAgICAgIDwveG1wTU06SW5ncmVkaWVudHM+CiAgICAgICAgIDxpbGx1c3RyYXRvcjpTdGFydHVwUHJvZmlsZT5QcmludDwvaWxsdXN0cmF0b3I6U3RhcnR1cFByb2ZpbGU+CiAgICAgICAgIDxpbGx1c3RyYXRvcjpDcmVhdG9yU3ViVG9vbD5BSVJvYmluPC9pbGx1c3RyYXRvcjpDcmVhdG9yU3ViVG9vbD4KICAgICAgICAgPHBkZjpQcm9kdWNlcj5BZG9iZSBQREYgbGlicmFyeSAxNy4wMDwvcGRmOlByb2R1Y2VyPgogICAgICA8L3JkZjpEZXNjcmlwdGlvbj4KICAgPC9yZGY6UkRGPgo8L3g6eG1wbWV0YT4KICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgIAo8P3hwYWNrZXQgZW5kPSJ3Ij8+/+IQCElDQ19QUk9GSUxFAAEBAAAP+GFwcGwCEAAAbW50clJHQiBYWVogB+kAAQASABIAJQAUYWNzcEFQUEwAAAAAQVBQTAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1hcHBsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASZGVzYwAAAVwAAABiZHNjbQAAAcAAAAScY3BydAAABlwAAAAjd3RwdAAABoAAAAAUclhZWgAABpQAAAAUZ1hZWgAABqgAAAAUYlhZWgAABrwAAAAUclRSQwAABtAAAAgMYWFyZwAADtwAAAAgdmNndAAADvwAAAAwbmRpbgAADywAAAA+Y2hhZAAAD2wAAAAsbW1vZAAAD5gAAAAodmNncAAAD8AAAAA4YlRSQwAABtAAAAgMZ1RSQwAABtAAAAgMYWFiZwAADtwAAAAgYWFnZwAADtwAAAAgZGVzYwAAAAAAAAAIRGlzcGxheQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG1sdWMAAAAAAAAAJgAAAAxockhSAAAAFAAAAdhrb0tSAAAADAAAAexuYk5PAAAAEgAAAfhpZAAAAAAAEgAAAgpodUhVAAAAFAAAAhxjc0NaAAAAFgAAAjBkYURLAAAAHAAAAkZubE5MAAAAFgAAAmJmaUZJAAAAEAAAAnhpdElUAAAAGAAAAohlc0VTAAAAFgAAAqByb1JPAAAAEgAAArZmckNBAAAAFgAAAshhcgAAAAAAFAAAAt51a1VBAAAAHAAAAvJoZUlMAAAAFgAAAw56aFRXAAAACgAAAyR2aVZOAAAADgAAAy5za1NLAAAAFgAAAzx6aENOAAAACgAAAyRydVJVAAAAJAAAA1JlbkdCAAAAFAAAA3ZmckZSAAAAFgAAA4ptcwAAAAAAEgAAA6BoaUlOAAAAEgAAA7J0aFRIAAAADAAAA8RjYUVTAAAAGAAAA9BlbkFVAAAAFAAAA3Zlc1hMAAAAEgAAArZkZURFAAAAEAAAA+hlblVTAAAAEgAAA/hwdEJSAAAAGAAABApwbFBMAAAAEgAABCJlbEdSAAAAIgAABDRzdlNFAAAAEAAABFZ0clRSAAAAFAAABGZwdFBUAAAAFgAABHpqYUpQAAAADAAABJAATABDAEQAIAB1ACAAYgBvAGoAac7st+wAIABMAEMARABGAGEAcgBnAGUALQBMAEMARABMAEMARAAgAFcAYQByAG4AYQBTAHoA7QBuAGUAcwAgAEwAQwBEAEIAYQByAGUAdgBuAP0AIABMAEMARABMAEMARAAtAGYAYQByAHYAZQBzAGsA5gByAG0ASwBsAGUAdQByAGUAbgAtAEwAQwBEAFYA5AByAGkALQBMAEMARABMAEMARAAgAGEAIABjAG8AbABvAHIAaQBMAEMARAAgAGEAIABjAG8AbABvAHIATABDAEQAIABjAG8AbABvAHIAQQBDAEwAIABjAG8AdQBsAGUAdQByIA8ATABDAEQAIAZFBkQGSAZGBikEGgQ+BDsETAQ+BEAEPgQyBDgEOQAgAEwAQwBEIA8ATABDAEQAIAXmBdEF4gXVBeAF2V9pgnIATABDAEQATABDAEQAIABNAOAAdQBGAGEAcgBlAGIAbgD9ACAATABDAEQEJgQyBDUEQgQ9BD4EOQAgBBYEGgAtBDQEOARBBD8EOwQ1BDkAQwBvAGwAbwB1AHIAIABMAEMARABMAEMARAAgAGMAbwB1AGwAZQB1AHIAVwBhAHIAbgBhACAATABDAEQJMAkCCRcJQAkoACAATABDAEQATABDAEQAIA4qDjUATABDAEQAIABlAG4AIABjAG8AbABvAHIARgBhAHIAYgAtAEwAQwBEAEMAbwBsAG8AcgAgAEwAQwBEAEwAQwBEACAAQwBvAGwAbwByAGkAZABvAEsAbwBsAG8AcgAgAEwAQwBEA4gDswPHA8EDyQO8A7cAIAO/A7gDzAO9A7cAIABMAEMARABGAOQAcgBnAC0ATABDAEQAUgBlAG4AawBsAGkAIABMAEMARABMAEMARAAgAGEAIABDAG8AcgBlAHMwqzDpMPwATABDAER0ZXh0AAAAAENvcHlyaWdodCBBcHBsZSBJbmMuLCAy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YUInEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCv/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/2Q==" alt="Fynd" className="lc-tb-heart" />
            <span className="lc-tb-divider"></span>
            <span className="lc-tb-title">Legal Connect</span>
          </div>
        </div>
        {/* Center: Search */}
        <div className="lc-tb-search">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            placeholder="Search contracts, reviewers, document types…"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
        {/* Right: User info */}
        <div className="lc-tb-right">
          {lcUser && (
            <div className="lc-tb-user">
              <div className="lc-tb-avatar">{lcUser.name ? lcUser.name.charAt(0).toUpperCase() : lcUser.email.charAt(0).toUpperCase()}</div>
              <div className="lc-tb-user-info">
                <span className="lc-tb-user-name">{lcUser.name || lcUser.email.split('@')[0]}</span>
                <span className="lc-tb-user-email">{lcUser.email}</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Sidebar */}
      <aside className="lc-sidebar">
        <nav className="lc-sb-nav">
          {NAV_ITEMS.map(item => (
            hasScope(item.id) ? (
              <button
                key={item.id}
                className={`lc-sbi${activePage === item.id ? " active" : ""}`}
                onClick={() => setActivePage(item.id)}
                title={item.label}
              >
                <i className={`fa-solid ${item.icon}`}></i>
                <span>{item.label}</span>
              </button>
            ) : null
          ))}
          {/* Request Logs */}
          <button
            className={`lc-sbi${activePage === "requests-logs" ? " active" : ""}`}
            onClick={() => setActivePage("requests-logs")}
            title="Request Logs"
          >
            <i className="fa-solid fa-clipboard-list"></i>
            <span>Request Logs</span>
          </button>
          {/* Fynd's IPR */}
          <button
            className={`lc-sbi${activePage === "fynds-ipr" ? " active" : ""}`}
            onClick={() => setActivePage("fynds-ipr")}
            title="Fynd's IPR"
          >
            <i className="fa-solid fa-registered"></i>
            <span>Fynd's IPR</span>
          </button>
          {/* Litigation */}
          <button
            className={`lc-sbi${activePage === "litigation" ? " active" : ""}`}
            onClick={() => setActivePage("litigation")}
            title="Litigation"
          >
            <i className="fa-solid fa-gavel"></i>
            <span>Litigation</span>
          </button>
          {/* Team — last (informational, not operational) */}
          {hasScope("team") && (
            <button
              className={`lc-sbi${activePage === "team" ? " active" : ""}`}
              onClick={() => setActivePage("team")}
              title="Team"
            >
              <i className="fa-solid fa-users"></i>
              <span>Team</span>
            </button>
          )}
        </nav>
        <div className="lc-sb-foot">
          <Link href="/legal-connect" className="lc-sb-home-btn" title="Back to Legal Connect">
            <i className="fa-solid fa-house"></i>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="lc-main">
        {pageComponents[activePage]}
      </main>
    </div>
  );
}
