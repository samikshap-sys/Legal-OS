/**
 * TallyEntry.tsx — exact port of v1 finops_god_code/frontend/src/pages/TallyEntry.jsx
 * Uses tRPC instead of raw fetch, but all logic is 1:1 with v1:
 *  - extractLedgerEntries: parses CreditLedger/AmountCreditLedger/DebitLedger/AmountDebitLedger pairs
 *  - detectPattern: identifies GST/TDS/RCM/Simple patterns
 *  - buildOrderedEntries: sorts by SLOT_ORDER
 *  - generateTallyXML: exact v1 XML generation with ALLLEDGERENTRIES.LIST
 *  - EntryDetailSidebar: shows journal entry with edit/save
 *  - Stats: Total, XML Created (Template Created), Processed, Pending
 *  - Toolbar: entry count, Download CSV, Download XML
 */
import { useState, useCallback, useMemo } from 'react'
import { useLocation } from 'wouter'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'

// ── Nav icons ─────────────────────────────────────────────────────────────
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
function XmlIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
}

const TE_NAV = [
  { id: 'dashboard',          label: 'AP Dashboard',       icon: <DashboardIcon /> },
  { id: 'invoice-booking',    label: 'Invoice Booking',    icon: <BookInvoiceIcon /> },
  { id: 'dp-invoice-booking', label: 'DP Invoice Booking', icon: <DPInvoiceIcon /> },
  { id: 'invoice-register',   label: 'Invoice Register',   icon: <RegisterIcon /> },
  { id: 'tally-entry',        label: 'Tally Entry',        icon: <TallyEntryIcon /> },
  { id: 'aging-analysis',     label: 'Aging Analysis',     icon: <AgingIcon /> },
]

// ── v1 Column constants ───────────────────────────────────────────────────
// Exact column names from Inv Entry Template sheet (v1 _load_tally_entries)
const COL_DATE         = 'DATE'
const COL_INVDATE      = 'INVOICEDATE'
const COL_VCHRTYPE     = 'VOUCHERTYPENAME'
const COL_INVOICENO    = 'InvoiceNo'
const COL_VCHRNUM      = 'VOUCHERNUMBER'
const COL_NARRATION    = 'NARRATION'
const COL_COSTCAT      = 'CostCategory'
const COL_COSTCENTRE   = 'CostCentre'
// Ledger pairs: CreditLedger/AmountCreditLedger, DebitLedger/AmountDebitLedger
// Action Status is the last column (appended by backend or synthetic)
const COL_ACTION       = 'Action Status'

// Columns to hide in the table
const HIDDEN_COLS = new Set(['Created At', 'Created By'])

// Columns to skip in XML generation
const XML_SKIP_COLS = new Set(['Created At', 'Created By', COL_ACTION])

// ── v1 LedgerEntry type ───────────────────────────────────────────────────
type LedgerEntry = {
  type: 'credit' | 'debit'
  slotIdx: number
  label: string
  ledger: string
  amount: string
  ledgerColIdx: number
  amountColIdx: number
}

// ── v1 getSlotLabel ───────────────────────────────────────────────────────
function getSlotLabel(type: 'credit' | 'debit', slotIdx: number, ledger: string): string {
  const l = ledger.toLowerCase()
  const isRCM = l.includes('rcm') || l.includes('outward') || l.includes('inward')
  const isInward = l.includes('inward')
  if (type === 'credit') {
    if (slotIdx === 0) return 'Vendor Payable'
    if (slotIdx === 1) {
      if (l.includes('tds') || /19[2-6][a-z]/i.test(ledger)) return 'TDS Payable'
      if (isRCM) return isInward ? 'RCM Inward' : 'RCM Outward'
      return 'Credit 1'
    }
    if (slotIdx === 2) {
      if (isRCM) return isInward ? 'RCM Inward' : 'RCM Outward'
      return 'RCM Outward'
    }
    if (slotIdx === 3) {
      if (l.includes('tds') || /19[2-6][a-z]/i.test(ledger)) return 'TDS Payable'
      return 'Round Off'
    }
    return `Credit ${slotIdx + 1}`
  } else {
    if (slotIdx === 0) return 'Expense Ledger 1'
    if (slotIdx === 1) {
      if (isRCM) return isInward ? 'RCM Inward' : 'RCM Outward'
      if (l.includes('igst')) return 'IGST'
      if (l.includes('cgst')) return 'CGST'
      if (l.includes('sgst')) return 'SGST'
      if (l.includes('gst')) return 'GST'
      return 'Expense Ledger 2'
    }
    if (slotIdx === 2) {
      if (isRCM) return isInward ? 'RCM Inward' : 'RCM Outward'
      if (l.includes('igst')) return 'IGST'
      if (l.includes('cgst')) return 'CGST'
      return 'CGST / IGST'
    }
    if (slotIdx === 3) {
      if (isRCM) return isInward ? 'RCM Inward' : 'RCM Outward'
      return 'SGST'
    }
    if (slotIdx === 4) return 'Round Off'
    return `Debit ${slotIdx + 1}`
  }
}

// ── v1 SLOT_ORDER ─────────────────────────────────────────────────────────
const SLOT_ORDER: Record<string, number> = {
  'credit-0': 0, 'debit-0': 1, 'debit-1': 2, 'debit-2': 3,
  'debit-3': 4, 'credit-1': 5, 'credit-2': 6, 'debit-4': 7, 'credit-3': 8,
}

// ── v1 buildOrderedEntries ────────────────────────────────────────────────
function buildOrderedEntries(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort((a, b) =>
    (SLOT_ORDER[`${a.type}-${a.slotIdx}`] ?? 9) - (SLOT_ORDER[`${b.type}-${b.slotIdx}`] ?? 9)
  )
}

