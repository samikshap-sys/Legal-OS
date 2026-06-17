/**
 * Google Sheets data layer for LedgerX AP Dashboard
 * Sheet: "Invoice Wise Data" in spreadsheet 1lNa90wnhWFkSOcG-4HfY4Phl_ZLfR9R4jK4oSRZ4xJE
 * Mirrors the computation logic from the original finops-local/app.py _load_dashboard_data()
 */

import { google } from 'googleapis';

const SPREADSHEET_ID = '1lNa90wnhWFkSOcG-4HfY4Phl_ZLfR9R4jK4oSRZ4xJE';
const INVOICE_SHEET  = 'Invoice Wise Data';
const CACHE_TTL_MS   = 60 * 1000; // 60-second cache

let sheetsClient: ReturnType<typeof google.sheets> | null = null;
let cachedData: { kpis: APKpis; charts: APCharts } | null = null;
let cacheExpiry = 0;

// ── Types ──────────────────────────────────────────────────────────────────

export interface APKpis {
  total_outstanding_count: number;
  total_outstanding_amt: number;
  overdue_count: number;
  overdue_amt: number;
  not_due_count: number;
  not_due_amt: number;
  due_next_7d_count: number;
  due_next_7d_amt: number;
  msme_45d_count: number;
  msme_45d_amt: number;
  paid_today_count: number;
  paid_today_amt: number;
  pending_approval_count: number;
  pending_approval_amt: number;
  rcm_pending_count: number;
  approvals_pending_gt7d: number;
}

export interface ChartItem {
  label: string;
  cnt: number;
  amt: number;
  classification?: string;
}

export interface APCharts {
  aging: ChartItem[];
  payment_status: ChartItem[];
  tally_status: ChartItem[];
  approval_status: ChartItem[];
  top_vendors: ChartItem[];
  monthly: ChartItem[];
}

// ── Auth ───────────────────────────────────────────────────────────────────

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  const credentials = JSON.parse(saJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toFloat(s: string): number {
  try {
    return parseFloat(s.replace(/,/g, '').replace(/₹|Rs\.?/g, '').trim()) || 0;
  } catch {
    return 0;
  }
}

function parseDate(s: string): Date | null {
  if (!s || !s.trim()) return null;
  const fmts = [
    // dd-Mon-YYYY  e.g. 01-Jan-2026
    /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/,
    // dd/mm/yyyy
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // dd-mm-yyyy
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  ];
  const months: Record<string, number> = {
    jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11
  };
  const str = s.trim();

  // Try dd-Mon-YYYY
  const m1 = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m1) {
    const mo = months[m1[2].toLowerCase()];
    if (mo !== undefined) return new Date(parseInt(m1[3]), mo, parseInt(m1[1]));
  }
  // Try dd/mm/yyyy
  const m2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
  // Try dd-mm-yyyy
  const m3 = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m3) return new Date(parseInt(m3[3]), parseInt(m3[2]) - 1, parseInt(m3[1]));

  return null;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

// ── Core computation ───────────────────────────────────────────────────────

