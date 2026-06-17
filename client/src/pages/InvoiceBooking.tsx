/**
 * InvoiceBooking.tsx
 * Exact replica of APInvoiceBooking.jsx from finops-local.
 * CSS is embedded via a <style> tag (converted from APInvoiceBooking.module.css).
 * All logic, state, effects, sub-components are preserved 1:1.
 * API calls are routed through tRPC (ledgerX.invoiceInit, ledgerX.invoiceVendors,
 * ledgerX.invoiceSubmit, ledgerX.invoicePending, ledgerX.invoiceUpload).
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'

// ── Date format helper: yyyy-MM-dd → dd-MMM-yyyy ──────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function fmtDate(val: string): string {
  if (!val) return ''
  const [y, m, d] = val.split('-')
  if (!y || !m || !d) return val
  return `${d}-${MONTHS[parseInt(m, 10) - 1]}-${y}`
}

// ── Static dropdown data ──────────────────────────────────────────────────
const GST_AVAIL_OPTIONS = ['Yes', 'Yes-ISD', 'No', 'No-ITC']
const GST_TYPE_OPTIONS  = ['IGST', 'CGST+SGST']
const LDC_OPTIONS       = ['Yes', 'No']
const RCM_OPTIONS       = ['No', 'Yes']
const GST_REGISTERED_OPTIONS = ['Y', 'N']

// ── Empty form state ──────────────────────────────────────────────────────
const EMPTY_FORM = {
  geoType: 'Domestic',
  voucherType: '',
  invoiceType: 'Invoice',
  eInvoice: '',
  vendorCode: '',
  groupName: '',
  pnlHead: '',
  vendorName: '',
  vendorClassification: '',
  frequency: '',
  vendorGstin: '',
  vendorPan: '',
  vendorState: '',
  gstRegistered: 'Y',
  invoiceNo: '',
  creditNoteNo: '',
  serviceMonth: '',
  invoiceDate: '',
  dueDate: '',
  serviceStartDate: '',
  serviceEndDate: '',
  poRefNo: '',
  serviceDescription: '',
  expenseAmount1: '',
  expenseAmount2: '',
  useAmount1: true,
  useAmount2: false,
  invoiceAmountFCY: '',
  exchangeRate: '',
  invoiceAmountINR: '',
  grossedUp: 'No',
  grossedUpPercent: '',
  serviceValueGrossedUp: '',
  gstRate: '',
  gstType: 'AUTO',
  gstAvail: 'Yes',
  cgst: '',
  sgst: '',
  igst: '',
  cgstLedger: '',
  sgstLedger: '',
  igstLedger: '',
  tdsLedger: '',
  tdsOnAmount1: true,
  tdsOnAmount2: false,
  tdsRate: '',
  tdsAmount: '',
  ldcApplicability: '',
  tdsRateText: '',
  rcmApplicability: 'No',
  rcmRateText: '',
  rcmAmount: '',
  rcmCgstLedger: '',
  rcmSgstLedger: '',
  rcmIgstLedger: '',
  groupLedger: '',
  ledgerExpName: '',
  businessOwner: '',
  paymentStatus: '',
  paymentMode: '',
  netPayable: '',
  roundOff: '',
}

type FormState = typeof EMPTY_FORM

// ── Vendor type ───────────────────────────────────────────────────────────
interface Vendor {
  code: string
  name: string
  gstin: string
  pan: string
  state: string
  gstRegistered: string
  groupName: string
  pnlHead: string
  groupLedger: string
  tdsRate: string
  gstRate: string
  serviceDesc: string
  vendorType: string
  msmeStatus: string
}

// ── Simple field helpers ──────────────────────────────────────────────────
function Sel({ label, req, value, onChange, options, className, disabled }: {
  label: string; req?: boolean; value: string; onChange: (v: string) => void
  options: string[]; className?: string; disabled?: boolean
}) {
  return (
    <div className={`ib-field ${className || 'ib-flex1'}`}>
      <label className="ib-label">{label}{req && <span className="ib-req"> *</span>}</label>
      <select
        className="ib-select"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={disabled ? { background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' } : undefined}
      >
        <option value="">-- select --</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ── Searchable combobox ───────────────────────────────────────────────────
function SearchableSel({ label, req, value, onChange, options, className }: {
  label: string; req?: boolean; value: string; onChange: (v: string) => void
  options: string[]; className?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const filtered = query
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    if (value) onChange('')
    setOpen(true)
  }
  const handleSelect = (opt: string) => {
    onChange(opt)
    setQuery('')
    setOpen(false)
  }
  const handleFocus = () => setOpen(true)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div className={`ib-field ${className || 'ib-flex1'}`} ref={wrapRef} style={{ position: 'relative' }}>
      <label className="ib-label">{label}{req && <span className="ib-req"> *</span>}</label>
      <input
        className="ib-input"
        value={value || query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder="Search or select…"
        autoComplete="off"
      />
      {open && (
        <div className="ib-dropdown">
          {filtered.length === 0 && (
            <div className="ib-dropdown-item" style={{ color: '#9ca3af' }}>No results</div>
          )}
          {filtered.map(o => (
            <div key={o} className="ib-dropdown-item" onMouseDown={() => handleSelect(o)}>{o}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function Inp({ label, req, value, onChange, placeholder, type, readOnly, className }: {
  label: string; req?: boolean; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; readOnly?: boolean; className?: string
}) {
  return (
    <div className={`ib-field ${className || 'ib-flex1'}`}>
      <label className="ib-label">{label}{req && <span className="ib-req"> *</span>}</label>
      <input
        className={`ib-input${readOnly ? ' ib-ro' : ''}`}
        type={type || 'text'}
        value={value}
        onChange={readOnly ? undefined : (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder || ''}
        readOnly={readOnly}
      />
    </div>
  )
}

function Section({ title }: { title: string }) {
  return <div className="ib-section-head">{title}</div>
}

function AmountWithCheckbox({ label, req, checked, onCheck, value, onChange }: {
  label: string; req?: boolean; checked: boolean; onCheck: (v: boolean) => void
  value: string; onChange: (v: string) => void
}) {
  return (
    <div className="ib-amount-field">
      <label className="ib-label">{label}{req && <span className="ib-req"> *</span>}</label>
      <div className="ib-amount-input-row">
        <input
          type="checkbox"
          className="ib-amount-checkbox"
          checked={checked}
          onChange={e => onCheck(e.target.checked)}
        />
        <input
          className="ib-input"
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="0.00"
          style={{ flex: 1 }}
        />
      </div>
    </div>
  )
}

// ── Vendor search combobox ────────────────────────────────────────────────
function VendorSearch({ vendorCode, vendorName, onSelect }: {
  vendorCode: string; vendorName: string; onSelect: (v: Vendor | null) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayValue = vendorCode ? `${vendorCode} - ${vendorName}` : query
  const vendorSearchMutation = trpc.ledgerX.invoiceVendors.useMutation()

  const search = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const d = await vendorSearchMutation.mutateAsync({ q, limit: 50 })
      if (d.ok) setResults((d.vendors as Vendor[]) || [])
      else setResults([])
    } catch (_) {
      setResults([])
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    if (vendorCode) onSelect(null)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 300)
  }
  const handleFocus = () => {
    setOpen(true)
    if (!vendorCode && results.length === 0) search(query)
  }
  const handleSelect = (v: Vendor) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    onSelect(v)
    setQuery('')
    setOpen(false)
  }
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
  return (
    <div className="ib-field ib-flex1" ref={wrapRef} style={{ position: 'relative' }}>
      <label className="ib-label">Vendor Code <span className="ib-req">*</span></label>
      <input
        className="ib-input"
        value={vendorCode ? displayValue : query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder="Search by code or name…"
        autoComplete="off"
      />
      {open && (
        <div className="ib-dropdown">
          {loading && <div className="ib-dropdown-item" style={{ color: '#9ca3af' }}>Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="ib-dropdown-item" style={{ color: '#9ca3af' }}>No vendors found</div>
          )}
          {!loading && results.map((v, i) => (
            <div
              key={`${v.code}-${i}`}
              className="ib-dropdown-item"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleSelect(v) }}
            >
              <strong>{v.code}</strong> — {v.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────
// ── Sidebar icons (same as LedgerXDashboard) ────────────────────────────
function DashboardIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
}
function BookInvoiceIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/><line x1="9" y1="9" x2="11" y2="9"/></svg>
}
function DPInvoiceIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
}
function RegisterIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
}
function TallyEntryIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
}
function AgingIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
}
function ChevronLeftIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
}
function ChevronRightIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
}
function HomeSmallIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
}
const IB_NAV = [
  { id: 'dashboard',          label: 'AP Dashboard',       icon: <DashboardIcon /> },
  { id: 'ap-invoice-booking', label: 'Invoice Booking',    icon: <BookInvoiceIcon /> },
  { id: 'dp-invoice-booking', label: 'DP Invoice Booking', icon: <DPInvoiceIcon /> },
  { id: 'invoice-register',   label: 'Invoice Register',   icon: <RegisterIcon /> },
  { id: 'tally-entry',        label: 'Tally Entry',        icon: <TallyEntryIcon /> },
  { id: 'aging-analysis',     label: 'Aging Analysis',     icon: <AgingIcon /> },
]

export default function InvoiceBooking() {
  const [, navigate] = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const handleSidebarNav = useCallback((id: string) => {
    if (id === 'ap-invoice-booking') return
    if (id === 'home') { navigate('/ledgerx'); return }
    if (id === 'dashboard') { navigate('/ledgerx/dashboard'); return }
    toast.info('Feature coming soon')
  }, [navigate])
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [mastersOpts, setMastersOpts] = useState({
    tdsLedgers: [] as string[],
    cgstLedgers: [] as string[],
    sgstLedgers: [] as string[],
    igstLedgers: [] as string[],
    eInvoice: [] as string[],
    vendorClassification: [] as string[],
    frequency: [] as string[],
    serviceMonth: [] as string[],
    geoType: [] as string[],
    voucherType: [] as string[],
    invoiceType: [] as string[],
    groupLedger: [] as string[],
    ledgerExpName: [] as string[],
    businessOwner: [] as string[],
    paymentStatus: [] as string[],
    paymentMode: [] as string[],
    rcmCgstLedgers: [] as string[],
    rcmSgstLedgers: [] as string[],
    rcmIgstLedgers: [] as string[],
  })
  const [previewWidth, setPreviewWidth] = useState(580)

  // ── Fetch Masters dropdown options on mount ──────────────────────────
  const initQuery = trpc.ledgerX.invoiceInit.useQuery(undefined, { staleTime: 5 * 60 * 1000 })
  useEffect(() => {
    if (!initQuery.data?.ok) return
    const d = initQuery.data as any
    setMastersOpts({
      tdsLedgers: d.tdsLedgers || [],
      cgstLedgers: d.cgstLedgers || [],
      sgstLedgers: d.sgstLedgers || [],
      igstLedgers: d.igstLedgers || [],
      eInvoice: d.eInvoiceOptions || [],
      vendorClassification: d.vendorClassificationOptions || [],
      frequency: d.frequencyOptions || [],
      serviceMonth: d.serviceMonthOptions || [],
      geoType: d.geoTypeOptions || [],
      voucherType: d.voucherTypeOptions || [],
      invoiceType: d.invoiceTypeOptions || [],
      groupLedger: d.groupLedgerOptions || [],
      ledgerExpName: d.ledgerExpNameOptions || [],
      businessOwner: d.businessOwnerOptions || [],
      paymentStatus: d.paymentStatusOptions || [],
      paymentMode: d.paymentModeOptions || [],
      rcmCgstLedgers: d.rcmCgstLedgers || [],
      rcmSgstLedgers: d.rcmSgstLedgers || [],
      rcmIgstLedgers: d.rcmIgstLedgers || [],
    })
  }, [initQuery.data])

  const startPanelResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = previewWidth
    const onMove = (e: MouseEvent) => {
      const w = Math.max(280, Math.min(900, startW + e.clientX - startX))
      setPreviewWidth(w)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [previewWidth])

  const [, setInvoiceFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileId, setFileId] = useState('')
  const [fileLink, setFileLink] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null)
  const [pendingFileName, setPendingFileName] = useState<string | null>(null)
  const [isLoadingPending, setIsLoadingPending] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState<{ type: string; text: string } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const f = (key: keyof FormState, val: any) => setForm(prev => ({ ...prev, [key]: val }))

  // tRPC mutations
  const uploadMutation = trpc.ledgerX.invoiceUpload.useMutation()
  const submitMutation = trpc.ledgerX.invoiceSubmit.useMutation()
  const pendingMutation = trpc.ledgerX.invoicePending.useMutation()

  // ── Load next pending invoice from Drive queue ────────────────────────
  const loadNextPending = useCallback(async () => {
    setIsLoadingPending(true)
    try {
      const d = await pendingMutation.mutateAsync({})
      if (d.ok && d.file) {
        setPreviewUrl(d.file.previewUrl)
        setFileId(d.file.id)
        setFileLink(d.file.fileLink)
        setPendingSourceId(d.file.id)
        setPendingFileName(d.file.name)
      } else {
        setPreviewUrl(null)
        setFileId('')
        setFileLink('')
        setPendingSourceId(null)
        setPendingFileName(null)
      }
    } catch (_) {}
    finally { setIsLoadingPending(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load first pending invoice on mount
  useEffect(() => { loadNextPending() }, [loadNextPending])

  const isCreditNote = form.invoiceType === 'Credit Note'

  // ── Auto-set Vendor Classification for International ─────────────────
  useEffect(() => {
    if (form.geoType === 'International') {
      setForm(prev => ({ ...prev, vendorClassification: 'Foreign Vendor' }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.geoType])

  // ── Service Value (Grossed Up INR) = INR × 100 / (100 – Grossed Up %) ───
  useEffect(() => {
    if (form.grossedUp !== 'Yes') {
      setForm(prev => ({ ...prev, serviceValueGrossedUp: '' }))
      return
    }
    const inr = parseFloat(form.invoiceAmountINR) || 0
    const pct = parseFloat(form.grossedUpPercent) || 0
    const denom = 100 - pct
    const gross = denom > 0 ? Math.round((inr * 100 / denom) * 100) / 100 : 0
    setForm(prev => ({ ...prev, serviceValueGrossedUp: gross ? String(gross) : '' }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.grossedUp, form.grossedUpPercent, form.invoiceAmountINR])

  // ── Invoice Amount INR = FCY × Exchange Rate (International only) ────────
  useEffect(() => {
    const fcy = parseFloat(form.invoiceAmountFCY) || 0
    const rate = parseFloat(form.exchangeRate) || 0
    const inr = Math.round(fcy * rate * 100) / 100
    setForm(prev => ({ ...prev, invoiceAmountINR: inr ? String(inr) : '' }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.invoiceAmountFCY, form.exchangeRate])

  // ── Taxable base = sum of checked expense amounts ────────────────────────
  const taxableBase = (form.useAmount1 ? parseFloat(form.expenseAmount1) || 0 : 0)
                    + (form.useAmount2 ? parseFloat(form.expenseAmount2) || 0 : 0)

  // ── GST auto-calculation ────────────────────────────────────────────────
  useEffect(() => {
    const rate = parseFloat(form.gstRate) || 0
    const base = (form.useAmount1 ? parseFloat(form.expenseAmount1) || 0 : 0)
               + (form.useAmount2 ? parseFloat(form.expenseAmount2) || 0 : 0)
    const totalGst = Math.round(base * rate * 100) / 10000
    let cgst = 0, sgst = 0, igst = 0
    if (form.gstType === 'IGST') {
      igst = totalGst
    } else {
      cgst = Math.round(totalGst / 2 * 100) / 100
      sgst = Math.round(totalGst / 2 * 100) / 100
    }
    setForm(prev => ({
      ...prev,
      cgst: cgst ? String(cgst) : '',
      sgst: sgst ? String(sgst) : '',
      igst: igst ? String(igst) : '',
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.gstRate, form.gstType, form.expenseAmount1, form.expenseAmount2, form.useAmount1, form.useAmount2])

  // ── TDS auto-calculation ────────────────────────────────────────────────
  useEffect(() => {
    const rate = parseFloat(form.tdsRate) || 0
    const isIntl = form.geoType === 'International'
    const base = isIntl
      ? (form.grossedUp === 'Yes'
          ? (parseFloat(form.serviceValueGrossedUp) || 0)
          : (parseFloat(form.invoiceAmountINR) || 0))
      : (form.tdsOnAmount1 ? parseFloat(form.expenseAmount1) || 0 : 0)
        + (form.tdsOnAmount2 ? parseFloat(form.expenseAmount2) || 0 : 0)
    const tds = Math.round(base * rate * 100) / 10000
    setForm(prev => ({ ...prev, tdsAmount: tds ? String(tds) : '' }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.geoType, form.grossedUp, form.serviceValueGrossedUp, form.invoiceAmountINR, form.expenseAmount1, form.expenseAmount2, form.tdsOnAmount1, form.tdsOnAmount2, form.tdsRate])

  // ── RCM Amount auto-calculation ─────────────────────────────────────────
  useEffect(() => {
    const isIntl = form.geoType === 'International'
    const base = isIntl
      ? (parseFloat(form.invoiceAmountINR) || 0)
      : (form.useAmount1 ? parseFloat(form.expenseAmount1) || 0 : 0)
        + (form.useAmount2 ? parseFloat(form.expenseAmount2) || 0 : 0)
    const rcmPct = parseFloat(form.rcmRateText) || 0
    const rcmAmt = Math.round(base * rcmPct) / 100
    setForm(prev => ({ ...prev, rcmAmount: String(rcmAmt) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.geoType, form.invoiceAmountINR, form.expenseAmount1, form.expenseAmount2, form.useAmount1, form.useAmount2, form.rcmRateText])

  // ── Net Payable + Round Off auto-calculation ─────────────────────────────
  useEffect(() => {
    const tds = parseFloat(form.tdsAmount) || 0
    let rawNet: number
    if (form.geoType === 'International') {
      const base = form.grossedUp === 'Yes'
        ? (parseFloat(form.serviceValueGrossedUp) || 0)
        : (parseFloat(form.invoiceAmountINR) || 0)
      rawNet = Math.round((base - tds) * 100) / 100
    } else {
      const base = (parseFloat(form.expenseAmount1) || 0)
                 + (parseFloat(form.expenseAmount2) || 0)
      const cgst = parseFloat(form.cgst) || 0
      const sgst = parseFloat(form.sgst) || 0
      const igst = parseFloat(form.igst) || 0
      rawNet = Math.round((base + cgst + sgst + igst - tds) * 100) / 100
    }
    const rounded  = Math.round(rawNet)
    const roundOff = Math.round((rounded - rawNet) * 100) / 100
    setForm(prev => ({ ...prev, netPayable: String(rounded), roundOff: String(roundOff) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.geoType, form.grossedUp, form.serviceValueGrossedUp, form.invoiceAmountINR, form.expenseAmount1, form.expenseAmount2, form.useAmount1, form.useAmount2, form.cgst, form.sgst, form.igst, form.tdsAmount])

  // ── Vendor selection handler ────────────────────────────────────────────
  const handleVendorSelect = (v: Vendor | null) => {
    if (!v) {
      setForm(prev => ({ ...prev, vendorCode: '', groupName: '', pnlHead: '', vendorName: '', vendorGstin: '', vendorPan: '', vendorState: '', gstRegistered: 'Y' }))
      return
    }
    setForm(prev => ({
      ...prev,
      vendorCode: v.code,
      groupName: v.groupName || '',
      pnlHead: v.pnlHead || '',
      vendorName: v.name,
      vendorGstin: v.gstin || '',
      vendorPan: v.pan || '',
      vendorState: v.state || '',
      gstRegistered: v.gstRegistered || 'Y',
    }))
  }

  // ── File upload ─────────────────────────────────────────────────────────
  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setInvoiceFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setFileId(''); setFileLink('')
    setPendingSourceId(null); setPendingFileName(null)
    setIsUploading(true)
    try {
      // Convert file to base64 for tRPC transport
      const arrayBuffer = await file.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      const d = await uploadMutation.mutateAsync({
        fileName: file.name,
        mimeType: file.type,
        base64,
      })
      if (d.ok && 'fileId' in d) { setFileId((d as any).fileId || ''); setFileLink((d as any).fileLink || '') }
    } catch (_) {}
    finally { setIsUploading(false) }
  }

  const onClear = () => {
    setInvoiceFile(null); setPreviewUrl(null); setFileId(''); setFileLink('')
    setPendingSourceId(null); setPendingFileName(null)
  }

  const onReset = () => {
    setForm({ ...EMPTY_FORM })
    setFormError(null); setSubmitMsg(null)
  }

  // ── Submit ──────────────────────────────────────────────────────────────
  const onSubmit = async () => {
    setFormError(null)
    setIsSubmitting(true)
    try {
      const d = await submitMutation.mutateAsync({
        vendor: {
          code: form.vendorCode,
          name: form.vendorName,
          gstin: form.vendorGstin,
          pan: form.vendorPan,
          state: form.vendorState,
          gstRegistered: form.gstRegistered,
        },
        invoice: {
          geoType: form.geoType,
          voucherType: form.voucherType,
          invoiceType: form.invoiceType,
          eInvoice: form.eInvoice,
          groupName: form.groupName,
          pnlHead: form.pnlHead,
          vendorClassification: form.vendorClassification,
          frequency: form.frequency,
          creditNoteNo: form.creditNoteNo,
          invoiceNo: form.invoiceNo,
          invoiceDate: fmtDate(form.invoiceDate),
          dueDate: fmtDate(form.dueDate),
          serviceStartDate: fmtDate(form.serviceStartDate),
          serviceEndDate: fmtDate(form.serviceEndDate),
          poRefNo: form.poRefNo,
          serviceMonth: form.serviceMonth,
          serviceDescription: form.serviceDescription,
          expenseAmount1: form.geoType === 'International'
            ? (parseFloat(form.invoiceAmountINR) || 0)
            : (parseFloat(form.expenseAmount1) || 0),
          expenseAmount2: parseFloat(form.expenseAmount2) || 0,
          invoiceAmountFCY: parseFloat(form.invoiceAmountFCY) || 0,
          exchangeRate: parseFloat(form.exchangeRate) || 0,
          invoiceAmountINR: parseFloat(form.invoiceAmountINR) || 0,
          grossedUp: form.grossedUp || 'No',
          grossedUpPercent: parseFloat(form.grossedUpPercent) || 0,
          serviceValueGrossedUp: parseFloat(form.serviceValueGrossedUp) || 0,
          taxableAmount: form.geoType === 'International'
            ? (parseFloat(form.invoiceAmountINR) || 0)
            : taxableBase,
          gstPercent: parseFloat(form.gstRate) || 0,
          gstType: form.gstType,
          gstAvail: form.gstAvail,
          cgstLedger: form.cgstLedger,
          sgstLedger: form.sgstLedger,
          igstLedger: form.igstLedger,
          tdsLedger: form.tdsLedger,
          tdsPercent: parseFloat(form.tdsRate) || 0,
          tdsOnAmount1: form.tdsOnAmount1,
          tdsOnAmount2: form.tdsOnAmount2,
          ldcApplicability: form.ldcApplicability,
          tdsRateText: form.tdsRateText,
          rcmApplicability: form.rcmApplicability,
          rcmRateText: form.rcmRateText,
          rcmAmount: parseFloat(form.rcmAmount) || 0,
          rcmCgstLedger: form.rcmCgstLedger,
          rcmSgstLedger: form.rcmSgstLedger,
          rcmIgstLedger: form.rcmIgstLedger,
          cgst: parseFloat(form.cgst) || 0,
          sgst: parseFloat(form.sgst) || 0,
          igst: parseFloat(form.igst) || 0,
          tdsAmount: parseFloat(form.tdsAmount) || 0,
          netPayable: parseFloat(form.netPayable) || 0,
          roundOff: parseFloat(form.roundOff) || 0,
          ledgerExpName: form.ledgerExpName,
          businessOwner: form.businessOwner,
          paymentStatus: form.paymentStatus,
          paymentMode: form.paymentMode,
          groupLedger: form.groupLedger,
          fileId,
          fileLink,
        },
        userEmail: 'local@finops.app',
        pendingFileId: pendingSourceId || '',
      })
      if (d.ok) {
        setSubmitMsg({ type: 'success', text: d.message || 'Invoice submitted successfully.' })
        setForm({ ...EMPTY_FORM })
        setFormError(null)
        loadNextPending()
      } else {
        setFormError(d.message || 'Submission failed')
      }
    } catch (e: any) { setFormError(e.message) }
    finally { setIsSubmitting(false) }
  }

  return (
    <>
      <style>{IB_CSS}</style>
      <style dangerouslySetInnerHTML={{ __html: IB_SHELL_CSS }} />
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
            {IB_NAV.map(item => (
              <button
                key={item.id}
                className={`lx-nav-item${item.id === 'ap-invoice-booking' ? ' lx-active' : ''}`}
                onClick={() => handleSidebarNav(item.id)}
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
              onClick={() => handleSidebarNav('home')}
              title="Home"
            >
              <HomeSmallIcon />
            </button>
          </div>
        </aside>
        {/* ── Main content ── */}
        <div className="ib-page">
        <div className="ib-page-header">
          <div>
            <h1 className="ib-page-title">Invoice Booking</h1>
            <p className="ib-page-subtitle">Book AP invoices — fill details or upload a PDF to auto-populate</p>
          </div>
        </div>
        {submitMsg?.type === 'success' && (
          <div className="ib-success-banner">
            ✓ {submitMsg.text}
            <button className="ib-banner-close" onClick={() => setSubmitMsg(null)}>✕</button>
          </div>
        )}
        <div className="ib-panels">
          {/* ── Left: Invoice Preview ── */}
          <div className="ib-left-panel" style={{ width: previewWidth, flex: `0 0 ${previewWidth}px` }}>
            <div className="ib-panel-head-blue">
              <div>
                <h2 className="ib-panel-title-white">Invoice Preview</h2>
                <p className="ib-panel-sub-white">Upload PDF/Image. Select &amp; copy text directly from the preview into fields.</p>
              </div>
              <button className="ib-clear-btn" onClick={onClear}>Clear</button>
            </div>
            <label className="ib-file-label">Upload Invoice PDF / Image</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={onFileChange} className="ib-file-input" />
            {isUploading && <p className="ib-uploading-msg">Uploading to Drive…</p>}
            {isLoadingPending && <p className="ib-uploading-msg">Loading from Pending Invoices…</p>}
            {pendingFileName && !isLoadingPending && (
              <p className="ib-uploading-msg" style={{ color: '#2563eb' }}>
                📄 {pendingFileName}
              </p>
            )}
            {fileLink && !pendingSourceId && <p className="ib-file-link"><a href={fileLink} target="_blank" rel="noreferrer">View in Drive ↗</a></p>}
            {fileLink && pendingSourceId && <p className="ib-file-link"><a href={fileLink} target="_blank" rel="noreferrer">Open in Drive ↗</a></p>}
            <div className="ib-preview-box">
              {previewUrl
                ? <iframe src={previewUrl} title="Invoice preview" className="ib-preview-iframe" />
                : !isLoadingPending && <p className="ib-no-file">No pending invoices.</p>
              }
            </div>
          </div>
          {/* ── Resize handle ── */}
          <div className="ib-panel-handle" onMouseDown={startPanelResize} title="Drag to resize" />
          {/* ── Right: Entry Form ── */}
          <div className="ib-right-panel">
            <div className="ib-panel-head">
              <div className="ib-geo-nav" style={{ flex: 1 }}>
                {['Domestic', 'International'].map(geo => (
                  <button
                    key={geo}
                    className={`ib-geo-nav-btn${form.geoType === geo ? ' ib-geo-nav-btn-active' : ''}`}
                    onClick={() => f('geoType', geo)}
                    type="button"
                  >
                    {geo}
                  </button>
                ))}
              </div>
              <button className="ib-reset-btn" onClick={onReset}>Reset</button>
            </div>
            {/* ══════════════════════════════════════════════════════════ */}
            {/* Card 1: Invoice & Vendor Info                           */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div className="ib-card">
              <div className="ib-card-header">
                <span className="ib-card-badge">1</span>
                <span className="ib-card-title">Invoice &amp; Vendor Info</span>
              </div>
              <Section title="Voucher & Invoice Type" />
              <div className="ib-section-block">
                <div className="ib-row">
                  <Sel label="Voucher Type" req value={form.voucherType} onChange={v => f('voucherType', v)} options={mastersOpts.voucherType} />
                  <Sel label="Invoice Type" req value={form.invoiceType} onChange={v => f('invoiceType', v)} options={mastersOpts.invoiceType} />
                  <Sel label="E-Invoice" value={form.eInvoice} onChange={v => f('eInvoice', v)} options={mastersOpts.eInvoice} />
                </div>
              </div>
              <Section title="Vendor Information" />
              <div className="ib-section-block">
                <div className="ib-row">
                  <VendorSearch
                    vendorCode={form.vendorCode}
                    vendorName={form.vendorName}
                    onSelect={handleVendorSelect}
                  />
                  <Inp
                    label="Group Name"
                    value={form.groupName}
                    onChange={v => f('groupName', v)}
                    placeholder="Auto-filled on vendor select"
                    readOnly={!!form.vendorCode}
                  />
                  <Inp
                    label="Vendor Name"
                    value={form.vendorName}
                    onChange={v => f('vendorName', v)}
                    placeholder="Auto-filled on vendor select"
                    readOnly={!!form.vendorCode}
                  />
                </div>
                <div className="ib-row">
                  <Inp
                    label="PNL Head"
                    value={form.pnlHead}
                    onChange={v => f('pnlHead', v)}
                    placeholder="Auto-filled on vendor select"
                    readOnly={!!form.vendorCode}
                  />
                  <Sel label="Vendor Classification" value={form.vendorClassification} onChange={v => f('vendorClassification', v)} options={mastersOpts.vendorClassification} />
                  <Sel label="Frequency" value={form.frequency} onChange={v => f('frequency', v)} options={mastersOpts.frequency} />
                </div>
                <div className="ib-row">
                  <Inp label="Vendor GSTIN" value={form.vendorGstin} onChange={v => f('vendorGstin', v)} placeholder="27AABCF1234A1Z5" readOnly={!!form.vendorCode} />
                  <Inp label="Vendor PAN" value={form.vendorPan} onChange={v => f('vendorPan', v)} placeholder="AABCF1234A" readOnly={!!form.vendorCode} />
                  <Sel label="State Code" value={form.vendorState} onChange={v => f('vendorState', v)} options={['MH', 'UP']} />
                  <Sel label="GST Registered" req value={form.gstRegistered} onChange={v => f('gstRegistered', v)} options={GST_REGISTERED_OPTIONS} />
                </div>
              </div>
              <Section title="Invoice Reference" />
              <div className="ib-section-block">
                <div className="ib-row">
                  <Inp
                    label={isCreditNote ? 'Original Invoice No' : 'Invoice No'}
                    req
                    value={form.invoiceNo}
                    onChange={v => f('invoiceNo', v)}
                    placeholder="e.g. INV-0163"
                    className="ib-flex2"
                  />
                  <Inp label="PO Reference No" value={form.poRefNo} onChange={v => f('poRefNo', v)} placeholder="optional" className="ib-flex2" />
                  <Inp
                    label="Credit Note No"
                    value={form.creditNoteNo}
                    onChange={v => f('creditNoteNo', v)}
                    placeholder="e.g. CN-001"
                    className="ib-flex2"
                  />
                </div>
                <div className="ib-row">
                  <Inp label="Invoice Date" req value={form.invoiceDate} onChange={v => f('invoiceDate', v)} type="date" />
                  <Inp label="Service Start Date" value={form.serviceStartDate} onChange={v => f('serviceStartDate', v)} type="date" />
                  <Inp label="Service End Date" value={form.serviceEndDate} onChange={v => f('serviceEndDate', v)} type="date" />
                  <Sel label="Service Month" value={form.serviceMonth} onChange={v => f('serviceMonth', v)} options={mastersOpts.serviceMonth} />
                </div>
                <div className="ib-row">
                  <Inp label="Service Description" value={form.serviceDescription} onChange={v => f('serviceDescription', v)} className="ib-flex2" />
                </div>
              </div>
            </div>
            {/* ══════════════════════════════════════════════════════════ */}
            {/* Card 2: Amount GST & Deductions                          */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div className="ib-card">
              <div className="ib-card-header">
                <span className="ib-card-badge">2</span>
                <span className="ib-card-title">Amount GST &amp; Deductions</span>
              </div>
              {form.geoType === 'International' ? (<>
                <Section title="Invoice Amount" />
                <div className="ib-section-block">
                  <div className="ib-row">
                    <Inp label="Invoice Amount (FCY)" req value={form.invoiceAmountFCY} onChange={v => f('invoiceAmountFCY', v)} placeholder="0.00" type="number" />
                    <Inp label="Exchange Rate" req value={form.exchangeRate} onChange={v => f('exchangeRate', v)} placeholder="e.g. 84.5" type="number" />
                    <Inp label="Invoice Amount (INR)" value={form.invoiceAmountINR} onChange={() => {}} readOnly placeholder="Auto-calculated" type="number" />
                  </div>
                  <div className="ib-row">
                    <Sel label="Grossed Up" value={form.grossedUp} onChange={v => f('grossedUp', v)} options={['Yes', 'No']} />
                    <Inp label="Grossed Up %" value={form.grossedUpPercent} onChange={v => f('grossedUpPercent', v)} placeholder="e.g. 20.80" type="number" readOnly={form.grossedUp !== 'Yes'} />
                    <Inp label="Service Value (Grossed Up INR)" value={form.serviceValueGrossedUp} onChange={() => {}} readOnly placeholder="Auto-calculated" type="number" />
                  </div>
                </div>
              </>) : (<>
                <Section title="Amounts & GST" />
                <div className="ib-section-block">
                  <div className="ib-row">
                    <AmountWithCheckbox
                      label="Expense Amount 1"
                      req
                      checked={form.useAmount1}
                      onCheck={v => f('useAmount1', v)}
                      value={form.expenseAmount1}
                      onChange={v => f('expenseAmount1', v)}
                    />
                    <AmountWithCheckbox
                      label="Expense Amount 2"
                      checked={form.useAmount2}
                      onCheck={v => f('useAmount2', v)}
                      value={form.expenseAmount2}
                      onChange={v => f('expenseAmount2', v)}
                    />
                  </div>
                  <div className="ib-row">
                    <Inp label="GST Rate %" value={form.gstRate} onChange={v => f('gstRate', v)} placeholder="e.g. 18" type="number" />
                    <Sel label="GST Type" value={form.gstType} onChange={v => f('gstType', v)} options={['AUTO', ...GST_TYPE_OPTIONS]} />
                    <Sel label="GST Avail" value={form.gstAvail} onChange={v => f('gstAvail', v)} options={GST_AVAIL_OPTIONS} />
                  </div>
                  <div className="ib-row">
                    <Inp label="CGST" value={form.cgst} onChange={() => {}} readOnly type="number" />
                    <Inp label="SGST" value={form.sgst} onChange={() => {}} readOnly type="number" />
                    <Inp label="IGST" value={form.igst} onChange={() => {}} readOnly type="number" />
                  </div>
                  <div className="ib-row">
                    <Sel label="CGST Ledger" value={form.cgstLedger} onChange={v => f('cgstLedger', v)} options={mastersOpts.cgstLedgers} />
                    <Sel label="SGST Ledger" value={form.sgstLedger} onChange={v => f('sgstLedger', v)} options={mastersOpts.sgstLedgers} />
                    <Sel label="IGST Ledger" value={form.igstLedger} onChange={v => f('igstLedger', v)} options={mastersOpts.igstLedgers} />
                  </div>
                </div>
              </>)}
              <Section title="TDS Details" />
              <div className="ib-section-block">
                <div className="ib-row">
                  <Sel label="TDS Ledger" value={form.tdsLedger} onChange={v => f('tdsLedger', v)} options={mastersOpts.tdsLedgers} />
                  <Inp label="TDS Rate %" value={form.tdsRate} onChange={v => f('tdsRate', v)} placeholder="e.g. 10" type="number" />
                  {form.geoType !== 'International' && (
                    <div className="ib-field ib-flex1">
                      <label className="ib-label">TDS Applied On</label>
                      <div style={{ display: 'flex', gap: '16px', height: '36px', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.86rem', cursor: 'pointer' }}>
                          <input type="checkbox" className="ib-amount-checkbox" checked={form.tdsOnAmount1} onChange={e => f('tdsOnAmount1', e.target.checked)} />
                          Exp Amt 1
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.86rem', cursor: 'pointer' }}>
                          <input type="checkbox" className="ib-amount-checkbox" checked={form.tdsOnAmount2} onChange={e => f('tdsOnAmount2', e.target.checked)} />
                          Exp Amt 2
                        </label>
                      </div>
                    </div>
                  )}
                </div>
                <div className="ib-row">
                  <Sel label="LDC Applicability" value={form.ldcApplicability} onChange={v => f('ldcApplicability', v)} options={LDC_OPTIONS} />
                  <Inp label="TDS Amount" value={form.tdsAmount} onChange={() => {}} readOnly type="number" />
                  <div className="ib-field ib-flex1">
                    <label className="ib-label">Net Payable</label>
                    <input className="ib-input ib-net-payable" value={form.netPayable} readOnly type="number" />
                  </div>
                  <div className="ib-field ib-flex1">
                    <label className="ib-label">Round Off</label>
                    <input className="ib-input ib-net-payable" value={form.roundOff} readOnly type="number" />
                  </div>
                </div>
              </div>
              <Section title="RCM Details" />
              <div className="ib-section-block">
                <div className="ib-row">
                  <Sel label="RCM Applicability" value={form.rcmApplicability} onChange={v => f('rcmApplicability', v)} options={RCM_OPTIONS} />
                  <Inp label="RCM Rate %" value={form.rcmRateText} onChange={v => f('rcmRateText', v)} placeholder="e.g. 18" type="number" />
                  <Inp label="RCM Amount" value={form.rcmAmount} onChange={() => {}} readOnly type="number" />
                </div>
                <div className="ib-row">
                  <Sel label="RCM CGST Ledger" value={form.rcmCgstLedger} onChange={v => f('rcmCgstLedger', v)} options={mastersOpts.rcmCgstLedgers} />
                  <Sel label="RCM SGST Ledger" value={form.rcmSgstLedger} onChange={v => f('rcmSgstLedger', v)} options={mastersOpts.rcmSgstLedgers} />
                  <Sel label="RCM IGST Ledger" value={form.rcmIgstLedger} onChange={v => f('rcmIgstLedger', v)} options={mastersOpts.rcmIgstLedgers} />
                </div>
              </div>
            </div>
            {/* ══════════════════════════════════════════════════════════ */}
            {/* Card 3: Ledger Mapping & Workflow                        */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div className="ib-card">
              <div className="ib-card-header">
                <span className="ib-card-badge">3</span>
                <span className="ib-card-title">Ledger Mapping &amp; Workflow</span>
              </div>
              <Section title="Classification" />
              <div className="ib-section-block">
                <div className="ib-row">
                  <SearchableSel label="Group Ledger" value={form.groupLedger} onChange={v => f('groupLedger', v)} options={mastersOpts.groupLedger} />
                  <SearchableSel label="Ledger Exp Name" value={form.ledgerExpName} onChange={v => f('ledgerExpName', v)} options={mastersOpts.ledgerExpName} />
                  <SearchableSel label="Business Owner Approval" value={form.businessOwner} onChange={v => f('businessOwner', v)} options={mastersOpts.businessOwner} />
                </div>
                <div className="ib-row">
                  <SearchableSel label="Payment Status" value={form.paymentStatus} onChange={v => f('paymentStatus', v)} options={mastersOpts.paymentStatus} />
                  <SearchableSel label="Payment Mode" value={form.paymentMode} onChange={v => f('paymentMode', v)} options={mastersOpts.paymentMode} />
                </div>
              </div>
              <Section title="File & Summary" />
              <div className="ib-section-block">
                <div className="ib-row">
                  <Inp label="Invoice File Link" value={fileLink || ''} onChange={() => {}} readOnly placeholder="Auto-populated after upload" className="ib-flex2" />
                </div>
              </div>
            </div>
            {formError && <div className="ib-error-box">⚠ {formError}</div>}
            <button className="ib-submit-btn" onClick={onSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting…' : '▶  Submit Invoice'}
            </button>
           </div>
        </div>
        </div>
      </div>
    </>
  )
}
// ── Embedded CSS (converted from APInvoiceBooking.module.css) ─────────────
const IB_CSS = `
.ib-page {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  padding: 22px 0 0 24px;
  box-sizing: border-box;
}
.ib-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.ib-page-title {
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: #1E4D6B;
}
.ib-page-subtitle {
  font-size: 0.84rem;
  color: #6b7280;
  margin-top: 4px;
}
.ib-success-banner {
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 0.87rem;
  color: #15803d;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ib-banner-close {
  background: none;
  border: none;
  color: #15803d;
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0 4px;
}
.ib-panels {
  display: flex;
  gap: 20px;
  align-items: stretch;
  flex: 1;
  min-height: 0;
}
.ib-left-panel,
.ib-right-panel {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ib-left-panel {
  min-width: 280px;
  max-width: 900px;
  flex-shrink: 0;
  overflow-y: auto;
  border-radius: 12px;
}
.ib-panel-handle {
  width: 6px;
  align-self: stretch;
  flex-shrink: 0;
  cursor: col-resize;
  border-radius: 3px;
  background: transparent;
  transition: background 0.15s;
  position: relative;
  z-index: 10;
}
.ib-panel-handle:hover,
.ib-panel-handle:active {
  background: #a8c4d4;
}
.ib-right-panel {
  flex: 1;
  min-width: 0;
  gap: 20px;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  border-right: none;
  border-radius: 12px 0 0 12px;
}
.ib-right-panel::-webkit-scrollbar { display: none; }
.ib-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: linear-gradient(135deg, #1E4D6B 0%, #153650 100%);
  margin: -24px -24px 16px -24px;
  padding: 12px 16px;
  border-radius: 12px 12px 0 0;
}
.ib-panel-head-blue {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: linear-gradient(135deg, #1E4D6B 0%, #153650 100%);
  margin: -24px -24px 0 -24px;
  padding: 14px 20px;
  border-radius: 12px 12px 0 0;
}
.ib-panel-title-white {
  font-size: 1rem;
  font-weight: 700;
  color: #ffffff;
}
.ib-panel-sub-white {
  font-size: 0.78rem;
  color: rgba(255,255,255,0.75);
  margin-top: 2px;
  line-height: 1.4;
}
.ib-clear-btn {
  flex-shrink: 0;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.4);
  border-radius: 7px;
  padding: 6px 14px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: background 0.15s;
}
.ib-clear-btn:hover { background: rgba(255,255,255,0.25); }
.ib-reset-btn {
  flex-shrink: 0;
  background: #1E4D6B;
  border: 1px solid #174060;
  border-radius: 7px;
  padding: 6px 14px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #ffffff;
  cursor: pointer;
  transition: background 0.15s;
}
.ib-reset-btn:hover { background: #174060; }
.ib-file-label {
  font-size: 0.82rem;
  font-weight: 600;
  color: #374151;
}
.ib-file-input {
  font-size: 0.84rem;
  color: #374151;
  width: 100%;
}
.ib-uploading-msg {
  font-size: 0.82rem;
  color: #6b7280;
  margin: 0;
}
.ib-file-link {
  font-size: 0.8rem;
  margin: 0;
}
.ib-file-link a {
  color: #1E4D6B;
  text-decoration: none;
}
.ib-preview-box {
  border: 1.5px dashed #d1d5db;
  border-radius: 8px;
  flex: 1;
  min-height: 300px;
  display: flex;
  align-items: stretch;
  justify-content: center;
  overflow: auto;
  background: #f9fafb;
  resize: vertical;
  position: relative;
}
.ib-preview-box::after {
  content: '';
  position: absolute;
  bottom: 4px;
  left: 50%;
  transform: translateX(-50%);
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: #d1d5db;
  pointer-events: none;
}
.ib-preview-iframe {
  width: 100%;
  flex: 1;
  border: none;
  display: block;
}
.ib-no-file {
  font-size: 0.84rem;
  color: #9ca3af;
  margin: 0;
}
.ib-geo-nav {
  display: flex;
  background: linear-gradient(135deg, #1E4D6B 0%, #153650 100%);
  border-radius: 10px;
  padding: 5px;
  gap: 4px;
}
.ib-geo-nav-btn {
  flex: 1;
  padding: 10px 24px;
  border: 2px solid transparent;
  border-radius: 7px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s, color 0.18s, box-shadow 0.18s;
  background: transparent;
  color: rgba(255,255,255,0.65);
  letter-spacing: 0.2px;
}
.ib-geo-nav-btn:hover {
  background: rgba(255,255,255,0.12);
  color: #ffffff;
}
.ib-geo-nav-btn-active {
  background: #ffffff !important;
  color: #1E4D6B !important;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
}
.ib-geo-nav-btn-active:hover {
  background: #e6eef3 !important;
  color: #153650 !important;
}
.ib-amount-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1 1 160px;
  min-width: 160px;
}
.ib-amount-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ib-amount-checkbox {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: #1E4D6B;
}
.ib-net-payable {
  background: #f0fdf4 !important;
  color: #15803d !important;
  font-weight: 700;
  border-color: #86efac !important;
  cursor: default;
}
.ib-net-payable:focus {
  border-color: #86efac !important;
  box-shadow: 0 0 0 3px rgba(134,239,172,0.25) !important;
}
.ib-card {
  background: #f0f4f9;
  border: 1px solid #e0e7ef;
  border-radius: 14px;
  padding: 24px 26px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.05);
}
.ib-section-block {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow:
    0 1px 2px rgba(0,0,0,0.04),
    0 4px 12px rgba(0,0,0,0.06),
    0 0 0 1px rgba(255,255,255,0.8) inset;
}
.ib-card-header {
  display: flex;
  align-items: center;
  gap: 14px;
  background: #ffffff;
  border: 1px solid #c8dde8;
  border-radius: 10px;
  padding: 14px 18px;
  box-shadow: 0 2px 8px rgba(30,77,107,0.08);
}
.ib-card-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: #e6eef3;
  border: 2px solid #a8c4d4;
  color: #1E4D6B;
  font-size: 0.82rem;
  font-weight: 700;
  flex-shrink: 0;
}
.ib-card-title {
  font-size: 1rem;
  font-weight: 700;
  color: #1E4D6B;
  letter-spacing: 0.3px;
}
.ib-section-head {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: #ffffff;
  background: linear-gradient(135deg, #1E4D6B 0%, #153650 100%);
  border-radius: 7px;
  padding: 8px 14px;
  margin-top: 10px;
  display: inline-block;
  align-self: flex-start;
}
.ib-row {
  display: flex;
  gap: 16px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.ib-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.ib-flex1 { flex: 1 1 120px; min-width: 120px; }
.ib-flex2 { flex: 2 1 200px; min-width: 200px; }
.ib-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #374151;
  white-space: normal;
  word-break: break-word;
  line-height: 1.3;
}
.ib-req { color: #ef4444; }
.ib-input,
.ib-select {
  height: 36px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 0.86rem;
  color: #111827;
  background: #ffffff;
  width: 100%;
  outline: none;
  transition: border-color 0.15s;
  box-sizing: border-box;
}
.ib-input:focus,
.ib-select:focus {
  border-color: #1E4D6B;
  box-shadow: 0 0 0 3px rgba(30,77,107,0.08);
}
.ib-ro {
  background: #f9fafb;
  color: #6b7280;
  cursor: default;
}
.ib-ro:focus {
  border-color: #d1d5db;
  box-shadow: none;
}
.ib-dropdown {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
}
.ib-dropdown-item {
  padding: 9px 12px;
  font-size: 0.84rem;
  color: #374151;
  cursor: pointer;
  transition: background 0.1s;
}
.ib-dropdown-item:hover {
  background: #e6eef3;
  color: #1E4D6B;
}
.ib-dropdown-item strong { color: #111827; }
.ib-error-box {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 0.84rem;
  color: #b91c1c;
}
.ib-submit-btn {
  width: 100%;
  padding: 13px;
  background: #1E4D6B;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s;
  letter-spacing: 0.3px;
}
.ib-submit-btn:hover:not(:disabled) { background: #174060; }
.ib-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 1100px) {
  .ib-panels { flex-direction: column; }
  .ib-left-panel { width: 100% !important; max-width: none; flex: none; }
  .ib-panel-handle { display: none; }
}
`

// ── Shell CSS (sidebar + lx-shell wrapper — same as LedgerXDashboard) ─────
const IB_SHELL_CSS = `
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
`