// ── v1 detectPattern ─────────────────────────────────────────────────────
function detectPattern(headers: string[], row: string[], entries: LedgerEntry[]) {
  const vType = (getColVal(headers, row, COL_VCHRTYPE) || '').toLowerCase()
  if (vType.includes('credit note') || vType.includes('cn')) {
    return { label: 'Credit Note', cls: 'pattern-cn' }
  }
  const credits = entries.filter(e => e.type === 'credit')
  const debits  = entries.filter(e => e.type === 'debit')
  const hasTDS = credits.some(e => e.slotIdx === 1 &&
    (e.ledger.toLowerCase().includes('tds') || /19[2-6][a-z]/i.test(e.ledger)))
  const hasRCMOutward = credits.some(e => e.slotIdx === 2 &&
    (e.ledger.toLowerCase().includes('outward') || e.ledger.toLowerCase().includes('rcm')))
  const hasRCMDebit = debits.some(e => e.slotIdx === 2 && e.ledger.toLowerCase().includes('rcm'))
  const hasGST = debits.some(e => e.slotIdx >= 1 &&
    (e.ledger.toLowerCase().includes('cgst') || e.ledger.toLowerCase().includes('sgst') ||
     e.ledger.toLowerCase().includes('igst')))
  if (hasRCMOutward || hasRCMDebit) return { label: 'Foreign Vendor (RCM)', cls: 'pattern-rcm' }
  if (hasGST && hasTDS)             return { label: 'GST + TDS',            cls: 'pattern-gsttds' }
  if (hasGST)                       return { label: 'GST Only',             cls: 'pattern-gst' }
  if (hasTDS)                       return { label: 'No GST + TDS',         cls: 'pattern-tds' }
  return { label: 'Simple Expense', cls: 'pattern-simple' }
}

// ── v1 extractLedgerEntries ───────────────────────────────────────────────
function extractLedgerEntries(headers: string[], row: string[]): LedgerEntry[] {
  const entries: LedgerEntry[] = []
  let creditCount = 0, debitCount = 0
  let i = 0
  while (i < headers.length) {
    const h = headers[i]
    if (h === 'CreditLedger' && i + 1 < headers.length && headers[i + 1] === 'AmountCreditLedger') {
      const ledgerVal = (row[i] || '').trim()
      const amount = (row[i + 1] || '').trim()
      if (ledgerVal && ledgerVal !== 'emp') {
        entries.push({
          type: 'credit',
          slotIdx: creditCount,
          label: getSlotLabel('credit', creditCount, ledgerVal),
          ledger: ledgerVal,
          amount: amount !== 'emp' ? amount : '',
          ledgerColIdx: i,
          amountColIdx: i + 1,
        })
      }
      creditCount++
      i += 2
      continue
    }
    if (h === 'DebitLedger' && i + 1 < headers.length && headers[i + 1] === 'AmountDebitLedger') {
      const ledgerVal = (row[i] || '').trim()
      const amount = (row[i + 1] || '').trim()
      if (ledgerVal && ledgerVal !== 'emp') {
        entries.push({
          type: 'debit',
          slotIdx: debitCount,
          label: getSlotLabel('debit', debitCount, ledgerVal),
          ledger: ledgerVal,
          amount: amount !== 'emp' ? amount : '',
          ledgerColIdx: i,
          amountColIdx: i + 1,
        })
      }
      debitCount++
      i += 2
      continue
    }
    i++
  }
  return entries
}

