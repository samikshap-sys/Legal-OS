/**
 * AgingAnalysis.tsx
 * Exact replica of AgingAnalysis.jsx from finops-local.
 * CSS embedded via <style> tag. tRPC calls: agingAnalysis, agingRefresh.
 */
import { useState, useCallback, useMemo } from 'react'
import { useLocation } from 'wouter'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'

// ── Nav items ─────────────────────────────────────────────────────────────
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
const AA_NAV = [
  { id: 'dashboard',          label: 'AP Dashboard',       icon: <DashboardIcon /> },
  { id: 'invoice-booking',    label: 'Invoice Booking',    icon: <BookInvoiceIcon /> },
  { id: 'dp-invoice-booking', label: 'DP Invoice Booking', icon: <DPInvoiceIcon /> },
  { id: 'invoice-register',   label: 'Invoice Register',   icon: <RegisterIcon /> },
  { id: 'tally-entry',        label: 'Tally Entry',        icon: <TallyEntryIcon /> },
  { id: 'aging-analysis',     label: 'Aging Analysis',     icon: <AgingIcon /> },
]

function ChevronLeftIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
}
function ChevronRightIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
}
function HomeSmallIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}

function fmt(n: number): string {
  if (n === 0) return '—'
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

const BUCKET_COLORS: Record<string, string> = {
  '0': '#6b7280',
  '1-30': '#10b981',
  '31-60': '#f59e0b',
  '61-90': '#f97316',
  '91-180': '#ef4444',
  '180+': '#7c3aed',
}

export default function AgingAnalysis() {
  const [, navigate] = useLocation()
  const [collapsed, setCollapsed] = useState(false)

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

  // ── Data ──────────────────────────────────────────────────────────────
  const { data: rawData, isLoading: loading, refetch } = trpc.ledgerX.agingAnalysis.useQuery(undefined, {
    refetchInterval: 60000,
  })
  const refreshMutation = trpc.ledgerX.agingRefresh.useMutation({
    onSuccess: () => refetch(),
  })

  const vendors: any[] = (rawData as any)?.vendors || []
  const buckets: string[] = (rawData as any)?.buckets || ['0', '1-30', '31-60', '61-90', '91-180', '180+']
  const totalsByBucket: Record<string, number> = (rawData as any)?.totalsByBucket || {}
  const msmeCount: number = (rawData as any)?.msmeCount || 0
  const nonMsmeCount: number = (rawData as any)?.nonMsmeCount || 0
  const totalOutstanding: number = (rawData as any)?.totalOutstanding || 0

  // ── State ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [msmeFilter, setMsmeFilter] = useState<'all' | 'msme' | 'non-msme'>('all')
  const [sortBucket, setSortBucket] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Filtering + Sorting ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = vendors
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((v: any) => v.vendorName.toLowerCase().includes(q))
    }
    if (msmeFilter === 'msme') list = list.filter((v: any) => v.isMsme)
    if (msmeFilter === 'non-msme') list = list.filter((v: any) => !v.isMsme)
    if (sortBucket) {
      list = [...list].sort((a: any, b: any) => {
        const av = sortBucket === 'total' ? a.total : (a.buckets[sortBucket] || 0)
        const bv = sortBucket === 'total' ? b.total : (b.buckets[sortBucket] || 0)
        return sortDir === 'desc' ? bv - av : av - bv
      })
    }
    return list
  }, [vendors, search, msmeFilter, sortBucket, sortDir])

  const handleSort = (bucket: string) => {
    if (sortBucket === bucket) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBucket(bucket); setSortDir('desc') }
  }

  // ── Download CSV ──────────────────────────────────────────────────────
  const downloadCsv = () => {
    const headers = ['Vendor Name', 'MSME', ...buckets, 'Total Outstanding']
    const rows = vendors.map((v: any) => [
      v.vendorName,
      v.isMsme ? 'Yes' : 'No',
      ...buckets.map(b => v.buckets[b] || 0),
      v.total,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'aging-analysis.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <style>{AA_CSS}</style>
      <style dangerouslySetInnerHTML={{ __html: AA_SHELL_CSS }} />
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
            {AA_NAV.map(item => (
              <button
                key={item.id}
                className={`lx-nav-item${item.id === 'aging-analysis' ? ' lx-active' : ''}`}
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
            <button className="lx-home-btn" onClick={() => handleNav('home')} title="Home">
              <HomeSmallIcon />
            </button>
          </div>
        </aside>

        {/* ── Main ── */}
        <div className="aa-page">
          <div className="aa-header">
            <div>
              <h1 className="aa-title">Aging Analysis</h1>
              <p className="aa-subtitle">Outstanding payables by aging bucket</p>
            </div>
            <div className="aa-header-actions">
              <button className="aa-btn aa-btn-outline" onClick={downloadCsv}>⬇ CSV</button>
              <button
                className="aa-btn aa-btn-outline"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
              >
                {refreshMutation.isPending ? '…' : '↺ Refresh'}
              </button>
            </div>
          </div>

          {/* ── KPI Row ── */}
          <div className="aa-kpi-row">
            <div className="aa-kpi-card">
              <div className="aa-kpi-value">{fmt(totalOutstanding)}</div>
              <div className="aa-kpi-label">Total Outstanding</div>
            </div>
            <div className="aa-kpi-card aa-kpi-blue">
              <div className="aa-kpi-value">{vendors.length}</div>
              <div className="aa-kpi-label">Total Vendors</div>
            </div>
            <div className="aa-kpi-card aa-kpi-green">
              <div className="aa-kpi-value">{msmeCount}</div>
              <div className="aa-kpi-label">MSME Vendors</div>
            </div>
            <div className="aa-kpi-card aa-kpi-gray">
              <div className="aa-kpi-value">{nonMsmeCount}</div>
              <div className="aa-kpi-label">Non-MSME</div>
            </div>
          </div>

          {/* ── Bucket Summary Bar ── */}
          <div className="aa-bucket-bar">
            {buckets.map(b => (
              <div key={b} className="aa-bucket-item">
                <div className="aa-bucket-dot" style={{ background: BUCKET_COLORS[b] || '#6b7280' }} />
                <div>
                  <div className="aa-bucket-label">{b} days</div>
                  <div className="aa-bucket-amount">{fmt(totalsByBucket[b] || 0)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Toolbar ── */}
          <div className="aa-toolbar">
            <input
              className="aa-search"
              placeholder="Search vendors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="aa-filter-group">
              {(['all', 'msme', 'non-msme'] as const).map(f => (
                <button
                  key={f}
                  className={`aa-filter-btn${msmeFilter === f ? ' aa-filter-active' : ''}`}
                  onClick={() => setMsmeFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'msme' ? 'MSME' : 'Non-MSME'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Table ── */}
          <div className="aa-table-wrap">
            {loading ? (
              <div className="aa-loading">Loading aging data…</div>
            ) : (rawData as any)?.error ? (
              <div className="aa-error">Error: {(rawData as any).error}</div>
            ) : (
              <table className="aa-table">
                <thead>
                  <tr>
                    <th className="aa-th aa-th-vendor">Vendor Name</th>
                    <th className="aa-th aa-th-msme">MSME</th>
                    {buckets.map(b => (
                      <th
                        key={b}
                        className={`aa-th aa-th-bucket${sortBucket === b ? ' aa-th-sorted' : ''}`}
                        onClick={() => handleSort(b)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span style={{ color: BUCKET_COLORS[b] || '#6b7280' }}>{b} days</span>
                        {sortBucket === b && <span className="aa-sort-arrow">{sortDir === 'desc' ? ' ↓' : ' ↑'}</span>}
                      </th>
                    ))}
                    <th
                      className={`aa-th aa-th-total${sortBucket === 'total' ? ' aa-th-sorted' : ''}`}
                      onClick={() => handleSort('total')}
                      style={{ cursor: 'pointer' }}
                    >
                      Total {sortBucket === 'total' && <span className="aa-sort-arrow">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Totals row */}
                  <tr className="aa-tr-totals">
                    <td className="aa-td aa-td-vendor"><strong>Grand Total</strong></td>
                    <td className="aa-td" />
                    {buckets.map(b => (
                      <td key={b} className="aa-td aa-td-amount">
                        <strong>{fmt(totalsByBucket[b] || 0)}</strong>
                      </td>
                    ))}
                    <td className="aa-td aa-td-amount">
                      <strong>{fmt(totalOutstanding)}</strong>
                    </td>
                  </tr>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={buckets.length + 3} className="aa-empty">No vendors found</td></tr>
                  ) : (
                    filtered.map((v: any, i: number) => (
                      <tr key={i} className="aa-tr">
                        <td className="aa-td aa-td-vendor">
                          {v.vendorName}
                        </td>
                        <td className="aa-td">
                          {v.isMsme ? (
                            <span className="aa-msme-badge">MSME</span>
                          ) : (
                            <span className="aa-non-msme-badge">—</span>
                          )}
                        </td>
                        {buckets.map(b => (
                          <td key={b} className="aa-td aa-td-amount">
                            {v.buckets[b] ? (
                              <span
                                className="aa-amount-cell"
                                style={{
                                  background: `${BUCKET_COLORS[b] || '#6b7280'}18`,
                                  color: BUCKET_COLORS[b] || '#6b7280',
                                }}
                              >
                                {fmt(v.buckets[b])}
                              </span>
                            ) : '—'}
                          </td>
                        ))}
                        <td className="aa-td aa-td-amount aa-td-total">
                          <strong>{fmt(v.total)}</strong>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

const AA_CSS = `
.aa-page {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #f5f6f8;
  overflow: hidden;
}
.aa-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px 12px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.aa-title {
  font-size: 22px;
  font-weight: 700;
  color: #1a2035;
  margin: 0;
}
.aa-subtitle {
  font-size: 13px;
  color: #6b7280;
  margin: 2px 0 0;
}
.aa-header-actions { display: flex; gap: 10px; align-items: center; }
.aa-btn {
  padding: 7px 16px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}
.aa-btn-outline {
  background: #fff;
  border: 1px solid #d1d5db;
  color: #374151;
}
.aa-btn-outline:hover { background: #f3f4f6; }
.aa-kpi-row {
  display: flex;
  gap: 16px;
  padding: 16px 28px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.aa-kpi-card {
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px 20px;
  min-width: 130px;
  text-align: center;
}
.aa-kpi-blue { border-color: #bfdbfe; background: #eff6ff; }
.aa-kpi-green { border-color: #a7f3d0; background: #f0fdf4; }
.aa-kpi-gray { border-color: #e5e7eb; background: #f9fafb; }
.aa-kpi-value { font-size: 22px; font-weight: 700; color: #1a2035; }
.aa-kpi-label { font-size: 12px; color: #6b7280; margin-top: 2px; }
.aa-bucket-bar {
  display: flex;
  gap: 20px;
  padding: 12px 28px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.aa-bucket-item { display: flex; align-items: center; gap: 8px; }
.aa-bucket-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.aa-bucket-label { font-size: 11px; color: #6b7280; font-weight: 500; }
.aa-bucket-amount { font-size: 13px; font-weight: 700; color: #1a2035; }
.aa-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 28px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.aa-search {
  padding: 7px 12px;
  border: 1px solid #d1d5db;
  border-radius: 7px;
  font-size: 13px;
  outline: none;
  width: 220px;
  background: #f9fafb;
  color: #1a2035;
}
.aa-search:focus { border-color: #4f6ef7; background: #fff; }
.aa-filter-group { display: flex; gap: 6px; }
.aa-filter-btn {
  padding: 5px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  transition: all 0.15s;
}
.aa-filter-btn:hover { background: #f3f4f6; }
.aa-filter-active {
  background: #1a2035 !important;
  color: #fff !important;
  border-color: #1a2035 !important;
}
.aa-table-wrap {
  flex: 1;
  overflow: auto;
  padding: 16px 28px;
}
.aa-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  background: #fff;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07);
}
.aa-th {
  background: #f8fafc;
  color: #374151;
  font-weight: 600;
  padding: 10px 12px;
  text-align: right;
  border-bottom: 2px solid #e5e7eb;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}
.aa-th-vendor { text-align: left; min-width: 200px; }
.aa-th-msme { text-align: center; width: 70px; }
.aa-th-bucket { min-width: 100px; }
.aa-th-total { min-width: 110px; }
.aa-th-sorted { background: #eff6ff; }
.aa-sort-arrow { font-size: 11px; }
.aa-tr:hover { background: #f9fafb; }
.aa-tr-totals { background: #f0f4ff; }
.aa-td {
  padding: 9px 12px;
  border-bottom: 1px solid #f3f4f6;
  color: #374151;
  text-align: right;
}
.aa-td-vendor { text-align: left; font-weight: 500; }
.aa-td-amount { font-variant-numeric: tabular-nums; }
.aa-td-total { font-weight: 600; }
.aa-amount-cell {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 600;
}
.aa-msme-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  background: #d1fae5;
  color: #065f46;
}
.aa-non-msme-badge { color: #9ca3af; }
.aa-loading, .aa-error, .aa-empty {
  text-align: center;
  padding: 48px;
  color: #9ca3af;
  font-size: 14px;
}
.aa-error { color: #dc2626; }
`

const AA_SHELL_CSS = `
.lx-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #f5f6f8;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.lx-sidebar {
  width: 220px;
  min-width: 220px;
  height: 100%;
  background: #1E4D6B;
  display: flex;
  flex-direction: column;
  transition: width 0.2s, min-width 0.2s;
  overflow: hidden;
  flex-shrink: 0;
}
.lx-sidebar.lx-collapsed { width: 60px; min-width: 60px; }
.lx-logo-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 14px 10px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.lx-logo-btns { display: flex; gap: 6px; }
.lx-collapse-btn {
  background: rgba(255,255,255,0.08);
  border: none;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255,255,255,0.7);
  transition: background 0.15s;
}
.lx-collapse-btn:hover { background: rgba(255,255,255,0.18); }
.lx-nav {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
}
.lx-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 16px;
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
  overflow: hidden;
}
.lx-nav-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
.lx-nav-item.lx-active { background: rgba(255,255,255,0.18); color: #fff; font-weight: 600; }
.lx-nav-icon { font-size: 16px; flex-shrink: 0; }
.lx-nav-label { overflow: hidden; text-overflow: ellipsis; }
.lx-sidebar-bottom {
  padding: 12px 10px;
  border-top: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.lx-fynd-logo-img { height: 22px; opacity: 0.7; }
.lx-fynd-logo-sm { height: 18px; opacity: 0.7; }
.lx-home-btn {
  background: rgba(255,255,255,0.08);
  border: none;
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: rgba(255,255,255,0.75);
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.lx-home-btn:hover { background: rgba(255,255,255,0.2); color: #fff; }
`
