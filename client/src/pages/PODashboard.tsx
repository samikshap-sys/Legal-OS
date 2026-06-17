/**
 * PODashboard.tsx — Purchase Order Dashboard FY 2026-27
 * Design: matches DP Recon style (white cards, purple accents, bl-* CSS classes)
 * v3: IP + Deal Name slicers, PO Start/End Date columns + filter widget, currency conversion
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line,
} from "recharts";

// ─── Theme ────────────────────────────────────────────────────────────────────
const BRAND = "#7C5CFC";
const ACCENT = "#9B7FFF";
const ACCENT_LIGHT = "#F0ECFF";
const PALETTE = [
  "#7C5CFC", "#9B7FFF", "#B8A0FF", "#6344E8", "#A88BFF",
  "#C4B0FF", "#5533D0", "#3D1FA8", "#8B6FFF", "#D4C8FF",
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface Kpis {
  totalPOs: number;
  totalRows: number;
  totalPOValueCr: number;
  totalConsumedCr: number;
  balanceCr: number;
  consumedPct: number;
  uniqueVendors: number;
  uniqueBUs: number;
  msmePOs: number;
  nonMsmePOs: number;
  msmePOValueCr: number;
  nonMsmePOValueCr: number;
  pendingApproval: number;
  pendingPct: number;
  openPOs: number;
  closedPOs: number;
  approvedPOs: number;
  servicePOs: number;
  materialPOs: number;
  servicePOValueCr: number;
  materialPOValueCr: number;
}

interface Charts {
  byPOStatus: Record<string, number>;
  byApprovalStatus: Record<string, number>;
  byFrequency: Record<string, number>;
  byMSME: Record<string, number>;
  byPOType: Record<string, number>;
  buValueList: { bu: string; valueCr: number; consumedCr: number; consumptionPct: number }[];
  topVendors: { name: string; valueCr: number }[];
  topCategories: { name: string; valueCr: number }[];
  monthlyConsumed: { month: string; valueCr: number }[];
}

interface Analytics {
  kpis: Kpis;
  charts: Charts;
  lastRefreshed: string;
}

// ─── Month order for FY 2026-27 ───────────────────────────────────────────────
const FY_MONTHS = [
  "Apr'26", "May'26", "Jun'26", "Jul'26", "Aug'26", "Sep'26",
  "Oct'26", "Nov'26", "Dec'26", "Jan'27", "Feb'27", "Mar'27",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCr(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  return `${n.toFixed(2)} Cr`;
}

function fmtCrShort(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 100) return `${n.toFixed(1)} Cr`;
  return `${n.toFixed(2)} Cr`;
}

function fmtINR(val: string): string {
  if (!val) return "—";
  const n = parseFloat(val.replace(/[,\s$₹]/g, ""));
  if (isNaN(n)) return val;
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return `${n.toLocaleString("en-IN")}`;
}

/** Parse "1-Apr-2026", "1-April-2026", "01/04/2026" style dates to JS Date */
function parseDateStr(val: string): Date | null {
  if (!val) return null;
  const m1 = val.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (m1) {
    const d = new Date(`${m1[2]} ${m1[1]}, ${m1[3]}`);
    if (!isNaN(d.getTime())) return d;
  }
  const d2 = new Date(val);
  if (!isNaN(d2.getTime())) return d2;
  return null;
}

/** Get INR value for a row: use "Total Value in INR" if present, else Total Value × Exchange Rate */
function getRowINRValue(row: Record<string, string>): number {
  const totalValueINR = parseFloat((row["Total Value in INR"] || "").replace(/[,\s$₹]/g, ""));
  if (!isNaN(totalValueINR) && totalValueINR > 0) return totalValueINR;
  const totalValue = parseFloat((row["Total Value"] || "").replace(/[,\s$₹]/g, "")) || 0;
  const exchangeRate = parseFloat((row["Exchange Rate"] || "").replace(/[,\s]/g, "")) || 1;
  return totalValue * exchangeRate;
}

/** Monthly INR column names — already converted to INR in the sheet */
const MONTHLY_COLS_FE = [
  "April'26 INR", "May'26 INR", "June'26 INR", "July'26 INR", "Aug'26 INR", "Sept'26 INR",
  "Oct'26 INR", "Nov'26 INR", "Dec'26 INR", "Jan'27 INR", "Feb'27 INR", "March'27 INR",
];

/** Get consumed INR for a row using the cumulative Consumption till March.27 column */
function getRowConsumedINR(row: Record<string, string>): number {
  return parseFloat((row["Consumption till March.27 in INR"] || "").replace(/[,\s$₹]/g, "")) || 0;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, loading }: {
  label: string; value: string; sub?: string; loading?: boolean;
}) {
  return (
    <div className="bl-kpi-card" style={{ flex: "1 1 180px" }}>
      <div className="bl-kpi-label">{label}</div>
      {loading
        ? <div className="bl-kpi-loading">Loading…</div>
        : <div className="bl-kpi-value">{value}</div>}
      {sub && <div className="bl-kpi-sub">{sub}</div>}
    </div>
  );
}