// ── v1 generateTallyXML ───────────────────────────────────────────────────
// Exact port of v1 generate_tally_xml / generateTallyXML
function generateTallyXML(headers: string[], rowsToExport: string[][]): string {
  const xmlHdr = '<ENVELOPE>\n<HEADER>\n<TALLYREQUEST>Import Data</TALLYREQUEST>\n</HEADER>\n<BODY>\n<IMPORTDATA>\n<REQUESTDESC>\n<REPORTNAME>Vouchers</REPORTNAME>\n</REQUESTDESC>\n</IMPORTDATA>\n<REQUESTDATA>\n'
  const xmlFtr = '</REQUESTDATA>\n</BODY>\n</ENVELOPE>\n'
  function esc(s: string) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }
  let srop = ''
  for (const row of rowsToExport) {
    let rowop = ''
    let v_type = ''
    let invoice_num = ''
    let cost_centre = 'emp'
    let cost_category = ''
    let debit_pass = true
    let credit_pass = true
    const last = headers.length - 1
    for (let i = 0; i <= last; i++) {
      const att = headers[i]
      const raw = row[i] || ''
      if (XML_SKIP_COLS.has(att)) continue
      const val = esc(raw)
      if (att === 'VOUCHERTYPENAME') {
        v_type = val
        rowop += `<${att}>${val}</${att}>\n`
        continue
      }
      if (att === 'DebitLedger' || att.startsWith('DebitLedger')) {
        if (!raw || raw === 'emp') continue
        rowop += `<ALLLEDGERENTRIES.LIST>\n<LEDGERNAME>${val}</LEDGERNAME>\n`
        continue
      }
      if (att === 'AmountDebitLedger' || att.startsWith('AmountDebit')) {
        const isLast = i === last
        if (!raw || raw === 'emp') {
          if (isLast) rowop += `</VOUCHER>\n</TALLYMESSAGE>\n`
          continue
        }
        if (debit_pass) {
          if (isLast) {
            if (cost_centre === 'emp') {
              rowop += `<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n<AMOUNT>${val}</AMOUNT>\n</ALLLEDGERENTRIES.LIST>\n</VOUCHER>\n</TALLYMESSAGE>\n`
            } else {
              rowop += `<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n<AMOUNT>${val}</AMOUNT>\n<CATEGORYALLOCATIONS.LIST>\n<CATEGORY>${esc(cost_category)}</CATEGORY>\n<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<COSTCENTREALLOCATIONS.LIST>\n<NAME>${esc(cost_centre)}</NAME>\n<AMOUNT>${val}</AMOUNT>\n</COSTCENTREALLOCATIONS.LIST>\n</CATEGORYALLOCATIONS.LIST>\n</ALLLEDGERENTRIES.LIST>\n</VOUCHER>\n</TALLYMESSAGE>\n`
            }
          } else {
            if (cost_centre === 'emp') {
              rowop += `<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n<AMOUNT>${val}</AMOUNT>\n</ALLLEDGERENTRIES.LIST>\n`
            } else {
              rowop += `<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n<AMOUNT>${val}</AMOUNT>\n<CATEGORYALLOCATIONS.LIST>\n<CATEGORY>${esc(cost_category)}</CATEGORY>\n<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<COSTCENTREALLOCATIONS.LIST>\n<NAME>${esc(cost_centre)}</NAME>\n<AMOUNT>${val}</AMOUNT>\n</COSTCENTREALLOCATIONS.LIST>\n</CATEGORYALLOCATIONS.LIST>\n</ALLLEDGERENTRIES.LIST>\n`
            }
          }
          debit_pass = false
        } else {
          if (isLast) {
            rowop += `<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n<AMOUNT>${val}</AMOUNT>\n</ALLLEDGERENTRIES.LIST>\n</VOUCHER>\n</TALLYMESSAGE>\n`
          } else {
            rowop += `<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n<AMOUNT>${val}</AMOUNT>\n</ALLLEDGERENTRIES.LIST>\n`
          }
        }
        continue
      }
      if (att === 'CreditLedger' || att.startsWith('CreditLedger')) {
        if (!raw || raw === 'emp') continue
        rowop += `<ALLLEDGERENTRIES.LIST>\n<LEDGERNAME>${val}</LEDGERNAME>\n`
        continue
      }
      if (att === 'AmountCreditLedger' || att.startsWith('AmountCredit')) {
        if (!raw || raw === 'emp') continue
        if (credit_pass) {
          rowop += `<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n<AMOUNT>${val}</AMOUNT>\n<BILLALLOCATIONS.LIST>\n<NAME>${esc(invoice_num)}</NAME>\n<BILLTYPE>New Ref</BILLTYPE>\n<AMOUNT>${val}</AMOUNT>\n</BILLALLOCATIONS.LIST>\n</ALLLEDGERENTRIES.LIST>\n`
          credit_pass = false
        } else {
          rowop += `<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n<ISPARTYLEDGER>Yes</ISPARTYLEDGER>\n<AMOUNT>${val}</AMOUNT>\n</ALLLEDGERENTRIES.LIST>\n`
        }
        continue
      }
      if (att === 'CostCentre') { cost_centre = raw || 'emp'; continue }
      if (att === 'CostCategory') { cost_category = raw || ''; continue }
      if (att === 'InvoiceNo') {
        invoice_num = raw || ''
        rowop += `<REFERENCE>${val}</REFERENCE>\n`
        continue
      }
      if (att === 'DATE') { rowop += `<${att}>${val}</${att}>\n`; continue }
      if (att === 'INVOICEDATE') { rowop += `<REFERENCEDATE>${val}</REFERENCEDATE>\n`; continue }
      rowop += `<${att}>${val}</${att}>\n`
    }
    srop += `<TALLYMESSAGE>\n<VOUCHER VCHTYPE="${v_type}" ACTION="Create">\n` + rowop
  }
  return xmlHdr + srop + xmlFtr
}

// ── Helpers ───────────────────────────────────────────────────────────────
function getColVal(headers: string[], row: string[], name: string): string {
  const i = headers.findIndex(h => h === name)
  return i >= 0 ? (row[i] || '') : ''
}

function fmtDate(val: string): string {
  const d = String(val || '')
  // YYYYMMDD → DD-MM-YYYY
  if (d.length === 8 && /^\d{8}$/.test(d)) {
    return `${d.slice(6, 8)}-${d.slice(4, 6)}-${d.slice(0, 4)}`
  }
  return val || '—'
}

