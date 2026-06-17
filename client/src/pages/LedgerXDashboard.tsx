/**
 * LedgerX AP Dashboard — pixel-matched replica of the original finops-local APDashboard.jsx
 * CSS is embedded via a <style> tag (converted from APDashboard.module.css + Sidebar.module.css).
 * Data is wired to the existing tRPC endpoints (ledgerX.apDashboard / ledgerX.apRefresh).
 */

import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'wouter'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'

/* ── Embedded CSS (exact replica of APDashboard.module.css + Sidebar.module.css) ── */
const STYLES = `
/* ── Shell ── */
.lx-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #f5f6f8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* ── Sidebar ── */
.lx-sidebar {
  width: 220px;
  min-width: 220px;
  height: 100%;
  background: #1E4D6B;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  transition: width 0.2s ease, min-width 0.2s ease;
}
.lx-sidebar.lx-collapsed {
  width: 60px;
  min-width: 60px;
}
.lx-logo-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 14px 14px 14px 18px;
  min-height: 52px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}
.lx-collapsed .lx-logo-row {
  justify-content: center;
  padding: 14px 0;
}
.lx-logo-btns {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.lx-collapse-btn {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 7px;
  outline: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.lx-collapse-btn:hover {
  background: rgba(255,255,255,0.12);
  color: #fff;
}
.lx-nav {
  flex: 1;
  padding: 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lx-nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 10px;
  border-radius: 8px;
  border: none;
  outline: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: rgba(255,255,255,0.72);
  font-size: 0.9rem;
  font-weight: 500;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.lx-nav-item:hover {
  background: rgba(255,255,255,0.1);
  color: #fff;
}
.lx-nav-item.lx-active {
  background: rgba(255,255,255,0.18);
  color: #fff;
  font-weight: 600;
}
.lx-collapsed .lx-nav-item {
  justify-content: center;
  padding: 11px 0;
}
.lx-nav-icon {
  flex-shrink: 0;
  color: rgba(255,255,255,0.6);
  display: flex;
  align-items: center;
}
.lx-nav-item.lx-active .lx-nav-icon,
.lx-nav-item:hover .lx-nav-icon {
  color: #fff;
}
.lx-nav-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lx-sidebar-bottom {
  flex-shrink: 0;
  padding: 14px 16px;
  border-top: 1px solid rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.lx-fynd-logo-img {
  width: 110px;
  height: auto;
  opacity: 0.9;
  display: block;
}
.lx-fynd-logo-sm {
  width: 26px;
  height: 26px;
  opacity: 0.9;
  display: block;
  object-fit: cover;
  object-position: left center;
}
.lx-home-btn {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 7px;
  outline: none;
  background: rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255,255,255,0.75);
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.lx-home-btn:hover {
  background: rgba(255,255,255,0.2);
  color: #fff;
}

/* ── Page shell ── */
.lx-page {
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #c8d6e0 transparent;
  background: #f5f6f8;
  padding: 28px 24px 40px 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.lx-page::-webkit-scrollbar { width: 5px; }
.lx-page::-webkit-scrollbar-track { background: transparent; }
.lx-page::-webkit-scrollbar-thumb { background: #c8d6e0; border-radius: 3px; }

/* ── Header ── */
.lx-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}
.lx-title {
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: #1E4D6B;
  margin: 0;
}
.lx-subtitle {
  font-size: 0.8rem;
  color: #6b7280;
  margin: 4px 0 0;
}

/* ── Error banner ── */
.lx-error-banner {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-left: 3px solid #64748b;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 0.83rem;
  color: #475569;
}

/* ── KPI row ── */
.lx-kpi-row {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  overflow-y: visible;
  padding-bottom: 2px;
  flex-shrink: 0;
}
.lx-kpi-row::-webkit-scrollbar { height: 4px; }
.lx-kpi-row::-webkit-scrollbar-track { background: #e0e7ef; border-radius: 2px; }
.lx-kpi-row::-webkit-scrollbar-thumb { background: #a8c4d4; border-radius: 2px; }

/* ── KPI card ── */
.lx-kpi-card {
  flex: 0 0 158px;
  width: 158px;
  min-height: 96px;
  background: #ffffff;
  border: 1px solid #e0e7ef;
  border-radius: 10px;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lx-kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.lx-kpi-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #6b7280;
}
.lx-kpi-icon {
  color: #9ca3af;
  display: flex;
  align-items: center;
}
.lx-kpi-value {
  font-size: 1.45rem;
  font-weight: 800;
  color: #1E4D6B;
  line-height: 1.1;
  letter-spacing: -0.4px;
}
.lx-kpi-sub {
  font-size: 0.72rem;
  color: #9ca3af;
  margin-top: 4px;
}

/* ── Refresh button ── */
.lx-refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid #a8c4d4;
  border-radius: 8px;
  background: #ffffff;
  color: #1E4D6B;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  white-space: nowrap;
  align-self: center;
}
.lx-refresh-btn:hover:not(:disabled) {
  background: #e6eef3;
  border-color: #1E4D6B;
}
.lx-refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ── Skeleton shimmer ── */
@keyframes lx-shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position: 600px 0; }
}
@keyframes lx-spin {
  to { transform: rotate(360deg); }
}
.lx-skeleton {
  background: linear-gradient(90deg, #e0e7ef 25%, #edf1f5 50%, #e0e7ef 75%);
  background-size: 600px 100%;
  animation: lx-shimmer 1.4s infinite linear;
  border-radius: 8px;
  display: block;
}

/* ── Generic panel card ── */
.lx-panel {
  background: #ffffff;
  border: 1px solid #e0e7ef;
  border-radius: 10px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.lx-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lx-panel-title {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #374151;
}
.lx-panel-amt {
  font-size: 0.78rem;
  font-weight: 600;
  color: #1E4D6B;
}

/* ── Row 2: Aging + Alerts ── */
.lx-row2 {
  display: flex;
  gap: 16px;
  align-items: stretch;
}
.lx-aging-panel { flex: 1; min-width: 0; }
.lx-alerts-panel { flex: 1; min-width: 0; }
.lx-alert-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lx-alert-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e0e7ef;
}
.lx-alert-icon {
  color: #1E4D6B;
  flex-shrink: 0;
  margin-top: 1px;
  display: flex;
}
.lx-alert-body { flex: 1; min-width: 0; }
.lx-alert-headline {
  font-size: 0.84rem;
  font-weight: 700;
  color: #1E4D6B;
  line-height: 1.3;
}
.lx-alert-desc {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 3px;
  line-height: 1.4;
}
.lx-alert-count {
  font-size: 1.3rem;
  font-weight: 800;
  color: #1E4D6B;
  flex-shrink: 0;
  align-self: center;
}

/* ── Row 3: Top Vendors + Monthly Trend ── */
.lx-row3 {
  display: flex;
  gap: 16px;
  align-items: stretch;
}
.lx-vendors-panel { flex: 1.3; min-width: 0; }
.lx-monthly-panel { flex: 1; min-width: 0; }

/* ── Vendors table ── */
.lx-table {
  width: 100%;
  border-collapse: collapse;
}
.lx-table th {
  text-align: left;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #9ca3af;
  border-bottom: 1px solid #e0e7ef;
  padding: 7px 10px;
}
.lx-th-right { text-align: right; }
.lx-table td {
  font-size: 0.86rem;
  color: #374151;
  padding: 14px 10px;
  border-bottom: 1px solid #f0f4f9;
}
.lx-table tr:last-child td { border-bottom: none; }
.lx-table tr:hover td { background: #f8fafc; }
.lx-td-vendor { font-weight: 600; color: #1E4D6B; }
.lx-td-amt { font-weight: 700; color: #1E4D6B; text-align: right; }
.lx-td-cnt { color: #6b7280; text-align: right; }

/* ── MSME badge ── */
.lx-msme-badge {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}
.lx-msme-inactive { background: #f0f4f9; color: #6b7280; border: 1px solid #e0e7ef; }
.lx-msme-active   { background: #e6eef3; color: #1E4D6B; border: 1px solid #a8c4d4; }

/* ── Monthly bar chart ── */
.lx-bar-wrap { overflow-x: auto; }
.lx-bar-wrap::-webkit-scrollbar { height: 4px; }
.lx-bar-wrap::-webkit-scrollbar-track { background: #e0e7ef; border-radius: 2px; }
.lx-bar-wrap::-webkit-scrollbar-thumb { background: #a8c4d4; border-radius: 2px; }

/* ── Row 4: Status donuts ── */
.lx-row4 {
  display: flex;
  gap: 16px;
  align-items: stretch;
}
.lx-status-panel { flex: 1; min-width: 0; }

/* ── Split bar ── */
.lx-split-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.lx-split-bar {
  display: flex;
  height: 32px;
  border-radius: 8px;
  overflow: hidden;
  gap: 2px;
}
.lx-split-segment {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
  min-width: 0;
}
.lx-split-segment:hover { opacity: 0.85; }
.lx-split-pct {
  font-size: 0.7rem;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.lx-split-stats {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lx-split-stat-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lx-split-dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
}
.lx-split-label { flex: 1; font-size: 0.8rem; color: #374151; }
.lx-split-count { font-size: 1rem; font-weight: 800; color: #1E4D6B; min-width: 28px; text-align: right; }
.lx-split-percent { font-size: 0.72rem; color: #9ca3af; min-width: 36px; text-align: right; }

/* ── Empty state ── */
.lx-empty-msg {
  font-size: 0.82rem;
  color: #9ca3af;
  text-align: center;
  padding: 16px 0;
  margin: 0;
}

/* ── Aging horizontal bars ── */
.lx-aging-bars {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.lx-aging-bar-row {
  display: flex;
  align-items: center;
  gap: 9px;
}
.lx-aging-bar-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #374151;
  min-width: 54px;
  flex-shrink: 0;
  letter-spacing: 0.2px;
}
.lx-aging-bar-track {
  flex: 1;
  height: 28px;
  background: #edf2f7;
  border-radius: 7px;
  overflow: hidden;
}
.lx-aging-bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.6s cubic-bezier(0.4,0,0.2,1);
}
.lx-aging-bar-pct {
  font-size: 0.7rem;
  font-weight: 600;
  color: #9ca3af;
  min-width: 40px;
  text-align: right;
  flex-shrink: 0;
}
.lx-aging-bar-amt {
  font-size: 0.78rem;
  font-weight: 700;
  color: #1E4D6B;
  min-width: 66px;
  text-align: right;
  flex-shrink: 0;
}
.lx-aging-cnt-badge {
  font-size: 0.68rem;
  font-weight: 700;
  color: #ffffff;
  background: #a8c4d4;
  border-radius: 20px;
  padding: 1px 7px;
  min-width: 24px;
  text-align: center;
  flex-shrink: 0;
  line-height: 1.6;
}
.lx-aging-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid #e0e7ef;
  font-size: 0.72rem;
  color: #9ca3af;
  font-weight: 500;
}

/* ── Payment ring ── */
.lx-ring-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 4px 0;
}

/* ── Tally pills ── */
.lx-pills-wrap {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding: 4px 0;
}
.lx-pill {
  flex: 1;
  min-width: 80px;
  padding: 18px 12px 14px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.lx-pill-count {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -1px;
}
.lx-pill-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-align: center;
}
.lx-pill-pct { font-size: 0.68rem; margin-top: 2px; }

/* ── Approval arc gauge ── */
.lx-gauge-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

/* ── Responsive ── */
@media (max-width: 900px) {
  .lx-row2, .lx-row3, .lx-row4 { flex-direction: column; }
  .lx-kpi-row { flex-wrap: wrap; }
  .lx-kpi-card { min-width: 140px; }
}
`