// ─── Chart Card ───────────────────────────────────────────────────────────────
function ChartCard({ title, sub, children, style, headerRight }: {
  title: string; sub?: string; children: React.ReactNode; style?: React.CSSProperties; headerRight?: React.ReactNode;
}) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(46,100,120,.13)",
      borderRadius: 14,
      padding: "20px 22px 16px",
      boxShadow: "0 1px 4px rgba(0,0,0,.04), 0 4px 16px rgba(46,100,120,.06)",
      ...style,
    }}>
      <div style={{ marginBottom: 14, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND, letterSpacing: "-.2px" }}>{title}</div>
          {sub && <div style={{ fontSize: 12, color: "#374151", marginTop: 3 }}>{sub}</div>}
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff", border: `1px solid rgba(46,100,120,.2)`,
      borderRadius: 8, padding: "10px 14px", fontSize: 12.5,
      boxShadow: "0 4px 16px rgba(46,100,120,.12)",
    }}>
      <div style={{ fontWeight: 700, color: BRAND, marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || BRAND, marginBottom: 2 }}>
          <span style={{ fontWeight: 600 }}>{p.name}:</span>{" "}
          {typeof p.value === "number" ? `${p.value.toFixed(2)} Cr` : p.value}
        </div>
      ))}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function LoadingCard({ height = 220 }: { height?: number }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid rgba(46,100,120,.1)",
      borderRadius: 14, height, display: "flex", alignItems: "center",
      justifyContent: "center", color: "#374151", fontSize: 13,
    }}>
      Loading data from Google Sheets…
    </div>
  );
}

// ─── Grid helper ─────────────────────────────────────────────────────────────
function Grid({ cols = 2, gap = 16, children }: {
  cols?: number; gap?: number; children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>
      {children}
    </div>
  );
}

// ─── Pill badge ───────────────────────────────────────────────────────────────
function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 700,
      color,
      background: bg,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "Open") return <Pill label="Open" color="#166534" bg="#dcfce7" />;
  if (status === "Closed") return <Pill label="Closed" color="#991b1b" bg="#fee2e2" />;
  return <Pill label={status || "—"} color="#374151" bg="#f3f4f6" />;
}

function ApprovalPill({ status }: { status: string }) {
  if (status === "Approved") return <Pill label="Approved" color="#166534" bg="#dcfce7" />;
  if (status === "Sent for Approval") return <Pill label="Sent for Approval" color="#92400e" bg="#fef3c7" />;
  if (status === "Draft") return <Pill label="Draft" color="#374151" bg="#f3f4f6" />;
  return <Pill label={status || "—"} color="#374151" bg="#f3f4f6" />;
}

function MSMEPill({ val }: { val: string }) {
  const lower = val.toLowerCase();
  if (lower.includes("msme") && !lower.includes("non")) {
    return <Pill label="MSME" color="#1e40af" bg="#dbeafe" />;
  }
  if (lower.includes("non")) return <Pill label="Non-MSME" color="#374151" bg="#f3f4f6" />;
  return <span style={{ color: "#9ca3af", fontSize: 12 }}>{val || "—"}</span>;
}

// ─── PO Register Table ────────────────────────────────────────────────────────
const TABLE_COLS = [
  { key: "PO Number", label: "PO Number", width: 120 },
  { key: "PO Date", label: "PO Date", width: 90 },
  { key: "PO Start Date", label: "PO Start Date", width: 110 },
  { key: "PO End Date", label: "PO End Date", width: 110 },
  { key: "Renewal Date", label: "Renewal Date", width: 110 },
  { key: "Region", label: "Region", width: 80 },
  { key: "BU", label: "BU", width: 70 },
  { key: "IP", label: "IP", width: 90 },
  { key: "Deal Name", label: "Deal Name", width: 160 },
  { key: "Vendor Name", label: "Vendor Name", width: 180 },
  { key: "Type", label: "Type", width: 80 },
  { key: "Total Value in INR", label: "PO Value (INR)", width: 130 },
  { key: "Consumption till March.27 in INR", label: "Consumed (INR)", width: 130 },
  { key: "Balance PO Value in INR", label: "Balance (INR)", width: 120 },
  { key: "Invoice Frequency", label: "Inv. Freq.", width: 100 },
  { key: "MSME/ Non MSME", label: "MSME", width: 110 },
  { key: "PO Approval Status", label: "Approval", width: 140 },
  { key: "Status", label: "Status", width: 80 },
];

const PAGE_SIZE = 10;

// ─── Dashboard-level filter state type ───────────────────────────────────────
interface FilterState {
  bu: string;
  region: string;
  status: string;
  approval: string;
  msme: string;
  ip: string;
  dealName: string;
  dateFrom: string;
  dateTo: string;
  renewalDate: string;  // show POs with Renewal Date >= this date
  search: string;
}

const DEFAULT_FILTERS: FilterState = {
  bu: "ALL", region: "ALL", status: "ALL", approval: "ALL",
  msme: "ALL", ip: "ALL", dealName: "ALL",
  dateFrom: "", dateTo: "",
  renewalDate: "",
  search: "",
};