async function loadDashboardData(): Promise<{ kpis: APKpis; charts: APCharts }> {
  const sheets = await getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: INVOICE_SHEET,
  });

  const raw = (resp.data.values || []) as string[][];
  if (raw.length < 3) {
    // Not enough data — return zeroed result
    return { kpis: emptyKpis(), charts: emptyCharts() };
  }

  // Row 0 is a title row; row 1 has actual column headers (same as app.py)
  const headerRow = raw[1].map((h: string) => h.trim().replace(/\s+/g, ' '));
  const idx: Record<string, number> = {};
  headerRow.forEach((h, i) => { if (h) idx[h] = i; });

  const dataRows = raw.slice(2);

  function g(row: string[], col: string): string {
    const i = idx[col];
    return (i !== undefined && i < row.length) ? (row[i] || '').trim() : '';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // KPI accumulators
  let total_outstanding_count = 0, total_outstanding_amt = 0;
  let overdue_count = 0, overdue_amt = 0;
  let not_due_count = 0, not_due_amt = 0;
  let due_next_7d_count = 0, due_next_7d_amt = 0;
  let msme_45d_count = 0, msme_45d_amt = 0;
  let paid_today_count = 0, paid_today_amt = 0;
  let pending_approval_count = 0, pending_approval_amt = 0;
  let rcm_pending_count = 0, approvals_pending_gt7d = 0;

  // Chart accumulators
  const agingMap:         Record<string, { cnt: number; amt: number }> = {};
  const paymentStatusMap: Record<string, { cnt: number; amt: number }> = {};
  const tallyStatusMap:   Record<string, { cnt: number }> = {};
  const approvalStatusMap:Record<string, { cnt: number }> = {};
  const vendorMap:        Record<string, { cnt: number; amt: number; classification: string }> = {};
  const monthlyMap:       Record<string, { label: string; cnt: number; amt: number }> = {};

  for (const row of dataRows) {
    const paymentStatus  = g(row, 'Payment Status');
    const approvalStatus = g(row, 'Approval Status');
    const tallyStatus    = g(row, 'Tally Entry Status');
    const netPayable     = toFloat(g(row, 'Net Payable'));
    const actualPayable  = toFloat(g(row, 'Actual Payable Amount')) || netPayable;
    const paymentTag     = g(row, 'Payment Tag');
    const msmeCol        = g(row, 'Vendor - MSME/Non-MSME');
    const invDate        = parseDate(g(row, 'Invoice Date'));
    const dueDate        = parseDate(g(row, 'Due Date'));
    const payDate1       = parseDate(g(row, 'Payment Date1'));
    const payDate2       = parseDate(g(row, 'Payment Date2'));
    const payDate3       = parseDate(g(row, 'Payment Date3'));
    const paidAmt1       = toFloat(g(row, 'Paid Amt1'));
    const paidAmt2       = toFloat(g(row, 'Paid Amt2'));
    const paidAmt3       = toFloat(g(row, 'Paid Amt3'));
    const vendorCls      = g(row, 'Vendor Classification');
    const vendorName     = g(row, 'Vendor Name');
    const aging          = g(row, 'Aging');
    const rcm            = g(row, 'RCM Applicability');

    const isUnpaid = paymentStatus.toLowerCase() !== 'paid';

    // Total Outstanding
    if (isUnpaid) {
      total_outstanding_count++;
      total_outstanding_amt += actualPayable;
    }

    // Overdue
    if (paymentTag === 'Overdue') {
      overdue_count++;
      overdue_amt += actualPayable;
    }

    // Not Due
    if (paymentTag === 'Not Due') {
      not_due_count++;
      not_due_amt += actualPayable;
    }

    // Due Next 7 Days
    if (dueDate) {
      const d7 = addDays(today, 7);
      if (dueDate >= today && dueDate <= d7) {
        due_next_7d_count++;
        due_next_7d_amt += actualPayable;
      }
    }

    // MSME Due 45D+
    if (msmeCol.toUpperCase() === 'MSME' && paymentTag === 'Overdue') {
      msme_45d_count++;
      msme_45d_amt += actualPayable;
    }

    // Paid Today
    if (payDate1 && sameDay(payDate1, today)) { paid_today_count++; paid_today_amt += paidAmt1; }
    if (payDate2 && sameDay(payDate2, today)) { paid_today_amt += paidAmt2; }
    if (payDate3 && sameDay(payDate3, today)) { paid_today_amt += paidAmt3; }

    // Pending Approval
    if (approvalStatus === 'Not Approved') {
      pending_approval_count++;
      pending_approval_amt += actualPayable;
      if (invDate && diffDays(today, invDate) > 7) approvals_pending_gt7d++;
    }

    // RCM Pending
    if (rcm === 'Yes' && tallyStatus === 'Pending') rcm_pending_count++;

    // Chart: Aging
    if (isUnpaid && aging) {
      const b = agingMap[aging] || (agingMap[aging] = { cnt: 0, amt: 0 });
      b.cnt++; b.amt += actualPayable;
    }

    // Chart: Payment Status
    const ps = paymentStatus || 'Unknown';
    const psb = paymentStatusMap[ps] || (paymentStatusMap[ps] = { cnt: 0, amt: 0 });
    psb.cnt++; psb.amt += netPayable;

    // Chart: Tally Status
    const ts = tallyStatus || 'Unknown';
    tallyStatusMap[ts] = tallyStatusMap[ts] || { cnt: 0 };
    tallyStatusMap[ts].cnt++;

    // Chart: Approval Status
    const as_ = approvalStatus || 'Unknown';
    approvalStatusMap[as_] = approvalStatusMap[as_] || { cnt: 0 };
    approvalStatusMap[as_].cnt++;

    // Chart: Top Vendors
    if (isUnpaid && vendorName) {
      const vb = vendorMap[vendorName] || (vendorMap[vendorName] = { cnt: 0, amt: 0, classification: vendorCls });
      vb.cnt++; vb.amt += netPayable;
      if (!vb.classification && vendorCls) vb.classification = vendorCls;
    }

    // Chart: Monthly Trend
    if (invDate) {
      const mk = monthKey(invDate);
      if (!monthlyMap[mk]) monthlyMap[mk] = { label: monthLabel(invDate), cnt: 0, amt: 0 };
      monthlyMap[mk].cnt++;
      monthlyMap[mk].amt += netPayable;
    }
  }

  // Build 6-month window for monthly trend
  const cutoffDate = new Date(today);
  cutoffDate.setMonth(cutoffDate.getMonth() - 5);
  cutoffDate.setDate(1);
  const cutoff = monthKey(cutoffDate);

  const kpis: APKpis = {
    total_outstanding_count,
    total_outstanding_amt: Math.round(total_outstanding_amt * 100) / 100,
    overdue_count,
    overdue_amt: Math.round(overdue_amt * 100) / 100,
    not_due_count,
    not_due_amt: Math.round(not_due_amt * 100) / 100,
    due_next_7d_count,
    due_next_7d_amt: Math.round(due_next_7d_amt * 100) / 100,
    msme_45d_count,
    msme_45d_amt: Math.round(msme_45d_amt * 100) / 100,
    paid_today_count,
    paid_today_amt: Math.round(paid_today_amt * 100) / 100,
    pending_approval_count,
    pending_approval_amt: Math.round(pending_approval_amt * 100) / 100,
    rcm_pending_count,
    approvals_pending_gt7d,
  };

  const charts: APCharts = {
    aging: Object.entries(agingMap)
      .map(([label, v]) => ({ label, cnt: v.cnt, amt: Math.round(v.amt * 100) / 100 }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    payment_status: Object.entries(paymentStatusMap)
      .map(([label, v]) => ({ label, cnt: v.cnt, amt: Math.round(v.amt * 100) / 100 })),
    tally_status: Object.entries(tallyStatusMap)
      .map(([label, v]) => ({ label, cnt: v.cnt, amt: 0 })),
    approval_status: Object.entries(approvalStatusMap)
      .map(([label, v]) => ({ label, cnt: v.cnt, amt: 0 })),
    top_vendors: Object.entries(vendorMap)
      .map(([label, v]) => ({ label, cnt: v.cnt, amt: Math.round(v.amt * 100) / 100, classification: v.classification }))
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 5),
    monthly: Object.entries(monthlyMap)
      .filter(([k]) => k >= cutoff)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ label: v.label, cnt: v.cnt, amt: Math.round(v.amt * 100) / 100 })),
  };

  return { kpis, charts };
}

function emptyKpis(): APKpis {
  return {
    total_outstanding_count: 0, total_outstanding_amt: 0,
    overdue_count: 0, overdue_amt: 0,
    not_due_count: 0, not_due_amt: 0,
    due_next_7d_count: 0, due_next_7d_amt: 0,
    msme_45d_count: 0, msme_45d_amt: 0,
    paid_today_count: 0, paid_today_amt: 0,
    pending_approval_count: 0, pending_approval_amt: 0,
    rcm_pending_count: 0, approvals_pending_gt7d: 0,
  };
}

function emptyCharts(): APCharts {
  return { aging: [], payment_status: [], tally_status: [], approval_status: [], top_vendors: [], monthly: [] };
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function getAPDashboardData(): Promise<{ kpis: APKpis; charts: APCharts }> {
  const now = Date.now();
  if (cachedData && now < cacheExpiry) return cachedData;
  cachedData = await loadDashboardData();
  cacheExpiry = now + CACHE_TTL_MS;
  console.log('[LedgerX] AP Dashboard data refreshed from Google Sheets');
  return cachedData;
}

export function bustAPDashboardCache(): void {
  cachedData = null;
  cacheExpiry = 0;
}