/* ── Formatters ── */
function fmtINR(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (typeof n !== 'number') n = Number(n)
  if (isNaN(n)) return '—'
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString('en-IN')
}

function nowIST(): string {
  return new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Kolkata',
  }) + ' IST'
}

function cleanAging(raw: string): string {
  const str = raw.replace(/^\d+\./, '').trim()
  if (/0.*30/i.test(str)) return '0-30d'
  if (/31.*45/i.test(str)) return '31-45d'
  if (/45.*60/i.test(str) || /46.*60/i.test(str)) return '46-60d'
  if (/61.*90/i.test(str)) return '61-90d'
  if (/90.*180/i.test(str) || /91.*180/i.test(str)) return '91-180d'
  if (/181.*360/i.test(str)) return '181-360d'
  if (/360/i.test(str)) return '360d+'
  return str.replace(/\s*days?\s*/gi, 'd').replace(/\s+/g, '')
}

function agingSort(label: string): number {
  const m = label.match(/^(\d+)\./)
  return m ? parseInt(m[1], 10) : 999
}

/* ── Colors ── */
const AGING_COLORS = ['#7ba8bf', '#4d8caa', '#2e6f94', '#1E4D6B', '#153650', '#0f2d47']
const SPLIT_COLORS = ['#1E4D6B', '#4d8caa', '#a8c4d4', '#c5d9e8']