function fmtAmount(raw: string): string {
  if (!raw || raw === 'emp') return '—'
  const num = parseFloat(String(raw).replace(/,/g, ''))
  if (isNaN(num)) return raw
  return `₹${Math.abs(num).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── EntryDetailSidebar ────────────────────────────────────────────────────
// v1 EntryDetailSidebar: shows voucher header, meta fields, narration, journal entry table with edit
interface SidebarProps {
  headers: string[]
  row: string[]
  allRows: string[][]
  currentIdx: number
  onNavigate: (idx: number) => void
  onClose: () => void
  onRowUpdated: (newRow: string[]) => void
}

function EntryDetailSidebar({ headers, row, allRows, currentIdx, onNavigate, onClose, onRowUpdated }: SidebarProps) {
  const entries = extractLedgerEntries(headers, row)
  const ordered = buildOrderedEntries(entries)
  const pattern = detectPattern(headers, row, entries)

  const voucherNo  = getColVal(headers, row, COL_VCHRNUM)
  const invoiceNo  = getColVal(headers, row, COL_INVOICENO)
  const date       = fmtDate(getColVal(headers, row, COL_DATE))
  const vType      = getColVal(headers, row, COL_VCHRTYPE)
  const narration  = getColVal(headers, row, COL_NARRATION)
  const costCentre = getColVal(headers, row, COL_COSTCENTRE)
  const actionStatus = getColVal(headers, row, COL_ACTION)

  const voucherParts = voucherNo.split('/')
  const voucherPrefix = voucherParts[0] || voucherNo

  const [editing, setEditing] = useState(false)
  const [editEntries, setEditEntries] = useState<LedgerEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)

  const tallyUpdateRow = trpc.ledgerX.tallyUpdateRow.useMutation()

  const displayEntries = editing ? editEntries : ordered

  function startEdit() {
    setEditEntries(ordered.map(e => ({ ...e })))
    setEditing(true)
    setSaveMsg(null)
  }

  function cancelEdit() {
    setEditing(false)
    setEditEntries([])
    setSaveMsg(null)
  }

  function updateField(i: number, field: 'ledger' | 'amount', value: string) {
    setEditEntries(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
  }

  async function saveChanges() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const updates = editEntries.map(e => ({
        ledger_col_idx: e.ledgerColIdx,
        ledger_val: e.ledger,
        amount_col_idx: e.amountColIdx,
        amount_val: e.amount || 'emp',
      }))
      const result = await tallyUpdateRow.mutateAsync({ voucherNumber: voucherNo, invoiceNo, updates })
      if (!result.ok) throw new Error((result as any).error || 'Save failed')
      // Update local row
      const newRow = [...row]
      editEntries.forEach(e => {
        newRow[e.ledgerColIdx] = e.ledger
        newRow[e.amountColIdx] = e.amount || 'emp'
      })
      onRowUpdated(newRow)
      setSaveMsg('Changes saved successfully')
      setEditing(false)
      toast.success('Journal entry saved')
    } catch (e: any) {
      setSaveMsg(`Error: ${e.message}`)
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const patternBadgeStyle: Record<string, { bg: string; color: string }> = {
    'pattern-rcm':     { bg: '#f3e8ff', color: '#7c3aed' },
    'pattern-gsttds':  { bg: '#dbeafe', color: '#1d4ed8' },
    'pattern-gst':     { bg: '#cffafe', color: '#0e7490' },
    'pattern-tds':     { bg: '#fef3c7', color: '#92400e' },
    'pattern-simple':  { bg: '#d1fae5', color: '#065f46' },
    'pattern-cn':      { bg: '#fee2e2', color: '#991b1b' },
  }
  const pb = patternBadgeStyle[pattern.cls] || { bg: '#f3f4f6', color: '#374151' }

  const actionBadgeStyle: Record<string, { bg: string; color: string }> = {
    'template prepared': { bg: '#fef3c7', color: '#92400e' },
    'template created':  { bg: '#d1fae5', color: '#065f46' },
    'entry updated':     { bg: '#dbeafe', color: '#1d4ed8' },
    'processed':         { bg: '#cffafe', color: '#0e7490' },
  }
  const ab = actionBadgeStyle[(actionStatus || '').toLowerCase()] || { bg: '#f3f4f6', color: '#6b7280' }

  return (
    <div className="te-detail-card">
      {/* Header */}
      <div className="te-detail-head">
        <div className="te-detail-head-left">
          <span className="te-voucher-prefix-badge">{voucherPrefix || 'V'}</span>
          <span className="te-voucher-type-badge">{vType || 'BILL'}</span>
          <span
            className="te-pattern-badge"
            style={{ background: pb.bg, color: pb.color }}
          >{pattern.label}</span>
        </div>
        <div className="te-detail-head-right">
          <button
            className="te-nav-arrow"
            onClick={() => onNavigate(currentIdx - 1)}
            disabled={currentIdx <= 0}
            title="Previous"
          >&#8249;</button>
          <span className="te-nav-counter">{currentIdx + 1} / {allRows.length}</span>
          <button
            className="te-nav-arrow"
            onClick={() => onNavigate(currentIdx + 1)}
            disabled={currentIdx >= allRows.length - 1}
            title="Next"
          >&#8250;</button>
          <button className="te-close-btn" onClick={onClose} title="Close">&#215;</button>
        </div>
      </div>

      {/* Voucher number */}
      <div className="te-detail-voucher-no">{voucherNo || '—'}</div>

      {/* Invoice No + Date row */}
      <div className="te-detail-fields-row">
        <div className="te-detail-field">
          <div className="te-detail-field-label">INVOICE NO</div>
          <div className="te-detail-field-value" style={{ color: '#60a5fa' }}>{invoiceNo || '—'}</div>
        </div>
        <div className="te-detail-field">
          <div className="te-detail-field-label">DATE</div>
          <div className="te-detail-field-value">{date || '—'}</div>
        </div>
        {costCentre && costCentre !== 'emp' && (
          <div className="te-detail-field">
            <div className="te-detail-field-label">COST CENTRE</div>
            <div className="te-detail-field-value" style={{ fontSize: '12px' }}>{costCentre}</div>
          </div>
        )}
      </div>

      {/* Narration */}
      {narration && (
        <div className="te-detail-narration-section">
          <div className="te-detail-field-label">NARRATION</div>
          <div className="te-detail-narration-text">{narration}</div>
        </div>
      )}

      {/* Action Status */}
      {actionStatus && (
        <div style={{ padding: '8px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <span
            style={{
              display: 'inline-block',
              background: ab.bg,
              color: ab.color,
              fontSize: '11px',
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: '4px',
            }}
          >{actionStatus}</span>
        </div>
      )}

      {/* Journal Entry */}
      <div className="te-journal-section">
        <div className="te-journal-header">
          <span className="te-journal-title">JOURNAL ENTRY</span>
          {!editing ? (
            <button className="te-edit-btn" onClick={startEdit}>Edit</button>
          ) : (
            <div className="te-edit-actions">
              <button className="te-cancel-btn" onClick={cancelEdit} disabled={saving}>Cancel</button>
              <button
                className="te-save-btn"
                onClick={saveChanges}
                disabled={saving}
              >{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          )}
        </div>

        {saveMsg && (
          <div
            style={{
              padding: '6px 10px',
              borderRadius: '5px',
              fontSize: '12px',
              marginBottom: '10px',
              background: saveMsg.startsWith('Error') ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
              color: saveMsg.startsWith('Error') ? '#f87171' : '#34d399',
            }}
          >{saveMsg}</div>
        )}

        <table className="te-journal-table">
          <thead>
            <tr>
              <th className="te-jt-th">PARTICULARS</th>
              <th className="te-jt-th">LEDGER NAME</th>
              <th className="te-jt-th te-jt-num">DR</th>
              <th className="te-jt-th te-jt-num">CR</th>
            </tr>
          </thead>
          <tbody>
            {displayEntries.map((e, i) => (
              <tr key={`${e.type}-${e.slotIdx}-${i}`}>
                <td className="te-jt-td" style={{ color: e.type === 'debit' ? '#60a5fa' : '#34d399', fontWeight: 600 }}>
                  {e.label}
                </td>
                <td className="te-jt-td">
                  {editing ? (
                    <input
                      className="te-jt-input"
                      value={e.ledger}
                      onChange={ev => updateField(i, 'ledger', ev.target.value)}
                    />
                  ) : e.ledger}
                </td>
                <td className="te-jt-td te-jt-num">
                  {e.type === 'debit' ? (
                    editing ? (
                      <input
                        className="te-jt-input te-jt-input-num"
                        value={e.amount}
                        onChange={ev => updateField(i, 'amount', ev.target.value)}
                      />
                    ) : <span style={{ color: '#1d4ed8' }}>{fmtAmount(e.amount)}</span>
                  ) : <span className="te-jt-dash">—</span>}
                </td>
                <td className="te-jt-td te-jt-num">
                  {e.type === 'credit' ? (
                    editing ? (
                      <input
                        className="te-jt-input te-jt-input-num"
                        value={e.amount}
                        onChange={ev => updateField(i, 'amount', ev.target.value)}
                      />
                    ) : <span style={{ color: '#059669' }}>{fmtAmount(e.amount)}</span>
                  ) : <span className="te-jt-dash">—</span>}
                </td>
              </tr>
            ))}
            {displayEntries.length === 0 && (
              <tr>
                <td colSpan={4} className="te-jt-td" style={{ textAlign: 'center', color: '#9ca3af' }}>
                  No ledger entries found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────
export default function TallyEntry() {
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
  const { data: rawData, isLoading: loading, refetch } = trpc.ledgerX.tallyEntries.useQuery(undefined, {
    refetchInterval: 60000,
  })
  const { data: mastersData } = trpc.ledgerX.tallyMasters.useQuery()

  const markXmlMutation = trpc.ledgerX.tallyMarkXmlCreated.useMutation({
    onSuccess: () => { refetch(); toast.success('Marked as XML created') },
    onError: (err) => toast.error(err.message || 'Failed to mark XML created'),
  })
  const refreshMutation = trpc.ledgerX.tallyRefresh.useMutation({
    onSuccess: () => { refetch(); toast.success('Refreshed') },
    onError: (err) => toast.error(err.message || 'Refresh failed'),
  })

  const rawHeaders: string[] = (rawData as any)?.headers || []
  const dataError: string | undefined = (rawData as any)?.error

  // Synthesize 'Action Status' column if not present in sheet
  const hasActionCol = rawHeaders.includes(COL_ACTION)
  const headers: string[] = hasActionCol ? rawHeaders : [...rawHeaders, COL_ACTION]

  // ── Local rows state (allows in-place updates) ────────────────────────
  const [localRows, setLocalRows] = useState<string[][] | null>(null)
  const rawRowsFromData: string[][] = (rawData as any)?.rows || []
  // Append synthetic 'Template Prepared' for Action Status if column was missing
  const rawRows: string[][] = hasActionCol
    ? rawRowsFromData
    : rawRowsFromData.map(row => [...row, 'Template Prepared'])
  const rows = localRows ?? rawRows

  // Sync localRows when rawData changes
  useMemo(() => {
    if (rawData) {
      const r: string[][] = (rawData as any)?.rows || []
      setLocalRows(hasActionCol ? r : r.map(row => [...row, 'Template Prepared']))
    }
  }, [rawData, hasActionCol])

  // ── State ─────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  // ── Derived ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(row => row.some(v => v && v.toLowerCase().includes(q)))
  }, [rows, search])

  // ── KPIs (v1: Total, XML Created/Template Created, Processed, Pending) ─
  const totalEntries = rows.length
  const actionIdx = headers.findIndex(h => h === COL_ACTION)
  const xmlCreatedCount = actionIdx >= 0
    ? rows.filter(r => (r[actionIdx] || '').toLowerCase() === 'template created').length
    : 0
  const processedCount = actionIdx >= 0
    ? rows.filter(r => (r[actionIdx] || '').toLowerCase() === 'processed').length
    : 0
  const pendingCount = totalEntries - xmlCreatedCount - processedCount

  // ── Column helpers ────────────────────────────────────────────────────
  const getVoucher = (row: string[]) => getColVal(headers, row, COL_VCHRNUM) || row[0] || '—'
  const getNarration = (row: string[]) => getColVal(headers, row, COL_NARRATION) || row[1] || '—'
  const getInvoiceNo = (row: string[]) => getColVal(headers, row, COL_INVOICENO) || '—'
  const getDate = (row: string[]) => fmtDate(getColVal(headers, row, COL_DATE))
  const getActionStatus = (row: string[]) => getColVal(headers, row, COL_ACTION)

  // ── Download CSV ──────────────────────────────────────────────────────
  const downloadCsv = () => {
    const visHdrs = headers.filter(h => !HIDDEN_COLS.has(h))
    const visIdxs = visHdrs.map(h => headers.indexOf(h))
    const csvRows = rows.map(row =>
      visIdxs.map(i => `"${String(row[i] || '').replace(/"/g, '""')}"`).join(',')
    )
    const csv = [visHdrs.join(','), ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'tally-entries.csv'; a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV downloaded')
  }

  // ── Download XML (v1 exact logic) ─────────────────────────────────────
  const downloadXml = async () => {
    const entriesToExport = filtered.length > 0 ? filtered : rows
    if (entriesToExport.length === 0) { toast.error('No entries to export'); return }
    const xml = generateTallyXML(headers, entriesToExport)
    const blob = new Blob([xml], { type: 'application/xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `tally-vouchers-${entriesToExport.length}.xml`; a.click()
    URL.revokeObjectURL(url)
    toast.success(`XML downloaded (${entriesToExport.length} vouchers)`)
    // Mark as Template Created
    const invoiceNoIdx = headers.findIndex(h => h === COL_INVOICENO)
    if (invoiceNoIdx >= 0) {
      const invoiceNos = entriesToExport.map(r => r[invoiceNoIdx]).filter(Boolean)
      if (invoiceNos.length > 0) {
        try { await markXmlMutation.mutateAsync({ invoiceNos }) } catch (_) { /* non-fatal */ }
      }
    }
  }

  // ── Navigate detail ───────────────────────────────────────────────────
  const handleNavigate = (idx: number) => {
    if (idx >= 0 && idx < filtered.length) setSelectedIdx(idx)
  }

  const handleRowUpdated = (newRow: string[]) => {
    if (selectedIdx === null) return
    const origRow = filtered[selectedIdx]
    setLocalRows(prev => {
      if (!prev) return prev
      const origIdx = prev.findIndex(r => r === origRow)
      if (origIdx < 0) return prev
      const next = [...prev]
      next[origIdx] = newRow
      return next
    })
  }

  const selectedRow = selectedIdx !== null && selectedIdx < filtered.length ? filtered[selectedIdx] : null

  // ── Action status badge ───────────────────────────────────────────────
  function ActionBadge({ status }: { status: string }) {
    const v = (status || '').toLowerCase()
    let bg = '#f3f4f6', color = '#6b7280'
    if (v === 'template prepared') { bg = '#fef3c7'; color = '#92400e' }
    else if (v === 'template created') { bg = '#d1fae5'; color = '#065f46' }
    else if (v === 'entry updated') { bg = '#dbeafe'; color = '#1d4ed8' }
    else if (v === 'processed') { bg = '#cffafe'; color = '#0e7490' }
    return (
      <span style={{ display: 'inline-block', background: bg, color, fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px' }}>
        {status || '—'}
      </span>
    )
  }

  return (
    <>
      <style>{TE_CSS}</style>
      <style dangerouslySetInnerHTML={{ __html: TE_SHELL_CSS }} />
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
            {TE_NAV.map(item => (
              <button
                key={item.id}
                className={`lx-nav-item${item.id === 'tally-entry' ? ' lx-active' : ''}`}
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
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px', fontWeight: 600 }}>FYND</span>
            ) : (
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', fontWeight: 700 }}>F</span>
            )}
            <button className="lx-home-btn" onClick={() => handleNav('home')} title="Home">
              <HomeSmallIcon />
            </button>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <div className="te-page">
          {/* ── Top bar ── */}
          <div className="te-topbar">
            <div>
              <h1 className="te-title">Tally Entry</h1>
              <p className="te-subtitle">Inv Entry Template</p>
            </div>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 24px' }}>
              <div className="te-search-wrap" style={{ width: '100%', maxWidth: '420px' }}>
                <svg className="te-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input
                  className="te-search"
                  style={{ width: '100%' }}
                  placeholder="Search invoices, vendors, document types…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="te-topbar-right">
              <button
                className="te-btn te-btn-refresh"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending || loading}
                title="Refresh"
              >
                <RefreshIcon />
                {refreshMutation.isPending ? ' …' : ' Refresh'}
              </button>
            </div>
          </div>

          {/* ── Stats cards ── */}
          <div className="te-stats-row">
            <div className="te-stat-card te-stat-total">
              <div className="te-stat-label">TOTAL ENTRIES</div>
              <div className="te-stat-value">{loading ? '…' : totalEntries}</div>
            </div>
            <div className="te-stat-card te-stat-processed">
              <div className="te-stat-label">CREATED</div>
              <div className="te-stat-value">{loading ? '…' : xmlCreatedCount}</div>
              <div className="te-stat-sublabel">via LedgerX</div>
            </div>
            <div className="te-stat-card te-stat-processed">
              <div className="te-stat-label">PROCESSED</div>
              <div className="te-stat-value">{loading ? '…' : processedCount}</div>
            </div>
            <div className="te-stat-card te-stat-pending">
              <div className="te-stat-label">PENDING</div>
              <div className="te-stat-value">{loading ? '…' : pendingCount}</div>
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="te-toolbar">
            <div className="te-toolbar-left">
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>Voucher Entries</span>
            </div>
            <div className="te-toolbar-right">
              <span className="te-entry-count">{filtered.length} entries</span>
              <button className="te-btn te-btn-download" onClick={downloadCsv} disabled={loading}>
                <DownloadIcon /> Download
              </button>
              <button className="te-btn te-btn-xml" onClick={downloadXml} disabled={loading}>
                <XmlIcon /> Download XML
              </button>
            </div>
          </div>

          {/* ── Error ── */}
          {dataError && (
            <div style={{ padding: '12px 28px', background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: '13px', borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
              Error: {dataError}
            </div>
          )}

          {/* ── Split panel ── */}
          <div className="te-split-panel">
            {/* Left: Table */}
            <div className={`te-table-panel${selectedRow ? ' te-table-panel-narrow' : ''}`}>
              {loading ? (
                <div className="te-loading">Loading tally entries…</div>
              ) : filtered.length === 0 ? (
                <div className="te-empty">
                  {rows.length === 0
                    ? 'No entries yet — use "Create Tally Entry" in Invoice Register'
                    : 'No results match your search'}
                </div>
              ) : (
<div className="te-table-wrap">
                <table className="te-table">
                  <thead>
                    <tr>
                      <th className="te-th te-th-check">
                        <input type="checkbox" style={{ cursor: 'pointer' }} />
                      </th>
                      {headers.map((h, hi) => HIDDEN_COLS.has(h) ? null : (
                        <th key={hi} className={`te-th${h === COL_ACTION ? ' te-th-action' : ''}`}>{h.toUpperCase()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => (
                      <tr
                        key={i}
                        className={`te-tr${selectedIdx === i ? ' te-tr-selected' : ''}`}
                        onClick={() => setSelectedIdx(i === selectedIdx ? null : i)}
                      >
                        <td className="te-td te-td-check" onClick={e => e.stopPropagation()}>
                          <input type="checkbox" style={{ cursor: 'pointer' }} />
                        </td>
                        {headers.map((h, hi) => {
                          if (HIDDEN_COLS.has(h)) return null
                          const val = row[hi] || ''
                          if (h === COL_ACTION) return (
                            <td key={hi} className="te-td te-td-action" style={{ whiteSpace: 'nowrap' }}>
                              <ActionBadge status={val} />
                            </td>
                          )
                          if (h === COL_INVOICENO || h === COL_VCHRNUM) return (
                            <td key={hi} className="te-td te-td-voucher">
                              <span className="te-voucher-link">{val || '—'}</span>
                            </td>
                          )
                          if (h === COL_DATE || h === COL_INVDATE) return (
                            <td key={hi} className="te-td" style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>{fmtDate(val)}</td>
                          )
                          if (h === COL_NARRATION) return (
                            <td key={hi} className="te-td te-td-narration">
                              <span className="te-narration-text">{val || '—'}</span>
                            </td>
                          )
                          if (h === 'AmountCreditLedger' || h === 'AmountDebitLedger') return (
                            <td key={hi} className="te-td" style={{ whiteSpace: 'nowrap', fontSize: '12px', textAlign: 'right' }}>
                              {val && val !== 'emp' ? fmtAmount(val) : <span style={{ color: '#9ca3af' }}>—</span>}
                            </td>
                          )
                          return (
                            <td key={hi} className="te-td" style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                              {val && val !== 'emp' ? val : <span style={{ color: '#9ca3af' }}>—</span>}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            {/* Right: Detail panel */}
            {selectedRow && (
              <div className="te-detail-panel-wrap">
                <EntryDetailSidebar
                  headers={headers}
                  row={selectedRow}
                  allRows={filtered}
                  currentIdx={selectedIdx!}
                  onNavigate={handleNavigate}
                  onClose={() => setSelectedIdx(null)}
                  onRowUpdated={handleRowUpdated}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ── Shell CSS ─────────────────────────────────────────────────────────────
const TE_SHELL_CSS = `
.lx-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #0d1f2d;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.lx-sidebar {
  width: 200px;
  min-width: 200px;
  height: 100%;
  background: #0d1f2d;
  border-right: 1px solid rgba(255,255,255,0.08);
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
.lx-collapse-btn:hover { background: rgba(255,255,255,0.15); }
.lx-nav {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
}
.lx-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: calc(100% - 16px);
  margin: 1px 8px;
  padding: 9px 12px;
  background: none;
  border: none;
  color: rgba(255,255,255,0.65);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  border-radius: 6px;
}
.lx-nav-item:hover { background: rgba(255,255,255,0.08); color: #fff; }
.lx-nav-item.lx-active { background: #1E4D6B; color: #fff; font-weight: 600; }
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
  color: rgba(255,255,255,0.7);
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.lx-home-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
`

// ── Page CSS ──────────────────────────────────────────────────────────────
const TE_CSS = `
.te-page {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #0d1f2d;
  overflow: hidden;
}
.te-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px 12px;
  background: #0d1f2d;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.te-title {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}
.te-subtitle {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  margin: 2px 0 0;
}
.te-topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.te-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.15s, opacity 0.15s;
  white-space: nowrap;
}
.te-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.te-btn-refresh { background: #1E4D6B; color: #fff; }
.te-btn-refresh:hover:not(:disabled) { background: #163d56; }
.te-btn-download { background: #1E4D6B; color: #fff; }
.te-btn-download:hover:not(:disabled) { background: #163d56; }
.te-btn-xml { background: #1a3a5c; color: #fff; border: 1px solid rgba(255,255,255,0.2); }
.te-btn-xml:hover:not(:disabled) { background: #1E4D6B; }
.te-stats-row {
  display: flex;
  gap: 0;
  background: #0d1f2d;
  padding: 16px 24px;
  flex-shrink: 0;
}
.te-stat-card {
  flex: 1;
  padding: 18px 22px;
  background: linear-gradient(135deg, #1a3a5c 0%, #1E4D6B 100%);
  border-radius: 0;
  position: relative;
  overflow: hidden;
}
.te-stat-card + .te-stat-card {
  margin-left: 1px;
}
.te-stat-card:first-child { border-radius: 10px 0 0 10px; }
.te-stat-card:last-child { border-radius: 0 10px 10px 0; }
.te-stat-total { background: linear-gradient(135deg, #0f2d45 0%, #1a3d58 100%); }
.te-stat-processed { background: linear-gradient(135deg, #1a3a5c 0%, #1E4D6B 100%); }
.te-stat-pending { background: linear-gradient(135deg, #2d5f8a 0%, #3d7fa8 100%); }
.te-stat-value {
  font-size: 36px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
  margin-top: 6px;
}
.te-stat-label {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,255,255,0.7);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 2px;
}
.te-stat-sublabel {
  font-size: 11px;
  color: rgba(255,255,255,0.5);
  margin-top: 4px;
}
.te-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #132a3e;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
  margin: 12px 16px 0;
  border-radius: 10px 10px 0 0;
  border: 1px solid rgba(255,255,255,0.08);
}
.te-toolbar-left { display: flex; align-items: center; gap: 10px; }
.te-toolbar-right { display: flex; align-items: center; gap: 10px; }
.te-entry-count { font-size: 13px; color: rgba(255,255,255,0.6); font-weight: 500; margin-right: 4px; }
.te-search-wrap { position: relative; display: flex; align-items: center; }
.te-search-icon { position: absolute; left: 10px; color: rgba(255,255,255,0.4); pointer-events: none; }
.te-search {
  padding: 7px 12px 7px 32px;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 7px;
  font-size: 13px;
  outline: none;
  width: 280px;
  background: rgba(255,255,255,0.08);
  color: #fff;
}
.te-search::placeholder { color: rgba(255,255,255,0.35); }
.te-search:focus { border-color: #3d7fa8; background: rgba(255,255,255,0.12); }
.te-split-panel {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
  padding: 0 16px 16px;
  background: #0d1f2d;
  gap: 16px;
}
.te-table-panel {
  flex: 1;
  overflow: auto;
  background: #132a3e;
  border: 1px solid rgba(255,255,255,0.08);
  border-top: none;
  border-radius: 0 0 10px 10px;
  min-width: 0;
  transition: flex 0.2s, max-width 0.2s;
}
.te-table-wrap {
  overflow-x: auto;
  min-width: 0;
  position: relative;
}
.te-th-check {
  width: 36px;
  min-width: 36px;
  padding: 10px 8px;
}
.te-td-check {
  width: 36px;
  min-width: 36px;
  padding: 10px 8px;
  vertical-align: middle;
}
.te-table-panel-narrow {
  flex: 0 0 620px;
  min-width: 460px;
  max-width: 700px;
}
.te-table {
  min-width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.te-th {
  background: #0f2d45;
  color: rgba(255,255,255,0.6);
  font-weight: 600;
  font-size: 11px;
  padding: 10px 16px;
  text-align: left;
  border-bottom: 2px solid rgba(255,255,255,0.1);
  white-space: nowrap;
  position: sticky;
  top: 0;
  z-index: 1;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.te-th-action {
  position: sticky;
  right: 0;
  z-index: 2;
  background: #0f2d45;
  box-shadow: -2px 0 6px rgba(0,0,0,0.3);
}
.te-td-action {
  position: sticky;
  right: 0;
  z-index: 1;
  background: #132a3e;
  box-shadow: -2px 0 6px rgba(0,0,0,0.2);
}
.te-tr:hover .te-td-action { background: #1a3a5c; }
.te-tr-selected .te-td-action { background: #1a3a5c !important; }
.te-tr { cursor: pointer; transition: background 0.1s; }
.te-tr:hover { background: #1a3a5c; }
.te-tr-selected { background: #1a3a5c !important; }
.te-td {
  padding: 10px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.85);
  vertical-align: top;
}
.te-td-voucher { width: 180px; white-space: nowrap; }
.te-td-narration { max-width: 240px; }
.te-voucher-link { color: #60a5fa; font-weight: 600; font-size: 13px; }
.te-narration-text {
  color: rgba(255,255,255,0.55);
  font-size: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.te-detail-panel-wrap {
  width: 380px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 0;
  min-width: 340px;
  max-width: 420px;
  margin-top: 0;
}
.te-detail-card {
  background: #132a3e;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.1);
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
}
.te-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 10px;
  background: #1E4D6B;
  flex-wrap: wrap;
  gap: 6px;
}
.te-detail-head-left { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.te-voucher-prefix-badge {
  background: rgba(255,255,255,0.2);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}
.te-voucher-type-badge {
  background: rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.85);
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 0.3px;
  text-transform: uppercase;
}
.te-pattern-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
}
.te-detail-head-right { display: flex; align-items: center; gap: 4px; }
.te-nav-arrow {
  background: rgba(255,255,255,0.12);
  border: none;
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
  line-height: 1;
  padding: 0;
}
.te-nav-arrow:hover:not(:disabled) { background: rgba(255,255,255,0.25); }
.te-nav-arrow:disabled { opacity: 0.4; cursor: not-allowed; }
.te-nav-counter { color: rgba(255,255,255,0.9); font-size: 12px; font-weight: 600; padding: 0 6px; white-space: nowrap; }
.te-close-btn {
  background: rgba(255,255,255,0.12);
  border: none;
  color: #fff;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  transition: background 0.15s;
  line-height: 1;
  padding: 0;
}
.te-close-btn:hover { background: rgba(255,255,255,0.25); }
.te-detail-voucher-no {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.te-detail-fields-row { display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.08); flex-wrap: wrap; }
.te-detail-field { flex: 1; min-width: 120px; padding: 12px 16px; border-right: 1px solid rgba(255,255,255,0.08); }
.te-detail-field:last-child { border-right: none; }
.te-detail-field-label {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255,255,255,0.45);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}
.te-detail-field-value { font-size: 14px; font-weight: 600; color: #fff; }
.te-detail-narration-section { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.te-detail-narration-text { font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.5; margin-top: 4px; }
.te-journal-section { padding: 14px 16px; }
.te-journal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.te-journal-title { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; }
.te-edit-btn { background: #1E4D6B; color: #fff; border: none; padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
.te-edit-btn:hover { background: #163d56; }
.te-edit-actions { display: flex; gap: 8px; }
.te-cancel-btn { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.15); padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
.te-cancel-btn:hover:not(:disabled) { background: rgba(255,255,255,0.15); }
.te-cancel-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.te-save-btn { background: #1E4D6B; color: #fff; border: none; padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.15s; }
.te-save-btn:hover:not(:disabled) { background: #163d56; }
.te-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.te-journal-table { width: 100%; border-collapse: collapse; font-size: 13px; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden; }
.te-jt-th { background: #0f2d45; color: rgba(255,255,255,0.6); font-size: 11px; font-weight: 700; padding: 8px 10px; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.1); text-transform: uppercase; letter-spacing: 0.3px; }
.te-jt-th.te-jt-num { text-align: right; }
.te-jt-td { padding: 10px 10px; border-bottom: 1px solid rgba(255,255,255,0.06); color: rgba(255,255,255,0.85); }
.te-jt-td.te-jt-num { text-align: right; }
.te-jt-dash { color: rgba(255,255,255,0.3); }
.te-jt-input { width: 100%; padding: 4px 8px; border: 1px solid rgba(255,255,255,0.2); border-radius: 5px; font-size: 13px; outline: none; background: rgba(255,255,255,0.08); color: #fff; box-sizing: border-box; }
.te-jt-input:focus { border-color: #3d7fa8; }
.te-jt-input-num { text-align: right; }
.te-loading, .te-error, .te-empty { text-align: center; padding: 60px 20px; color: rgba(255,255,255,0.4); font-size: 14px; }
.te-error { color: #f87171; }
`
