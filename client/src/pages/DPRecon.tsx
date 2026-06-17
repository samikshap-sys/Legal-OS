/**
 * DP Recon Dashboard — powered by fynd-db.finance_dwh.DP_monthly_Rev
 * 5 tabs: Executive Overview | DP Performance | India Operations | RBL Operations | Monthly Trends
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, ComposedChart,
} from "recharts";

// ─── Theme colours ────────────────────────────────────────────────────────────
const BRAND = "#7C5CFC";
const ACCENT = "#9B7FFF";
const ACCENT_LIGHT = "#F0ECFF";
const TEAL_PALETTE = [
  "#7C5CFC", "#9B7FFF", "#B8A0FF", "#6344E8", "#A88BFF",
  "#C4B0FF", "#5533D0", "#3D1FA8", "#8B6FFF", "#D4C8FF",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtNum(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtCurr(n: number | undefined | null): string {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
}

function fmtRaw(n: number | undefined | null, d = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: d });
}

const TABS = [
  { id: "exec", label: "Executive Overview" },
  { id: "dp", label: "DP Performance" },
  { id: "india", label: "India Operations" },
  { id: "rbl", label: "RBL Operations" },
  { id: "trends", label: "Monthly Trends" },
] as const;

type TabId = typeof TABS[number]["id"];

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, loading,
}: { label: string; value: string; sub?: string; loading?: boolean }) {
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
function ChartCard({
  title, sub, children, style,
}: { title: string; sub?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "#fff",
      border: "1px solid rgba(46,100,120,.13)",
      borderRadius: 14,
      padding: "20px 22px 16px",
      boxShadow: "0 1px 4px rgba(0,0,0,.04), 0 4px 16px rgba(46,100,120,.06)",
      ...style,
    }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND, letterSpacing: "-.2px" }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: "#374151", marginTop: 3 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────
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
          {typeof p.value === "number" ? fmtRaw(p.value) : p.value}
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
      Loading data from BigQuery…
    </div>
  );
}

// ─── Grid layout helper ───────────────────────────────────────────────────────
function Grid({ cols = 2, gap = 16, children }: { cols?: number; gap?: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap }}>
      {children}
    </div>
  );
}

// ─── Slicer button ────────────────────────────────────────────────────────────
function SlicerBtn({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 14px",
        borderRadius: 6,
        border: `1.5px solid ${active ? BRAND : "rgba(46,100,120,.2)"}`,
        background: active ? BRAND : "#fff",
        color: active ? "#fff" : BRAND,
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
        transition: "all .15s",
        lineHeight: 1.4,
      }}
    >
      {label}
    </button>
  );
}

// ─── Monthly Summary Table with slicers ───────────────────────────────────────
function MonthlySummaryTable({
  monthSummary,
  monthBuMatrix,
  isLoading,
}: {
  monthSummary: { month: string; quarter: string; ships: number; dp_cost: number; rev: number; margin: number; cost_per_ship: number }[];
  monthBuMatrix: { month: string; quarter: string; bu: string; lapa_type: string; ships: number; dp_cost: number; rev: number }[];
  isLoading: boolean;
}) {
  const [buFilter, setBuFilter] = useState<"ALL" | "INDIA" | "RBL">("ALL");
  const [lapaFilter, setLapaFilter] = useState<"ALL" | "LAPA" | "Non-LAPA">("ALL");

  // When both slicers are ALL, use the pre-aggregated monthSummary (has cost_per_ship)
  // Otherwise, derive from monthBuMatrix
  const tableRows = useMemo(() => {
    if (buFilter === "ALL" && lapaFilter === "ALL") {
      return monthSummary.map(r => ({
        month: r.month,
        quarter: r.quarter,
        ships: r.ships,
        dp_cost: r.dp_cost,
        rev: r.rev,
        margin: r.margin,
        cost_per_ship: r.cost_per_ship,
      }));
    }
    // Filter monthBuMatrix and re-aggregate per month
    const filtered = monthBuMatrix.filter(r => {
      if (buFilter !== "ALL" && r.bu !== buFilter) return false;
      if (lapaFilter !== "ALL" && r.lapa_type !== lapaFilter) return false;
      return true;
    });
    const map: Record<string, { month: string; quarter: string; ships: number; dp_cost: number; rev: number }> = {};
    filtered.forEach(r => {
      if (!map[r.month]) map[r.month] = { month: r.month, quarter: r.quarter, ships: 0, dp_cost: 0, rev: 0 };
      map[r.month].ships += r.ships;
      map[r.month].dp_cost += r.dp_cost;
      map[r.month].rev += r.rev;
    });
    // Preserve original month order from monthSummary
    return monthSummary
      .map(s => map[s.month])
      .filter(Boolean)
      .map(r => ({
        ...r,
        margin: r.rev - r.dp_cost,
        cost_per_ship: r.ships > 0 ? r.dp_cost / r.ships : 0,
      }));
  }, [buFilter, lapaFilter, monthSummary, monthBuMatrix]);

  return (
    <ChartCard title="Monthly Summary Table" sub="Full month-by-month breakdown with cost-per-shipment">
      {/* Slicers */}
      <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".5px" }}>BU</span>
          {(["ALL", "INDIA", "RBL"] as const).map(v => (
            <SlicerBtn key={v} label={v} active={buFilter === v} onClick={() => setBuFilter(v)} />
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: "rgba(46,100,120,.15)" }} />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: ".5px" }}>Type</span>
          {(["ALL", "LAPA", "Non-LAPA"] as const).map(v => (
            <SlicerBtn key={v} label={v} active={lapaFilter === v} onClick={() => setLapaFilter(v)} />
          ))}
        </div>
        {(buFilter !== "ALL" || lapaFilter !== "ALL") && (
          <button
            onClick={() => { setBuFilter("ALL"); setLapaFilter("ALL"); }}
            style={{
              marginLeft: "auto", fontSize: 11, color: "#374151", background: "none",
              border: "none", cursor: "pointer", textDecoration: "underline",
            }}
          >
            Reset filters
          </button>
        )}
      </div>

      {isLoading ? <LoadingCard height={200} /> : (
        <div className="bl-table-wrap">
          <table className="bl-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Quarter</th>
                <th style={{ textAlign: "right" }}>Shipments</th>
                <th style={{ textAlign: "right" }}>DP Cost</th>
                <th style={{ textAlign: "right" }}>Revenue</th>
                <th style={{ textAlign: "right" }}>Margin</th>
                <th style={{ textAlign: "right" }}>₹/Ship</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700, color: BRAND }}>{r.month}</td>
                  <td style={{ color: "#374151" }}>{r.quarter}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{fmtNum(r.ships)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{fmtCurr(r.dp_cost)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{fmtCurr(r.rev)}</td>
                  <td className="mono" style={{ textAlign: "right", color: r.margin >= 0 ? "#27ae60" : "#e74c3c" }}>
                    {fmtCurr(r.margin)}
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>₹{fmtRaw(r.cost_per_ship)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

// ─── India Brands Table (full, with slicers + sort + CSV) ──────────────────────
type IndiaBrandRow = { company: string; lapa_type: string; ships: number; dp_cost: number; rev: number };
type IndiaSortKey = "company" | "lapa_type" | "ships" | "dp_cost" | "rev" | "margin";

function IndiaBrandsTable({ rows, isLoading }: { rows: IndiaBrandRow[]; isLoading: boolean }) {
  const [lapaFilter, setLapaFilter] = useState<"ALL" | "LAPA" | "Non-LAPA">("ALL");
  const [plFilter, setPlFilter] = useState<"ALL" | "Profitable" | "Loss Making">("ALL");
  const [sortKey, setSortKey] = useState<IndiaSortKey>("ships");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [lapaOpen, setLapaOpen] = useState(false);
  const [plOpen, setPlOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const enriched = useMemo(() =>
    rows.map(r => ({ ...r, margin: r.lapa_type === "LAPA" ? r.rev - r.dp_cost : null as number | null })),
    [rows]
  );

  const filtered = useMemo(() => {
    let d = enriched;
    if (lapaFilter !== "ALL") d = d.filter(r => r.lapa_type === lapaFilter);
    if (plFilter === "Profitable") d = d.filter(r => r.margin != null && r.margin >= 0);
    if (plFilter === "Loss Making") d = d.filter(r => r.margin != null && r.margin < 0);
    return [...d].sort((a, b) => {
      const av = sortKey === "margin" ? (a.margin ?? -Infinity) : (a[sortKey] as number | string);
      const bv = sortKey === "margin" ? (b.margin ?? -Infinity) : (b[sortKey] as number | string);
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [enriched, lapaFilter, plFilter, sortKey, sortDir]);

  const toggleSort = (key: IndiaSortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setSortOpen(false);
  };

  const downloadCsv = () => {
    const headers = ["#", "Brand", "Type", "Shipments", "DP Cost", "Revenue", "Margin"];
    const csvRows = enriched.map((r, i) => [
      i + 1, `"${r.company}"`, r.lapa_type, r.ships,
      r.dp_cost.toFixed(2), r.rev.toFixed(2),
      r.margin != null ? r.margin.toFixed(2) : "",
    ]);
    const csv = [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "india-brands.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const SORT_OPTIONS: { key: IndiaSortKey; label: string }[] = [
    { key: "ships", label: "Shipments" }, { key: "dp_cost", label: "DP Cost" },
    { key: "rev", label: "Revenue" }, { key: "margin", label: "Margin" },
    { key: "company", label: "Brand Name" }, { key: "lapa_type", label: "Type" },
  ];

  const dropdownStyle: React.CSSProperties = {
    position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
    background: "#fff", border: "1px solid rgba(46,100,120,.2)",
    borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.1)",
    minWidth: 160, padding: "4px 0",
  };
  const dropItemStyle = (active: boolean): React.CSSProperties => ({
    display: "block", width: "100%", textAlign: "left",
    padding: "7px 14px", fontSize: 12, fontWeight: active ? 700 : 500,
    color: active ? BRAND : "#374151", background: active ? ACCENT_LIGHT : "transparent",
    border: "none", cursor: "pointer",
  });
  const triggerStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5,
    padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
    border: `1.5px solid rgba(46,100,120,.25)`, background: "#fff", color: BRAND,
    cursor: "pointer", whiteSpace: "nowrap" as const,
  };

  const SortIcon = ({ col }: { col: IndiaSortKey }) =>
    sortKey === col ? <span style={{ fontSize: 10 }}>{sortDir === "asc" ? " ▲" : " ▼"}</span> : null;

  return (
    <ChartCard title="India Brands" sub={`All brands — INDIA BU · ${filtered.length} of ${enriched.length} shown`}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {/* LAPA dropdown */}
        <div style={{ position: "relative" }}>
          <button style={triggerStyle} onClick={() => { setLapaOpen(o => !o); setPlOpen(false); setSortOpen(false); }}>
            Type: {lapaFilter} <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {lapaOpen && (
            <div style={dropdownStyle}>
              {(["ALL", "LAPA", "Non-LAPA"] as const).map(v => (
                <button key={v} style={dropItemStyle(lapaFilter === v)} onClick={() => { setLapaFilter(v); setLapaOpen(false); }}>{v}</button>
              ))}
            </div>
          )}
        </div>
        {/* P&L dropdown */}
        <div style={{ position: "relative" }}>
          <button style={triggerStyle} onClick={() => { setPlOpen(o => !o); setLapaOpen(false); setSortOpen(false); }}>
            P&L: {plFilter} <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {plOpen && (
            <div style={dropdownStyle}>
              {(["ALL", "Profitable", "Loss Making"] as const).map(v => (
                <button key={v} style={dropItemStyle(plFilter === v)} onClick={() => { setPlFilter(v); setPlOpen(false); }}>{v}</button>
              ))}
            </div>
          )}
        </div>
        {/* Sort dropdown */}
        <div style={{ position: "relative" }}>
          <button style={triggerStyle} onClick={() => { setSortOpen(o => !o); setLapaOpen(false); setPlOpen(false); }}>
            Sort: {SORT_OPTIONS.find(o => o.key === sortKey)?.label} {sortDir === "asc" ? "▲" : "▼"} <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {sortOpen && (
            <div style={dropdownStyle}>
              {SORT_OPTIONS.map(o => (
                <button key={o.key} style={dropItemStyle(sortKey === o.key)} onClick={() => toggleSort(o.key)}>
                  {o.label} {sortKey === o.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={downloadCsv}
          style={{ ...triggerStyle, background: BRAND, color: "#fff", border: "none" }}
        >
          ↓ Download CSV
        </button>
      </div>
      {isLoading ? <LoadingCard height={300} /> : (
        <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
          <table className="bl-table" style={{ minWidth: 700 }}>
            <thead style={{ position: "sticky", top: 0, background: "#f8fbfc", zIndex: 1 }}>
              <tr>
                <th style={{ cursor: "default" }}>#</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("company")}>Brand <SortIcon col="company" /></th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("lapa_type")}>Type <SortIcon col="lapa_type" /></th>
                <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("ships")}>Shipments <SortIcon col="ships" /></th>
                <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("dp_cost")}>DP Cost <SortIcon col="dp_cost" /></th>
                <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("rev")}>Revenue <SortIcon col="rev" /></th>
                <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("margin")}>Margin <SortIcon col="margin" /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td style={{ color: BRAND, fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{r.company}</td>
                  <td>
                    <span style={{
                      background: r.lapa_type === "LAPA" ? ACCENT_LIGHT : "rgba(46,100,120,.08)",
                      color: BRAND, borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 700,
                    }}>{r.lapa_type}</span>
                  </td>
                  <td className="mono" style={{ textAlign: "right" }}>{fmtNum(r.ships)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{fmtCurr(r.dp_cost)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{r.lapa_type === "LAPA" ? fmtCurr(r.rev) : "—"}</td>
                  <td className="mono" style={{ textAlign: "right", color: r.margin != null ? (r.margin >= 0 ? "#27ae60" : "#e74c3c") : undefined }}>
                    {r.lapa_type === "LAPA" && r.margin != null ? fmtCurr(r.margin) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

// ─── RBL Brands Table (full, with slicers + sort + CSV) ──────────────────────
type RBLBrandRow = { company: string; ships: number; dp_cost: number; rev: number; margin: number; margin_pct: number };
type RBLSortKey = "company" | "ships" | "dp_cost" | "rev" | "margin" | "margin_pct";

function RBLBrandsTable({ rows, isLoading }: { rows: RBLBrandRow[]; isLoading: boolean }) {
  const [plFilter, setPlFilter] = useState<"ALL" | "Profitable" | "Loss Making">("ALL");
  const [sortKey, setSortKey] = useState<RBLSortKey>("ships");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [plOpen, setPlOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = useMemo(() => {
    let d = rows;
    if (plFilter === "Profitable") d = d.filter(r => r.margin >= 0);
    if (plFilter === "Loss Making") d = d.filter(r => r.margin < 0);
    return [...d].sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [rows, plFilter, sortKey, sortDir]);

  const toggleSort = (key: RBLSortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
    setSortOpen(false);
  };

  const downloadCsv = () => {
    const headers = ["#", "Brand", "Shipments", "DP Cost", "Revenue", "Margin", "Margin %"];
    const csvRows = rows.map((r, i) => [
      i + 1, `"${r.company}"`, r.ships,
      r.dp_cost.toFixed(2), r.rev.toFixed(2),
      r.margin.toFixed(2), r.margin_pct != null ? r.margin_pct.toFixed(2) : "",
    ]);
    const csv = [headers.join(","), ...csvRows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "rbl-brands.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const SORT_OPTIONS: { key: RBLSortKey; label: string }[] = [
    { key: "ships", label: "Shipments" }, { key: "dp_cost", label: "DP Cost" },
    { key: "rev", label: "Revenue" }, { key: "margin", label: "Margin" },
    { key: "margin_pct", label: "Margin %" }, { key: "company", label: "Brand Name" },
  ];

  const dropdownStyle: React.CSSProperties = {
    position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
    background: "#fff", border: "1px solid rgba(46,100,120,.2)",
    borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.1)",
    minWidth: 160, padding: "4px 0",
  };
  const dropItemStyle = (active: boolean): React.CSSProperties => ({
    display: "block", width: "100%", textAlign: "left",
    padding: "7px 14px", fontSize: 12, fontWeight: active ? 700 : 500,
    color: active ? BRAND : "#374151", background: active ? ACCENT_LIGHT : "transparent",
    border: "none", cursor: "pointer",
  });
  const triggerStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5,
    padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
    border: `1.5px solid rgba(46,100,120,.25)`, background: "#fff", color: BRAND,
    cursor: "pointer", whiteSpace: "nowrap" as const,
  };

  const SortIcon = ({ col }: { col: RBLSortKey }) =>
    sortKey === col ? <span style={{ fontSize: 10 }}>{sortDir === "asc" ? " ▲" : " ▼"}</span> : null;

  return (
    <ChartCard title="RBL Brands" sub={`All brands — RBL BU · ${filtered.length} of ${rows.length} shown`}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {/* P&L dropdown */}
        <div style={{ position: "relative" }}>
          <button style={triggerStyle} onClick={() => { setPlOpen(o => !o); setSortOpen(false); }}>
            P&L: {plFilter} <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {plOpen && (
            <div style={dropdownStyle}>
              {(["ALL", "Profitable", "Loss Making"] as const).map(v => (
                <button key={v} style={dropItemStyle(plFilter === v)} onClick={() => { setPlFilter(v); setPlOpen(false); }}>{v}</button>
              ))}
            </div>
          )}
        </div>
        {/* Sort dropdown */}
        <div style={{ position: "relative" }}>
          <button style={triggerStyle} onClick={() => { setSortOpen(o => !o); setPlOpen(false); }}>
            Sort: {SORT_OPTIONS.find(o => o.key === sortKey)?.label} {sortDir === "asc" ? "▲" : "▼"} <span style={{ fontSize: 10 }}>▾</span>
          </button>
          {sortOpen && (
            <div style={dropdownStyle}>
              {SORT_OPTIONS.map(o => (
                <button key={o.key} style={dropItemStyle(sortKey === o.key)} onClick={() => toggleSort(o.key)}>
                  {o.label} {sortKey === o.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={downloadCsv}
          style={{ ...triggerStyle, background: BRAND, color: "#fff", border: "none" }}
        >
          ↓ Download CSV
        </button>
      </div>
      {isLoading ? <LoadingCard height={300} /> : (
        <div style={{ maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
          <table className="bl-table" style={{ minWidth: 700 }}>
            <thead style={{ position: "sticky", top: 0, background: "#f8fbfc", zIndex: 1 }}>
              <tr>
                <th style={{ cursor: "default" }}>#</th>
                <th style={{ cursor: "pointer" }} onClick={() => toggleSort("company")}>Brand <SortIcon col="company" /></th>
                <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("ships")}>Shipments <SortIcon col="ships" /></th>
                <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("dp_cost")}>DP Cost <SortIcon col="dp_cost" /></th>
                <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("rev")}>Revenue <SortIcon col="rev" /></th>
                <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("margin")}>Margin <SortIcon col="margin" /></th>
                <th style={{ textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("margin_pct")}>Margin % <SortIcon col="margin_pct" /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={i}>
                  <td style={{ color: BRAND, fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{r.company}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{fmtNum(r.ships)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{fmtCurr(r.dp_cost)}</td>
                  <td className="mono" style={{ textAlign: "right" }}>{fmtCurr(r.rev)}</td>
                  <td className="mono" style={{ textAlign: "right", color: r.margin >= 0 ? "#27ae60" : "#e74c3c" }}>{fmtCurr(r.margin)}</td>
                  <td className="mono" style={{ textAlign: "right", color: r.margin_pct >= 0 ? "#27ae60" : "#e74c3c" }}>
                    {r.margin_pct != null ? `${r.margin_pct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: Executive Overview
// ═══════════════════════════════════════════════════════════════════════════════
function ExecOverview({ fy }: { fy: string }) {
  const { data, isLoading } = trpc.dpRecon.execOverview.useQuery({ fy });

  const t = data?.totals;
  const monthlyTrend = data?.monthlyTrend ?? [];
  const buSplit = data?.buSplit ?? [];
  const quarterlyTrend = data?.quarterlyTrend ?? [];
  const top10 = data?.top10Companies ?? [];

  const donutData = useMemo(() => {
    const map: Record<string, number> = {};
    buSplit.forEach(r => { map[r.segment] = (map[r.segment] || 0) + r.ships; });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [buSplit]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="bl-kpi-row">
        <KpiCard label="Total Shipments" value={fmtNum(t?.total_ships)} sub="FY 25-26 all BUs" loading={isLoading} />
        <KpiCard label="Total DP Cost" value={fmtCurr(t?.total_dp_cost)} sub="Sum of logistics cost" loading={isLoading} />
        <KpiCard label="Total Revenue (LAPA)" value={fmtCurr(t?.total_rev)} sub="LAPA brands only" loading={isLoading} />
        <KpiCard label="Gross Margin" value={fmtCurr(t?.total_margin)} sub="Rev − DP Cost (LAPA)" loading={isLoading} />
        <KpiCard label="India Shipments" value={fmtNum(t?.india_ships)} sub="INDIA BU" loading={isLoading} />
        <KpiCard label="RBL Shipments" value={fmtNum(t?.rbl_ships)} sub="RBL BU" loading={isLoading} />
        <KpiCard label="Active DPs" value={String(t?.distinct_dps ?? "—")} sub="Delivery partners" loading={isLoading} />
        <KpiCard label="Brands Served" value={String(t?.distinct_companies ?? "—")} sub="Distinct companies" loading={isLoading} />
      </div>

      <Grid cols={2} gap={16}>
        {isLoading ? <LoadingCard height={280} /> : (
          <ChartCard title="Monthly Shipment Trend" sub="Total shipments across all BUs per month">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={monthlyTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="shipGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BRAND} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="ships" name="Shipments" stroke={BRAND} strokeWidth={2.5} fill="url(#shipGrad)" dot={{ r: 3, fill: BRAND }} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {isLoading ? <LoadingCard height={280} /> : (
          <ChartCard title="BU × LAPA Segment Mix" sub="Shipment share by Business Unit and LAPA type">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  dataKey="value" nameKey="name" paddingAngle={3}
                  label={({ name, percent }: { name: string; percent: number }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {donutData.map((_, i) => <Cell key={i} fill={TEAL_PALETTE[i % TEAL_PALETTE.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmtNum(v)} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </Grid>

      <Grid cols={2} gap={16}>
        {isLoading ? <LoadingCard height={260} /> : (
          <ChartCard title="Monthly DP Cost Trend" sub="Total logistics cost per month (₹)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis tickFormatter={v => fmtCurr(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="dp_cost" name="DP Cost" fill={BRAND} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {isLoading ? <LoadingCard height={260} /> : (
          <ChartCard title="Quarterly Shipments — India vs RBL" sub="Quarter-wise BU comparison">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={quarterlyTrend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
                <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="india_ships" name="India" fill={BRAND} radius={[3, 3, 0, 0]} />
                <Bar dataKey="rbl_ships" name="RBL" fill={ACCENT} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </Grid>

      <ChartCard title="Top 10 Brands by Shipment Volume" sub="Ranked by total shipments across all months">
        {isLoading ? <LoadingCard height={180} /> : (
          <div className="bl-table-wrap">
            <table className="bl-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Brand / Company</th>
                  <th>BU</th>
                  <th style={{ textAlign: "right" }}>Shipments</th>
                  <th style={{ textAlign: "right" }}>DP Cost</th>
                  <th style={{ textAlign: "right" }}>Cost / Ship</th>
                </tr>
              </thead>
              <tbody>
                {top10.map((r, i) => (
                  <tr key={i}>
                    <td style={{ color: BRAND, fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{r.company}</td>
                    <td>
                      <span style={{
                        background: r.bu === "INDIA" ? ACCENT_LIGHT : "rgba(46,100,120,.1)",
                        color: BRAND, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700,
                      }}>{r.bu}</span>
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtNum(r.ships)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtCurr(r.dp_cost)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {fmtCurr(r.ships > 0 ? r.dp_cost / r.ships : 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: DP Performance
// ═══════════════════════════════════════════════════════════════════════════════
function DPPerformance({ fy }: { fy: string }) {
  const { data, isLoading } = trpc.dpRecon.dpPerformance.useQuery({ fy });

  const dpSummary = data?.dpSummary ?? [];
  const dpShare = data?.dpShare ?? [];
  const dpCostShare = data?.dpCostShare ?? [];
  const dpMonthly = data?.dpMonthly ?? [];

  const months = useMemo(() => Array.from(new Set(dpMonthly.map(r => r.month))), [dpMonthly]);
  const dps = useMemo(() => Array.from(new Set(dpMonthly.map(r => r.dp))), [dpMonthly]);

  const stackedData = useMemo(() => months.map(m => {
    const row: Record<string, string | number> = { month: m };
    dps.forEach(dp => {
      const found = dpMonthly.find(r => r.month === m && r.dp === dp);
      row[dp] = found?.ships ?? 0;
    });
    return row;
  }), [months, dps, dpMonthly]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="bl-kpi-row">
        {isLoading ? (
          [1, 2, 3].map(i => <KpiCard key={i} label="Loading…" value="—" loading />)
        ) : dpSummary.slice(0, 5).map((dp, i) => (
          <KpiCard
            key={i}
            label={dp.dp}
            value={fmtNum(dp.ships)}
            sub={`Cost: ${fmtCurr(dp.dp_cost)} | ₹${fmtRaw(dp.cost_per_ship)}/ship`}
          />
        ))}
      </div>

      <Grid cols={2} gap={16}>
        {isLoading ? <LoadingCard height={280} /> : (
          <ChartCard title="DP Shipment Share" sub="% of total shipments by delivery partner">
            <div className="bl-table-wrap">
              <table className="bl-table">
                <thead>
                  <tr>
                    <th>Delivery Partner</th>
                    <th style={{ textAlign: "right" }}>Shipments</th>
                    <th style={{ textAlign: "right" }}>Share %</th>
                    <th style={{ textAlign: "right" }}>India</th>
                    <th style={{ textAlign: "right" }}>RBL</th>
                  </tr>
                </thead>
                <tbody>
                  {dpShare.map((r, i) => {
                    const summary = dpSummary.find(d => d.dp === r.dp);
                    return (
                      <tr key={i}>
                        <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: TEAL_PALETTE[i % TEAL_PALETTE.length], flexShrink: 0, display: "inline-block" }} />
                          <span style={{ fontWeight: 600 }}>{r.dp}</span>
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>{fmtNum(r.ships)}</td>
                        <td style={{ textAlign: "right" }}>
                          <span style={{ background: ACCENT_LIGHT, color: BRAND, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{r.pct}%</span>
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>{fmtNum(summary?.bu_india)}</td>
                        <td className="mono" style={{ textAlign: "right" }}>{fmtNum(summary?.bu_rbl)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}

        {isLoading ? <LoadingCard height={280} /> : (
          <ChartCard title="DP Cost Share" sub="% of total DP cost by delivery partner">
            <div className="bl-table-wrap">
              <table className="bl-table">
                <thead>
                  <tr>
                    <th>Delivery Partner</th>
                    <th style={{ textAlign: "right" }}>DP Cost</th>
                    <th style={{ textAlign: "right" }}>Share %</th>
                    <th style={{ textAlign: "right" }}>₹/Ship</th>
                  </tr>
                </thead>
                <tbody>
                  {dpCostShare.map((r, i) => {
                    const summary = dpSummary.find(d => d.dp === r.dp);
                    return (
                      <tr key={i}>
                        <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: TEAL_PALETTE[i % TEAL_PALETTE.length], flexShrink: 0, display: "inline-block" }} />
                          <span style={{ fontWeight: 600 }}>{r.dp}</span>
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>{fmtCurr(r.dp_cost)}</td>
                        <td style={{ textAlign: "right" }}>
                          <span style={{ background: ACCENT_LIGHT, color: BRAND, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{r.pct}%</span>
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>₹{fmtRaw(summary?.cost_per_ship)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}
      </Grid>

      {isLoading ? <LoadingCard height={260} /> : (
        <ChartCard title="DP Cost vs Shipment Volume" sub="Comparing total cost and shipments per delivery partner">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={dpSummary} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
              <XAxis dataKey="dp" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis yAxisId="left" tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={v => fmtCurr(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="left" dataKey="ships" name="Shipments" fill={BRAND} radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="dp_cost" name="DP Cost" stroke="#e67e22" strokeWidth={2.5} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {isLoading ? <LoadingCard height={240} /> : (
        <ChartCard title="Cost per Shipment by DP" sub="Average DP cost per shipment (₹)">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dpSummary} layout="vertical" margin={{ top: 4, right: 80, left: 80, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `₹${v}`} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis type="category" dataKey="dp" tick={{ fontSize: 11, fill: "#374151" }} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="cost_per_ship" name="₹/Shipment" fill={ACCENT}
                radius={[0, 4, 4, 0]}
                label={{ position: "right", formatter: (v: number) => `₹${fmtRaw(v)}`, fontSize: 11, fill: BRAND }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {isLoading ? <LoadingCard height={280} /> : (
        <ChartCard title="Monthly Shipments by DP" sub="Stacked view of shipment volume per DP across months">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stackedData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {dps.map((dp, i) => (
                <Bar key={dp} dataKey={dp} stackId="a" fill={TEAL_PALETTE[i % TEAL_PALETTE.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ChartCard title="DP Performance Summary" sub="Full comparison across all delivery partners">
        {isLoading ? <LoadingCard height={200} /> : (
          <div className="bl-table-wrap">
            <table className="bl-table">
              <thead>
                <tr>
                  <th>DP Name</th>
                  <th style={{ textAlign: "right" }}>Shipments</th>
                  <th style={{ textAlign: "right" }}>DP Cost</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                  <th style={{ textAlign: "right" }}>₹/Ship</th>
                  <th style={{ textAlign: "right" }}>India Ships</th>
                  <th style={{ textAlign: "right" }}>RBL Ships</th>
                </tr>
              </thead>
              <tbody>
                {dpSummary.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: BRAND }}>{r.dp}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtNum(r.ships)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtCurr(r.dp_cost)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtCurr(r.rev)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>₹{fmtRaw(r.cost_per_ship)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtNum(r.bu_india)}</td>
                    <td className="mono" style={{ textAlign: "right" }}>{fmtNum(r.bu_rbl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: India Operations
// ═══════════════════════════════════════════════════════════════════════════════
function IndiaOps({ fy }: { fy: string }) {
  const { data, isLoading } = trpc.dpRecon.indiaOps.useQuery({ fy });

  const k = data?.indiaKpis;
  const quarterly = data?.indiaQuarterly ?? [];
  const monthly = data?.indiaMonthly ?? [];
  const dps = data?.indiaDPs ?? [];
  const channels = data?.indiaChannels ?? [];
  const topCompanies = data?.indiaTopCompanies ?? [];

  const dpAgg = useMemo(() => {
    const map: Record<string, { dp: string; lapa: number; nonlapa: number; total: number }> = {};
    dps.forEach(r => {
      if (!map[r.dp]) map[r.dp] = { dp: r.dp, lapa: 0, nonlapa: 0, total: 0 };
      if (r.lapa_type === "LAPA") map[r.dp].lapa += r.ships;
      else map[r.dp].nonlapa += r.ships;
      map[r.dp].total += r.ships;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [dps]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="bl-kpi-row">
        <KpiCard label="India Total Ships" value={fmtNum(k?.total_ships)} sub="All INDIA BU" loading={isLoading} />
        <KpiCard label="LAPA Shipments" value={fmtNum(k?.lapa_ships)} sub="LAPA type only" loading={isLoading} />
        <KpiCard label="Non-LAPA Ships" value={fmtNum(k?.nonlapa_ships)} sub="Non-LAPA type" loading={isLoading} />
        <KpiCard label="LAPA Revenue" value={fmtCurr(k?.lapa_rev)} sub="Logistic revenue" loading={isLoading} />
        <KpiCard label="LAPA DP Cost" value={fmtCurr(k?.lapa_cost)} sub="LAPA logistics cost" loading={isLoading} />
        <KpiCard label="LAPA Margin" value={fmtCurr(k?.lapa_margin)} sub="Rev − Cost (LAPA)" loading={isLoading} />
      </div>

      <Grid cols={2} gap={16}>
        {isLoading ? <LoadingCard height={280} /> : (
          <ChartCard title="India Monthly: LAPA vs Non-LAPA Shipments" sub="Month-wise breakdown by LAPA type">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="lapa_ships" name="LAPA" fill={BRAND} stackId="a" />
                <Bar dataKey="nonlapa_ships" name="Non-LAPA" fill={ACCENT} stackId="a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {isLoading ? <LoadingCard height={280} /> : (
          <ChartCard title="India Channel Mix" sub="Shipment distribution by ordering channel">
            <div className="bl-table-wrap">
              <table className="bl-table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th style={{ textAlign: "right" }}>Shipments</th>
                    <th style={{ textAlign: "right" }}>Share %</th>
                    <th style={{ textAlign: "right" }}>DP Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const total = channels.reduce((s, r) => s + r.ships, 0);
                    return channels.map((r, i) => (
                      <tr key={i}>
                        <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 2, background: TEAL_PALETTE[i % TEAL_PALETTE.length], flexShrink: 0, display: "inline-block" }} />
                          <span style={{ fontWeight: 600 }}>{r.channel}</span>
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>{fmtNum(r.ships)}</td>
                        <td style={{ textAlign: "right" }}>
                          <span style={{ background: ACCENT_LIGHT, color: BRAND, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
                            {total > 0 ? ((r.ships / total) * 100).toFixed(1) : 0}%
                          </span>
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>{fmtCurr(r.dp_cost)}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </ChartCard>
        )}
      </Grid>

      {isLoading ? <LoadingCard height={260} /> : (
        <ChartCard title="India Quarterly P&L — LAPA" sub="Quarter-wise LAPA revenue, cost, and margin">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={quarterly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
              <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis yAxisId="left" tickFormatter={v => fmtCurr(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="right" dataKey="lapa_ships" name="LAPA Ships" fill={ACCENT_LIGHT}
                stroke={BRAND} strokeWidth={1} radius={[4, 4, 0, 0]} />
              <Line yAxisId="left" type="monotone" dataKey="lapa_rev" name="LAPA Rev" stroke={BRAND} strokeWidth={2.5} dot={{ r: 4 }} />
              <Line yAxisId="left" type="monotone" dataKey="lapa_cost" name="LAPA Cost" stroke="#e67e22" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
              <Line yAxisId="left" type="monotone" dataKey="lapa_margin" name="Margin" stroke="#27ae60" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {isLoading ? <LoadingCard height={260} /> : (
        <ChartCard title="India DP Shipment Breakdown" sub="LAPA vs Non-LAPA shipments per delivery partner">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dpAgg} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
              <XAxis dataKey="dp" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="lapa" name="LAPA" fill={BRAND} stackId="a" />
              <Bar dataKey="nonlapa" name="Non-LAPA" fill={ACCENT} stackId="a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <IndiaBrandsTable rows={topCompanies} isLoading={isLoading} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: RBL Operations
// ═══════════════════════════════════════════════════════════════════════════════
function RBLOps({ fy }: { fy: string }) {
  const { data, isLoading } = trpc.dpRecon.rblOps.useQuery({ fy });

  const k = data?.rblKpis;
  const quarterly = data?.rblQuarterly ?? [];
  const monthly = data?.rblMonthly ?? [];
  const dps = data?.rblDPs ?? [];
  const topCompanies = data?.rblTopCompanies ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="bl-kpi-row">
        <KpiCard label="RBL Total Ships" value={fmtNum(k?.total_ships)} sub="All RBL BU" loading={isLoading} />
        <KpiCard label="RBL DP Cost" value={fmtCurr(k?.total_cost)} sub="Total logistics cost" loading={isLoading} />
        <KpiCard label="RBL Revenue" value={fmtCurr(k?.total_rev)} sub="LAPA revenue" loading={isLoading} />
        <KpiCard label="RBL Margin" value={fmtCurr(k?.total_margin)} sub="Rev − Cost" loading={isLoading} />
        <KpiCard label="Cost / Shipment" value={k ? `₹${fmtRaw(k.cost_per_ship)}` : "—"} sub="Avg DP cost/ship" loading={isLoading} />
        <KpiCard label="Active DPs" value={String(k?.distinct_dps ?? "—")} sub="RBL delivery partners" loading={isLoading} />
        <KpiCard label="Brands Served" value={String(k?.distinct_companies ?? "—")} sub="RBL companies" loading={isLoading} />
      </div>

      <Grid cols={2} gap={16}>
        {isLoading ? <LoadingCard height={280} /> : (
          <ChartCard title="RBL Monthly Trend" sub="Shipments, cost, and margin over time">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={monthly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="rblShipGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={BRAND} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis yAxisId="left" tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={v => fmtCurr(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Area yAxisId="left" type="monotone" dataKey="ships" name="Shipments" stroke={BRAND} strokeWidth={2} fill="url(#rblShipGrad)" />
                <Line yAxisId="right" type="monotone" dataKey="dp_cost" name="DP Cost" stroke="#e67e22" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="margin" name="Margin" stroke="#27ae60" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {isLoading ? <LoadingCard height={280} /> : (
          <ChartCard title="RBL DP-wise Shipments" sub="Shipment volume per delivery partner in RBL">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dps} layout="vertical" margin={{ top: 4, right: 60, left: 80, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" horizontal={false} />
                <XAxis type="number" tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
                <YAxis type="category" dataKey="dp" tick={{ fontSize: 11, fill: "#374151" }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="ships" name="Shipments" fill={BRAND} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </Grid>

      {isLoading ? <LoadingCard height={260} /> : (
        <ChartCard title="RBL Quarterly P&L" sub="Quarter-wise revenue, cost, and margin for RBL">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={quarterly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
              <XAxis dataKey="quarter" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis yAxisId="left" tickFormatter={v => fmtCurr(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="right" dataKey="ships" name="Shipments" fill={ACCENT_LIGHT}
                stroke={BRAND} strokeWidth={1} radius={[4, 4, 0, 0]} />
              <Line yAxisId="left" type="monotone" dataKey="rev" name="Revenue" stroke={BRAND} strokeWidth={2.5} dot={{ r: 4 }} />
              <Line yAxisId="left" type="monotone" dataKey="dp_cost" name="DP Cost" stroke="#e67e22" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
              <Line yAxisId="left" type="monotone" dataKey="margin" name="Margin" stroke="#27ae60" strokeWidth={2} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {isLoading ? <LoadingCard height={240} /> : (
        <ChartCard title="RBL DP Cost per Shipment" sub="Average cost per shipment for each DP in RBL">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dps} layout="vertical" margin={{ top: 4, right: 80, left: 80, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `₹${v}`} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis type="category" dataKey="dp" tick={{ fontSize: 11, fill: "#374151" }} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="cost_per_ship" name="₹/Ship" fill={ACCENT}
                radius={[0, 4, 4, 0]}
                label={{ position: "right", formatter: (v: number) => `₹${fmtRaw(v)}`, fontSize: 11, fill: BRAND }} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <RBLBrandsTable rows={topCompanies} isLoading={isLoading} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 5: Monthly Trends
// ═══════════════════════════════════════════════════════════════════════════════
function MonthlyTrends({ fy }: { fy: string }) {
  const { data, isLoading } = trpc.dpRecon.monthlyTrends.useQuery({ fy });

  const monthDpMatrix = data?.monthDpMatrix ?? [];
  const monthBuMatrix = data?.monthBuMatrix ?? [];
  const monthChannels = data?.monthChannels ?? [];
  const monthSummary = data?.monthSummary ?? [];

  const months = useMemo(() => Array.from(new Set(monthDpMatrix.map(r => r.month))), [monthDpMatrix]);
  const dps = useMemo(() => Array.from(new Set(monthDpMatrix.map(r => r.dp))), [monthDpMatrix]);
  const channels = useMemo(() => Array.from(new Set(monthChannels.map(r => r.channel))), [monthChannels]);

  const dpAreaData = useMemo(() => months.map(m => {
    const row: Record<string, string | number> = { month: m };
    dps.forEach(dp => {
      const found = monthDpMatrix.find(r => r.month === m && r.dp === dp);
      row[dp] = found?.ships ?? 0;
    });
    return row;
  }), [months, dps, monthDpMatrix]);

  const channelData = useMemo(() => months.map(m => {
    const row: Record<string, string | number> = { month: m };
    channels.forEach(ch => {
      const found = monthChannels.find(r => r.month === m && r.channel === ch);
      row[ch] = found?.ships ?? 0;
    });
    return row;
  }), [months, channels, monthChannels]);

  const buMonthData = useMemo(() => {
    const map: Record<string, Record<string, number | string>> = {};
    monthBuMatrix.forEach(r => {
      if (!map[r.month]) map[r.month] = { month: r.month };
      const key = `${r.bu}_${r.lapa_type}`;
      map[r.month][key] = ((map[r.month][key] as number) || 0) + r.ships;
    });
    return months.map(m => map[m] ?? { month: m });
  }, [months, monthBuMatrix]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="bl-kpi-row">
        {isLoading ? (
          [1, 2, 3].map(i => <KpiCard key={i} label="Loading…" value="—" loading />)
        ) : monthSummary.map((m, i) => (
          <KpiCard
            key={i}
            label={m.month}
            value={fmtNum(m.ships)}
            sub={`Cost: ${fmtCurr(m.dp_cost)} | ₹${fmtRaw(m.cost_per_ship)}/ship`}
          />
        ))}
      </div>

      {isLoading ? <LoadingCard height={280} /> : (
        <ChartCard title="Monthly Shipments & DP Cost" sub="Combined view of volume and cost trends across all months">
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={monthSummary} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="summaryGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BRAND} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis yAxisId="left" tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={v => fmtCurr(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Area yAxisId="left" type="monotone" dataKey="ships" name="Shipments" stroke={BRAND} strokeWidth={2.5} fill="url(#summaryGrad)" />
              <Line yAxisId="right" type="monotone" dataKey="dp_cost" name="DP Cost" stroke="#e67e22" strokeWidth={2} dot={{ r: 3 }} />
              <Line yAxisId="right" type="monotone" dataKey="margin" name="Margin" stroke="#27ae60" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {isLoading ? <LoadingCard height={280} /> : (
        <ChartCard title="Monthly Shipments by DP — Stacked Area" sub="Delivery partner contribution to total shipments each month">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={dpAreaData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {dps.map((dp, i) => (
                <Area key={dp} type="monotone" dataKey={dp} stackId="1"
                  stroke={TEAL_PALETTE[i % TEAL_PALETTE.length]}
                  fill={TEAL_PALETTE[i % TEAL_PALETTE.length]}
                  fillOpacity={0.7} strokeWidth={1.5} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {isLoading ? <LoadingCard height={260} /> : (
        <ChartCard title="Monthly Shipments — BU × LAPA Breakdown" sub="India and RBL LAPA/Non-LAPA shipments per month">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buMonthData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="INDIA_LAPA" name="India LAPA" fill={BRAND} stackId="a" />
              <Bar dataKey="INDIA_Non-LAPA" name="India Non-LAPA" fill={ACCENT} stackId="a" />
              <Bar dataKey="RBL_LAPA" name="RBL LAPA" fill="#5fa4b4" stackId="a" />
              <Bar dataKey="RBL_Non-LAPA" name="RBL Non-LAPA" fill="#92e3f0" stackId="a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {isLoading ? <LoadingCard height={260} /> : (
        <ChartCard title="Monthly Channel Breakdown" sub="Shipments by ordering channel across months">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={channelData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(46,100,120,.08)" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis tickFormatter={v => fmtNum(v)} tick={{ fontSize: 11, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {channels.map((ch, i) => (
                <Bar key={ch} dataKey={ch} stackId="ch" fill={TEAL_PALETTE[i % TEAL_PALETTE.length]}
                  radius={i === channels.length - 1 ? [3, 3, 0, 0] : undefined} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <MonthlySummaryTable
        monthSummary={monthSummary}
        monthBuMatrix={monthBuMatrix}
        isLoading={isLoading}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main DPRecon page
// ═══════════════════════════════════════════════════════════════════════════════
export default function DPRecon() {
  const [activeTab, setActiveTab] = useState<TabId>("exec");
  const [selectedFY, setSelectedFY] = useState<string>("ALL");
  const [fyDropOpen, setFyDropOpen] = useState(false);
  const { data: fyListData } = trpc.dpRecon.fyList.useQuery();
  const fyOptions = fyListData ?? [];

  return (
    <div className="bl-page">
      {/* Page header */}
      <div className="bl-page-header">
        <div>
          <div className="bl-page-title">
            {/* Delivery van icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="15" height="13" rx="1" />
              <path d="M16 8h4l3 5v3h-7V8z" />
              <circle cx="5.5" cy="18.5" r="2.5" />
              <circle cx="18.5" cy="18.5" r="2.5" />
            </svg>
            DP Recon
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* FY Dropdown Slicer */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setFyDropOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                border: `1.5px solid ${selectedFY !== "ALL" ? BRAND : "rgba(46,100,120,.25)"}`,
                background: selectedFY !== "ALL" ? BRAND : "#fff",
                color: selectedFY !== "ALL" ? "#fff" : BRAND,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              FY: {selectedFY} <span style={{ fontSize: 10 }}>▾</span>
            </button>
            {fyDropOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 100,
                background: "#fff", border: "1px solid rgba(46,100,120,.2)",
                borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,.12)",
                minWidth: 150, padding: "4px 0",
              }}>
                <button
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "7px 14px", fontSize: 12,
                    fontWeight: selectedFY === "ALL" ? 700 : 500,
                    color: selectedFY === "ALL" ? BRAND : "#374151",
                    background: selectedFY === "ALL" ? ACCENT_LIGHT : "transparent",
                    border: "none", cursor: "pointer",
                  }}
                  onClick={() => { setSelectedFY("ALL"); setFyDropOpen(false); }}
                >
                  ALL (no filter)
                </button>
                {fyOptions.map(opt => (
                  <button
                    key={opt}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "7px 14px", fontSize: 12,
                      fontWeight: selectedFY === opt ? 700 : 500,
                      color: selectedFY === opt ? BRAND : "#374151",
                      background: selectedFY === opt ? ACCENT_LIGHT : "transparent",
                      border: "none", cursor: "pointer",
                    }}
                    onClick={() => { setSelectedFY(opt); setFyDropOpen(false); }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ width: 1, height: 24, background: "rgba(46,100,120,.15)" }} />
          <span style={{
            background: ACCENT_LIGHT, color: BRAND, borderRadius: 6,
            padding: "4px 12px", fontSize: 12, fontWeight: 700,
          }}>
            INDIA + RBL
          </span>
          <span style={{
            background: "rgba(46,100,120,.1)", color: BRAND, borderRadius: 6,
            padding: "4px 12px", fontSize: 12, fontWeight: 700,
          }}>
            LAPA + Non-LAPA
          </span>
        </div>
      </div>

      {/* Sub-navigation */}
      <nav className="bl-subnav">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`bl-subnav-item${activeTab === tab.id ? " bl-subnav-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      {activeTab === "exec" && <ExecOverview fy={selectedFY} />}
      {activeTab === "dp" && <DPPerformance fy={selectedFY} />}
      {activeTab === "india" && <IndiaOps fy={selectedFY} />}
      {activeTab === "rbl" && <RBLOps fy={selectedFY} />}
      {activeTab === "trends" && <MonthlyTrends fy={selectedFY} />}
    </div>
  );
}