/* ── Types ── */
interface ChartItem { label: string; cnt: number; amt: number; classification?: string }
interface AgingBarItem { label: string; value: number; cnt: number; color: string }

/* ── Sub-components ── */

function Skel({ h = 120, w = '100%' }: { h?: number; w?: string }) {
  return <div className="lx-skeleton" style={{ height: h, width: w }} />
}

function MsmeBadge({ cls }: { cls?: string }) {
  const isMsme = cls && cls.toUpperCase().includes('MSME')
  return (
    <span className={`lx-msme-badge ${isMsme ? 'lx-msme-active' : 'lx-msme-inactive'}`}>
      {isMsme ? cls : 'Non-MSME'}
    </span>
  )
}

function KPICard({ label, value, sub, icon, accentIdx = 0 }: {
  label: string; value: string; sub?: string | null; icon: React.ReactNode; accentIdx?: number
}) {
  const accents = ['#1E4D6B', '#2e6f94', '#4d8caa', '#7ba8bf', '#a8c4d4', '#c5d9e8', '#0f2d47']
  return (
    <div className="lx-kpi-card" style={{ borderTop: `3px solid ${accents[accentIdx % accents.length]}` }}>
      <div className="lx-kpi-top">
        <span className="lx-kpi-label">{label}</span>
        <span className="lx-kpi-icon">{icon}</span>
      </div>
      <div className="lx-kpi-value">{value}</div>
      {sub && <div className="lx-kpi-sub">{sub}</div>}
    </div>
  )
}