// ─── Slicer Bar (dashboard-level) ─────────────────────────────────────────────
function SlicerBar({
  filters, setFilters, rows,
}: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  rows: Record<string, string>[];
}) {
  const buOptions = useMemo(() => {
    const s = new Set(rows.map(r => r["BU"] || "").filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);
  const regionOptions = useMemo(() => {
    const s = new Set(rows.map(r => r["Region"] || "").filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);
  const statusOptions = useMemo(() => {
    const s = new Set(rows.map(r => r["Status"] || "").filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);
  const approvalOptions = useMemo(() => {
    const s = new Set(rows.map(r => r["PO Approval Status"] || "").filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);
  const msmeOptions = useMemo(() => {
    const s = new Set(rows.map(r => r["MSME/ Non MSME"] || "").filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);
  const ipOptions = useMemo(() => {
    const s = new Set(rows.map(r => r["IP"] || "").filter(Boolean));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);
  const dealNameOptions = useMemo(() => {
    const s = new Set(rows.map(r => r["Deal Name"] || "").filter(v => v && v !== "-" && v !== "—"));
    return ["ALL", ...Array.from(s).sort()];
  }, [rows]);

  const hasFilters = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  const selectStyle: React.CSSProperties = {
    height: 34, padding: "0 10px", borderRadius: 7, fontSize: 12.5, fontWeight: 500,
    border: "1.5px solid #e5e7eb", background: "#f9fafb", color: "#374151",
    cursor: "pointer", fontFamily: "inherit", outline: "none",
    boxShadow: "0 1px 2px rgba(0,0,0,.04)",
  };

  const inputStyle: React.CSSProperties = {
    height: 34, padding: "0 10px", borderRadius: 7, fontSize: 12.5,
    border: "1.5px solid rgba(46,100,120,.2)", outline: "none",
    fontFamily: "inherit", background: "#f9fafb", color: "#374151",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 600, color: "#6b7280", whiteSpace: "nowrap",
  };

  return (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(46,100,120,.13)",
      borderRadius: 12,
      padding: "14px 18px",
      marginBottom: 18,
      boxShadow: "0 1px 4px rgba(0,0,0,.04)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
        Filters &amp; Slicers
      </div>

      {/* Row 1: Search + main slicers — order: Search, BU, Region, IP, Status, Approval, MSME, Deal Name, PO Date */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search PO, vendor, deal…"
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          style={{ ...inputStyle, minWidth: 190 }}
        />

        {/* BU */}
        <select value={filters.bu} onChange={e => setFilters(f => ({ ...f, bu: e.target.value }))} style={selectStyle}>
          {buOptions.map(o => <option key={o} value={o}>{o === "ALL" ? "All BUs" : o}</option>)}
        </select>

        {/* Region */}
        <select value={filters.region} onChange={e => setFilters(f => ({ ...f, region: e.target.value }))} style={selectStyle}>
          {regionOptions.map(o => <option key={o} value={o}>{o === "ALL" ? "All Regions" : o}</option>)}
        </select>

        {/* IP */}
        <select value={filters.ip} onChange={e => setFilters(f => ({ ...f, ip: e.target.value }))} style={{ ...selectStyle, maxWidth: 160 }}>
          {ipOptions.map(o => <option key={o} value={o}>{o === "ALL" ? "All IPs" : o}</option>)}
        </select>

        {/* Status */}
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={selectStyle}>
          {statusOptions.map(o => <option key={o} value={o}>{o === "ALL" ? "All Statuses" : o}</option>)}
        </select>

        {/* Approval */}
        <select value={filters.approval} onChange={e => setFilters(f => ({ ...f, approval: e.target.value }))} style={selectStyle}>
          {approvalOptions.map(o => <option key={o} value={o}>{o === "ALL" ? "All Approvals" : o}</option>)}
        </select>

        {/* MSME */}
        <select value={filters.msme} onChange={e => setFilters(f => ({ ...f, msme: e.target.value }))} style={selectStyle}>
          {msmeOptions.map(o => <option key={o} value={o}>{o === "ALL" ? "All MSME" : o}</option>)}
        </select>

        {/* Deal Name */}
        <select value={filters.dealName} onChange={e => setFilters(f => ({ ...f, dealName: e.target.value }))} style={{ ...selectStyle, maxWidth: 200 }}>
          {dealNameOptions.map(o => <option key={o} value={o}>{o === "ALL" ? "All Deal Names" : o}</option>)}
        </select>

        {/* PO Date range */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={labelStyle}>PO Date:</span>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
            style={{ ...inputStyle, width: 130 }}
          />
          <span style={{ fontSize: 11.5, color: "#9ca3af" }}>–</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
            style={{ ...inputStyle, width: 130 }}
          />
        </div>

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={() => setFilters({ ...DEFAULT_FILTERS })}
            style={{
              height: 34, padding: "0 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
              border: `1.5px solid ${BRAND}`, background: "transparent", color: BRAND,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Clear All
          </button>
        )}
      </div>

    </div>
  );
}

// ─── PO Register Table (receives filtered rows from parent) ───────────────────
function PORegisterTable({ rows, loading, allRowCount, filters, setFilters }: {
  rows: Record<string, string>[];
  loading: boolean;
  allRowCount: number;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
}) {
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const netPOValueCr = useMemo(() => {
    const total = rows.reduce((sum, r) => sum + getRowINRValue(r), 0);
    return total / 1e7;
  }, [rows]);

  const bulletSummary = useMemo(() => {
    const byBU: Record<string, { value: number; consumed: number }> = {};
    rows.forEach(r => {
      const bu = r["BU"] || "Unknown";
      const v = getRowINRValue(r);
      const c = getRowConsumedINR(r);
      if (!byBU[bu]) byBU[bu] = { value: 0, consumed: 0 };
      byBU[bu].value += v;
      byBU[bu].consumed += c;
    });
    return Object.entries(byBU)
      .map(([bu, d]) => ({
        bu,
        valueCr: d.value / 1e7,
        consumedCr: d.consumed / 1e7,
        pct: d.value > 0 ? Math.round((d.consumed / d.value) * 100) : 0,
      }))
      .sort((a, b) => b.valueCr - a.valueCr);
  }, [rows]);

  return (
    <ChartCard
      title="Purchase Order Register"
      sub={`${rows.length} of ${allRowCount} rows shown`}
      headerRight={
        <div style={{
          background: "linear-gradient(135deg, #7C5CFC 0%, #9B7FFF 100%)",
          borderRadius: 10,
          padding: "8px 16px",
          textAlign: "right",
          boxShadow: "0 2px 8px rgba(124,92,252,.25)",
          minWidth: 140,
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,.8)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 2 }}>Net PO Value</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-.3px", lineHeight: 1.1 }}>{netPOValueCr.toFixed(2)} Cr</div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,.65)", marginTop: 2 }}>{rows.length} PO{rows.length !== 1 ? "s" : ""} selected</div>
        </div>
      }
    >
      {/* PO Start/End Date single-picker filters — inside the table card */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", marginBottom: 14, padding: "10px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid rgba(46,100,120,.1)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          Renewal Date Filter
        </div>
        {/* Renewal Date single picker: show POs renewing on or after selected date */}
        <input
          type="date"
          value={filters.renewalDate}
          onChange={e => setFilters(f => ({ ...f, renewalDate: e.target.value }))}
          style={{ height: 32, padding: "0 8px", borderRadius: 6, fontSize: 12, border: "1.5px solid rgba(46,100,120,.2)", outline: "none", fontFamily: "inherit", background: "#fff", color: "#374151", width: 140 }}
        />
        {filters.renewalDate && (
          <button
            onClick={() => setFilters(f => ({ ...f, renewalDate: "" }))}
            style={{ height: 32, padding: "0 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: `1.5px solid ${BRAND}`, background: "transparent", color: BRAND, cursor: "pointer", fontFamily: "inherit" }}
          >
            Clear
          </button>
        )}
      </div>

      {!loading && bulletSummary.length > 0 && (
        <div style={{
          marginBottom: 16,
          padding: "12px 14px",
          background: ACCENT_LIGHT,
          borderRadius: 10,
          border: `1px solid rgba(124,92,252,.15)`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
            BU Consumption Coordinates
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
            {bulletSummary.map(b => (
              <span key={b.bu} style={{ fontSize: 12, color: "#374151" }}>
                <span style={{ fontWeight: 700, color: BRAND }}>{b.bu}</span>
                {" — "}
                <span style={{ fontWeight: 600 }}>{fmtCr(b.valueCr)}</span>
                {" PO · "}
                <span style={{ fontWeight: 600 }}>{fmtCr(b.consumedCr)}</span>
                {" consumed ("}
                <span style={{
                  fontWeight: 700,
                  color: b.pct >= 80 ? "#dc2626" : b.pct >= 50 ? "#d97706" : "#16a34a",
                }}>
                  {b.pct}%
                </span>
                {")"}
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? <LoadingCard height={300} /> : (
        <>
          <div className="bl-table-wrap">
            <table className="bl-table" style={{ minWidth: 1800 }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  {TABLE_COLS.map(col => (
                    <th key={col.key} style={{ minWidth: col.width }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={TABLE_COLS.length + 1} style={{ textAlign: "center", padding: "40px 20px", color: "#9ca3af" }}>
                      No records match the current filters.
                    </td>
                  </tr>
                ) : pageRows.map((row, i) => (
                  <tr key={i}>
                    <td style={{ color: BRAND, fontWeight: 700 }}>{(safePage - 1) * PAGE_SIZE + i + 1}</td>
                    {TABLE_COLS.map(col => {
                      const val = row[col.key] || "";
                      if (col.key === "Status") return <td key={col.key}><StatusPill status={val} /></td>;
                      if (col.key === "PO Approval Status") return <td key={col.key}><ApprovalPill status={val} /></td>;
                      if (col.key === "MSME/ Non MSME") return <td key={col.key}><MSMEPill val={val} /></td>;
                      if (col.key === "Total Value in INR" || col.key === "Consumption till March.27 in INR" || col.key === "Balance PO Value in INR") {
                        return <td key={col.key} className="mono" style={{ textAlign: "right" }}>{fmtINR(val)}</td>;
                      }
                      if (col.key === "PO Number") return <td key={col.key} style={{ fontWeight: 700, color: BRAND }}>{val || "—"}</td>;
                      return <td key={col.key}>{val || "—"}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bl-pagination">
            <button
              className="bl-page-btn"
              disabled={safePage <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              &#8592; Prev
            </button>
            <span className="bl-page-info">
              Page {safePage} of {totalPages} &mdash; {rows.length} records
            </span>
            <button
              className="bl-page-btn"
              disabled={safePage >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next &#8594;
            </button>
          </div>
        </>
      )}
    </ChartCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main PO Dashboard page
// ═══════════════════════════════════════════════════════════════════════════════
export default function PODashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [allRows, setAllRows] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>({ ...DEFAULT_FILTERS });

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, rowsRes] = await Promise.all([
        fetch("/api/po-dashboard/analytics"),
        fetch("/api/po-dashboard/rows"),
      ]);
      const analyticsJson = await analyticsRes.json();
      const rowsJson = await rowsRes.json();
      if (analyticsJson.success) setAnalytics(analyticsJson);
      if (rowsJson.success) setAllRows(rowsJson.rows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/po-dashboard/refresh", { method: "POST" });
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleDownloadReport = async () => {
    setDownloading(true);
    try {
      const resp = await fetch("/api/po-dashboard/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: filteredRows }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const blob = await resp.blob();
      const cd = resp.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `PO_Report_${new Date().toISOString().slice(0, 10)}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDownloading(false);
    }
  };

  // ── Apply dashboard-level filters ─────────────────────────────────────────
  const filteredRows = useMemo(() => {
    const q = filters.search.toLowerCase();
    const fromDate = filters.dateFrom ? new Date(filters.dateFrom) : null;
    const toDate = filters.dateTo ? new Date(filters.dateTo + "T23:59:59") : null;
    // Renewal Date single filter: show POs with Renewal Date >= selected date
    const renewalFrom = filters.renewalDate ? new Date(filters.renewalDate) : null;

    return allRows.filter(r => {
      if (filters.bu !== "ALL" && r["BU"] !== filters.bu) return false;
      if (filters.region !== "ALL" && r["Region"] !== filters.region) return false;
      if (filters.status !== "ALL" && r["Status"] !== filters.status) return false;
      if (filters.approval !== "ALL" && r["PO Approval Status"] !== filters.approval) return false;
      if (filters.msme !== "ALL" && r["MSME/ Non MSME"] !== filters.msme) return false;
      if (filters.ip !== "ALL" && r["IP"] !== filters.ip) return false;
      if (filters.dealName !== "ALL" && r["Deal Name"] !== filters.dealName) return false;

      if (fromDate || toDate) {
        const poDate = parseDateStr(r["PO Date"] || "");
        if (!poDate) return false;
        if (fromDate && poDate < fromDate) return false;
        if (toDate && poDate > toDate) return false;
      }
      // Renewal Date single filter: show POs renewing on or after selected date
      if (renewalFrom) {
        const d = parseDateStr(r["Renewal Date"] || "");
        if (!d || d < renewalFrom) return false;
      }

      if (q) {
        const haystack = [r["PO Number"], r["Vendor Name"], r["Deal Name"], r["BU"], r["IP"]].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, filters]);

  // ── Compute KPIs from filtered rows (using INR-converted values) ──────────
  const filteredKpis = useMemo(() => {
    if (!filteredRows.length) return null;
    const totalPOValue = filteredRows.reduce((s, r) => s + getRowINRValue(r), 0);
    const totalConsumed = filteredRows.reduce((s, r) => s + getRowConsumedINR(r), 0);
    const balance = totalPOValue - totalConsumed;
    const uniquePOs = new Set(filteredRows.map(r => r["PO Number"]).filter(Boolean)).size;
    const uniqueVendors = new Set(filteredRows.map(r => r["Vendor Name"]).filter(Boolean)).size;
    const uniqueBUs = new Set(filteredRows.map(r => r["BU"]).filter(Boolean)).size;
    const msmePOs = filteredRows.filter(r => r["MSME/ Non MSME"]?.toLowerCase().includes("msme") && !r["MSME/ Non MSME"]?.toLowerCase().includes("non")).length;
    const nonMsmePOs = filteredRows.filter(r => r["MSME/ Non MSME"]?.toLowerCase().includes("non")).length;
    const msmePOValue = filteredRows.filter(r => r["MSME/ Non MSME"]?.toLowerCase().includes("msme") && !r["MSME/ Non MSME"]?.toLowerCase().includes("non")).reduce((s, r) => s + getRowINRValue(r), 0);
    const nonMsmePOValue = filteredRows.filter(r => r["MSME/ Non MSME"]?.toLowerCase().includes("non")).reduce((s, r) => s + getRowINRValue(r), 0);
    const pendingApproval = filteredRows.filter(r => r["PO Approval Status"] === "Sent for Approval").length;
    const openPOs = filteredRows.filter(r => r["Status"] === "Open").length;
    const servicePOs = filteredRows.filter(r => r["Type"]?.toLowerCase().includes("service")).length;
    const materialPOs = filteredRows.filter(r => r["Type"]?.toLowerCase().includes("material")).length;
    const servicePOValue = filteredRows.filter(r => r["Type"]?.toLowerCase().includes("service")).reduce((s, r) => s + getRowINRValue(r), 0);
    const materialPOValue = filteredRows.filter(r => r["Type"]?.toLowerCase().includes("material")).reduce((s, r) => s + getRowINRValue(r), 0);
    return {
      totalPOs: uniquePOs,
      totalRows: filteredRows.length,
      totalPOValueCr: totalPOValue / 1e7,
      totalConsumedCr: totalConsumed / 1e7,
      balanceCr: balance / 1e7,
      consumedPct: totalPOValue > 0 ? Math.round((totalConsumed / totalPOValue) * 100) : 0,
      uniqueVendors,
      uniqueBUs,
      msmePOs,
      nonMsmePOs,
      msmePOValueCr: msmePOValue / 1e7,
      nonMsmePOValueCr: nonMsmePOValue / 1e7,
      pendingApproval,
      pendingPct: uniquePOs > 0 ? Math.round((pendingApproval / uniquePOs) * 100) : 0,
      openPOs,
      closedPOs: filteredRows.filter(r => r["Status"] === "Closed").length,
      approvedPOs: filteredRows.filter(r => r["PO Approval Status"] === "Approved").length,
      servicePOs,
      materialPOs,
      servicePOValueCr: servicePOValue / 1e7,
      materialPOValueCr: materialPOValue / 1e7,
    };
  }, [filteredRows]);

  // ── Compute charts from filtered rows ─────────────────────────────────────
  const filteredCharts = useMemo(() => {
    const byPOStatus: Record<string, number> = {};
    const byApprovalStatus: Record<string, number> = {};
    const byMSME: Record<string, number> = {};
    const buMap: Record<string, { value: number; consumed: number }> = {};
    const vendorMap: Record<string, number> = {};

    filteredRows.forEach(r => {
      const status = r["Status"] || "Unknown";
      byPOStatus[status] = (byPOStatus[status] || 0) + 1;

      const approval = r["PO Approval Status"] || "Unknown";
      byApprovalStatus[approval] = (byApprovalStatus[approval] || 0) + 1;

      const msme = r["MSME/ Non MSME"] || "Unknown";
      const msmeKey = msme.toLowerCase().includes("non") ? "Non-MSME" : msme.toLowerCase().includes("msme") ? "MSME" : msme;
      byMSME[msmeKey] = (byMSME[msmeKey] || 0) + 1;

      const bu = r["BU"] || "Unknown";
      const v = getRowINRValue(r);
      const c = getRowConsumedINR(r);
      if (!buMap[bu]) buMap[bu] = { value: 0, consumed: 0 };
      buMap[bu].value += v;
      buMap[bu].consumed += c;

      const vendor = r["Vendor Name"] || "Unknown";
      vendorMap[vendor] = (vendorMap[vendor] || 0) + v;
    });

    const buValueList = Object.entries(buMap).map(([bu, d]) => ({
      bu,
      valueCr: d.value / 1e7,
      consumedCr: d.consumed / 1e7,
      consumptionPct: d.value > 0 ? Math.round((d.consumed / d.value) * 100) : 0,
    })).sort((a, b) => b.valueCr - a.valueCr);

    const topVendors = Object.entries(vendorMap)
      .map(([name, v]) => ({ name, valueCr: v / 1e7 }))
      .sort((a, b) => b.valueCr - a.valueCr)
      .slice(0, 12);

    return { byPOStatus, byApprovalStatus, byMSME, buValueList, topVendors };
  }, [filteredRows]);

  // ── Month-wise time series ─────────────────────────────────────────────────
  // Monthly time series uses the pre-converted "April'26 INR" columns from the sheet
  const monthlyTimeSeries = useMemo(() => {
    // Map: sheet column name (already in INR) → display label
    const INR_MONTH_COLS: [string, string][] = [
      ["April'26 INR",   "Apr'26"],
      ["May'26 INR",     "May'26"],
      ["June'26 INR",    "Jun'26"],
      ["July'26 INR",    "Jul'26"],
      ["Aug'26 INR",     "Aug'26"],
      ["Sept'26 INR",    "Sep'26"],
      ["Oct'26 INR",     "Oct'26"],
      ["Nov'26 INR",     "Nov'26"],
      ["Dec'26 INR",     "Dec'26"],
      ["Jan'27 INR",     "Jan'27"],
      ["Feb'27 INR",     "Feb'27"],
      ["March'27 INR",   "Mar'27"],
    ];

    const monthTotals: Record<string, number> = {};
    INR_MONTH_COLS.forEach(([, label]) => { monthTotals[label] = 0; });

    filteredRows.forEach(r => {
      INR_MONTH_COLS.forEach(([colName, label]) => {
        const raw = parseFloat((r[colName] || "").replace(/[,\s$₹]/g, "")) || 0;
        if (raw !== 0) monthTotals[label] += raw;
      });
    });

    return INR_MONTH_COLS.map(([, label]) => ({
      month: label,
      consumed: parseFloat((monthTotals[label] / 1e7).toFixed(2)),
    }));
  }, [filteredRows]);

  const isFiltered = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  const kpis = isFiltered ? filteredKpis : analytics?.kpis;
  const charts = analytics?.charts;

  const statusDonut = useMemo(() => {
    const src = isFiltered ? filteredCharts.byPOStatus : charts?.byPOStatus;
    if (!src) return [];
    return Object.entries(src).map(([name, value]) => ({ name, value }));
  }, [isFiltered, filteredCharts, charts]);

  const approvalDonut = useMemo(() => {
    const src = isFiltered ? filteredCharts.byApprovalStatus : charts?.byApprovalStatus;
    if (!src) return [];
    return Object.entries(src).map(([name, value]) => ({ name, value }));
  }, [isFiltered, filteredCharts, charts]);

  const msmeDonut = useMemo(() => {
    const src = isFiltered ? filteredCharts.byMSME : charts?.byMSME;
    if (!src) return [];
    return Object.entries(src).map(([name, value]) => ({ name, value }));
  }, [isFiltered, filteredCharts, charts]);

  const buValueList = isFiltered ? filteredCharts.buValueList : (charts?.buValueList ?? []);
  const topVendors = isFiltered ? filteredCharts.topVendors : (charts?.topVendors ?? []);

  return (
    <div className="bl-page">
      {/* Page header */}
      <div className="bl-page-header">
        <div>
          <div className="bl-page-title">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            PO Dashboard
          </div>
          <div className="bl-page-sub">
            Purchase Order Register &mdash; FY 2026-27
            {analytics?.lastRefreshed && (
              <span style={{ marginLeft: 12, color: "#9ca3af", fontSize: 12 }}>
                Last synced: {analytics.lastRefreshed}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{
            display: "flex", alignItems: "center", gap: 5,
            background: ACCENT_LIGHT, color: BRAND,
            borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 700,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            Live
          </span>
          <span style={{
            background: "rgba(46,100,120,.1)", color: BRAND,
            borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 700,
          }}>
            FY 2026-27
          </span>
          <button
            onClick={handleDownloadReport}
            disabled={downloading || loading || filteredRows.length === 0}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              height: 34, padding: "0 14px", borderRadius: 8,
              background: "#6B7280", color: "#fff", border: "none",
              fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit",
              opacity: (downloading || loading || filteredRows.length === 0) ? 0.6 : 1,
              transition: "opacity .15s",
            }}
            title={`Download Word report (.docx) for ${filteredRows.length} filtered rows`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {downloading ? "Generating…" : "Download Report"}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              height: 34, padding: "0 14px", borderRadius: 8,
              background: BRAND, color: "#fff", border: "none",
              fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", opacity: (refreshing || loading) ? 0.6 : 1,
              transition: "opacity .15s",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {refreshing ? "Syncing…" : "Sync Sheet"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          background: "#fff5f5", border: "1px solid #fed7d7", borderRadius: 10,
          padding: "14px 18px", color: "#c53030", fontSize: 13, marginBottom: 20,
        }}>
          Error loading data: {error}
        </div>
      )}

      {/* ── SLICERS — above KPIs ─────────────────────────────────────────── */}
      <SlicerBar filters={filters} setFilters={setFilters} rows={allRows} />

      {/* ── KPI Row 1 — Value KPIs ───────────────────────────────────────── */}
      <div className="bl-kpi-row">
        <KpiCard label="Total POs" value={kpis ? String(kpis.totalPOs) : "—"} sub={kpis ? `${kpis.totalRows} total rows` : "Distinct PO numbers"} loading={loading} />
        <KpiCard label="Total PO Value" value={kpis ? fmtCr(kpis.totalPOValueCr) : "—"} sub="Sum of Total Value in INR" loading={loading} />
        <KpiCard label="Consumed" value={kpis ? fmtCr(kpis.totalConsumedCr) : "—"} sub={kpis ? `${kpis.consumedPct}% of PO value` : "Till March 2027"} loading={loading} />
        <KpiCard label="Balance" value={kpis ? fmtCr(kpis.balanceCr) : "—"} sub="Remaining PO value" loading={loading} />
        <KpiCard label="Unique Vendors" value={kpis ? String(kpis.uniqueVendors) : "—"} sub="Active vendor count" loading={loading} />
        <KpiCard label="Business Units" value={kpis ? String(kpis.uniqueBUs) : "—"} sub="Distinct BUs" loading={loading} />
      </div>

      {/* ── KPI Row 2 — Classification KPIs ─────────────────────────────── */}
      <div className="bl-kpi-row">
        <KpiCard label="MSME POs" value={kpis ? String(kpis.msmePOs) : "—"} sub={kpis ? `${fmtCrShort(kpis.msmePOValueCr)} value` : "MSME vendors"} loading={loading} />
        <KpiCard label="Non-MSME POs" value={kpis ? String(kpis.nonMsmePOs) : "—"} sub={kpis ? `${fmtCrShort(kpis.nonMsmePOValueCr)} value` : "Non-MSME vendors"} loading={loading} />
        <KpiCard label="Service POs" value={kpis ? String(kpis.servicePOs) : "—"} sub={kpis ? `${fmtCrShort(kpis.servicePOValueCr)} value` : "Service type"} loading={loading} />
        <KpiCard label="Material POs" value={kpis ? String(kpis.materialPOs) : "—"} sub={kpis ? `${fmtCrShort(kpis.materialPOValueCr)} value` : "Material type"} loading={loading} />
        <KpiCard label="Open POs" value={kpis ? String(kpis.openPOs) : "—"} sub="Active purchase orders" loading={loading} />
        <KpiCard label="Pending Approval" value={kpis ? String(kpis.pendingApproval) : "—"} sub={kpis ? `${kpis.pendingPct}% of total POs` : "Sent for approval"} loading={loading} />
      </div>

      {/* ── Charts Row 1 — 3 donuts ──────────────────────────────────────── */}
      {loading ? (
        <Grid cols={3} gap={16}><LoadingCard height={260} /><LoadingCard height={260} /><LoadingCard height={260} /></Grid>
      ) : (
        <Grid cols={3} gap={16}>
          <ChartCard title="PO Status" sub="Open vs Closed">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" nameKey="name" paddingAngle={3}
                  label={({ name, percent }: { name: string; percent: number }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {statusDonut.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => v} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Approval Status" sub="Approved / Sent / Draft">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={approvalDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" nameKey="name" paddingAngle={3}
                  label={({ name, percent }: { name: string; percent: number }) => `${name.split(" ")[0]} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {approvalDonut.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => v} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="MSME Classification" sub="MSME vs Non-MSME">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={msmeDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                  dataKey="value" nameKey="name" paddingAngle={3}
                  label={({ name, percent }: { name: string; percent: number }) => {
                    const short = name.toLowerCase().includes("non") ? "Non-MSME" : "MSME";
                    return `${short} ${(percent * 100).toFixed(0)}%`;
                  }}
                  labelLine={false}>
                  {msmeDonut.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => v} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>
      )}

      <div style={{ height: 16 }} />

      {/* ── Charts Row 2 — Month-wise line chart + BU value bar ──────────── */}
      {loading ? (
        <Grid cols={2} gap={16}><LoadingCard height={280} /><LoadingCard height={280} /></Grid>
      ) : (
        <Grid cols={2} gap={16}>
          <ChartCard
            title="Monthly Consumption Trend"
            sub={`Consumption in Cr by month — FY 2026-27${isFiltered ? " (filtered)" : ""}`}
          >
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={monthlyTimeSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#6b7280" }} />
                <YAxis tickFormatter={v => `${v}Cr`} tick={{ fontSize: 11, fill: "#6b7280" }} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="consumed"
                  name="Consumed (Cr)"
                  stroke={BRAND}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: BRAND, strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="PO Value by BU" sub="Total PO value per Business Unit (Cr)">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={buValueList.slice(0, 10)}
                layout="vertical"
                margin={{ top: 4, right: 40, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
                <XAxis type="number" tickFormatter={v => `${v}Cr`} tick={{ fontSize: 10, fill: "#6b7280" }} />
                <YAxis type="category" dataKey="bu" tick={{ fontSize: 11, fill: "#374151" }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="valueCr" name="PO Value (Cr)" fill={BRAND} radius={[0, 4, 4, 0]} />
                <Bar dataKey="consumedCr" name="Consumed (Cr)" fill={ACCENT} radius={[0, 4, 4, 0]} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Grid>
      )}

      <div style={{ height: 16 }} />

      {/* ── Charts Row 3 — Top Vendors + BU Consumption % ───────────────── */}
      {loading ? (
        <Grid cols={2} gap={16}><LoadingCard height={320} /><LoadingCard height={320} /></Grid>
      ) : (
        <Grid cols={2} gap={16}>
          <ChartCard title="Top Vendors by PO Value" sub="Top 12 vendors ranked by total PO value">
            <div className="bl-table-wrap">
              <table className="bl-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Vendor Name</th>
                    <th style={{ textAlign: "right" }}>PO Value</th>
                  </tr>
                </thead>
                <tbody>
                  {topVendors.map((v, i) => (
                    <tr key={i}>
                      <td style={{ color: BRAND, fontWeight: 700 }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{v.name}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{fmtCr(v.valueCr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="Consumption % by BU" sub="Consumed vs PO value per Business Unit">
            <div className="bl-table-wrap">
              <table className="bl-table">
                <thead>
                  <tr>
                    <th>BU</th>
                    <th style={{ textAlign: "right" }}>PO Value</th>
                    <th style={{ textAlign: "right" }}>Consumed</th>
                    <th style={{ textAlign: "right" }}>Consumed %</th>
                  </tr>
                </thead>
                <tbody>
                  {buValueList.map((bu, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{bu.bu}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{fmtCr(bu.valueCr)}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{fmtCr(bu.consumedCr)}</td>
                      <td style={{ textAlign: "right" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                          background: bu.consumptionPct >= 80 ? "#fee2e2" : bu.consumptionPct >= 50 ? "#fef3c7" : "#dcfce7",
                          color: bu.consumptionPct >= 80 ? "#991b1b" : bu.consumptionPct >= 50 ? "#92400e" : "#166534",
                        }}>
                          {bu.consumptionPct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </Grid>
      )}

      <div style={{ height: 20 }} />

      {/* ── PO Register Table ─────────────────────────────────────────────── */}
      <PORegisterTable rows={filteredRows} loading={loading} allRowCount={allRows.length} filters={filters} setFilters={setFilters} />
    </div>
  );
}
