/**
 * DPInvoiceBooking — Delivery Partner Invoice Booking
 *
 * Full port of v1 DPInvoiceBooking.jsx to TypeScript + tRPC.
 * Supports: Blue Dart, Bigshort Tails, Busybees, Delhivery, DTDC, Shadowfax, Wefast
 * Theme: LedgerX light theme (matching InvoiceRegister.tsx)
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'wouter'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'

// ── Full Invoice Wise Data column definitions ─────────────────────────
const COLUMNS = [
  { key: 'created_at',            label: 'Created At' },
  { key: 'created_by',            label: 'Created By' },
  { key: 'geo_type',              label: 'Geo Type' },
  { key: 'vendor_code',           label: 'Vendor Code' },
  { key: 'group_name',            label: 'Group name' },
  { key: 'vendor_name',           label: 'Vendor Name' },
  { key: 'vendor_classification', label: 'Vendor Classification' },
  { key: 'vendor_msme',           label: 'Vendor - MSME/Non-MSME' },
  { key: 'frequency',             label: 'Frequency' },
  { key: 'vendor_gstin',          label: 'Vendor GSTIN' },
  { key: 'vendor_pan',            label: 'Vendor PAN' },
  { key: 'vendor_state',          label: 'Vendor State' },
  { key: 'voucher_type',          label: 'Voucher Type' },
  { key: 'invoice_type',          label: 'Invoice Type' },
  { key: 'e_invoice',             label: 'E-Invoice' },
  { key: 'invoice_no',            label: 'Invoice No' },
  { key: 'invoice_date',          label: 'Invoice Date' },
  { key: 'service_start_date',    label: 'Service start date' },
  { key: 'service_end_date',      label: 'Service end date' },
  { key: 'service_month',         label: 'Service Month' },
  { key: 'po_ref_no',             label: 'PO Ref No' },
  { key: 'gst_registered',        label: 'GST Registered (Y/N)' },
  { key: 'service_description',   label: 'Service Description' },
  { key: 'pnl_head',              label: 'PNL head' },
  { key: 'group_ledger',          label: 'Group Ledger' },
  { key: 'ledger_exp_name',       label: 'Ledger Exp Name' },
  { key: 'ledger_exp_name2',      label: 'Ledger Exp Name2' },
  { key: 'invoice_amount_fcy',    label: 'Invoice Amount (FCY)' },
  { key: 'exchange_rate',         label: 'Exchange Rate' },
  { key: 'grossed_up',            label: 'Grossed Up (Yes/No)' },
  { key: 'grossed_up_pct',        label: 'Grossed Up Percentage' },
  { key: 'expense_amount_1',      label: 'Expense Amount 1' },
  { key: 'expense_amount_2',      label: 'Expense Amount 2' },
  { key: 'gst_avail',             label: 'GST Avail' },
  { key: 'gst_type',              label: 'GST Type' },
  { key: 'gst_rate',              label: 'GST Rate %' },
  { key: 'cgst_ledger',           label: 'CGST Ledger' },
  { key: 'sgst_ledger',           label: 'SGST Ledger' },
  { key: 'igst_ledger',           label: 'IGST Ledger' },
  { key: 'cgst_amount',           label: 'CGST Amount' },
  { key: 'sgst_amount',           label: 'SGST Amount' },
  { key: 'igst_amount',           label: 'IGST Amount' },
  { key: 'ldc_applicability',     label: 'LDC Applicability (Yes/No)' },
  { key: 'tds_ledger',            label: 'TDS Ledger' },
  { key: 'tds_percent',           label: 'TDS %' },
  { key: 'tds_amount',            label: 'TDS Amount' },
  { key: 'credit_note_no',        label: 'Credit Note No' },
  { key: 'credit_note_date',      label: 'Credit Note Date' },
  { key: 'cn_expense_amount',     label: 'CN Expense Amount' },
  { key: 'round_off',             label: 'Round Off' },
  { key: 'net_payable',           label: 'Net Payable' },
  { key: 'rcm_applicability',     label: 'RCM Applicability' },
  { key: 'rcm_rate',              label: 'RCM Rate' },
  { key: 'rcm_amount',            label: 'RCM Amount' },
  { key: 'rcm_cgst_inward',       label: 'RCM-CGST Ledger Inward' },
  { key: 'rcm_sgst_inward',       label: 'RCM-SGST Ledger Inward' },
  { key: 'rcm_igst_inward',       label: 'RCM-IGST Ledger Inward' },
  { key: 'rcm_cgst_outward',      label: 'RCM-CGST Ledger Outward' },
  { key: 'rcm_sgst_outward',      label: 'RCM-SGST Ledger Outward' },
  { key: 'rcm_igst_outward',      label: 'RCM-IGST Ledger Outward' },
  { key: 'remarks',               label: 'Remarks' },
  { key: 'narration',             label: 'Narration' },
  { key: 'tally_entry_status',    label: 'Tally Entry Status' },
  { key: 'tally_inserted_date',   label: 'Tally Inserted Date' },
  { key: 'total_due_amt',         label: 'Total Due Amt' },
  { key: 'credit_period',         label: 'Credit Period' },
  { key: 'due_date',              label: 'Due Date' },
  { key: 'days',                  label: 'Days' },
  { key: 'aging',                 label: 'Aging' },
  { key: 'payment_tag',           label: 'Payment Tag' },
  { key: 'payment_due_week',      label: 'Payment Due Week' },
  { key: 'payment_due_month',     label: 'Payment Due Month' },
  { key: 'ca_cb_email',           label: '15CA/CB Email Status' },
  { key: 'vendor_criticality',    label: 'Vendor Criticality' },
  { key: 'business_owner',        label: 'Business Owner' },
  { key: 'approval_status',       label: 'Approval Status' },
  { key: 'payment_mode',          label: 'Payment Mode' },
  { key: 'payment_status',        label: 'Payment Status' },
  { key: 'payment_date1',         label: 'Payment Date1' },
  { key: 'paid_amt1',             label: 'Paid Amt1' },
  { key: 'utr1',                  label: 'UTR1' },
  { key: 'payment_date2',         label: 'Payment Date2' },
  { key: 'paid_amt2',             label: 'Paid Amt2' },
  { key: 'utr2',                  label: 'UTR2' },
  { key: 'payment_date3',         label: 'Payment Date3' },
  { key: 'paid_amt3',             label: 'Paid Amt3' },
  { key: 'utr3',                  label: 'UTR3' },
  { key: 'adjustment_date',       label: 'Adjustment Date' },
  { key: 'adjustment_reversed',   label: 'Adjustment / Entry Reversed' },
  { key: 'gst_amt_hold',          label: 'GST Amt Hold' },
  { key: 'actual_payable_amount', label: 'Actual Payable Amount' },
  { key: 'payment_plan_date',     label: 'Payment Plan Date' },
  { key: 'payment_remarks',       label: 'Payment Remarks' },
  { key: 'short_descriptions',    label: 'Short Descriptions for Payment' },
  { key: 'business_vertical',     label: 'Business Vertical' },
  { key: 'reporting_bunit',       label: 'Reporting Business unit' },
  { key: 'bunit_sejal',           label: 'Business Unit as per Invoice (Updated by Sejal)' },
  { key: 'bunit_mail',            label: 'Business Unit as per Invoice (Mail)' },
  { key: 'business_line',         label: 'Business Line' },
  { key: 'bunit_per_po',          label: 'Business Unit as per PO' },
  { key: 'region',                label: 'Region' },
  { key: 'product_revenue_ip',    label: 'Product /Revenue IP' },
  { key: 'bill_to',               label: 'Bill to' },
  { key: 'cost_category',         label: 'CostCategory' },
  { key: 'invoice_file_id',       label: 'Invoice File Id' },
  { key: 'invoice_file_link',     label: 'Invoice File Link' },
]

// ── Delivery Partner tabs ─────────────────────────────────────────────
const DP_TABS = [
  { key: 'bluedart',   label: 'Blue Dart' },
  { key: 'bigshot',    label: 'Bigshort Tails' },
  { key: 'busybees',   label: 'Busybees' },
  { key: 'delhivery',  label: 'Delhivery' },
  { key: 'dtdc',       label: 'DTDC' },
  { key: 'shadowfax',  label: 'Shadowfax' },
  { key: 'wefast',     label: 'Wefast' },
]

const DP_FORMAT_LABEL: Record<string, string> = {
  bluedart:  'Drag & drop or browse — BlueDart format supported',
  dtdc:      'Drag & drop or browse — DTDC format supported (PDF & Excel)',
  bigshot:   'Drag & drop or browse — Bigshort Tails format supported',
  busybees:  'Drag & drop or browse — Busybees format supported (.xlsx)',
  delhivery: 'Drag & drop or browse — Delhivery format supported',
  shadowfax: 'Drag & drop or browse — Shadowfax format coming soon',
  wefast:    'Drag & drop or browse — Wefast format coming soon',
}

// Areas that attract CGST+SGST (Maharashtra-based)
const CGST_SGST_AREAS = ['mumbai', 'pune', 'nagpur', 'nashik', 'thane', 'aurangabad']

const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function nowStr() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${MON[d.getMonth()]}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function fmtDate(str: string): string {
  if (!str) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, day] = str.split('-')
    return `${day}-${MON[parseInt(m, 10) - 1]}-${y}`
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [day, m, y] = str.split('/')
    return `${day}-${MON[parseInt(m, 10) - 1]}-${y}`
  }
  return str
}

// Build a row in Invoice Wise Data format from a PDF row + user inputs
function buildRow(pdfRow: Record<string, string>, ui: Record<string, any>): Record<string, string> {
  const base: Record<string, string> = {}
  COLUMNS.forEach(c => { base[c.key] = '' })

  const areaLower = (pdfRow.area || '').trim().toLowerCase()
  const isBigshot = ['bigshot', 'busybees', 'delhivery', 'dtdc_excel'].includes(pdfRow.format || '')

  const gstType = isBigshot && pdfRow.gst_type
    ? pdfRow.gst_type
    : (pdfRow.gstin || '').startsWith('27')
      ? 'CGST+SGST'
      : CGST_SGST_AREAS.includes(areaLower) ? 'CGST+SGST' : 'IGST'

  const gstRateStr = isBigshot && pdfRow.gst_rate ? pdfRow.gst_rate : '18%'
  const gstRateNum = parseFloat(gstRateStr) / 100

  const invAmtRaw = parseFloat((pdfRow.invoice_amount || '').replace(/,/g, '')) || 0
  const expAmt1 = isBigshot
    ? invAmtRaw
    : Math.round(invAmtRaw * 100 / (100 + gstRateNum * 100) * 100) / 100

  const halfRate = gstRateNum / 2
  const cgstAmt = gstType === 'CGST+SGST' ? Math.round(expAmt1 * halfRate * 100) / 100 : 0
  const sgstAmt = gstType === 'CGST+SGST' ? Math.round(expAmt1 * halfRate * 100) / 100 : 0
  const igstAmt = gstType === 'IGST'       ? Math.round(expAmt1 * gstRateNum * 100) / 100 : 0

  const tdsAmt     = Math.round(expAmt1 * ((parseFloat(ui.tdsPercent || '0')) / 100) * 100) / 100
  const netPayable = Math.round((expAmt1 + cgstAmt + sgstAmt + igstAmt - tdsAmt) * 100) / 100
  const roundedNet = Math.round(netPayable)
  const roundOff   = Math.round((roundedNet - netPayable) * 100) / 100
  const v          = ui.vendorInfo || {}
  const invDateFmt = fmtDate(pdfRow.invoice_date || '')
  const narration  = `Being Expenses booked for ${ui.serviceDescription || 'Freight Charges'} against Invoice no: ${pdfRow.invoice_number || ''} dated ${invDateFmt} from period ${fmtDate(ui.serviceStartDate)} to ${fmtDate(ui.serviceEndDate)}${ui.poNumber ? ', ' + ui.poNumber : ''}`

  const cgstLedger = gstType === 'CGST+SGST' ? (ui.cgstLedger || '') : ''
  const sgstLedger = gstType === 'CGST+SGST' ? (ui.sgstLedger || '') : ''
  const igstLedger = gstType === 'IGST'       ? (ui.igstLedger || '') : ''

  return {
    ...base,
    created_at:            nowStr(),
    created_by:            '',
    geo_type:              '',
    vendor_code:           v.code        || ui.vendorCode || '',
    group_name:            v.group       || '',
    vendor_name:           v.name        || ui.dpName || '',
    vendor_classification: v.classification || '',
    vendor_msme:           v.msme        || '',
    frequency:             ui.frequency  || '',
    vendor_gstin:          pdfRow.gstin  || v.gstin || '',
    vendor_pan:            v.pan         || '',
    vendor_state:          ui.vendorState || '',
    voucher_type:          ui.vchType    || '',
    invoice_type:          ui.invoiceType || '',
    e_invoice:             ui.eInvoice   || '',
    invoice_no:            pdfRow.invoice_number || '',
    invoice_date:          invDateFmt,
    service_start_date:    fmtDate(ui.serviceStartDate),
    service_end_date:      fmtDate(ui.serviceEndDate),
    service_month:         ui.serviceMonth || '',
    po_ref_no:             ui.poNumber   || '',
    gst_registered:        ui.gstRegistered || '',
    service_description:   ui.serviceDescription || 'Freight Charges',
    pnl_head:              ui.pnlHead    || '',
    group_ledger:          ui.groupLedger || '',
    ledger_exp_name:       ui.ledgerExpName1 || '',
    ledger_exp_name2:      ui.ledgerExpName2 || '',
    invoice_amount_fcy:    '',
    exchange_rate:         '',
    grossed_up:            '',
    grossed_up_pct:        '',
    expense_amount_1:      expAmt1 === 0 ? '' : expAmt1.toFixed(2),
    expense_amount_2:      '',
    gst_avail:             ui.gstAvail   || '',
    gst_type:              gstType,
    gst_rate:              gstRateStr,
    cgst_ledger:           cgstLedger,
    sgst_ledger:           sgstLedger,
    igst_ledger:           igstLedger,
    cgst_amount:           cgstAmt === 0 ? '' : cgstAmt.toFixed(2),
    sgst_amount:           sgstAmt === 0 ? '' : sgstAmt.toFixed(2),
    igst_amount:           igstAmt === 0 ? '' : igstAmt.toFixed(2),
    ldc_applicability:     ui.ldcApplicability || '',
    tds_ledger:            ui.tdsLedger  || '',
    tds_percent:           ui.tdsPercent || '',
    tds_amount:            tdsAmt === 0 ? '' : tdsAmt.toFixed(2),
    credit_note_no:        '',
    credit_note_date:      '',
    cn_expense_amount:     '',
    round_off:             roundOff === 0 ? '' : roundOff.toFixed(2),
    net_payable:           roundedNet === 0 ? '' : String(roundedNet),
    narration,
  }
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Nav icons ─────────────────────────────────────────────────────────
function DashboardIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> }
function BookInvoiceIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/><line x1="9" y1="9" x2="11" y2="9"/></svg> }
function DPInvoiceIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> }
function RegisterIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg> }
function TallyEntryIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><polyline points="9 17 11 19 15 15"/></svg> }
function AgingIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function ChevronLeftIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg> }
function ChevronRightIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg> }
function HomeIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> }

const DP_NAV = [
  { id: 'dashboard',         label: 'AP Dashboard',       icon: <DashboardIcon /> },
  { id: 'invoice-booking',   label: 'Invoice Booking',    icon: <BookInvoiceIcon /> },
  { id: 'dp-invoice-booking',label: 'DP Invoice Booking', icon: <DPInvoiceIcon /> },
  { id: 'invoice-register',  label: 'Invoice Register',   icon: <RegisterIcon /> },
  { id: 'tally-entry',       label: 'Tally Entry',        icon: <TallyEntryIcon /> },
  { id: 'aging-analysis',    label: 'Aging Analysis',     icon: <AgingIcon /> },
]

// ── Reusable select ───────────────────────────────────────────────────
function Sel({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
}) {
  return (
    <select className="dp-select" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o, i) => <option key={`${i}-${o}`} value={o}>{o}</option>)}
    </select>
  )
}

export default function DPInvoiceBooking() {
  const [, navigate] = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tablePanelRef = useRef<HTMLDivElement>(null)

  const [activeDP, setActiveDP] = useState('bluedart')

  // ── Remote data ──────────────────────────────────────────────────────
  const { data: initDataRaw, isLoading: initLoading, error: initQueryError } = trpc.ledgerX.dpInit.useQuery()
  const vendorSearchMutation = trpc.ledgerX.invoiceVendors.useMutation()
  const parseMutation = trpc.ledgerX.dpParseInvoice.useMutation()

  const initData = {
    dpNames:         (initDataRaw as any)?.dpNames         || [] as string[],
    serviceMonths:   (initDataRaw as any)?.serviceMonths   || [] as string[],
    pnlHeads:        (initDataRaw as any)?.pnlHeads        || [] as string[],
    groupLedgers:    (initDataRaw as any)?.groupLedgers    || [] as string[],
    ledgerExpNames:  (initDataRaw as any)?.ledgerExpNames  || [] as string[],
    cgstLedgers:     (initDataRaw as any)?.cgstLedgers     || [] as string[],
    sgstLedgers:     (initDataRaw as any)?.sgstLedgers     || [] as string[],
    igstLedgers:     (initDataRaw as any)?.igstLedgers     || [] as string[],
    tdsLedgers:      (initDataRaw as any)?.tdsLedgers      || [] as string[],
    voucherTypes:    (initDataRaw as any)?.voucherTypes    || [] as string[],
    frequencies:     (initDataRaw as any)?.frequencies     || [] as string[],
    vendorStates:    (initDataRaw as any)?.vendorStates    || [] as string[],
    invoiceTypes:    (initDataRaw as any)?.invoiceTypes    || [] as string[],
    eInvoiceOptions: (initDataRaw as any)?.eInvoiceOptions || [] as string[],
  }
  const initError = (initDataRaw as any)?.error || (initQueryError?.message) || ''
  const dpVendorDefaults: Record<string, any> = (initDataRaw as any)?.dpVendorDefaults || {}

  // ── Table selection & editing ────────────────────────────────────────
  const [selectedRows, setSelectedRows]     = useState<Set<number>>(new Set())
  const [editPanelIdx, setEditPanelIdx]     = useState<number | null>(null)
  const [editPanelBuf, setEditPanelBuf]     = useState<Record<string, string>>({})
  const [menuOpenIdx, setMenuOpenIdx]       = useState<number | null>(null)

  // ── Card 1 – Invoice Details ─────────────────────────────────────────
  const [vendorCode, setVendorCode]             = useState('')
  const [vendorInfo, setVendorInfo]             = useState<any>(null)
  const [dpName, setDpName]                     = useState('')
  const [serviceStartDate, setServiceStartDate] = useState('')
  const [serviceEndDate, setServiceEndDate]     = useState('')
  const [serviceMonth, setServiceMonth]         = useState('')

  // ── Card 2 – Invoice Configuration ──────────────────────────────────
  const [vchType, setVchType]                   = useState('D-BILL-MH')
  const [invoiceType, setInvoiceType]           = useState('Invoice')
  const [eInvoice, setEInvoice]                 = useState('')
  const [frequency, setFrequency]               = useState('')
  const [vendorState, setVendorState]           = useState('MH')
  const [gstRegistered, setGstRegistered]       = useState('Yes')
  const [gstAvail, setGstAvail]                 = useState('Yes')
  const [serviceDescription, setServiceDescription] = useState('Freight Charges')
  const [poNumber, setPoNumber]                 = useState('')
  const [pnlHead, setPnlHead]                   = useState('')
  const [groupLedger, setGroupLedger]           = useState('')
  const [ledgerExpName1, setLedgerExpName1]     = useState('')
  const [ledgerExpName2, setLedgerExpName2]     = useState('')
  const [tdsLedger, setTdsLedger]               = useState('')
  const [tdsPercent, setTdsPercent]             = useState('')
  const [ldcApplicability, setLdcApplicability] = useState('')
  const [cgstLedger, setCgstLedger]             = useState('')
  const [sgstLedger, setSgstLedger]             = useState('')
  const [igstLedger, setIgstLedger]             = useState('')

  // ── File & parse ─────────────────────────────────────────────────────
  const [file, setFile]             = useState<File | null>(null)
  const [dragging, setDragging]     = useState(false)
  const [parsing, setParsing]       = useState(false)
  const [rows, setRows]             = useState<Record<string, string>[] | null>(null)
  const [parseError, setParseError] = useState('')
  const dpVendorCache               = useRef<Record<string, any>>({})
  const syncingFromName             = useRef(false)

  const applyDpVendor = useCallback((dpKey: string) => {
    const match = dpVendorCache.current[dpKey]
    if (!match) return
    syncingFromName.current = true
    setVendorCode(match.code || '')
    setDpName(match.name || '')
    setVendorInfo(match)
    if (match.state) setVendorState(match.state)
    syncingFromName.current = false
  }, [])

  // On init data load: populate cache and apply default tab
  useEffect(() => {
    if (dpVendorDefaults && Object.keys(dpVendorDefaults).length > 0) {
      dpVendorCache.current = dpVendorDefaults
      applyDpVendor('bluedart')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initDataRaw])

  // On tab switch: reset file/results, restore field defaults, apply from cache
  useEffect(() => {
    setFile(null); setRows(null); setParseError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    setVchType('D-BILL-MH')
    setInvoiceType('Invoice')
    setVendorState('MH')
    setGstRegistered('Yes')
    setGstAvail('Yes')
    applyDpVendor(activeDP)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDP])

  // Scroll table into view when rows are loaded
  useEffect(() => {
    if (rows !== null && tablePanelRef.current) {
      setTimeout(() => tablePanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    }
  }, [rows])

  // ── Vendor Code → DP Name (debounced) ────────────────────────────────
  useEffect(() => {
    if (syncingFromName.current) return
    if (!vendorCode.trim()) {
      setVendorInfo(null)
      setDpName('')
      return
    }
    const t = setTimeout(async () => {
      try {
        const d = await vendorSearchMutation.mutateAsync({ q: vendorCode, limit: 200 })
        if (d.ok) {
          const match = (d.vendors as any[]).find((v: any) => v.code === vendorCode.trim())
          if (match) {
            setVendorInfo(match)
            setDpName(match.name || '')
            if (match.state) setVendorState(match.state)
          } else {
            setVendorInfo(null)
            setDpName('')
            setVendorState('')
          }
        }
      } catch { /* ignore */ }
    }, 400)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorCode])

  function handleDpNameChange(name: string) {
    setDpName(name)
    syncingFromName.current = true
    // Find vendor code from dpVendorDefaults or search
    const found = Object.values(dpVendorCache.current).find((v: any) => v.name === name)
    if (found) {
      setVendorCode((found as any).code || '')
      setVendorInfo(found)
      if ((found as any).state) setVendorState((found as any).state)
    } else {
      setVendorCode('')
      setVendorInfo(null)
    }
    syncingFromName.current = false
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const n = f.name.toLowerCase()
    if (n.endsWith('.pdf') || n.endsWith('.xlsx') || n.endsWith('.xls')) {
      setFile(f); setRows(null); setParseError('')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    const n = (f?.name || '').toLowerCase()
    if (n.endsWith('.pdf') || n.endsWith('.xlsx') || n.endsWith('.xls')) {
      setFile(f); setRows(null); setParseError('')
    }
  }

  function handleRemoveFile() {
    setFile(null); setRows(null); setParseError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleParse() {
    if (!file) return
    setParsing(true); setParseError(''); setRows(null)
    try {
      const base64 = await fileToBase64(file)
      const data = await parseMutation.mutateAsync({
        dpType: activeDP,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
      })
      if ((data as any).ok && (data as any).rows?.length > 0) {
        const ui = {
          vendorCode, vendorInfo, dpName, vchType,
          frequency, vendorState, invoiceType, eInvoice,
          serviceStartDate, serviceEndDate, serviceMonth,
          gstRegistered, gstAvail, serviceDescription,
          poNumber,
          pnlHead, groupLedger, ledgerExpName1, ledgerExpName2,
          cgstLedger, sgstLedger, igstLedger,
          ldcApplicability, tdsLedger, tdsPercent,
        }
        try {
          const built = (data as any).rows.map((r: Record<string, string>) => buildRow(r, ui))
          setRows(built)
          setSelectedRows(new Set())
          setEditPanelIdx(null)
          setEditPanelBuf({})
          toast.success(`Extracted ${built.length} invoice row${built.length !== 1 ? 's' : ''}`)
        } catch (buildErr: any) {
          setParseError('Row build error: ' + buildErr.message)
        }
      } else if ((data as any).rows?.length === 0) {
        setRows([])
        toast.info('No invoice rows could be extracted from this file.')
      } else {
        setParseError((data as any).error || 'Parsing failed')
      }
    } catch (e: any) {
      setParseError('Error: ' + e.message)
    } finally {
      setParsing(false)
    }
  }

  function toggleRow(i: number) {
    setSelectedRows(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function toggleAll() {
    if (!rows) return
    setSelectedRows(prev =>
      prev.size === rows.length ? new Set() : new Set(rows.map((_, i) => i))
    )
  }

  function handleDownloadCSV() {
    if (!rows || rows.length === 0) return
    const toDownload = selectedRows.size > 0
      ? rows.filter((_, i) => selectedRows.has(i))
      : rows
    const header = COLUMNS.map(c => `"${c.label.replace(/[\n\r]/g, ' ')}"`).join(',')
    const body = toDownload.map(row =>
      COLUMNS.map(c => `"${(row[c.key] || '').toString().replace(/"/g, '""')}"`).join(',')
    ).join('\n')
    const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dp_invoice_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function openEditPanel(i: number) {
    setEditPanelIdx(i)
    setEditPanelBuf({ ...(rows?.[i] || {}) })
    setMenuOpenIdx(null)
  }

  function closeEditPanel() {
    setEditPanelIdx(null)
    setEditPanelBuf({})
  }

  function saveEditPanel() {
    setRows(prev => prev ? prev.map((r, idx) => idx === editPanelIdx ? { ...editPanelBuf } : r) : prev)
    setEditPanelIdx(null)
    setEditPanelBuf({})
  }

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

  const canParse = !!(file && vendorCode && dpName && serviceStartDate && serviceEndDate && serviceMonth)
  const uploadLabel = activeDP === 'busybees' ? 'Upload Invoice Excel' : activeDP === 'dtdc' ? 'Upload Invoice (PDF or Excel)' : 'Upload Invoice PDF'
  const fileAcceptLabel = activeDP === 'busybees' ? 'Excel (.xlsx)' : activeDP === 'dtdc' ? 'PDF & .xlsx' : 'PDF only'

  return (
    <div className="lx-shell">
      <style>{`
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

        /* ── DP Invoice Booking page ── */
        .dp-page {
          flex: 1;
          overflow-y: auto;
          padding: 22px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-sizing: border-box;
        }
        .dp-page-header { display: flex; align-items: flex-start; gap: 12px; }
        .dp-page-icon {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #1E4D6B 0%, #153650 100%);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: #fff;
        }
        .dp-page-title {
          font-size: 1.35rem;
          font-weight: 800;
          letter-spacing: -0.5px;
          color: #1E4D6B;
        }
        .dp-page-subtitle {
          font-size: 0.84rem;
          color: #6b7280;
          margin-top: 3px;
        }

        /* DP tab bar */
        .dp-tab-bar {
          display: flex;
          gap: 2px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 5px;
          flex-wrap: wrap;
        }
        .dp-tab-btn {
          padding: 7px 18px;
          border: none;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          background: transparent;
          color: #6b7280;
        }
        .dp-tab-btn:hover { background: #f3f4f6; color: #1E4D6B; }
        .dp-tab-btn.dp-tab-active {
          background: #1E4D6B;
          color: #fff;
          font-weight: 600;
        }

        /* Cards */
        .dp-card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
        }
        .dp-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 20px;
          background: linear-gradient(135deg, #1E4D6B 0%, #153650 100%);
          border-radius: 10px 10px 0 0;
        }
        .dp-card-header-icon {
          width: 28px;
          height: 28px;
          background: rgba(255,255,255,0.15);
          border-radius: 7px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          flex-shrink: 0;
        }
        .dp-card-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #fff;
        }
        .dp-card-subtitle {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.72);
          margin-top: 1px;
        }
        .dp-card-body { padding: 20px; }

        /* Section labels */
        .dp-section-label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.7px;
          color: #6b7280;
          margin-bottom: 12px;
          margin-top: 4px;
        }
        .dp-section-note {
          font-size: 0.78rem;
          color: #9ca3af;
          margin-bottom: 10px;
          margin-top: -6px;
        }

        /* Form grid */
        .dp-grid-4 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .dp-grid-5 {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
        }
        .dp-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
          max-width: 500px;
        }
        .dp-grid-7 {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 10px;
        }
        .dp-grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }

        @media (max-width: 900px) {
          .dp-grid-4 { grid-template-columns: repeat(2, 1fr); }
          .dp-grid-5 { grid-template-columns: repeat(2, 1fr); }
          .dp-grid-7 { grid-template-columns: repeat(2, 1fr); }
          .dp-grid-3 { grid-template-columns: repeat(2, 1fr); }
          .dp-grid-2 { grid-template-columns: 1fr; max-width: 100%; }
        }
        .dp-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .dp-label {
          font-size: 0.78rem;
          font-weight: 600;
          color: #374151;
        }
        .dp-req { color: #ef4444; }
        .dp-input, .dp-select {
          height: 34px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          padding: 0 10px;
          font-size: 0.85rem;
          color: #111827;
          background: #fff;
          width: 100%;
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .dp-input:focus, .dp-select:focus {
          border-color: #1E4D6B;
          box-shadow: 0 0 0 3px rgba(30,77,107,0.08);
        }
        .dp-select { cursor: pointer; }

        /* Divider between sections */
        .dp-section-divider {
          border: none;
          border-top: 1px solid #f3f4f6;
          margin: 16px 0;
        }

        /* Upload zone */
        .dp-dropzone {
          border: 2px dashed #d1d5db;
          border-radius: 8px;
          padding: 36px 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          background: #fafafa;
          text-align: center;
        }
        .dp-dropzone:hover, .dp-dropzone.dp-dragging {
          border-color: #1E4D6B;
          background: #f0f5f9;
        }
        .dp-dropzone-icon {
          width: 48px;
          height: 48px;
          background: #e6eef3;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #1E4D6B;
        }
        .dp-dropzone-text {
          font-size: 0.9rem;
          color: #374151;
        }
        .dp-dropzone-link { color: #1E4D6B; font-weight: 600; text-decoration: underline; cursor: pointer; }
        .dp-dropzone-hint { font-size: 0.78rem; color: #9ca3af; }
        .dp-file-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .dp-file-name { font-size: 0.88rem; color: #374151; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dp-file-size { font-size: 0.78rem; color: #9ca3af; flex-shrink: 0; }
        .dp-file-remove {
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          font-size: 1rem;
          padding: 2px 6px;
          border-radius: 4px;
          transition: color 0.15s, background 0.15s;
        }
        .dp-file-remove:hover { color: #dc2626; background: #fef2f2; }

        /* Error box */
        .dp-error-box {
          background: #fef2f2;
          border: 1px solid #fca5a5;
          border-radius: 7px;
          padding: 10px 14px;
          font-size: 0.84rem;
          color: #b91c1c;
          margin-top: 12px;
        }

        /* Extract button */
        .dp-extract-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 22px;
          background: #1E4D6B;
          color: #fff;
          border: none;
          border-radius: 7px;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
          margin-top: 14px;
        }
        .dp-extract-btn:hover:not(:disabled) { background: #174060; }
        .dp-extract-btn:disabled { background: #d1d5db; color: #9ca3af; cursor: not-allowed; }
        .dp-extract-hint {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.78rem;
          color: #9ca3af;
          margin-top: 14px;
          margin-left: 12px;
        }

        /* Results table */
        .dp-results-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 20px;
          background: linear-gradient(135deg, #1E4D6B 0%, #153650 100%);
        }
        .dp-results-title {
          font-size: 0.95rem;
          font-weight: 700;
          color: #fff;
        }
        .dp-results-count {
          font-size: 0.78rem;
          color: rgba(255,255,255,0.72);
          margin-left: 8px;
        }
        .dp-download-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          background: rgba(255,255,255,0.15);
          border: 1px solid rgba(255,255,255,0.35);
          border-radius: 6px;
          color: #fff;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .dp-download-btn:hover { background: rgba(255,255,255,0.25); }
        .dp-table-wrap { overflow-x: auto; }
        .dp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .dp-table thead tr {
          background: #f8fafc;
          border-bottom: 2px solid #e5e7eb;
        }
        .dp-table th {
          padding: 9px 10px;
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          color: #374151;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          white-space: nowrap;
        }
        .dp-table tbody tr {
          border-bottom: 1px solid #f3f4f6;
          transition: background 0.1s;
        }
        .dp-table tbody tr:hover { background: #f9fafb; }
        .dp-table tbody tr.dp-row-selected { background: #eff6ff; }
        .dp-table td {
          padding: 8px 10px;
          color: #374151;
          white-space: nowrap;
        }
        .dp-table td.dp-td-empty { color: #d1d5db; }
        .dp-action-btn {
          background: none;
          border: none;
          padding: 3px 7px;
          border-radius: 5px;
          color: #6b7280;
          cursor: pointer;
          font-size: 0.82rem;
          transition: background 0.1s, color 0.1s;
        }
        .dp-action-btn:hover { background: #f3f4f6; color: #1E4D6B; }
        .dp-menu-wrap { position: relative; display: inline-block; }
        .dp-menu-dropdown {
          position: absolute;
          right: 0;
          top: calc(100% + 2px);
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 7px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.1);
          z-index: 50;
          min-width: 120px;
          overflow: hidden;
        }
        .dp-menu-item {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 9px 14px;
          background: none;
          border: none;
          font-size: 0.84rem;
          color: #374151;
          cursor: pointer;
          text-align: left;
          transition: background 0.1s;
        }
        .dp-menu-item:hover { background: #f3f4f6; color: #1E4D6B; }
        .dp-empty-table {
          padding: 40px 20px;
          text-align: center;
          font-size: 0.88rem;
          color: #9ca3af;
        }

        /* Edit panel */
        .dp-edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: rgba(0,0,0,0.35);
        }
        .dp-edit-panel {
          position: absolute;
          right: 0;
          top: 0;
          height: 100%;
          width: 400px;
          background: #fff;
          border-left: 1px solid #e5e7eb;
          display: flex;
          flex-direction: column;
          box-shadow: -4px 0 24px rgba(0,0,0,0.1);
        }
        .dp-edit-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid #e5e7eb;
          background: linear-gradient(135deg, #1E4D6B 0%, #153650 100%);
        }
        .dp-edit-title { font-size: 0.95rem; font-weight: 700; color: #fff; }
        .dp-edit-sub { font-size: 0.78rem; color: rgba(255,255,255,0.72); margin-top: 2px; }
        .dp-edit-close {
          background: rgba(255,255,255,0.12);
          border: none;
          border-radius: 6px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: rgba(255,255,255,0.8);
          font-size: 1rem;
          transition: background 0.15s;
        }
        .dp-edit-close:hover { background: rgba(255,255,255,0.25); }
        .dp-edit-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .dp-edit-footer {
          display: flex;
          gap: 10px;
          padding: 14px 20px;
          border-top: 1px solid #e5e7eb;
          background: #f9fafb;
        }
        .dp-edit-cancel {
          flex: 1;
          padding: 9px;
          border: 1px solid #d1d5db;
          border-radius: 7px;
          background: #fff;
          color: #374151;
          font-size: 0.88rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.15s;
        }
        .dp-edit-cancel:hover { background: #f3f4f6; }
        .dp-edit-save {
          flex: 1;
          padding: 9px;
          border: none;
          border-radius: 7px;
          background: #1E4D6B;
          color: #fff;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .dp-edit-save:hover { background: #174060; }

        /* Loading/error banners */
        .dp-loading-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          border-radius: 8px;
          font-size: 0.84rem;
          color: #1d4ed8;
        }
        .dp-error-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: #fef2f2;
          border: 1px solid #fca5a5;
          border-radius: 8px;
          font-size: 0.84rem;
          color: #b91c1c;
        }
        .dp-spin { animation: dp-spin 0.8s linear infinite; display: inline-flex; }
        @keyframes dp-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Sidebar ── */}
      <aside className={`lx-sidebar${collapsed ? ' lx-collapsed' : ''}`}>
        <div className="lx-logo-row">
          {!collapsed && <span className="lx-logo-title">LedgerX</span>}
          <button
            className="lx-collapse-btn"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
        </div>
        <nav className="lx-nav">
          {DP_NAV.map(item => (
            <button
              key={item.id}
              className={`lx-nav-item${item.id === 'dp-invoice-booking' ? ' lx-active' : ''}`}
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
            <>
              <img src="/fynd-logo-white.png" alt="Fynd" className="lx-fynd-logo-img" />
              <button className="lx-home-btn" onClick={() => handleNav('home')} title="Home">
                <HomeIcon />
              </button>
            </>
          ) : (
            <img src="/fynd-logo-white.png" alt="Fynd" className="lx-fynd-logo-sm" />
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="dp-page">

        {/* Page header */}
        <div className="dp-page-header">
          <div className="dp-page-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <div>
            <div className="dp-page-title">DP Invoice Booking</div>
            <div className="dp-page-subtitle">Select a delivery partner, configure invoice settings, upload a PDF and extract the full Invoice Wise Data table.</div>
          </div>
        </div>

        {/* DP Tab bar */}
        <div className="dp-tab-bar">
          {DP_TABS.map(tab => (
            <button
              key={tab.key}
              className={`dp-tab-btn${activeDP === tab.key ? ' dp-tab-active' : ''}`}
              onClick={() => setActiveDP(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Init loading / error */}
        {initLoading && (
          <div className="dp-loading-bar">
            <span className="dp-spin">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            </span>
            Loading master data…
          </div>
        )}
        {initError && (
          <div className="dp-error-banner">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {initError}
          </div>
        )}

        {/* ── Card 1: Invoice Details ── */}
        <div className="dp-card">
          <div className="dp-card-header">
            <div className="dp-card-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div>
              <div className="dp-card-title">Invoice Details</div>
              <div className="dp-card-subtitle">Select delivery partner and service period</div>
            </div>
          </div>
          <div className="dp-card-body">
            <div className="dp-grid-5">
              <div className="dp-field">
                <label className="dp-label">Vendor Code <span className="dp-req">*</span></label>
                <input type="text" className="dp-input" value={vendorCode} onChange={e => setVendorCode(e.target.value)} placeholder="e.g. 100001" />
              </div>
              <div className="dp-field">
                <label className="dp-label">DP Name <span className="dp-req">*</span></label>
                <Sel value={dpName} onChange={handleDpNameChange} options={initData.dpNames} placeholder="— Select DP Name —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">Service Start Date <span className="dp-req">*</span></label>
                <input type="date" className="dp-input" value={serviceStartDate} onChange={e => setServiceStartDate(e.target.value)} />
              </div>
              <div className="dp-field">
                <label className="dp-label">Service End Date <span className="dp-req">*</span></label>
                <input type="date" className="dp-input" value={serviceEndDate} onChange={e => setServiceEndDate(e.target.value)} />
              </div>
              <div className="dp-field">
                <label className="dp-label">Service Month <span className="dp-req">*</span></label>
                <Sel value={serviceMonth} onChange={setServiceMonth} options={initData.serviceMonths} placeholder="— Select Month —" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Card 2: Invoice Configuration ── */}
        <div className="dp-card">
          <div className="dp-card-header">
            <div className="dp-card-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
            </div>
            <div>
              <div className="dp-card-title">Invoice Configuration</div>
              <div className="dp-card-subtitle">Ledger, tax and classification settings</div>
            </div>
          </div>
          <div className="dp-card-body">
            {/* General */}
            <div className="dp-section-label">General</div>
            <div className="dp-grid-7">
              <div className="dp-field">
                <label className="dp-label">Vch Type</label>
                <Sel value={vchType} onChange={setVchType} options={initData.voucherTypes} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">Invoice Type</label>
                <Sel value={invoiceType} onChange={setInvoiceType} options={initData.invoiceTypes} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">E-Invoice</label>
                <Sel value={eInvoice} onChange={setEInvoice} options={initData.eInvoiceOptions} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">Frequency</label>
                <Sel value={frequency} onChange={setFrequency} options={initData.frequencies} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">Vendor State</label>
                <Sel value={vendorState} onChange={setVendorState} options={initData.vendorStates} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">GST Registered (Y/N)</label>
                <Sel value={gstRegistered} onChange={setGstRegistered} options={['Yes', 'No']} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">GST Avail</label>
                <Sel value={gstAvail} onChange={setGstAvail} options={['Yes', 'Yes-ISD', 'No', 'No-ITC']} placeholder="— Select —" />
              </div>
            </div>
            <div style={{ marginTop: 14 }} className="dp-grid-2">
              <div className="dp-field">
                <label className="dp-label">Service Description</label>
                <input type="text" className="dp-input" value={serviceDescription} onChange={e => setServiceDescription(e.target.value)} placeholder="Freight Charges" />
              </div>
              <div className="dp-field">
                <label className="dp-label">PO Number</label>
                <input type="text" className="dp-input" value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="Enter PO number" />
              </div>
            </div>

            <hr className="dp-section-divider" />

            {/* Ledger Mapping */}
            <div className="dp-section-label">Ledger Mapping</div>
            <div className="dp-grid-7">
              <div className="dp-field">
                <label className="dp-label">PNL Head</label>
                <Sel value={pnlHead} onChange={setPnlHead} options={initData.pnlHeads} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">Group Ledger</label>
                <Sel value={groupLedger} onChange={setGroupLedger} options={initData.groupLedgers} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">Ledger Exp Name 1</label>
                <Sel value={ledgerExpName1} onChange={setLedgerExpName1} options={initData.ledgerExpNames} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">Ledger Exp Name 2</label>
                <Sel value={ledgerExpName2} onChange={setLedgerExpName2} options={initData.ledgerExpNames} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">TDS Ledger</label>
                <Sel value={tdsLedger} onChange={setTdsLedger} options={initData.tdsLedgers} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">TDS %</label>
                <input type="number" className="dp-input" value={tdsPercent} onChange={e => setTdsPercent(e.target.value)} placeholder="e.g. 2" min="0" max="100" step="0.01" />
              </div>
              <div className="dp-field">
                <label className="dp-label">LDC Applicability (Yes/No)</label>
                <Sel value={ldcApplicability} onChange={setLdcApplicability} options={['Yes', 'No']} placeholder="— Select —" />
              </div>
            </div>

            <hr className="dp-section-divider" />

            {/* GST Ledgers */}
            <div className="dp-section-label">GST Ledgers — Auto-applied per row based on Area (MUMBAI/PUNE → CGST+SGST, OTHERS → IGST)</div>
            <div className="dp-grid-3">
              <div className="dp-field">
                <label className="dp-label">CGST Ledger</label>
                <Sel value={cgstLedger} onChange={setCgstLedger} options={initData.cgstLedgers} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">SGST Ledger</label>
                <Sel value={sgstLedger} onChange={setSgstLedger} options={initData.sgstLedgers} placeholder="— Select —" />
              </div>
              <div className="dp-field">
                <label className="dp-label">IGST Ledger</label>
                <Sel value={igstLedger} onChange={setIgstLedger} options={initData.igstLedgers} placeholder="— Select —" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Card 3: Upload ── */}
        <div className="dp-card">
          <div className="dp-card-header">
            <div className="dp-card-header-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div>
              <div className="dp-card-title">{uploadLabel}</div>
              <div className="dp-card-subtitle">{DP_FORMAT_LABEL[activeDP]}</div>
            </div>
          </div>
          <div className="dp-card-body">
            {!file ? (
              <div
                className={`dp-dropzone${dragging ? ' dp-dragging' : ''}`}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="dp-dropzone-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <div className="dp-dropzone-text">
                  Drop your {activeDP === 'busybees' ? 'Excel file' : activeDP === 'dtdc' ? 'PDF or Excel file' : 'PDF'} here, or{' '}
                  <span className="dp-dropzone-link">browse files</span>
                </div>
                <div className="dp-dropzone-hint">{fileAcceptLabel}</div>
                <input ref={fileInputRef} type="file" accept=".pdf,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFileChange} />
              </div>
            ) : (
              <div className="dp-file-row">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E4D6B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span className="dp-file-name">{file.name}</span>
                <span className="dp-file-size">{(file.size / 1024).toFixed(1)} KB</span>
                <button className="dp-file-remove" onClick={handleRemoveFile} title="Remove">✕</button>
              </div>
            )}

            {parseError && <div className="dp-error-box">{parseError}</div>}

            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="dp-extract-btn"
                disabled={!canParse || parsing}
                onClick={handleParse}
              >
                {parsing ? (
                  <>
                    <span className="dp-spin">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    </span>
                    Extracting…
                  </>
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    Extract Invoice Table
                  </>
                )}
              </button>
              {!canParse && file && (
                <span className="dp-extract-hint">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Complete Invoice Details above to enable extraction
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Results table ── */}
        {rows !== null && (
          <div className="dp-card" ref={tablePanelRef}>
            <div className="dp-results-header">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span className="dp-results-title">Invoice Summary</span>
                <span className="dp-results-count">
                  {selectedRows.size > 0
                    ? `${selectedRows.size} of ${rows.length} selected`
                    : `${rows.length} row${rows.length !== 1 ? 's' : ''} extracted`}
                </span>
              </div>
              <button className="dp-download-btn" onClick={handleDownloadCSV}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                {selectedRows.size > 0 ? `Download (${selectedRows.size})` : 'Download CSV'}
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="dp-empty-table">No invoice rows could be extracted from this file.</div>
            ) : (
              <div className="dp-table-wrap">
                <table className="dp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox"
                          checked={selectedRows.size === rows.length && rows.length > 0}
                          ref={el => { if (el) el.indeterminate = selectedRows.size > 0 && selectedRows.size < rows.length }}
                          onChange={toggleAll}
                        />
                      </th>
                      {COLUMNS.map(c => (
                        <th key={c.key}>{c.label.replace(/\n/g, ' ')}</th>
                      ))}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={selectedRows.has(i) ? 'dp-row-selected' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedRows.has(i)}
                            onChange={() => toggleRow(i)}
                          />
                        </td>
                        {COLUMNS.map(c => (
                          <td key={c.key} className={row[c.key] ? '' : 'dp-td-empty'}>
                            {row[c.key] || '—'}
                          </td>
                        ))}
                        <td>
                          <div className="dp-menu-wrap">
                            <button
                              className="dp-action-btn"
                              onClick={() => setMenuOpenIdx(menuOpenIdx === i ? null : i)}
                            >
                              •••
                            </button>
                            {menuOpenIdx === i && (
                              <div className="dp-menu-dropdown">
                                <button className="dp-menu-item" onClick={() => openEditPanel(i)}>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  Edit Row
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Edit side panel ── */}
      {editPanelIdx !== null && (
        <div className="dp-edit-overlay" onClick={closeEditPanel}>
          <div className="dp-edit-panel" onClick={e => e.stopPropagation()}>
            <div className="dp-edit-header">
              <div>
                <div className="dp-edit-title">Editing Row {editPanelIdx + 1}</div>
                <div className="dp-edit-sub">
                  {editPanelBuf.vendor_name || editPanelBuf.invoice_no || 'Invoice row'}
                </div>
              </div>
              <button className="dp-edit-close" onClick={closeEditPanel}>✕</button>
            </div>
            <div className="dp-edit-body">
              {COLUMNS.map(c => (
                <div key={c.key} className="dp-field">
                  <label className="dp-label">{c.label.replace(/\n/g, ' ')}</label>
                  <input
                    className="dp-input"
                    value={editPanelBuf[c.key] ?? ''}
                    onChange={e => setEditPanelBuf(prev => ({ ...prev, [c.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="dp-edit-footer">
              <button className="dp-edit-cancel" onClick={closeEditPanel}>Cancel</button>
              <button className="dp-edit-save" onClick={saveEditPanel}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