function BarChart({ data }: { data: ChartItem[] }) {
  if (!data || data.length === 0) return <p className="lx-empty-msg">No data yet</p>

  const BAR_W = 72, GAP = 40, H = 200, LABEL_H = 32, TOP = 28, PAD_L = 16, PAD_R = 16
  const maxAmt = Math.max(...data.map(d => d.amt || 0), 1)
  const totalW = PAD_L + data.length * (BAR_W + GAP) - GAP + PAD_R
  const cx = (i: number) => PAD_L + i * (BAR_W + GAP) + BAR_W / 2
  const barTop = (amt: number) => TOP + H - Math.max(6, (amt / maxAmt) * H)
  const linePoints = data.map((d, i) => `${cx(i)},${barTop(d.amt || 0)}`).join(' ')

  return (
    <div className="lx-bar-wrap">
      <svg
        width={Math.max(totalW, 500)}
        height={TOP + H + LABEL_H}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {[0.25, 0.5, 0.75, 1].map(f => (
          <line key={f}
            x1={PAD_L} y1={TOP + H - f * H}
            x2={totalW - PAD_R} y2={TOP + H - f * H}
            stroke="#f0f4f9" strokeWidth={1}
          />
        ))}
        <line x1={PAD_L} y1={TOP + H} x2={totalW - PAD_R} y2={TOP + H}
          stroke="#e0e7ef" strokeWidth={1.5} />
        {data.map((d, i) => {
          const bh = Math.max(6, ((d.amt || 0) / maxAmt) * H)
          const x = PAD_L + i * (BAR_W + GAP)
          const y = TOP + H - bh
          return (
            <g key={i}>
              <rect x={x} y={y} width={BAR_W} height={bh} fill="#1E4D6B" rx={4} opacity={0.85} />
              <rect x={x} y={y} width={BAR_W} height={Math.min(bh, 6)} fill="#2e6f94" rx={4} />
              <text x={cx(i)} y={y - 8} textAnchor="middle" fontSize="10.5" fill="#1E4D6B" fontWeight="700">
                {fmtINR(d.amt)}
              </text>
              <text x={cx(i)} y={TOP + H + 20} textAnchor="middle" fontSize="11" fill="#6b7280">
                {d.label}
              </text>
            </g>
          )
        })}
        {data.length > 1 && (
          <polyline points={linePoints} fill="none" stroke="#4d8caa"
            strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {data.map((d, i) => (
          <circle key={i} cx={cx(i)} cy={barTop(d.amt || 0)}
            r={4} fill="#ffffff" stroke="#1E4D6B" strokeWidth={2.5} />
        ))}
      </svg>
    </div>
  )
}

function AgingHBars({ data }: { data: AgingBarItem[] }) {
  if (!data || data.length === 0) return <p className="lx-empty-msg">No outstanding invoices</p>
  const totalAmt = data.reduce((sum, d) => sum + (d.value || 0), 0)
  const totalCnt = data.reduce((sum, d) => sum + (d.cnt || 0), 0)
  const maxAmt = Math.max(...data.map(d => d.value || 0), 1)
  return (
    <div className="lx-aging-bars">
      {data.map((d, i) => {
        const pct = totalAmt > 0 ? (d.value / totalAmt) * 100 : 0
        const barW = Math.max(1.5, (d.value / maxAmt) * 100)
        const color = AGING_COLORS[Math.min(i, AGING_COLORS.length - 1)]
        return (
          <div key={i} className="lx-aging-bar-row">
            <span className="lx-aging-bar-label">{d.label}</span>
            <div className="lx-aging-bar-track">
              <div className="lx-aging-bar-fill" style={{ width: `${barW}%`, background: color }} />
            </div>
            <span className="lx-aging-bar-pct">{pct.toFixed(1)}%</span>
            <span className="lx-aging-bar-amt">{fmtINR(d.value)}</span>
            <span className="lx-aging-cnt-badge">{d.cnt}</span>
          </div>
        )
      })}
      <div className="lx-aging-footer">
        <span>{totalCnt} invoice{totalCnt !== 1 ? 's' : ''}</span>
        <span>{fmtINR(totalAmt)} total outstanding</span>
      </div>
    </div>
  )
}

function PaymentRing({ data }: { data: ChartItem[] }) {
  const total = data.reduce((acc, d) => acc + (d.cnt || 0), 0)
  if (total === 0) return <p className="lx-empty-msg">No data</p>

  const SIZE = 160, THICK = 36
  const r = (SIZE - THICK) / 2
  const cxv = SIZE / 2, cyv = SIZE / 2
  const circ = 2 * Math.PI * r

  const colored = data.map((d, i) => ({ ...d, color: SPLIT_COLORS[i % SPLIT_COLORS.length] }))
  let offset = 0
  const slices = colored.filter(d => d.cnt > 0).map(d => {
    const dash = (d.cnt / total) * circ
    const rot = (offset / total) * 360 - 90
    offset += d.cnt
    return { ...d, dash, gap: circ - dash, rot }
  })

  const dominant = colored.reduce((best: (typeof colored[0]) | null, d) =>
    d.cnt > (best?.cnt ?? -1) ? d : best, null)
  const totalAmt = data.reduce((acc, d) => acc + (d.amt || 0), 0)

  return (
    <div className="lx-ring-wrap">
      <svg width={SIZE} height={SIZE}>
        <circle cx={cxv} cy={cyv} r={r} fill="none" stroke="#f0f4f9" strokeWidth={THICK} />
        {slices.map((sl, i) => (
          <circle key={i} cx={cxv} cy={cyv} r={r} fill="none"
            stroke={sl.color} strokeWidth={THICK}
            strokeDasharray={`${sl.dash} ${sl.gap}`}
            transform={`rotate(${sl.rot} ${cxv} ${cyv})`}
          />
        ))}
        <text x={cxv} y={cyv - 8} textAnchor="middle"
          fontSize="26" fontWeight="800" fill="#1E4D6B">{total}</text>
        <text x={cxv} y={cyv + 8} textAnchor="middle"
          fontSize="9.5" fill="#6b7280">total invoices</text>
        {dominant && (
          <text x={cxv} y={cyv + 22} textAnchor="middle"
            fontSize="9" fontWeight="700" fill={dominant.color}>{dominant.label}</text>
        )}
      </svg>

      <div className="lx-split-bar" style={{ width: '100%', height: 10, borderRadius: 6 }}>
        {colored.filter(d => d.cnt > 0).map(d => (
          <div key={d.label} className="lx-split-segment"
            style={{ flex: d.cnt, background: d.color, minWidth: 4 }} />
        ))}
      </div>

      <div className="lx-split-stats" style={{ width: '100%' }}>
        {colored.map(d => {
          const pct = total > 0 ? ((d.cnt / total) * 100).toFixed(1) : '0.0'
          return (
            <div key={d.label} className="lx-split-stat-row">
              <span className="lx-split-dot" style={{ background: d.color }} />
              <span className="lx-split-label">{d.label}</span>
              <span className="lx-split-count">{d.cnt}</span>
              <span className="lx-split-percent">{pct}%</span>
              {d.amt > 0 && <span style={{ fontSize: '0.7rem', color: '#6b7280', minWidth: 58, textAlign: 'right' }}>{fmtINR(d.amt)}</span>}
            </div>
          )
        })}
        <div className="lx-split-stat-row" style={{ borderTop: '1px solid #f0f4f9', paddingTop: 6, marginTop: 2 }}>
          <span className="lx-split-dot" style={{ background: 'transparent', border: '1.5px solid #d1d5db' }} />
          <span className="lx-split-label" style={{ fontWeight: 700, color: '#374151' }}>Total</span>
          <span className="lx-split-count">{total}</span>
          <span className="lx-split-percent">100%</span>
          {totalAmt > 0 && <span style={{ fontSize: '0.7rem', color: '#1E4D6B', fontWeight: 700, minWidth: 58, textAlign: 'right' }}>{fmtINR(totalAmt)}</span>}
        </div>
      </div>
    </div>
  )
}

function TallyPills({ data, rcmPending }: { data: ChartItem[]; rcmPending: number }) {
  const total = data.reduce((acc, d) => acc + (d.cnt || 0), 0)
  if (total === 0) return <p className="lx-empty-msg">No data</p>
  const COLORS    = ['#1E4D6B', '#e0e7ef', '#4d8caa', '#c5d9e8']
  const TEXT_MAIN = ['#ffffff', '#374151', '#ffffff', '#1E4D6B']
  const TEXT_SUB  = ['rgba(255,255,255,0.65)', '#9ca3af', 'rgba(255,255,255,0.65)', '#6b7280']
  return (
    <div className="lx-split-wrap">
      <div className="lx-pills-wrap">
        {data.map((d, i) => {
          const pct = total > 0 ? Math.round((d.cnt / total) * 100) : 0
          const bg = COLORS[i % COLORS.length]
          const tc = TEXT_MAIN[i % TEXT_MAIN.length]
          const sc = TEXT_SUB[i % TEXT_SUB.length]
          return (
            <div key={d.label} className="lx-pill" style={{ background: bg }}>
              <span className="lx-pill-count" style={{ color: tc }}>{d.cnt}</span>
              <span className="lx-pill-label" style={{ color: tc }}>{d.label}</span>
              <span className="lx-pill-pct" style={{ color: sc }}>{pct}%</span>
            </div>
          )
        })}
      </div>

      <div className="lx-split-bar">
        {data.map((d, i) => {
          const pct = total > 0 ? (d.cnt / total) * 100 : 0
          return (
            <div key={d.label} className="lx-split-segment"
              style={{ flex: pct, background: COLORS[i % COLORS.length], minWidth: pct > 0 ? 8 : 0 }}>
              {pct > 12 && (
                <span className="lx-split-pct" style={{ color: i === 0 ? '#fff' : '#374151' }}>
                  {Math.round(pct)}%
                </span>
              )}
            </div>
          )
        })}
      </div>

      <div className="lx-split-stats">
        {data.map((d, i) => {
          const pct = total > 0 ? ((d.cnt / total) * 100).toFixed(1) : '0.0'
          return (
            <div key={d.label} className="lx-split-stat-row">
              <span className="lx-split-dot" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="lx-split-label">{d.label}</span>
              <span className="lx-split-count">{d.cnt}</span>
              <span className="lx-split-percent">{pct}%</span>
            </div>
          )
        })}
        <div className="lx-split-stat-row" style={{ borderTop: '1px solid #f0f4f9', paddingTop: 6, marginTop: 2 }}>
          <span className="lx-split-dot" style={{ background: 'transparent', border: '1.5px solid #d1d5db' }} />
          <span className="lx-split-label" style={{ fontWeight: 700, color: '#374151' }}>Total entries</span>
          <span className="lx-split-count">{total}</span>
          <span className="lx-split-percent">100%</span>
        </div>
      </div>

      {rcmPending > 0 && (
        <div style={{ fontSize: '0.74rem', color: '#6b7280', paddingTop: 6, borderTop: '1px solid #f0f4f9' }}>
          ⚠ <strong>{rcmPending}</strong> RCM entr{rcmPending === 1 ? 'y' : 'ies'} pending Tally booking
        </div>
      )}
    </div>
  )
}

function ApprovalGauge({ data }: { data: ChartItem[] }) {
  const total = data.reduce((acc, d) => acc + (d.cnt || 0), 0)
  if (total === 0) return <p className="lx-empty-msg">No data</p>

  const pending = data.find(d => /pend/i.test(d.label)) || data[0]
  const pendingCnt = pending?.cnt || 0
  const pct = total > 0 ? pendingCnt / total : 0

  const SIZE = 160, CX = 80, CY = 86, R = 58, SW = 14
  const START = 150, SPAN = 240

  function pt(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180
    return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) }
  }
  function arc(startDeg: number, spanDeg: number): string {
    if (spanDeg <= 0) return ''
    if (spanDeg >= 360) spanDeg = 359.99
    const s2 = pt(startDeg), e2 = pt(startDeg + spanDeg)
    return `M ${s2.x} ${s2.y} A ${R} ${R} 0 ${spanDeg > 180 ? 1 : 0} 1 ${e2.x} ${e2.y}`
  }

  const trackPath = arc(START, SPAN)
  const fillSpan = pct * SPAN
  const fillPath = fillSpan > 1 ? arc(START, fillSpan) : null

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const deg = START + f * SPAN
    const inner = {
      x: CX + (R - SW / 2 - 2) * Math.cos(((deg - 90) * Math.PI) / 180),
      y: CY + (R - SW / 2 - 2) * Math.sin(((deg - 90) * Math.PI) / 180)
    }
    const outer = {
      x: CX + (R + SW / 2 + 2) * Math.cos(((deg - 90) * Math.PI) / 180),
      y: CY + (R + SW / 2 + 2) * Math.sin(((deg - 90) * Math.PI) / 180)
    }
    return { inner, outer }
  })

  const notApproved = data.find(d => /not.approv/i.test(d.label))

  return (
    <div className="lx-gauge-wrap">
      <svg width={SIZE} height={SIZE - 10} style={{ overflow: 'visible' }}>
        <path d={trackPath} fill="none" stroke="#e0e7ef" strokeWidth={SW} strokeLinecap="round" />
        {fillPath && (
          <path d={fillPath} fill="none" stroke="#1E4D6B" strokeWidth={SW} strokeLinecap="round" />
        )}
        {ticks.map((t, i) => (
          <line key={i}
            x1={t.inner.x} y1={t.inner.y}
            x2={t.outer.x} y2={t.outer.y}
            stroke="#fff" strokeWidth={1.5}
          />
        ))}
        <text x={CX} y={CY - 10} textAnchor="middle"
          fontSize="28" fontWeight="800" fill="#1E4D6B">{pendingCnt}</text>
        <text x={CX} y={CY + 8} textAnchor="middle"
          fontSize="9.5" fill="#6b7280">pending</text>
        <text x={CX} y={CY + 22} textAnchor="middle"
          fontSize="9" fill="#9ca3af">{Math.round(pct * 100)}% of {total}</text>
      </svg>

      <div className="lx-split-bar" style={{ width: '100%', height: 10, borderRadius: 6 }}>
        {data.filter(d => d.cnt > 0).map((d, i) => (
          <div key={d.label} className="lx-split-segment"
            style={{ flex: d.cnt, background: SPLIT_COLORS[i % SPLIT_COLORS.length], minWidth: 4 }} />
        ))}
      </div>

      <div className="lx-split-stats" style={{ width: '100%' }}>
        {data.map((d, i) => {
          const dpct = total > 0 ? ((d.cnt / total) * 100).toFixed(1) : '0.0'
          return (
            <div key={d.label} className="lx-split-stat-row">
              <span className="lx-split-dot" style={{ background: SPLIT_COLORS[i % SPLIT_COLORS.length] }} />
              <span className="lx-split-label">{d.label}</span>
              <span className="lx-split-count">{d.cnt}</span>
              <span className="lx-split-percent">{dpct}%</span>
            </div>
          )
        })}
        <div className="lx-split-stat-row" style={{ borderTop: '1px solid #f0f4f9', paddingTop: 6, marginTop: 2 }}>
          <span className="lx-split-dot" style={{ background: 'transparent', border: '1.5px solid #d1d5db' }} />
          <span className="lx-split-label" style={{ fontWeight: 700, color: '#374151' }}>Total</span>
          <span className="lx-split-count">{total}</span>
          <span className="lx-split-percent">100%</span>
        </div>
      </div>

      {notApproved && notApproved.cnt > 0 && (
        <div style={{ fontSize: '0.74rem', color: '#6b7280', paddingTop: 6, borderTop: '1px solid #f0f4f9', width: '100%' }}>
          ⚠ <strong>{notApproved.cnt}</strong> invoice{notApproved.cnt !== 1 ? 's' : ''} awaiting approval
        </div>
      )}
    </div>
  )
}

