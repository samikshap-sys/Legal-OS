/**
 * InvoiceRegister.tsx
 * Exact reference match:
 * - Sidebar (LedgerX nav)
 * - Top bar: title, search
 * - Toolbar: All Payment Status / All Tally Status / All MSME dropdowns + Create Tally Entry + Download CSV + Refresh
 * - Table: Invoice No (link), Vendor, Type, Inv Date, Due Date, Net Payable, GST, TDS, MSME, Aging, Tally, Approval, Payment, Actions
 * - Actions column: checkmark button + three-dot dropdown (View Details, Approve, Dispute, Not Approved)
 * - Invoice Detail modal: Net Payable hero, TDS/GST/Type, Inv Date/Due Date/Aging, Payment/Tally/Approval/MSME badges, GSTIN, Vendor Code/Name, Save Remark textarea, Dispute/Not Approved/Approve buttons
 * - All backend write-back functions: approve, dispute, not approved, save remark
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { useLocation } from 'wouter'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'

// ── Nav icons ─────────────────────────────────────────────────────────────────
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
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
}
function ChevronRightIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
}
function HomeSmallIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
function RefreshIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
}
function DownloadIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function TallyCreateIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><polyline points="9 17 11 19 15 15"/></svg>
}
function CheckIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function ChevronDownIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
}
function DotsIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
}
function EyeIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function ApproveIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
}
function DisputeIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
}
function XIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
function CloseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
}
function InvoiceFileIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/></svg>
}

const IR_NAV = [
  { id: 'dashboard',          label: 'AP Dashboard',       icon: <DashboardIcon /> },
  { id: 'invoice-booking',    label: 'Invoice Booking',    icon: <BookInvoiceIcon /> },
  { id: 'dp-invoice-booking', label: 'DP Invoice Booking', icon: <DPInvoiceIcon /> },
  { id: 'invoice-register',   label: 'Invoice Register',   icon: <RegisterIcon /> },
  { id: 'tally-entry',        label: 'Tally Entry',        icon: <TallyEntryIcon /> },
  { id: 'aging-analysis',     label: 'Aging Analysis',     icon: <AgingIcon /> },
]

// ── Column definitions: maps display label → structured backend field ────────────
const COLS = [
  { key: 'invoiceNo',    label: 'INVOICE NO',    field: 'invoice_no',      width: 140, link: true },
  { key: 'vendor',       label: 'VENDOR',        field: 'vendor',           width: 160 },
  { key: 'type',         label: 'TYPE',          field: 'type',             width: 80,  badge: 'type' },
  { key: 'invDate',      label: 'INV DATE',      field: 'inv_date',         width: 95 },
  { key: 'dueDate',      label: 'DUE DATE',      field: 'due_date',         width: 95 },
  { key: 'netPayable',   label: 'NET PAYABLE',   field: 'net_payable',      width: 110, align: 'right' },
  { key: 'gst',          label: 'GST',           field: 'gst',              width: 80,  align: 'right' },
  { key: 'tds',          label: 'TDS',           field: 'tds',              width: 80,  align: 'right' },
  { key: 'msme',         label: 'MSME',          field: 'msme',             width: 90,  badge: 'msme' },
  { key: 'aging',        label: 'AGING',         field: 'aging',            width: 110 },
  { key: 'tally',        label: 'TALLY',         field: 'tally_status',     width: 130, badge: 'tally' },
  { key: 'approval',     label: 'APPROVAL',      field: 'approval_status',  width: 110, badge: 'approval' },
  { key: 'payment',      label: 'PAYMENT',       field: 'payment_status',   width: 90,  badge: 'payment' },
]

// ── Badge renderers ───────────────────────────────────────────────────────────
function TallyBadge({ val }: { val: string }) {
  if (!val || val === '—') return <span className="ir-dash">—</span>
  const v = val.toLowerCase()
  let cls = 'ir-badge-grey'
  if (v.includes('processed')) cls = 'ir-badge-green'
  else if (v.includes('xml created') || v.includes('xml_created')) cls = 'ir-badge-teal'
  else if (v.includes('entry updated') || v.includes('entry_updated')) cls = 'ir-badge-orange'
  else if (v.includes('template prepared') || v.includes('template_prepared')) cls = 'ir-badge-blue'
  else if (v.includes('pending')) cls = 'ir-badge-yellow'
  return <span className={`ir-badge ${cls}`}>{val}</span>
}

function ApprovalBadge({ val }: { val: string }) {
  if (!val || val === '—') return <span className="ir-dash">—</span>
  const v = val.toLowerCase()
  let cls = 'ir-badge-grey'
  if (v === 'approved') cls = 'ir-badge-green'
  else if (v.includes('not approved') || v.includes('not_approved')) cls = 'ir-badge-red-soft'
  else if (v.includes('dispute')) cls = 'ir-badge-orange'
  else if (v.includes('pending')) cls = 'ir-badge-yellow'
  else if (v.includes('rejected')) cls = 'ir-badge-red'
  return <span className={`ir-badge ${cls}`}>{val}</span>
}

function PaymentBadge({ val }: { val: string }) {
  if (!val || val === '—') return <span className="ir-dash">—</span>
  const v = val.toLowerCase()
  let cls = 'ir-badge-grey'
  if (v.includes('paid') && !v.includes('unpaid')) cls = 'ir-badge-green'
  else if (v.includes('unpaid')) cls = 'ir-badge-red'
  else if (v.includes('partial')) cls = 'ir-badge-orange'
  return <span className={`ir-badge ${cls}`}>{val}</span>
}

function TypeBadge({ val }: { val: string }) {
  if (!val || val === '—') return <span className="ir-dash">—</span>
  const v = val.toLowerCase()
  let cls = 'ir-badge-blue-soft'
  if (v.includes('credit')) cls = 'ir-badge-purple'
  else if (v.includes('debit')) cls = 'ir-badge-orange'
  return <span className={`ir-badge ${cls}`}>{val}</span>
}

function MsmeBadge({ val }: { val: string }) {
  if (!val || val === '—' || val.trim() === '') return <span className="ir-badge ir-badge-grey-outline">Non-MSME</span>
  const v = val.toLowerCase()
  if (v.includes('foreign')) return <span className="ir-badge ir-badge-purple">{val}</span>
  if (v.includes('non') || v === 'gst non registered' || v.includes('non registered')) return <span className="ir-badge ir-badge-grey-outline">Non-MSME</span>
  if (v.includes('gst registered') || v.includes('gst_registered')) return <span className="ir-badge ir-badge-teal">{val}</span>
  if (v.includes('msme')) return <span className="ir-badge ir-badge-teal">{val}</span>
  return <span className="ir-badge ir-badge-grey-outline">{val}</span>
}

function renderCell(colKey: string, val: string, badgeType?: string) {
  if (!val || val === '') return <span className="ir-dash">—</span>
  if (badgeType === 'tally') return <TallyBadge val={val} />
  if (badgeType === 'approval') return <ApprovalBadge val={val} />
  if (badgeType === 'payment') return <PaymentBadge val={val} />
  if (badgeType === 'type') return <TypeBadge val={val} />
  if (badgeType === 'msme') return <MsmeBadge val={val} />
  return <span title={val}>{val}</span>
}

// ── Dropdown filter component ─────────────────────────────────────────────────
function FilterDropdown({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return (
    <div className="ir-filter-wrap" ref={ref} style={{ position: 'relative' }}>
      <button className="ir-filter-btn" onClick={() => setOpen(o => !o)}>
        {value || label} <ChevronDownIcon />
      </button>
      {open && (
        <div className="ir-filter-menu">
          <div className="ir-filter-opt ir-filter-opt-all" onClick={() => { onChange(''); setOpen(false) }}>
            {label}
          </div>
          {options.map(opt => (
            <div
              key={opt}
              className={`ir-filter-opt${value === opt ? ' ir-filter-opt-active' : ''}`}
              onClick={() => { onChange(opt); setOpen(false) }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Dispute Remark Modal (for dropdown Dispute action) ───────────────────────
function DisputeRemarkModal({ onClose, onSubmit, saving }: {
  onClose: () => void
  onSubmit: (remark: string) => void
  saving: boolean
}) {
  const [remark, setRemark] = useState('')
  return (
    <div className="ir-modal-overlay" onClick={onClose}>
      <div className="ir-dispute-remark-modal" onClick={e => e.stopPropagation()}>
        <div className="ir-dispute-remark-header">
          <DisputeIcon />
          <span>Dispute Invoice</span>
          <button className="ir-detail-close" onClick={onClose}><CloseIcon /></button>
        </div>
        <p className="ir-dispute-remark-desc">Please provide a remark explaining the reason for dispute.</p>
        <textarea
          className="ir-detail-remark"
          placeholder="Enter dispute reason…"
          value={remark}
          onChange={e => setRemark(e.target.value)}
          rows={3}
          autoFocus
        />
        <div className="ir-dispute-remark-actions">
          <button className="ir-btn ir-btn-outline" onClick={onClose}>Cancel</button>
          <button
            className="ir-btn ir-detail-btn-dispute"
            onClick={() => { if (!remark.trim()) return; onSubmit(remark.trim()) }}
            disabled={saving || !remark.trim()}
          >
            <DisputeIcon /> Dispute
          </button>
        </div>
      </div>
    </div>
  )
}
// ── Row action dropdown ───────────────────────────────────────────────────────
function RowActionMenu({ row, onViewDetails, onApprove, onDisputeWithRemark, onNotApproved }: {
  row: any
  onViewDetails: () => void
  onApprove: () => void
  onDisputeWithRemark: () => void
  onNotApproved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const dotsRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        dotsRef.current && !dotsRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleDotsClick = () => {
    if (!dotsRef.current) return
    const rect = dotsRef.current.getBoundingClientRect()
    const menuWidth = 160
    const viewportWidth = window.innerWidth
    const rawLeft = rect.right - menuWidth
    const clampedLeft = Math.min(rawLeft, viewportWidth - menuWidth - 8)
    setMenuPos({ top: rect.bottom + 4, left: Math.max(8, clampedLeft) })
    setOpen(o => !o)
  }

  return (
    <div className="ir-row-actions">
      <button
        className="ir-action-check-btn"
        onClick={onApprove}
        title="Quick Approve"
      >
        <CheckIcon />
      </button>
      <button
        ref={dotsRef}
        className="ir-action-dots-btn"
        onClick={handleDotsClick}
        title="More actions"
      >
        <DotsIcon />
      </button>
      {open && (
        <div
          ref={menuRef}
          className="ir-action-menu"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          <div className="ir-action-menu-item" onClick={() => { onViewDetails(); setOpen(false) }}>
            <EyeIcon /> View Details
          </div>
          <div className="ir-action-menu-item ir-action-menu-approve" onClick={() => { onApprove(); setOpen(false) }}>
            <ApproveIcon /> Approve
          </div>
          <div className="ir-action-menu-item ir-action-menu-dispute" onClick={() => { onDisputeWithRemark(); setOpen(false) }}>
            <DisputeIcon /> Dispute
          </div>
          <div className="ir-action-menu-item ir-action-menu-reject" onClick={() => { onNotApproved(); setOpen(false) }}>
            <XIcon /> Not Approved
          </div>
        </div>
      )}
    </div>
  )
}

// ── Invoice Detail Modal ──────────────────────────────────────────────────────
function InvoiceDetailModal({ row, onClose, onApprove, onDispute, onNotApproved, onSaveRemark, saving }: {
  row: any
  onClose: () => void
  onApprove: () => void
  onDispute: (remark: string) => void
  onNotApproved: () => void
  onSaveRemark: (remark: string) => void
  saving: boolean
}) {
  const [remark, setRemark] = useState(row.remark || '')

  // Format currency value
  const fmtCurrency = (v: string) => {
    if (!v || v === '—') return '—'
    const n = parseFloat(String(v).replace(/[₹,]/g, ''))
    if (isNaN(n)) return v
    return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  return (
    <div className="ir-modal-overlay" onClick={onClose}>
      <div className="ir-detail-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ir-detail-header">
          <div className="ir-detail-header-left">
            <div className="ir-detail-icon"><InvoiceFileIcon /></div>
            <div>
              <div className="ir-detail-title">Invoice: {row.invoice_no || '—'}</div>
              <div className="ir-detail-vendor">{row.vendor || '—'}</div>
            </div>
          </div>
          <button className="ir-detail-close" onClick={onClose}><CloseIcon /></button>
        </div>

        {/* Hero card: Net Payable + TDS + GST + Type */}
        <div className="ir-detail-hero">
          <div className="ir-detail-hero-left">
            <div className="ir-detail-hero-label">NET PAYABLE</div>
            <div className="ir-detail-hero-amount">{fmtCurrency(row.net_payable)}</div>
          </div>
          <div className="ir-detail-hero-right">
            <div className="ir-detail-hero-stat">
              <div className="ir-detail-hero-stat-label">TDS</div>
              <div className="ir-detail-hero-stat-val">{fmtCurrency(row.tds)}</div>
            </div>
            <div className="ir-detail-hero-divider" />
            <div className="ir-detail-hero-stat">
              <div className="ir-detail-hero-stat-label">GST</div>
              <div className="ir-detail-hero-stat-val">{fmtCurrency(row.gst)}</div>
            </div>
            <div className="ir-detail-hero-divider" />
            <div className="ir-detail-hero-stat">
              <div className="ir-detail-hero-stat-label">TYPE</div>
              <div className="ir-detail-hero-stat-val"><TypeBadge val={row.type || '—'} /></div>
            </div>
          </div>
        </div>

        {/* Date + Aging row */}
        <div className="ir-detail-grid3">
          <div className="ir-detail-cell">
            <div className="ir-detail-cell-label">INV DATE</div>
            <div className="ir-detail-cell-val">{row.inv_date || '—'}</div>
          </div>
          <div className="ir-detail-cell">
            <div className="ir-detail-cell-label">DUE DATE</div>
            <div className="ir-detail-cell-val">{row.due_date || '—'}</div>
          </div>
          <div className="ir-detail-cell">
            <div className="ir-detail-cell-label">AGING</div>
            <div className="ir-detail-cell-val">{row.aging || '—'}</div>
          </div>
        </div>

        {/* Status badges row */}
        <div className="ir-detail-grid4">
          <div className="ir-detail-cell">
            <div className="ir-detail-cell-label">PAYMENT</div>
            <div className="ir-detail-cell-val"><PaymentBadge val={row.payment_status || '—'} /></div>
          </div>
          <div className="ir-detail-cell">
            <div className="ir-detail-cell-label">TALLY</div>
            <div className="ir-detail-cell-val"><TallyBadge val={row.tally_status || '—'} /></div>
          </div>
          <div className="ir-detail-cell">
            <div className="ir-detail-cell-label">APPROVAL</div>
            <div className="ir-detail-cell-val"><ApprovalBadge val={row.approval_status || '—'} /></div>
          </div>
          <div className="ir-detail-cell">
            <div className="ir-detail-cell-label">MSME</div>
            <div className="ir-detail-cell-val"><MsmeBadge val={row.msme || ''} /></div>
          </div>
        </div>

        {/* GSTIN + Vendor Code row */}
        <div className="ir-detail-grid2">
          <div className="ir-detail-cell">
            <div className="ir-detail-cell-label">GSTIN</div>
            <div className="ir-detail-cell-val ir-detail-mono">{row.vendor_gstin || '—'}</div>
          </div>
          <div className="ir-detail-cell">
            <div className="ir-detail-cell-label">VENDOR CODE / NAME</div>
            <div className="ir-detail-cell-val">{row.vendor || '—'}</div>
          </div>
        </div>

        {/* Remark textarea */}
        <div className="ir-detail-remark-wrap">
          <textarea
            className="ir-detail-remark"
            placeholder="Add a remark…"
            value={remark}
            onChange={e => setRemark(e.target.value)}
            rows={2}
          />
        </div>

        {/* Action buttons */}
        <div className="ir-detail-actions">
          <button className="ir-btn ir-btn-outline" onClick={onClose}>Close</button>
          <button
            className="ir-btn ir-detail-btn-remark"
            onClick={() => onSaveRemark(remark)}
            disabled={saving}
          >
            {saving ? 'Saving…' : '✎ Save Remark'}
          </button>
          <button
            className="ir-btn ir-detail-btn-dispute"
            onClick={() => { if (!remark.trim()) { toast.error('Please add a remark before disputing'); return }; onDispute(remark.trim()) }}
            title={!remark.trim() ? 'Add a remark to dispute' : undefined}
          >
            <DisputeIcon /> Dispute
          </button>
          <button className="ir-btn ir-detail-btn-reject" onClick={onNotApproved}>
            <XIcon /> Not Approved
          </button>
          <button className="ir-btn ir-detail-btn-approve" onClick={onApprove}>
            <ApproveIcon /> Approve
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InvoiceRegister() {
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

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: rawData, isLoading: loading, refetch } = trpc.ledgerX.invoiceRegister.useQuery(undefined, {
    refetchInterval: 30000,
  })
  const approveMutation = trpc.ledgerX.invoiceRegisterApprove.useMutation({
    onSuccess: () => { refetch() },
  })
  const remarkMutation = trpc.ledgerX.invoiceRegisterRemark.useMutation({
    onSuccess: () => { refetch(); toast.success('Remark saved') },
  })
  const refreshMutation = trpc.ledgerX.invoiceRegisterRefresh.useMutation({
    onSuccess: () => refetch(),
  })
  const submittedIdxsRef = { current: new Set<number>() }
  const tallyCreateMutation = trpc.ledgerX.tallyCreate.useMutation({
    onSuccess: (data: any) => {
      if (data?.error) { toast.error(`Failed: ${data.error}`); return }
      const count = data?.count ?? 0
      toast.success(`✓ ${count} entr${count === 1 ? 'y' : 'ies'} created in Tally sheet`)
      setLocalRows(prev => prev.map((r: any) =>
        submittedIdxsRef.current.has(r._rowIdx) ? { ...r, tally_status: 'Template Prepared' } : r
      ))
      setSelected(new Set())
      submittedIdxsRef.current = new Set()
    },
    onError: (err: any) => toast.error(`Failed: ${err.message}`),
  })

  const rows: any[] = (rawData as any)?.rows || []

  // ── State ─────────────────────────────────────────────────────────────────
  const [localRows, setLocalRows] = useState<any[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [tallyFilter, setTallyFilter] = useState('')
  const [msmeFilter, setMsmeFilter] = useState('')
  const [detailRow, setDetailRow] = useState<any | null>(null)
  const [disputeRow, setDisputeRow] = useState<any | null>(null)
  useEffect(() => { if ((rawData as any)?.rows) setLocalRows((rawData as any).rows) }, [rawData])
  const displayRows = localRows.length > 0 ? localRows : rows

  // ── Derive unique filter options from data ─────────────────────────────────
  const paymentOptions = Array.from(new Set(displayRows.map((r: any) => r.payment_status).filter(Boolean))).sort() as string[]
  const tallyOptions = Array.from(new Set(displayRows.map((r: any) => r.tally_status).filter(Boolean))).sort() as string[]
  const msmeOptions = Array.from(new Set(displayRows.map((r: any) => r.msme).filter(Boolean))).sort() as string[]

  // ── Filtering ─────────────────────────────────────────────────────────────
  const filtered = displayRows.filter((row: any) => {
    if (search) {
      const q = search.toLowerCase()
      if (!Object.values(row).some(v => String(v).toLowerCase().includes(q))) return false
    }
    if (paymentFilter && row.payment_status !== paymentFilter) return false
    if (tallyFilter && row.tally_status !== tallyFilter) return false
    if (msmeFilter && row.msme !== msmeFilter) return false
    return true
  })

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = (rowIdx: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(rowIdx)) next.delete(rowIdx)
      else next.add(rowIdx)
      return next
    })
  }
  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map((r: any) => r._rowIdx)))
  }

  // ── Approve / Dispute / Not Approved ─────────────────────────────────────
  const handleStatusChange = async (rowIdx: number, status: string, remark?: string) => {
    // Optimistic update: update localRows immediately
    setLocalRows(prev => prev.map((r: any) => r._rowIdx === rowIdx ? { ...r, approval_status: status } : r))
    if (detailRow && detailRow._rowIdx === rowIdx) {
      setDetailRow((prev: any) => prev ? { ...prev, approval_status: status } : null)
    }
    try {
      await approveMutation.mutateAsync({ rowIndices: [rowIdx], status })
      if (remark) await remarkMutation.mutateAsync({ rowIdx, remark })
      toast.success(`Invoice marked as ${status}`)
    } catch {
      // Rollback optimistic update on error
      setLocalRows((rawData as any)?.rows || [])
      toast.error('Failed to update status')
    }
  }

  // Bulk approve/reject from selection bar
  const handleBulkStatus = async (status: string) => {
    if (selected.size === 0) { toast.error('Select at least one invoice'); return }
    const rowIndices = Array.from(selected)
    await approveMutation.mutateAsync({ rowIndices, status })
    setSelected(new Set())
    toast.success(`${rowIndices.length} invoice(s) marked as ${status}`)
  }

  // ── Remark ────────────────────────────────────────────────────────────────
  const saveRemark = async (rowIdx: number, remark: string) => {
    await remarkMutation.mutateAsync({ rowIdx, remark })
    if (detailRow && detailRow._rowIdx === rowIdx) {
      setDetailRow((prev: any) => prev ? { ...prev, remark } : null)
    }
  }

  // ── Download CSV (full dataset) ───────────────────────────────────────────
  const downloadCsv = () => {
    const csvFields = COLS.map(c => c.field)
    const csvLabels = COLS.map(c => c.label)
    // Download selected rows only; fall back to all filtered rows if nothing selected
    const sourceRows = selected.size > 0
      ? displayRows.filter((r: any) => selected.has(r._rowIdx))
      : filtered
    const csvRows = sourceRows.map((row: any) => csvFields.map(f => `"${String((row as any)[f] || '').replace(/"/g, '""')}"`).join(','))
    const csv = [csvLabels.join(','), ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'invoice-register.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <style>{IR_CSS}</style>
      <style dangerouslySetInnerHTML={{ __html: IR_SHELL_CSS }} />
      <div className="lx-shell">
        {/* ── Sidebar ── */}
        <aside className={`lx-sidebar${collapsed ? ' lx-collapsed' : ''}`}>
          <div className="lx-logo-row">
            {!collapsed && <span className="lx-logo-title">LedgerX</span>}
            <button
              className="lx-collapse-btn"
              onClick={() => setCollapsed(c => !c)}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </button>
          </div>
          <nav className="lx-nav">
            {IR_NAV.map(item => (
              <button
                key={item.id}
                className={`lx-nav-item${item.id === 'invoice-register' ? ' lx-active' : ''}`}
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
        <div className="ir-page">
          {/* ── Top bar ── */}
          <div className="ir-topbar">
            <div className="ir-topbar-left">
              <div>
                <h1 className="ir-title">Invoice Register</h1>
                <p className="ir-subtitle">Invoice Repository</p>
              </div>
            </div>
            <div className="ir-topbar-right">
              <div className="ir-search-wrap">
                <svg className="ir-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  className="ir-search"
                  placeholder="Search invoices, vendors, document types..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Filter + Action bar ── */}
          <div className="ir-toolbar">
            <div className="ir-toolbar-filters">
              <FilterDropdown
                label="All Payment Status"
                value={paymentFilter}
                options={paymentOptions}
                onChange={setPaymentFilter}
              />
              <FilterDropdown
                label="All Tally Status"
                value={tallyFilter}
                options={tallyOptions}
                onChange={setTallyFilter}
              />
              <FilterDropdown
                label="All MSME"
                value={msmeFilter}
                options={msmeOptions}
                onChange={setMsmeFilter}
              />
            </div>
            <div className="ir-toolbar-actions">
              <button
                className="ir-btn ir-btn-primary"
                onClick={() => {
                  const toSubmit = selected.size > 0
                    ? filtered.filter((r: any) => selected.has(r._rowIdx))
                    : filtered
                  if (!toSubmit.length) { toast.error('No invoices to submit'); return }
                  submittedIdxsRef.current = new Set(toSubmit.map((r: any) => r._rowIdx))
                  tallyCreateMutation.mutate({ invoices: toSubmit.map((r: any) => ({
                    row_idx: r._rowIdx,
                    invoice_no: r.invoice_no,
                    vendor: r.vendor,
                    type: r.type,
                    inv_date: r.inv_date,
                  })) })
                }}
                disabled={tallyCreateMutation.isPending}
              >
                <TallyCreateIcon /> {tallyCreateMutation.isPending ? 'Creating…' : 'Create Tally Entry'}
              </button>
              <button className="ir-btn ir-btn-outline" onClick={downloadCsv}>
                <DownloadIcon /> Download CSV
              </button>
              <button
                className="ir-btn ir-btn-icon"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
                title="Refresh"
              >
                <RefreshIcon />
              </button>
            </div>
          </div>

          {/* ── Bulk selection action bar ── */}
          {selected.size > 0 && (
            <div className="ir-action-bar">
              <span className="ir-action-count">{selected.size} selected</span>
              <button className="ir-btn ir-btn-approve" onClick={() => handleBulkStatus('Approved')} disabled={approveMutation.isPending}>
                ✓ Approve
              </button>
              <button className="ir-btn ir-btn-dispute" onClick={() => handleBulkStatus('Dispute')} disabled={approveMutation.isPending}>
                ⚠ Dispute
              </button>
              <button className="ir-btn ir-btn-reject" onClick={() => handleBulkStatus('Not Approved')} disabled={approveMutation.isPending}>
                ✕ Not Approved
              </button>
              <button className="ir-btn ir-btn-outline" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}

          {/* ── Table ── */}
          <div className="ir-table-wrap">
            {loading ? (
              <div className="ir-loading">Loading invoice register…</div>
            ) : (rawData as any)?.error ? (
              <div className="ir-error">Error: {(rawData as any).error}</div>
            ) : (
              <>
                <div className="ir-table-meta">
                  <span className="ir-table-label">INVOICES</span>
                  <span className="ir-table-count">{filtered.length} invoices</span>
                </div>
                <table className="ir-table">
                  <thead>
                    <tr>
                      <th className="ir-th ir-th-check">
                        <input
                          type="checkbox"
                          checked={selected.size === filtered.length && filtered.length > 0}
                          onChange={selectAll}
                        />
                      </th>
                      {COLS.map(col => (
                        <th key={col.key} className="ir-th" style={{ minWidth: col.width, textAlign: (col as any).align || 'left' }}>
                          {col.label}
                        </th>
                      ))}
                      <th className="ir-th ir-th-action">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={COLS.length + 2} className="ir-empty">No invoices found</td></tr>
                    ) : (
                      filtered.map((row: any) => {
                        const isSelected = selected.has(row._rowIdx)
                        return (
                          <tr key={row._rowIdx} className={`ir-tr${isSelected ? ' ir-tr-selected' : ''}`}>
                            <td className="ir-td ir-td-check">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelect(row._rowIdx)}
                              />
                            </td>
                            {COLS.map(col => {
                              const val: string = (row as any)[col.field] || ''
                              return (
                                <td
                                  key={col.key}
                                  className="ir-td"
                                  style={{ textAlign: (col as any).align || 'left' }}
                                >
                                  {(col as any).link && val ? (
                                    <span className="ir-inv-link" title={val} onClick={() => setDetailRow(row)}>{val}</span>
                                  ) : col.key === 'msme' ? (
                                    <MsmeBadge val={val} />
                                  ) : (col as any).badge ? (
                                    renderCell(col.key, val || '—', (col as any).badge)
                                  ) : (
                                    <span title={val}>{val || '—'}</span>
                                  )}
                                </td>
                              )
                            })}
                            <td className="ir-td ir-td-actions">
                              <RowActionMenu
                                row={row}
                                onViewDetails={() => setDetailRow(row)}
                                onApprove={() => handleStatusChange(row._rowIdx, 'Approved')}
                                onDisputeWithRemark={() => setDisputeRow(row)}
                                onNotApproved={() => handleStatusChange(row._rowIdx, 'Not Approved')}
                              />
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Invoice Detail Modal ── */}
      {detailRow && (
        <InvoiceDetailModal
          row={detailRow}
          onClose={() => setDetailRow(null)}
          onApprove={() => handleStatusChange(detailRow._rowIdx, 'Approved')}
          onDispute={(remark) => handleStatusChange(detailRow._rowIdx, 'Dispute', remark)}
          onNotApproved={() => handleStatusChange(detailRow._rowIdx, 'Not Approved')}
          onSaveRemark={(remark) => saveRemark(detailRow._rowIdx, remark)}
          saving={remarkMutation.isPending || approveMutation.isPending}
        />
      )}
      {/* ── Dispute Remark Modal (from dropdown) ── */}
      {disputeRow && (
        <DisputeRemarkModal
          onClose={() => setDisputeRow(null)}
          onSubmit={async (remark) => {
            await handleStatusChange(disputeRow._rowIdx, 'Dispute', remark)
            setDisputeRow(null)
          }}
          saving={approveMutation.isPending || remarkMutation.isPending}
        />
      )}
    </>
  )
}

const IR_CSS = `
.ir-page {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #f5f6f8;
  overflow: hidden;
}

/* Top bar */
.ir-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px 14px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  gap: 20px;
}
.ir-topbar-left { display: flex; align-items: center; gap: 16px; }
.ir-topbar-right { display: flex; align-items: center; gap: 10px; flex: 1; justify-content: flex-end; }
.ir-title {
  font-size: 20px;
  font-weight: 700;
  color: #1a2035;
  margin: 0;
}
.ir-subtitle {
  font-size: 12px;
  color: #9ca3af;
  margin: 2px 0 0;
}
.ir-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.ir-search-icon {
  position: absolute;
  left: 10px;
  color: #9ca3af;
  pointer-events: none;
}
.ir-search {
  padding: 7px 12px 7px 32px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  width: 300px;
  background: #f9fafb;
  color: #1a2035;
  transition: border-color 0.15s, background 0.15s;
}
.ir-search:focus { border-color: #1E4D6B; background: #fff; }

/* Toolbar */
.ir-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 28px;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  gap: 12px;
}
.ir-toolbar-filters { display: flex; gap: 8px; align-items: center; }
.ir-toolbar-actions { display: flex; gap: 8px; align-items: center; }

/* Filter dropdown */
.ir-filter-wrap { position: relative; }
.ir-filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: none;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: #1E4D6B;
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(30,77,107,0.15);
}
.ir-filter-btn:hover { background: #153650; }
.ir-filter-btn.ir-filter-active { background: #0f2a40; box-shadow: 0 0 0 2px #4a9eca; }
.ir-filter-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.10);
  z-index: 100;
  min-width: 180px;
  overflow: hidden;
}
.ir-filter-opt {
  padding: 8px 14px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  transition: background 0.12s;
}
.ir-filter-opt:hover { background: #f3f4f6; }
.ir-filter-opt-all { color: #6b7280; border-bottom: 1px solid #f3f4f6; }
.ir-filter-opt-active { background: #eff6ff; color: #1d4ed8; font-weight: 600; }

/* Buttons */
.ir-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.15s, box-shadow 0.15s;
  white-space: nowrap;
}
.ir-btn-primary { background: #1E4D6B; color: #fff; }
.ir-btn-primary:hover { background: #153650; }
.ir-btn-outline { background: #fff; border: 1px solid #d1d5db; color: #374151; }
.ir-btn-outline:hover { background: #f3f4f6; }
.ir-btn-icon { background: #fff; border: 1px solid #d1d5db; color: #374151; padding: 7px 10px; }
.ir-btn-icon:hover { background: #f3f4f6; }
.ir-btn-icon:disabled { opacity: 0.5; cursor: not-allowed; }
.ir-btn-approve { background: #059669; color: #fff; }
.ir-btn-approve:hover { background: #047857; }
.ir-btn-approve:disabled { opacity: 0.6; cursor: not-allowed; }
.ir-btn-dispute { background: #d97706; color: #fff; }
.ir-btn-dispute:hover { background: #b45309; }
.ir-btn-dispute:disabled { opacity: 0.6; cursor: not-allowed; }
.ir-btn-reject { background: #dc2626; color: #fff; }
.ir-btn-reject:hover { background: #b91c1c; }

/* Selection action bar */
.ir-action-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 28px;
  background: #eff6ff;
  border-bottom: 1px solid #bfdbfe;
  flex-shrink: 0;
}
.ir-action-count { font-size: 13px; font-weight: 600; color: #1d4ed8; margin-right: 4px; }

/* Table */
.ir-table-wrap {
  flex: 1;
  overflow: auto;
  padding: 16px 28px 24px;
}
.ir-table-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.ir-table-label { font-size: 11px; font-weight: 700; letter-spacing: 0.8px; color: #6b7280; text-transform: uppercase; }
.ir-table-count { font-size: 12px; color: #9ca3af; }
.ir-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07);
  table-layout: auto;
}
.ir-th {
  background: #fff;
  color: #6b7280;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.4px;
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #e5e7eb;
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
}
.ir-th-check { width: 36px; }
.ir-th-action { width: 80px; }
.ir-tr { border-bottom: 1px solid #f3f4f6; }
.ir-tr:hover { background: #f9fafb; }
.ir-tr-selected { background: #eff6ff !important; }
.ir-td {
  padding: 9px 12px;
  color: #374151;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
}
.ir-td-check { width: 36px; }
.ir-td-actions { width: 80px; text-align: center; }
.ir-inv-link {
  color: #1E4D6B;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: transparent;
  transition: text-decoration-color 0.15s;
}
.ir-inv-link:hover { text-decoration-color: #1E4D6B; }
.ir-dash { color: #d1d5db; }

/* Row action buttons */
.ir-row-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: center;
  position: relative;
}
.ir-action-check-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  color: #6b7280;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.ir-action-check-btn:hover { background: #f0fdf4; border-color: #059669; color: #059669; }
.ir-action-dots-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  color: #6b7280;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.ir-action-dots-btn:hover { background: #f3f4f6; border-color: #9ca3af; color: #374151; }
.ir-action-menu {
  position: fixed;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  z-index: 9999;
  min-width: 160px;
  overflow: hidden;
}
.ir-action-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  font-size: 13px;
  color: #374151;
  cursor: pointer;
  transition: background 0.12s;
}
.ir-action-menu-item:hover { background: #f9fafb; }
.ir-action-menu-approve { color: #059669; }
.ir-action-menu-approve:hover { background: #f0fdf4; }
.ir-action-menu-dispute { color: #d97706; }
.ir-action-menu-dispute:hover { background: #fffbeb; }
.ir-action-menu-reject { color: #dc2626; }
.ir-action-menu-reject:hover { background: #fef2f2; }

/* Badges */
.ir-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.ir-badge-green { background: #d1fae5; color: #065f46; }
.ir-badge-orange { background: #fef3c7; color: #92400e; }
.ir-badge-blue { background: #dbeafe; color: #1e40af; }
.ir-badge-blue-soft { background: #eff6ff; color: #1d4ed8; }
.ir-badge-yellow { background: #fef9c3; color: #713f12; }
.ir-badge-red { background: #fee2e2; color: #991b1b; }
.ir-badge-red-soft { background: #fff1f2; color: #be123c; }
.ir-badge-grey { background: #f3f4f6; color: #6b7280; }
.ir-badge-grey-outline { background: #f9fafb; color: #6b7280; border: 1px solid #e5e7eb; }
.ir-badge-teal { background: #ccfbf1; color: #0f766e; }
.ir-badge-purple { background: #f3e8ff; color: #7c3aed; }

/* States */
.ir-loading, .ir-error, .ir-empty {
  text-align: center;
  padding: 48px;
  color: #9ca3af;
  font-size: 14px;
}
.ir-error { color: #dc2626; }

/* ── Invoice Detail Modal ── */
.ir-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.ir-detail-modal {
  background: #fff;
  border-radius: 14px;
  width: 660px;
  max-width: 95vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 8px 40px rgba(0,0,0,0.22);
}
.ir-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid #f3f4f6;
}
.ir-detail-header-left { display: flex; align-items: center; gap: 12px; }
.ir-detail-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #1E4D6B;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ir-detail-title { font-size: 16px; font-weight: 700; color: #1a2035; }
.ir-detail-vendor { font-size: 13px; color: #6b7280; margin-top: 2px; }
.ir-detail-close {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.ir-detail-close:hover { background: #f3f4f6; color: #374151; }

/* Hero card */
.ir-detail-hero {
  background: #1E4D6B;
  margin: 0;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.ir-detail-hero-left {}
.ir-detail-hero-label { font-size: 11px; font-weight: 600; letter-spacing: 0.8px; color: rgba(255,255,255,0.65); text-transform: uppercase; margin-bottom: 4px; }
.ir-detail-hero-amount { font-size: 28px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
.ir-detail-hero-right { display: flex; align-items: center; gap: 0; }
.ir-detail-hero-stat { padding: 0 20px; text-align: center; }
.ir-detail-hero-stat-label { font-size: 11px; font-weight: 600; letter-spacing: 0.6px; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 4px; }
.ir-detail-hero-stat-val { font-size: 14px; font-weight: 600; color: #fff; }
.ir-detail-hero-divider { width: 1px; height: 36px; background: rgba(255,255,255,0.18); }

/* Grid cells */
.ir-detail-grid3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  border-bottom: 1px solid #f3f4f6;
}
.ir-detail-grid4 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  border-bottom: 1px solid #f3f4f6;
}
.ir-detail-grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid #f3f4f6;
}
.ir-detail-cell {
  padding: 14px 20px;
  border-right: 1px solid #f3f4f6;
}
.ir-detail-cell:last-child { border-right: none; }
.ir-detail-cell-label { font-size: 10px; font-weight: 700; letter-spacing: 0.7px; color: #9ca3af; text-transform: uppercase; margin-bottom: 5px; }
.ir-detail-cell-val { font-size: 13px; font-weight: 500; color: #1a2035; }
.ir-detail-mono { font-family: 'Courier New', monospace; font-size: 12px; color: #374151; }

/* Remark */
.ir-detail-remark-wrap { padding: 16px 24px 0; }
.ir-detail-remark {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 13px;
  resize: vertical;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  color: #374151;
  min-height: 60px;
}
.ir-detail-remark:focus { border-color: #1E4D6B; }

/* Detail action buttons */
.ir-detail-actions {
  display: flex;
  gap: 8px;
  padding: 16px 24px 20px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.ir-detail-btn-remark { background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; }
.ir-detail-btn-remark:hover { background: #e5e7eb; }
.ir-detail-btn-remark:disabled { opacity: 0.6; cursor: not-allowed; }
.ir-detail-btn-dispute { background: #d97706; color: #fff; }
.ir-detail-btn-dispute:hover { background: #b45309; }
.ir-detail-btn-dispute:disabled { opacity: 0.5; cursor: not-allowed; }
/* Dispute Remark Modal */
.ir-dispute-remark-modal {
  background: #fff;
  border-radius: 12px;
  width: 420px;
  max-width: 95vw;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
}
.ir-dispute-remark-header {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  color: #d97706;
  margin-bottom: 10px;
}
.ir-dispute-remark-header button { margin-left: auto; }
.ir-dispute-remark-desc {
  font-size: 13px;
  color: #6b7280;
  margin: 0 0 14px;
}
.ir-dispute-remark-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 14px;
}
.ir-detail-btn-reject { background: #dc2626; color: #fff; }
.ir-detail-btn-reject:hover { background: #b91c1c; }
.ir-detail-btn-approve { background: #059669; color: #fff; }
.ir-detail-btn-approve:hover { background: #047857; }
`

const IR_SHELL_CSS = `
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
  justify-content: space-between;
  padding: 14px 12px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.lx-logo-title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
}
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
  flex-shrink: 0;
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
.lx-nav-icon { font-size: 16px; flex-shrink: 0; display: flex; }
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