/* ── Icons ── */
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      style={spinning ? { animation: 'lx-spin 0.7s linear infinite' } : {}}>
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  )
}
function BagIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
}
function WarnIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
}
function CalIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
}
function ClockIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
}
function MsmeIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
}
function PaidIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
}
function ApprovalIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
}
function AlarmIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6"/><path d="M22 6l-3-3"/></svg>
}
function RcmIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
}
function DashboardIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
function BookInvoiceIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/><line x1="9" y1="9" x2="11" y2="9"/></svg>
}
function DPInvoiceIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
}
function RegisterIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
}
function TallyEntryIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><polyline points="9 17 11 19 15 15"/></svg>
}
function AgingIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
}
function ChevronLeftIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
}
function ChevronRightIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
}
function HomeSmallIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}

/* ── Nav config ── */
const NAV = [
  { id: 'dashboard',          label: 'AP Dashboard',       icon: <DashboardIcon /> },
  { id: 'invoice-booking',    label: 'Invoice Booking',    icon: <BookInvoiceIcon /> },
  { id: 'dp-invoice-booking', label: 'DP Invoice Booking', icon: <DPInvoiceIcon /> },
  { id: 'invoice-register',   label: 'Invoice Register',   icon: <RegisterIcon /> },
  { id: 'tally-entry',        label: 'Tally Entry',        icon: <TallyEntryIcon /> },
  { id: 'aging-analysis',     label: 'Aging Analysis',     icon: <AgingIcon /> },
]

/* ── Main component ── */
export default function LedgerXDashboard() {
  const [, navigate] = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [ts, setTs] = useState('')

  const { data, isLoading, refetch } = trpc.ledgerX.apDashboard.useQuery(undefined, {
    staleTime: 55_000,
    refetchOnWindowFocus: false,
  })

  const refreshMutation = trpc.ledgerX.apRefresh.useMutation({
    onSuccess: () => { refetch() },
  })

  // Set timestamp when data arrives
  useEffect(() => {
    if (data?.ok) setTs(nowIST())
  }, [data])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => { refetch() }, 30000)
    return () => clearInterval(id)
  }, [refetch])

  const handleRefresh = useCallback(() => {
    refreshMutation.mutate()
  }, [refreshMutation])

  const handleNav = useCallback((id: string) => {
    if (id === 'home') { navigate('/ledgerx'); return }
    if (id === 'dashboard') { navigate('/ledgerx/dashboard'); return }
    if (id === 'invoice-booking') { navigate('/ledgerx/invoice-booking'); return }
    if (id === 'dp-invoice-booking') { navigate('/ledgerx/dp-invoice-booking'); return }
    if (id === 'invoice-register') { navigate('/ledgerx/invoice-register'); return }
    if (id === 'tally-entry') { navigate('/ledgerx/tally-entry'); return }
    if (id === 'aging-analysis') { navigate('/ledgerx/aging-analysis'); return }
    toast.info('Feature coming soon')
  }, [navigate])

  const kpis = data?.kpis ?? null
  const charts = data?.charts ?? null
  const loading = isLoading
  const error = data?.error ?? null

  const agingData = charts
    ? [...(charts.aging || [])].sort((a, b) => agingSort(a.label) - agingSort(b.label))
    : []

  const agingBarData: AgingBarItem[] = agingData.map((d, i) => ({
    label: cleanAging(d.label),
    value: d.amt,
    cnt: d.cnt,
    color: AGING_COLORS[i % AGING_COLORS.length],
  }))

  const refreshing = refreshMutation.isPending

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="lx-shell">

        {/* ── Sidebar ── */}
        <aside className={`lx-sidebar${collapsed ? ' lx-collapsed' : ''}`}>
          <div className="lx-logo-row">
            <div className="lx-logo-btns">
              <button
                className="lx-collapse-btn"
                onClick={() => setCollapsed(c => !c)}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
              </button>
            </div>
          </div>

          <nav className="lx-nav">
            {NAV.map(item => (
              <button
                key={item.id}
                className={`lx-nav-item${item.id === 'dashboard' ? ' lx-active' : ''}`}
                onClick={() => handleNav(item.id)}
                title={collapsed ? item.label : undefined}
              >
                <span className="lx-nav-icon">{item.icon}</span>
                {!collapsed && <span className="lx-nav-label">{item.label}</span>}
              </button>
            ))}
          </nav>

          <div className="lx-sidebar-bottom">
            {!collapsed ? (
              <img src="/fynd-logo-white.png" alt="Fynd" className="lx-fynd-logo-img" />
            ) : (
              <img src="/fynd-logo-white.png" alt="Fynd" className="lx-fynd-logo-sm" />
            )}
            <button
              className="lx-home-btn"
              onClick={() => handleNav('home')}
              title="Home"
            >
              <HomeSmallIcon />
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="lx-page">

          {/* Header */}
          <div className="lx-header">
            <div>
              <h1 className="lx-title">AP Command Center</h1>
              <p className="lx-subtitle">Real-time accounts payable · {ts || '—'}</p>
            </div>
            <button
              className="lx-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh data from Google Sheets"
            >
              <RefreshIcon spinning={refreshing} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className="lx-error-banner">Could not load data: {error}</div>
          )}

          {/* KPI row */}
          {loading ? (
            <div className="lx-kpi-row">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="lx-kpi-card" style={{ borderTop: '3px solid #e0e7ef' }}>
                  <Skel h={14} w="60%" />
                  <Skel h={28} w="80%" />
                  <Skel h={12} w="50%" />
                </div>
              ))}
            </div>
          ) : (
            <div className="lx-kpi-row">
              <KPICard accentIdx={0} label="Total Outstanding" icon={<BagIcon />}
                value={fmtINR(kpis?.total_outstanding_amt)}
                sub={`${fmtNum(kpis?.total_outstanding_count)} invoices`} />
              <KPICard accentIdx={1} label="Overdue" icon={<WarnIcon />}
                value={fmtINR(kpis?.overdue_amt)}
                sub={`${fmtNum(kpis?.overdue_count)} overdue`} />
              <KPICard accentIdx={2} label="Not Due" icon={<CalIcon />}
                value={kpis?.not_due_amt ? fmtINR(kpis.not_due_amt) : '—'}
                sub={kpis?.not_due_count ? `${fmtNum(kpis.not_due_count)} invoices` : null} />
              <KPICard accentIdx={3} label="Due Next 7 Days" icon={<ClockIcon />}
                value={kpis?.due_next_7d_amt ? fmtINR(kpis.due_next_7d_amt) : '—'}
                sub={kpis?.due_next_7d_count ? `${fmtNum(kpis.due_next_7d_count)} invoices` : null} />
              <KPICard accentIdx={4} label="MSME Due 45D+" icon={<MsmeIcon />}
                value={kpis?.msme_45d_amt ? fmtINR(kpis.msme_45d_amt) : '—'}
                sub={kpis?.msme_45d_count ? `${fmtNum(kpis.msme_45d_count)} invoices` : null} />
              <KPICard accentIdx={5} label="Paid Today" icon={<PaidIcon />}
                value={kpis?.paid_today_amt ? fmtINR(kpis.paid_today_amt) : '—'}
                sub={kpis?.paid_today_count ? `${fmtNum(kpis.paid_today_count)} invoices` : null} />
              <KPICard accentIdx={6} label="Pending Approval" icon={<ApprovalIcon />}
                value={kpis?.pending_approval_amt ? fmtINR(kpis.pending_approval_amt) : '—'}
                sub={kpis?.pending_approval_count ? `${fmtNum(kpis.pending_approval_count)} invoices` : null} />
            </div>
          )}

          {/* Row 2: Aging + Alerts */}
          <div className="lx-row2">
            <div className="lx-panel lx-aging-panel">
              <div className="lx-panel-head">
                <span className="lx-panel-title">Aging Distribution</span>
                {kpis && <span className="lx-panel-amt">{fmtINR(kpis.total_outstanding_amt)}</span>}
              </div>
              {loading ? <Skel h={200} /> : <AgingHBars data={agingBarData} />}
            </div>

            <div className="lx-panel lx-alerts-panel">
              <div className="lx-panel-title">Compliance Alerts</div>
              {loading ? <Skel h={120} /> : (
                <div className="lx-alert-list">
                  <div className="lx-alert-item" style={{ borderLeft: '3px solid #1E4D6B' }}>
                    <span className="lx-alert-icon"><AlarmIcon /></span>
                    <div className="lx-alert-body">
                      <div className="lx-alert-headline">
                        {fmtNum(kpis?.approvals_pending_gt7d ?? 0)} Approval(s) Pending &gt;7 Days
                      </div>
                      <div className="lx-alert-desc">Approval overdue for {fmtNum(kpis?.approvals_pending_gt7d ?? 0)} invoices.</div>
                    </div>
                    <span className="lx-alert-count">{fmtNum(kpis?.approvals_pending_gt7d ?? 0)}</span>
                  </div>
                  <div className="lx-alert-item" style={{ borderLeft: '3px solid #4d8caa' }}>
                    <span className="lx-alert-icon"><RcmIcon /></span>
                    <div className="lx-alert-body">
                      <div className="lx-alert-headline">
                        {fmtNum(kpis?.rcm_pending_count ?? 0)} RCM Invoice(s) Pending
                      </div>
                      <div className="lx-alert-desc">Reverse Charge Mechanism applicable. Ensure RCM entries are booked before GSTR filing.</div>
                    </div>
                    <span className="lx-alert-count">{fmtNum(kpis?.rcm_pending_count ?? 0)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 3: Top Vendors + Monthly Trend */}
          <div className="lx-row3">
            <div className="lx-panel lx-vendors-panel">
              <div className="lx-panel-head">
                <span className="lx-panel-title">Top Vendors</span>
              </div>
              {loading ? <Skel h={160} /> : (
                <table className="lx-table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>MSME</th>
                      <th className="lx-th-right">Outstanding</th>
                      <th className="lx-th-right">#</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(charts?.top_vendors || []).length === 0 ? (
                      <tr><td colSpan={4} className="lx-empty-msg">No data</td></tr>
                    ) : (charts?.top_vendors || []).map(v => (
                      <tr key={v.label}>
                        <td className="lx-td-vendor">{v.label}</td>
                        <td><MsmeBadge cls={v.classification} /></td>
                        <td className="lx-td-amt">{fmtINR(v.amt)}</td>
                        <td className="lx-td-cnt">{fmtNum(v.cnt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="lx-panel lx-monthly-panel">
              <div className="lx-panel-title">Monthly Trend</div>
              {loading ? <Skel h={180} /> : <BarChart data={charts?.monthly || []} />}
            </div>
          </div>

          {/* Row 4: Status charts */}
          <div className="lx-row4">
            <div className="lx-panel lx-status-panel">
              <div className="lx-panel-title">Payment Status</div>
              {loading ? <Skel h={180} /> : (
                <PaymentRing data={charts?.payment_status || []} />
              )}
            </div>

            <div className="lx-panel lx-status-panel">
              <div className="lx-panel-title">Tally Status</div>
              {loading ? <Skel h={180} /> : (
                <TallyPills data={charts?.tally_status || []} rcmPending={kpis?.rcm_pending_count ?? 0} />
              )}
            </div>

            <div className="lx-panel lx-status-panel">
              <div className="lx-panel-title">Approval Status</div>
              {loading ? <Skel h={180} /> : (
                <ApprovalGauge data={charts?.approval_status || []} />
              )}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
