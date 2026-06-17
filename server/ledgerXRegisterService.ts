/**
 * ledgerXRegisterService.ts
 * Backend service for Invoice Register, Tally Entries, Aging Analysis, DP Invoice Booking.
 * Mirrors the Python Flask backend (app.py) line-by-line.
 */
import { google } from 'googleapis';
import * as XLSX from 'xlsx';

// ── Cache ─────────────────────────────────────────────────────────────────
const CACHE: Record<string, { ts: number; data: any }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function cacheGet(key: string) {
  const entry = CACHE[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { delete CACHE[key]; return null; }
  return entry.data;
}

function cacheSet(key: string, data: any) {
  CACHE[key] = { ts: Date.now(), data };
}

export function bustCache(key: string) {
  delete CACHE[key];
}

// ── Google Auth ───────────────────────────────────────────────────────────
function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GCS_SERVICE_ACCOUNT_JSON || '';
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set');
  return JSON.parse(raw);
}

function getAuth() {
  const creds = getCredentials();
  return new google.auth.GoogleAuth({
    credentials: creds,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });
}

function getSheetsClient() {
  return google.sheets({ version: 'v4', auth: getAuth() as any });
}

function getDriveClient() {
  return google.drive({ version: 'v3', auth: getAuth() as any });
}

// ── Helpers ───────────────────────────────────────────────────────────────
function indexMap(header: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  header.forEach((h, i) => { m[h.trim()] = i; });
  return m;
}

function g(row: string[], idx: Record<string, number>, col: string): string {
  const i = idx[col];
  return i !== undefined ? (row[i] || '') : '';
}

function toF(s: string): number {
  return parseFloat(String(s).replace(/,/g, '')) || 0;
}

function bucketFromAging(s: string): string | null {
  if (!s) return null;
  const n = toF(s);
  if (n <= 0) return '0';
  if (n <= 30) return '1-30';
  if (n <= 60) return '31-60';
  if (n <= 90) return '61-90';
  if (n <= 180) return '91-180';
  return '180+';
}

function colToLetter(col: number): string {
  let s = '';
  let n = col;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

// ── Types ───────────────────────────────────────────────────────────────────
export interface InvoiceRegisterRow {
  _rowIdx: number;
  invoice_no: string;
  vendor: string;
  type: string;
  inv_date: string;
  due_date: string;
  net_payable: string;
  gst: string;
  tds: string;
  msme: string;
  aging: string;
  tally_status: string;
  approval_status: string;
  payment_status: string;
  vendor_gstin: string;
}

// ── Sheet IDs ─────────────────────────────────────────────────────────────
const SHEET_ID_INVOICE_REGISTER = '1lNa90wnhWFkSOcG-4HfY4Phl_ZLfR9R4jK4oSRZ4xJE';
const SHEET_ID_TALLY = '1lNa90wnhWFkSOcG-4HfY4Phl_ZLfR9R4jK4oSRZ4xJE';
const SHEET_ID_AGING = '1lNa90wnhWFkSOcG-4HfY4Phl_ZLfR9R4jK4oSRZ4xJE';
const SHEET_ID_DP = '1lNa90wnhWFkSOcG-4HfY4Phl_ZLfR9R4jK4oSRZ4xJE';

const TAB_INVOICE_REGISTER = 'Invoice Wise Data';
const TAB_TALLY = 'Inv Entry Template';
const TAB_AGING = 'Invoice Wise Data';
const TAB_DP_VENDORS = 'Vendor Master';
const TAB_DP_LEDGERS = 'Ledger Master';
const TAB_DP_MASTERS = 'Masters';

// ── Invoice Register ──────────────────────────────────────────────────────
export async function loadInvoiceRegister(): Promise<{ rows: InvoiceRegisterRow[] }> {
  const cached = cacheGet('invoice_register');
  if (cached) return cached;

  const sheets = getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_INVOICE_REGISTER,
    range: `${TAB_INVOICE_REGISTER}!A1:ZZ`,
  });
  const rawRows = resp.data.values || [];
  // v1 structure: row 0 = title row, row 1 = headers, row 2+ = data
  if (rawRows.length < 2) return { rows: [] };

  const headers = (rawRows[1] as string[]).map(h => String(h || '').trim());
  const idx = indexMap(headers);

  function g(row: string[], col: string): string {
    const i = idx[col];
    return (i !== undefined && i < row.length) ? String(row[i] || '').trim() : '';
  }
  function firstFound(row: string[], ...cols: string[]): string {
    for (const col of cols) {
      const v = g(row, col);
      if (v) return v;
    }
    return '';
  }

  const dataRows = rawRows.slice(2) as string[][];
  const rows: InvoiceRegisterRow[] = dataRows.map((row, i) => ({
    _rowIdx:         i + 3, // row1=title, row2=header, row3+=data
    invoice_no:      g(row, 'Invoice No'),
    vendor:          g(row, 'Vendor Name'),
    type:            firstFound(row, 'Invoice Type', 'Voucher Type'),
    inv_date:        g(row, 'Invoice Date'),
    due_date:        g(row, 'Due Date'),
    net_payable:     g(row, 'Net Payable'),
    gst:             firstFound(row, 'GST Amount', 'GST Amt', 'GST', 'IGST', 'CGST'),
    tds:             firstFound(row, 'TDS Deducted', 'TDS Amount', 'TDS'),
    msme:            g(row, 'Vendor Classification'),
    aging:           g(row, 'Aging'),
    tally_status:    g(row, 'Tally Entry Status'),
    approval_status: g(row, 'Approval Status'),
    payment_status:  g(row, 'Payment Status'),
    vendor_gstin:    g(row, 'Vendor GSTIN'),
  }));

  const result = { rows };
  cacheSet('invoice_register', result);
  return result;
}

export async function approveInvoices(rowIndices: number[], status: string): Promise<{ ok: boolean; error?: string }> {
  const sheets = getSheetsClient();
  // Re-fetch headers directly from the sheet (row 2 = headers in v1 structure)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_INVOICE_REGISTER,
    range: `${TAB_INVOICE_REGISTER}!A2:ZZ2`,
  });
  const headerRow = (resp.data.values?.[0] || []) as string[];
  const idx = indexMap(headerRow.map(h => String(h || '').trim()));

  // Find the "Approval Status" column
  const approvalCol = idx['Approval Status'] ?? idx['Status'] ?? -1;
  if (approvalCol < 0) return { ok: false, error: 'Approval Status column not found' };

  const colLetter = colToLetter(approvalCol);
  const requests = rowIndices.map(rowIdx => ({
    range: `${TAB_INVOICE_REGISTER}!${colLetter}${rowIdx + 1}`,
    values: [[status]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID_INVOICE_REGISTER,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: requests,
    },
  });

  bustCache('invoice_register');
  return { ok: true };
}

export async function remarkInvoice(rowIdx: number, remark: string): Promise<{ ok: boolean; error?: string }> {
  const sheets = getSheetsClient();
  // Re-fetch headers directly from the sheet (row 2 = headers in v1 structure)
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_INVOICE_REGISTER,
    range: `${TAB_INVOICE_REGISTER}!A2:ZZ2`,
  });
  const headerRow = (resp.data.values?.[0] || []) as string[];
  const idx = indexMap(headerRow.map(h => String(h || '').trim()));

  const remarkCol = idx['Remarks'] ?? idx['Remark'] ?? -1;
  if (remarkCol < 0) return { ok: false, error: 'Remarks column not found' };

  const colLetter = colToLetter(remarkCol);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID_INVOICE_REGISTER,
    range: `${TAB_INVOICE_REGISTER}!${colLetter}${rowIdx + 1}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[remark]] },
  });

  bustCache('invoice_register');
  return { ok: true };
}

// ── Aging Analysis ────────────────────────────────────────────────────────
export async function loadAgingAnalysis(): Promise<{
  vendors: any[];
  buckets: string[];
  totalsByBucket: Record<string, number>;
  msmeCount: number;
  nonMsmeCount: number;
  totalOutstanding: number;
}> {
  const cached = cacheGet('aging_analysis');
  if (cached) return cached;

  const sheets = getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_AGING,
    range: `${TAB_AGING}!A1:ZZ`,
  });
  const rawRows = resp.data.values || [];
  if (rawRows.length === 0) {
    return { vendors: [], buckets: [], totalsByBucket: {}, msmeCount: 0, nonMsmeCount: 0, totalOutstanding: 0 };
  }

  const headers = (rawRows[0] as string[]).map(h => String(h || '').trim());
  const idx = indexMap(headers);

  const BUCKETS = ['0', '1-30', '31-60', '61-90', '91-180', '180+'];
  const vendorMap: Record<string, any> = {};
  const totalsByBucket: Record<string, number> = {};
  BUCKETS.forEach(b => { totalsByBucket[b] = 0; });

  let msmeCount = 0;
  let nonMsmeCount = 0;
  let totalOutstanding = 0;

  for (const row of rawRows.slice(1)) {
    const vendorName = g(row as string[], idx, 'Vendor Name') || g(row as string[], idx, 'Vendor');
    if (!vendorName) continue;

    const agingDays = g(row as string[], idx, 'Aging Days') || g(row as string[], idx, 'Aging');
    const outstanding = toF(g(row as string[], idx, 'Outstanding Amount') || g(row as string[], idx, 'Net Payable') || '0');
    const isMsme = (g(row as string[], idx, 'MSME') || '').toLowerCase() === 'yes';
    const bucket = bucketFromAging(agingDays) || '0';

    if (!vendorMap[vendorName]) {
      vendorMap[vendorName] = {
        vendorName,
        isMsme,
        buckets: {} as Record<string, number>,
        total: 0,
      };
      BUCKETS.forEach(b => { vendorMap[vendorName].buckets[b] = 0; });
    }

    vendorMap[vendorName].buckets[bucket] = (vendorMap[vendorName].buckets[bucket] || 0) + outstanding;
    vendorMap[vendorName].total += outstanding;
    totalsByBucket[bucket] = (totalsByBucket[bucket] || 0) + outstanding;
    totalOutstanding += outstanding;
    if (isMsme) msmeCount++; else nonMsmeCount++;
  }

  const vendors = Object.values(vendorMap).sort((a: any, b: any) => b.total - a.total);
  const result = { vendors, buckets: BUCKETS, totalsByBucket, msmeCount, nonMsmeCount, totalOutstanding };
  cacheSet('aging_analysis', result);
  return result;
}

// ── Tally Entries ─────────────────────────────────────────────────────────
// Try multiple possible tab names for the Tally Entry sheet
const TALLY_TAB_CANDIDATES = ['Inv Entry Template', 'Inv Entry Template1', 'Tally Entry', 'TallyEntry', 'tally_entry', 'Tally', 'Tally Entries', 'TALLY ENTRY', 'Sheet1'];

async function findTallyTab(sheets: any): Promise<string> {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID_TALLY });
    const tabNames: string[] = (meta.data.sheets || []).map((s: any) => s.properties?.title || '');
    console.log('[Tally] Available tabs:', tabNames);
    // Try exact match first
    for (const candidate of TALLY_TAB_CANDIDATES) {
      if (tabNames.includes(candidate)) return candidate;
    }
    // Try case-insensitive match
    for (const candidate of TALLY_TAB_CANDIDATES) {
      const found = tabNames.find((t: string) => t.toLowerCase() === candidate.toLowerCase());
      if (found) return found;
    }
    // Try partial match for 'tally'
    const tallyTab = tabNames.find((t: string) => t.toLowerCase().includes('tally'));
    if (tallyTab) return tallyTab;
    // Fallback to first non-empty tab
    return tabNames[0] || TAB_TALLY;
  } catch {
    return TAB_TALLY;
  }
}

export async function loadTallyEntries(): Promise<{ headers: string[]; rows: string[][] }> {
  const cached = cacheGet('tally_entries');
  if (cached) return cached;

  const sheets = getSheetsClient();
  const tabName = await findTallyTab(sheets);
  console.log('[Tally] Using tab:', tabName);
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_TALLY,
    range: `${tabName}!A1:ZZ`,
  });
  const rawRows = resp.data.values || [];
  if (rawRows.length === 0) return { headers: [], rows: [] };

  const headers = (rawRows[0] as string[]).map(h => String(h || '').trim());
  const rows = rawRows.slice(1).map((row: any[]) =>
    headers.map((_, i) => row[i] !== undefined ? String(row[i]) : '')
  );

  const result = { headers, rows };
  cacheSet('tally_entries', result);
  return result;
}

export async function getTallyMasters(): Promise<{
  ok: boolean;
  companies: string[];
  ledgers: string[];
  costCentres: string[];
}> {
  const sheets = getSheetsClient();
  try {
    // Try to get from a Masters sheet
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID_TALLY,
      range: `Tally Masters!A1:D`,
    });
    const rows = resp.data.values || [];
    const companies: string[] = [];
    const ledgers: string[] = [];
    const costCentres: string[] = [];
    for (const row of rows.slice(1)) {
      if (row[0]) companies.push(String(row[0]));
      if (row[1]) ledgers.push(String(row[1]));
      if (row[2]) costCentres.push(String(row[2]));
    }
    return { ok: true, companies, ledgers, costCentres };
  } catch {
    return { ok: true, companies: ['Fynd'], ledgers: [], costCentres: [] };
  }
}

// ── v1 helpers ───────────────────────────────────────────────────────────
const COMPANY_STATE = 'MH';

function parseDateYYYYMMDD(dateStr: string): string {
  if (!dateStr) return '';
  const months: Record<string, string> = {
    Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
    Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
  };
  const m = dateStr.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = months[m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase()] || '00';
    let yr = m[3];
    if (yr.length === 2) yr = '20' + yr;
    return yr + mon + day;
  }
  return dateStr.replace(/[-/]/g, '');
}

function n(v: string): number {
  try { return v ? parseFloat(String(v).replace(/,/g, '')) || 0 : 0; } catch { return 0; }
}
function debit(v: string): string {
  const num = n(v);
  return num !== 0 ? String(-num) : 'emp';
}
function credit(v: string): string {
  const num = n(v);
  return num !== 0 ? String(num) : 'emp';
}
function ledger(v: string): string {
  return v || 'emp';
}

export async function createTallyEntries(invoices: Record<string, any>[]): Promise<{ ok: boolean; count?: number; error?: string }> {
  const sheets = getSheetsClient();
  const tabName = await findTallyTab(sheets);

  // ── Get existing tally entries to find last voucher number ──────────────
  const existingResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_TALLY,
    range: `${tabName}!A1:ZZ`,
  });
  const existing = existingResp.data.values || [];
  const hdrMap = indexMap((existing[0] || []) as string[]);
  const vchrCol = hdrMap['VOUCHERNUMBER'] ?? -1;
  let lastNum = 0;
  let fySuffix = '2627';
  const prefix = `V-BILL-${COMPANY_STATE}`;
  if (vchrCol >= 0 && existing.length > 1) {
    for (const row of existing.slice(1)) {
      if (vchrCol < row.length) {
        const m = String(row[vchrCol] || '').match(/\/(\d+)\/(\w+)/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > lastNum) { lastNum = num; fySuffix = m[2]; }
        }
      }
    }
  }

  // ── Read Invoice Wise Data once to get ledger fields ────────────────────
  const invResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_INVOICE_REGISTER,
    range: `${TAB_INVOICE_REGISTER}!A1:ZZ`,
  });
  const invShData = invResp.data.values || [];
  const invDataHdr = invShData.length > 1
    ? indexMap((invShData[1] as string[]).map(h => String(h || '').trim()))
    : {};

  function gd(dataRow: string[], col: string): string {
    const i = invDataHdr[col];
    return (i !== undefined && i < dataRow.length) ? String(dataRow[i] || '').trim() : '';
  }
  function first(dataRow: string[], ...cols: string[]): string {
    for (const col of cols) { const v = gd(dataRow, col); if (v) return v; }
    return '';
  }

  // Build lookup: sheet_row_idx → data_row
  const rowLookup: Record<number, string[]> = {};
  for (let i = 0; i < invShData.slice(2).length; i++) {
    rowLookup[i + 3] = invShData[2 + i] as string[];
  }

  const INVALID_TDS = new Set([
    'no tds', 'no pe no tds', 'n/a', '-', '',
    'no tds below limit', 'no tds below lim',
    'no pe- no tds', 'equlisation levy',
  ]);
  const EMPTY_EXP2 = new Set(['', 'na', 'n/a', '-', 'nil', 'none']);

  const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const rowsToAppend: string[][] = [];
  const invoiceRowIndices: number[] = [];

  for (const inv of invoices) {
    lastNum++;
    const vchrNum = `${prefix}/${String(lastNum).padStart(4, '0')}/${fySuffix}`;
    const dateFmt = parseDateYYYYMMDD(inv.inv_date || '');
    const invType = String(inv.type || 'Invoice').toUpperCase();
    const vchrType = invType.includes('JV') ? 'JV' : `V-BILL-${COMPANY_STATE}`;
    const invNo = inv.invoice_no || '';
    const invDate = inv.inv_date || '';
    const rowIdx = inv.row_idx ? parseInt(String(inv.row_idx), 10) : null;
    const dRow = rowIdx ? rowLookup[rowIdx] : null;

    let vendorName: string, narration: string, costCategory: string, costCentre: string;
    let ledgerExp1: string, ledgerExp2: string, expAmt1: string, expAmt2: string;
    let cgstLedger: string, sgstLedger: string, igstLedger: string;
    let cgstAmt: string, sgstAmt: string, igstAmt: string;
    let tdsLedger: string, tdsAmt: string, netPayable: string;
    let rcmYes: boolean, rcmAmt: string;
    let rcmIgstI: string, rcmCgstI: string, rcmSgstI: string;
    let rcmIgstO: string, rcmCgstO: string, rcmSgstO: string;
    let roN: number;
    let d2Led: string, d2Amt: string, d3Led: string, d3Amt: string;
    let c1Led: string, c1Amt: string, c2Led: string, c2Amt: string;
    let c3Led: string, c3Amt: string, d4Led: string, d4Amt: string;
    let d1LedF: string, d1AmtF: string, d2LedF: string, d2AmtF: string;
    let d3LedF: string, d3AmtF: string;

    if (dRow) {
      vendorName   = gd(dRow, 'Vendor Name');
      narration    = gd(dRow, 'Narration') ||
                     `Being Expenses booked for ${vendorName} against Invoice no: ${invNo} dated ${invDate}`;
      costCategory = gd(dRow, 'CostCategory') || 'emp';
      costCentre   = gd(dRow, 'Group Ledger') || 'emp';
      netPayable   = first(dRow, 'Net Payable');
      ledgerExp1   = first(dRow, 'Ledger Exp Name');
      const exp2Raw = gd(dRow, 'Ledger Exp Name2');
      ledgerExp2   = EMPTY_EXP2.has(exp2Raw.trim().toLowerCase()) ? '' : exp2Raw;
      expAmt1      = first(dRow, 'Expense Amount 1', 'Taxable Amount');
      expAmt2      = ledgerExp2 ? gd(dRow, 'Expense Amount 2') : '';
      cgstLedger   = gd(dRow, 'CGST Ledger');
      sgstLedger   = gd(dRow, 'SGST Ledger');
      igstLedger   = gd(dRow, 'IGST Ledger');
      cgstAmt      = first(dRow, 'CGST Amount', 'CGST');
      sgstAmt      = first(dRow, 'SGST Amount', 'SGST');
      igstAmt      = first(dRow, 'IGST Amount', 'IGST');
      const tdsLedgerRaw = gd(dRow, 'TDS Ledger');
      tdsLedger    = INVALID_TDS.has(tdsLedgerRaw.trim().toLowerCase()) ? '' : tdsLedgerRaw;
      tdsAmt       = first(dRow, 'TDS Amount', 'TDS/ Equalisation Levy Amount', 'TDS Deducted', 'TDS');
      rcmYes       = gd(dRow, 'RCM Applicability').trim().toLowerCase() === 'yes';
      rcmAmt       = gd(dRow, 'RCM Amount');
      rcmIgstI     = first(dRow, 'RCM-IGST Legder Inward', 'RCM-IGST Ledger Inward', 'RCM-IGST Legder', 'RCM-IGST Ledger');
      rcmCgstI     = first(dRow, 'RCM-CGST Legder Inward', 'RCM-CGST Ledger Inward', 'RCM-CGST Legder', 'RCM-CGST Ledger');
      rcmSgstI     = first(dRow, 'RCM-SGST Legder Inward', 'RCM-SGST Ledger Inward', 'RCM-SGST Legder', 'RCM-SGST Ledger');
      rcmIgstO     = first(dRow, 'RCM-IGST Legder Outward', 'RCM-IGST Ledger Outward');
      rcmCgstO     = first(dRow, 'RCM-CGST Legder Outward', 'RCM-CGST Ledger Outward');
      rcmSgstO     = first(dRow, 'RCM-SGST Legder Outward', 'RCM-SGST Ledger Outward');
      roN          = n(gd(dRow, 'Round Off'));

      const rcmN  = n(rcmAmt);
      const igstN = n(igstAmt);
      const cgstN = n(cgstAmt);

      if (rcmYes && rcmN !== 0) {
        if (rcmIgstI || rcmIgstO) {
          // Interstate RCM
          d2Led = ledger(rcmIgstI || igstLedger); d2Amt = debit(String(rcmN));
          d3Led = 'emp'; d3Amt = 'emp';
          const igstOut = rcmIgstO || (rcmIgstI ? rcmIgstI.replace('Inward', 'Outward') : 'IGST Outward (RCM)');
          c1Led = ledger(igstOut); c1Amt = credit(String(rcmN));
          c2Led = tdsLedger ? ledger(tdsLedger) : 'emp';
          c2Amt = tdsLedger ? credit(tdsAmt) : 'emp';
          c3Led = roN < 0 ? 'Round Off' : 'emp';
          c3Amt = roN < 0 ? credit(String(Math.abs(roN))) : 'emp';
        } else {
          // Same-state RCM
          const half = Math.round(rcmN / 2 * 100) / 100;
          d2Led = ledger(rcmCgstI || cgstLedger); d2Amt = debit(String(half));
          d3Led = ledger(rcmSgstI || sgstLedger); d3Amt = debit(String(half));
          const cgstOut = rcmCgstO || (rcmCgstI ? rcmCgstI.replace('Inward', 'Outward') : 'CGST Outward (RCM)');
          const sgstOut = rcmSgstO || (rcmSgstI ? rcmSgstI.replace('Inward', 'Outward') : 'SGST Outward (RCM)');
          c1Led = ledger(cgstOut); c1Amt = credit(String(half));
          c2Led = ledger(sgstOut); c2Amt = credit(String(half));
          c3Led = tdsLedger ? ledger(tdsLedger) : 'emp';
          c3Amt = tdsLedger ? credit(tdsAmt) : 'emp';
        }
      } else if (igstN !== 0) {
        // Interstate (no RCM)
        d2Led = ledger(igstLedger); d2Amt = debit(igstAmt);
        d3Led = 'emp'; d3Amt = 'emp';
        c1Led = ledger(tdsLedger); c1Amt = credit(tdsAmt);
        c2Led = 'emp'; c2Amt = 'emp';
        c3Led = roN < 0 ? 'Round Off' : 'emp';
        c3Amt = roN < 0 ? credit(String(Math.abs(roN))) : 'emp';
      } else if (cgstN !== 0) {
        // Same-state (no RCM)
        d2Led = ledger(cgstLedger); d2Amt = debit(cgstAmt);
        d3Led = ledger(sgstLedger); d3Amt = debit(sgstAmt);
        c1Led = ledger(tdsLedger); c1Amt = credit(tdsAmt);
        c2Led = 'emp'; c2Amt = 'emp';
        c3Led = roN < 0 ? 'Round Off' : 'emp';
        c3Amt = roN < 0 ? credit(String(Math.abs(roN))) : 'emp';
      } else {
        // No GST, no RCM
        d2Led = 'emp'; d2Amt = 'emp'; d3Led = 'emp'; d3Amt = 'emp';
        c1Led = ledger(tdsLedger); c1Amt = credit(tdsAmt);
        c2Led = 'emp'; c2Amt = 'emp';
        c3Led = roN < 0 ? 'Round Off' : 'emp';
        c3Amt = roN < 0 ? credit(String(Math.abs(roN))) : 'emp';
      }
      d4Led = roN > 0 ? 'Round Off' : 'emp';
      d4Amt = roN > 0 ? debit(String(roN)) : 'emp';

      // Shift GST into D1 when Ledger Exp Name2 is absent
      if (!ledgerExp2) {
        d1LedF = d2Led; d1AmtF = d2Amt;
        d2LedF = d3Led; d2AmtF = d3Amt;
        d3LedF = 'emp'; d3AmtF = 'emp';
      } else {
        d1LedF = ledger(ledgerExp2); d1AmtF = debit(expAmt2);
        d2LedF = d2Led; d2AmtF = d2Amt;
        d3LedF = d3Led; d3AmtF = d3Amt;
      }
    } else {
      vendorName = inv.vendor || '';
      narration  = `Being Expenses booked for ${vendorName} against Invoice no: ${invNo} dated ${invDate}`;
      costCategory = costCentre = 'emp';
      ledgerExp1 = ledgerExp2 = expAmt1 = expAmt2 = '';
      tdsLedger = tdsAmt = netPayable = '';
      d2Led = d2Amt = d3Led = d3Amt = 'emp';
      c1Led = c1Amt = 'emp';
      c2Led = c2Amt = c3Led = c3Amt = 'emp';
      d4Led = d4Amt = 'emp';
      d1LedF = d1AmtF = 'emp';
      d2LedF = d2AmtF = d3LedF = d3AmtF = 'emp';
    }

    rowsToAppend.push([
      nowStr, 'LedgerX',
      dateFmt, dateFmt,
      vchrType, invNo, vchrNum, narration,
      costCategory,                                    // CostCategory
      costCentre,                                      // CostCentre
      ledger(vendorName!),  credit(netPayable!),        // C0: Vendor Payable
      ledger(ledgerExp1!),  debit(expAmt1!),            // D0: Expense Ledger 1
      d1LedF!, d1AmtF!,                                // D1: Exp2 (or GST if exp2 empty)
      d2LedF!, d2AmtF!,                                // D2: CGST/IGST (or SGST if exp2 empty)
      c1Led!, c1Amt!,                                  // C1: TDS (normal) / RCM Outward CGST/IGST
      c2Led!, c2Amt!,                                  // C2: emp (normal) / RCM Outward SGST
      d3LedF!, d3AmtF!,                                // D3: SGST (normal) / emp (RCM)
      c3Led!, c3Amt!,                                  // C3: Round Off Cr (normal) / TDS (RCM)
      d4Led!, d4Amt!,                                  // D4: Round Off Debit
    ]);

    if (rowIdx) invoiceRowIndices.push(rowIdx);
  }

  // Append to Inv Entry Template
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID_TALLY,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rowsToAppend },
  });

  // Update "Tally Entry Status" → "Template Prepared" in Invoice Wise Data
  if (invoiceRowIndices.length > 0) {
    const invRespH = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID_INVOICE_REGISTER,
      range: `${TAB_INVOICE_REGISTER}!A2:ZZ2`,
    });
    const invHdr = (invRespH.data.values?.[0] || []) as string[];
    const invIdx2 = indexMap(invHdr.map(h => String(h || '').trim()));
    const tallyCol = invIdx2['Tally Entry Status'] ?? -1;
    if (tallyCol >= 0) {
      const tallyColLetter = colToLetter(tallyCol);
      const batchUpdates = invoiceRowIndices.map(ri => ({
        range: `${TAB_INVOICE_REGISTER}!${tallyColLetter}${ri}`,
        values: [['Template Prepared']],
      }));
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: SHEET_ID_INVOICE_REGISTER,
        requestBody: { valueInputOption: 'USER_ENTERED', data: batchUpdates },
      });
    }
  }

  bustCache('tally_entries');
  bustCache('invoice_register');
  return { ok: true, count: rowsToAppend.length };
}

export async function markXmlCreated(invoiceNos: string[]): Promise<{ ok: boolean; error?: string }> {
  // v1: updates Tally Entry Status in Invoice Wise Data to "Template Created"
  const sheets = getSheetsClient();
  const invNosSet = new Set(invoiceNos);

  // Update Invoice Wise Data Tally Entry Status
  const invResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_INVOICE_REGISTER,
    range: `${TAB_INVOICE_REGISTER}!A1:ZZ`,
  });
  const invVals = invResp.data.values || [];
  if (invVals.length > 1) {
    const iIdx = indexMap((invVals[1] as string[]).map(h => String(h || '').trim()));
    const invNoCol = iIdx['Invoice No'] ?? -1;
    const tallyCol = iIdx['Tally Entry Status'] ?? -1;
    if (invNoCol >= 0 && tallyCol >= 0) {
      const cells: { range: string; values: string[][] }[] = [];
      for (let rIdx = 2; rIdx < invVals.length; rIdx++) {
        const row = invVals[rIdx] as string[];
        if (invNoCol < row.length && invNosSet.has(String(row[invNoCol] || '').trim())) {
          cells.push({
            range: `${TAB_INVOICE_REGISTER}!${colToLetter(tallyCol)}${rIdx + 1}`,
            values: [['Template Created']],
          });
        }
      }
      if (cells.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SHEET_ID_INVOICE_REGISTER,
          requestBody: { valueInputOption: 'USER_ENTERED', data: cells },
        });
      }
    }
  }

  bustCache('tally_entries');
  bustCache('invoice_register');
  return { ok: true };
}

export async function updateTallyRow(
  voucherNumber: string,
  invoiceNo: string,
  updates: Array<{ ledger_col_idx?: number; ledger_val?: string; amount_col_idx?: number; amount_val?: string }>
): Promise<{ ok: boolean; error?: string }> {
  // v1: updates specific ledger/amount cells by column index, then marks Invoice Register as Entry Updated
  const sheets = getSheetsClient();
  const tabName = await findTallyTab(sheets);

  // Find the row in Inv Entry Template by VOUCHERNUMBER
  const tallyResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID_TALLY,
    range: `${tabName}!A1:ZZ`,
  });
  const tallyVals = tallyResp.data.values || [];
  if (tallyVals.length < 2) return { ok: false, error: 'No data in Inv Entry Template' };

  const tHeaders = tallyVals[0] as string[];
  const vchrCol = tHeaders.findIndex(h => String(h || '').trim() === 'VOUCHERNUMBER');
  if (vchrCol < 0) return { ok: false, error: 'VOUCHERNUMBER column not found' };

  let rowIdx = -1;
  for (let i = 1; i < tallyVals.length; i++) {
    const row = tallyVals[i] as string[];
    if (vchrCol < row.length && String(row[vchrCol] || '').trim() === voucherNumber) {
      rowIdx = i + 1; // 1-indexed sheet row
      break;
    }
  }
  if (rowIdx < 0) return { ok: false, error: `Row not found for voucher ${voucherNumber}` };

  const cells: { range: string; values: string[][] }[] = [];
  for (const upd of updates) {
    if (upd.ledger_col_idx !== undefined) {
      cells.push({
        range: `${tabName}!${colToLetter(upd.ledger_col_idx)}${rowIdx}`,
        values: [[upd.ledger_val || '']],
      });
    }
    if (upd.amount_col_idx !== undefined) {
      cells.push({
        range: `${tabName}!${colToLetter(upd.amount_col_idx)}${rowIdx}`,
        values: [[upd.amount_val || '']],
      });
    }
  }
  if (cells.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SHEET_ID_TALLY,
      requestBody: { valueInputOption: 'USER_ENTERED', data: cells },
    });
  }

  // Update Invoice Register Tally Entry Status → Entry Updated
  if (invoiceNo) {
    try {
      const invResp = await sheets.spreadsheets.values.get({
        spreadsheetId: SHEET_ID_INVOICE_REGISTER,
        range: `${TAB_INVOICE_REGISTER}!A1:ZZ`,
      });
      const invVals = invResp.data.values || [];
      if (invVals.length > 1) {
        const iIdx = indexMap((invVals[1] as string[]).map(h => String(h || '').trim()));
        const invNoCol = iIdx['Invoice No'] ?? -1;
        const tallyCol = iIdx['Tally Entry Status'] ?? -1;
        if (invNoCol >= 0 && tallyCol >= 0) {
          const invCells: { range: string; values: string[][] }[] = [];
          for (let rIdx = 2; rIdx < invVals.length; rIdx++) {
            const row = invVals[rIdx] as string[];
            if (invNoCol < row.length && String(row[invNoCol] || '').trim() === invoiceNo) {
              invCells.push({
                range: `${TAB_INVOICE_REGISTER}!${colToLetter(tallyCol)}${rIdx + 1}`,
                values: [['Entry Updated']],
              });
            }
          }
          if (invCells.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId: SHEET_ID_INVOICE_REGISTER,
              requestBody: { valueInputOption: 'USER_ENTERED', data: invCells },
            });
          }
        }
      }
    } catch (_) { /* non-fatal */ }
  }

  bustCache('tally_entries');
  bustCache('invoice_register');
  return { ok: true };
}

// ── DP Invoice Booking ────────────────────────────────────────────────────

// DP search terms for auto-matching vendor from Vendor Master
const DP_SEARCH_MAP: Record<string, string> = {
  bluedart:  'blue dart',
  dtdc:      'dtdc',
  bigshot:   'bigshort',
  busybees:  'busybees',
  delhivery: 'delhivery',
  shadowfax: 'shadowfax',
  wefast:    'wefast',
};

function getColValues(values: string[][], headerLower: string[], colName: string): string[] {
  const ci = headerLower.indexOf(colName.toLowerCase());
  if (ci < 0) return [];
  return values.slice(1)
    .map(row => (ci < row.length ? (row[ci] || '').trim() : ''))
    .filter(Boolean);
}

export async function getDpInit(): Promise<{
  ok: boolean;
  dpNames: string[];
  dpVendorDefaults: Record<string, any>;
  serviceMonths: string[];
  pnlHeads: string[];
  groupLedgers: string[];
  ledgerExpNames: string[];
  cgstLedgers: string[];
  sgstLedgers: string[];
  igstLedgers: string[];
  tdsLedgers: string[];
  voucherTypes: string[];
  frequencies: string[];
  vendorStates: string[];
  invoiceTypes: string[];
  eInvoiceOptions: string[];
  error?: string;
}> {
  const cached = cacheGet('dp_init_v2');
  if (cached) return cached;

  const sheets = getSheetsClient();

  // Load Masters sheet for dropdown data
  let mastersValues: string[][] = [];
  let mastersHeaderLower: string[] = [];
  try {
    const mResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID_DP,
      range: `${TAB_DP_MASTERS}!A1:ZZ`,
    });
    mastersValues = (mResp.data.values || []) as string[][];
    if (mastersValues.length > 0) {
      mastersHeaderLower = mastersValues[0].map(h => String(h || '').trim().toLowerCase());
    }
  } catch { /* ignore */ }

  const gc = (col: string) => getColValues(mastersValues, mastersHeaderLower, col);

  // Load Vendor Master for dpNames and dpVendorDefaults
  let dpNames: string[] = [];
  const dpVendorDefaults: Record<string, any> = {};
  try {
    const vResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID_DP,
      range: `${TAB_DP_VENDORS}!A1:ZZ`,
    });
    const vRows = (vResp.data.values || []) as string[][];
    if (vRows.length > 1) {
      const vHeaders = vRows[0].map(h => String(h || '').trim());
      const vHeaderLower = vHeaders.map(h => h.toLowerCase());
      const vcIdx = vHeaderLower.indexOf('vendor code');
      const vnIdx = vHeaderLower.indexOf('vendor name');
      const vsIdx = vHeaderLower.indexOf('vendor state');
      const gstinIdx = vHeaderLower.indexOf('vendor gstin') >= 0 ? vHeaderLower.indexOf('vendor gstin') : vHeaderLower.indexOf('gstin no.');
      const panIdx = vHeaderLower.indexOf('vendor pan') >= 0 ? vHeaderLower.indexOf('vendor pan') : vHeaderLower.indexOf('pan no.');
      const groupIdx = vHeaderLower.indexOf('group name') >= 0 ? vHeaderLower.indexOf('group name') : vHeaderLower.indexOf('parent group');
      const typeIdx = vHeaderLower.indexOf('vendor type');
      const msmeIdx = vHeaderLower.indexOf('msme status') >= 0 ? vHeaderLower.indexOf('msme status') : vHeaderLower.indexOf('msme');

      if (vnIdx >= 0) {
        const nameSet = new Set<string>();
        for (const row of vRows.slice(1)) {
          const name = (vnIdx < row.length ? row[vnIdx] : '').trim();
          if (name) nameSet.add(name);
        }
        dpNames = Array.from(nameSet).sort();
      }

      // Build DP vendor defaults by matching search terms
      for (const row of vRows.slice(1)) {
        if (vnIdx < 0 || vnIdx >= row.length) continue;
        const nameLower = (row[vnIdx] || '').trim().toLowerCase();
        for (const [dpKey, term] of Object.entries(DP_SEARCH_MAP)) {
          if (dpVendorDefaults[dpKey]) continue; // already found
          if (nameLower.includes(term)) {
            dpVendorDefaults[dpKey] = {
              code:       vcIdx >= 0 && vcIdx < row.length ? (row[vcIdx] || '').trim() : '',
              name:       vnIdx >= 0 && vnIdx < row.length ? (row[vnIdx] || '').trim() : '',
              state:      vsIdx >= 0 && vsIdx < row.length ? (row[vsIdx] || '').trim() : '',
              gstin:      gstinIdx >= 0 && gstinIdx < row.length ? (row[gstinIdx] || '').trim() : '',
              pan:        panIdx >= 0 && panIdx < row.length ? (row[panIdx] || '').trim() : '',
              groupName:  groupIdx >= 0 && groupIdx < row.length ? (row[groupIdx] || '').trim() : '',
              vendorType: typeIdx >= 0 && typeIdx < row.length ? (row[typeIdx] || '').trim() : '',
              msmeStatus: msmeIdx >= 0 && msmeIdx < row.length ? (row[msmeIdx] || '').trim() : '',
            };
          }
        }
      }
    }
  } catch { /* ignore */ }

  const result = {
    ok: true,
    dpNames,
    dpVendorDefaults,
    serviceMonths:  gc('Service Month'),
    pnlHeads:       gc('PNL head'),
    groupLedgers:   gc('Group Ledger'),
    ledgerExpNames: gc('Ledger Exp Name'),
    cgstLedgers:    gc('CGST_Ledgers'),
    sgstLedgers:    gc('SGST_Ledgers'),
    igstLedgers:    gc('IGST_Ledgers'),
    tdsLedgers:     gc('TDS_Ledgers'),
    voucherTypes:   gc('Voucher Type'),
    frequencies:    gc('Frequency'),
    vendorStates:   gc('Vendor State'),
    invoiceTypes:   gc('Invoice Type'),
    eInvoiceOptions: gc('E-Invoice (Y/N)'),
  };
  cacheSet('dp_init_v2', result);
  return result;
}

// ── GSTIN regex ────────────────────────────────────────────────────────────
const GSTIN_RE = /\b(\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1})\b/;
function extractGstin(text: string): string {
  const m = GSTIN_RE.exec(text || '');
  return m ? m[1] : '';
}

// ── State code → name map (for DTDC) ────────────────────────────────────────
const STATE_CODE_MAP: Record<string, string> = {
  '01': 'JAMMU AND KASHMIR', '02': 'HIMACHAL PRADESH', '03': 'PUNJAB',
  '04': 'CHANDIGARH', '05': 'UTTARAKHAND', '06': 'HARYANA',
  '07': 'DELHI', '08': 'RAJASTHAN', '09': 'UTTAR PRADESH',
  '10': 'BIHAR', '11': 'SIKKIM', '12': 'ARUNACHAL PRADESH',
  '13': 'NAGALAND', '14': 'MANIPUR', '15': 'MIZORAM',
  '16': 'TRIPURA', '17': 'MEGHALAYA', '18': 'ASSAM',
  '19': 'WEST BENGAL', '20': 'JHARKHAND', '21': 'ODISHA',
  '22': 'CHHATTISGARH', '23': 'MADHYA PRADESH', '24': 'GUJARAT',
  '26': 'DADRA AND NAGAR HAVELI', '27': 'MAHARASHTRA', '28': 'ANDHRA PRADESH',
  '29': 'KARNATAKA', '30': 'GOA', '31': 'LAKSHADWEEP',
  '32': 'KERALA', '33': 'TAMIL NADU', '34': 'PUDUCHERRY',
  '35': 'ANDAMAN AND NICOBAR', '36': 'TELANGANA', '37': 'ANDHRA PRADESH',
  '38': 'LADAKH',
};

export async function parseDpInvoice(
  dpType: string,
  fileBuffer: Buffer,
  fileName: string
): Promise<{ ok: boolean; rows: any[]; error?: string }> {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const isExcel = ext === 'xlsx' || ext === 'xls';
  const isPdf   = ext === 'pdf';

  // ── Excel-based parsers ──────────────────────────────────────────────────
  if (isExcel) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // ── Busybees: Sheet1, pivot by state ──
    if (dpType === 'busybees') {
      const sheetName = workbook.SheetNames.includes('Sheet1') ? 'Sheet1' : workbook.SheetNames[0];
      const ws = workbook.Sheets[sheetName];
      const allRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];

      let headerRowIdx = -1;
      for (let r = 0; r < Math.min(allRows.length, 15); r++) {
        if ((allRows[r] as any[]).some((c: any) => String(c || '').toLowerCase().includes('row label'))) {
          headerRowIdx = r; break;
        }
      }
      if (headerRowIdx < 0) return { ok: false, rows: [], error: "Could not find 'Row Labels' header in Sheet1" };

      const headers = (allRows[headerRowIdx] as any[]).map((c: any) => String(c || '').toLowerCase());
      const netColIdx = headers.findIndex((h: string) => h.includes('netcharge') || h.includes('net charge'));
      const invColIdx = headers.findIndex((h: string) => h.includes('invoice number') || h.includes('invoice no'));

      const rows: any[] = [];
      let sno = 0;
      for (let r = headerRowIdx + 1; r < allRows.length; r++) {
        const row = allRows[r] as any[];
        const state = String(row[0] || '').trim();
        if (!state || ['grand total', 'total', ''].includes(state.toLowerCase())) continue;
        const netCharges = parseFloat(String(netColIdx >= 0 ? row[netColIdx] : 0)) || 0;
        const invoiceNumber = invColIdx >= 0 ? String(row[invColIdx] || '').trim() : '';
        const isMH = state.toUpperCase() === 'MAHARASHTRA';
        sno++;
        rows.push({
          sr_no: sno, invoice_number: invoiceNumber, area: state, invoice_date: '',
          invoice_amount: String(Math.round(netCharges * 100) / 100), gstin: '',
          format: 'busybees', gst_type: isMH ? 'CGST+SGST' : 'IGST', gst_rate: '18%', is_subtotal: true,
        });
      }
      return { ok: true, rows };
    }

    // ── DTDC Excel: pivot by INVOICE_NO, aggregate SUB_TOTAL ──
    if (dpType === 'dtdc') {
      const ws = workbook.Sheets[workbook.SheetNames[0]];
      const allRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][];

      let headerRowIdx = -1;
      for (let r = 0; r < Math.min(allRows.length, 10); r++) {
        if ((allRows[r] as any[]).some((c: any) => String(c || '').toUpperCase().includes('INVOICE'))) {
          headerRowIdx = r; break;
        }
      }
      if (headerRowIdx < 0) return { ok: false, rows: [], error: 'Could not find header row with INVOICE_NO' };

      const headers = (allRows[headerRowIdx] as any[]).map((c: any) =>
        String(c || '').trim().toUpperCase().replace(/\s+/g, '_')
      );
      const hIdx = (name: string) => headers.indexOf(name);
      const invCol  = hIdx('INVOICE_NO');
      let subCol    = hIdx('SUB_TOTAL');
      if (subCol < 0) subCol = headers.findIndex((h: string) => h.includes('SUB') && h.includes('TOTAL'));
      if (subCol < 0) subCol = 21;
      const gstCol  = hIdx('GST');
      const dateCol = hIdx('INVOICE_DATE');

      const pivot: Record<string, { subtotal: number; gst: number; date: string }> = {};
      for (let r = headerRowIdx + 1; r < allRows.length; r++) {
        const row = allRows[r] as any[];
        const invNo = String(row[invCol] || '').trim();
        if (!invNo) continue;
        const subVal  = parseFloat(String(row[subCol] || 0)) || 0;
        const gstVal  = gstCol >= 0 ? (parseFloat(String(row[gstCol] || 0)) || 0) : 0;
        const invDate = dateCol >= 0 ? String(row[dateCol] || '').trim() : '';
        if (!pivot[invNo]) pivot[invNo] = { subtotal: 0, gst: 0, date: invDate };
        pivot[invNo].subtotal += subVal;
        pivot[invNo].gst      += gstVal;
      }

      const rows: any[] = [];
      let sno = 0;
      for (const [invNo, data] of Object.entries(pivot)) {
        sno++;
        const stateCode = invNo.length >= 4 ? invNo.slice(2, 4) : '';
        const stateName = STATE_CODE_MAP[stateCode] || '';
        const isMH = stateCode === '27';
        const gstin = stateCode ? stateCode + 'AACD8017H1ZW' : '';
        rows.push({
          sr_no: sno, invoice_number: invNo, area: stateName, invoice_date: data.date,
          invoice_amount: String(Math.round(data.subtotal * 100) / 100), gstin,
          format: 'dtdc_excel', gst_type: isMH ? 'CGST+SGST' : 'IGST', gst_rate: '18%',
          is_subtotal: true, vendor_state: stateName,
        });
      }
      return { ok: true, rows };
    }

    // Generic Excel fallback
    const ws = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
    return { ok: true, rows };
  }

  // ── PDF-based parsers ────────────────────────────────────────────────────
  if (isPdf) {
    try {
      const pdfParse = await import('pdf-parse') as any;
      const pdfData  = await (pdfParse.default || pdfParse)(fileBuffer);
      const text: string = pdfData.text || '';

      // ── Bigshot / Blitz ──
      if (dpType === 'bigshot') {
        const gstin    = extractGstin(text);
        const invNoM   = text.match(/Invoice\.?\s*No\.?\s*[:\s]+([\w/\-]+)/i);
        const invNo    = invNoM ? invNoM[1].trim() : '';
        const invDateM = text.match(/Invoice\s*Date\s*[:\s]+(\d{2}\/\d{2}\/\d{4})/i);
        const invDate  = invDateM ? invDateM[1].trim() : '';
        const subM     = text.match(/Sub\s*Total\s*[:\s]*([\d,]+\.?\d*)/i);
        const subTotal = subM ? subM[1].trim() : '';

        let gstType = '';
        let gstRate = '';
        const igstM = text.match(/IGST\d*\s*\((\d+)%?\)/i);
        if (igstM) { gstType = 'IGST'; gstRate = igstM[1] + '%'; }
        else {
          const rateM = text.match(/(\d+)%\s+[\d,]+\.\d+\s+[\d,]+\.\d+/);
          if (rateM) { gstRate = rateM[1] + '%'; gstType = 'IGST'; }
        }
        if (/\bCGST\b/i.test(text) && /\bSGST\b/i.test(text)) {
          gstType = 'CGST+SGST';
          const cgstM = text.match(/CGST\d*\s*\((\d+)%?\)/i);
          if (cgstM) gstRate = String(parseInt(cgstM[1]) * 2) + '%';
        }
        const igstAmtM = text.match(/IGST\d*\s*\(\d+%?\)\s*([\d,]+\.?\d*)/i);
        const igstAmt  = igstAmtM ? igstAmtM[1].trim() : '';

        return { ok: true, rows: [{
          sr_no: 1, invoice_number: invNo, area: '', invoice_date: invDate,
          invoice_amount: subTotal, gstin, format: 'bigshot',
          gst_type: gstType, gst_rate: gstRate, gst_amount: igstAmt, is_subtotal: true,
        }] };
      }

      // ── Delhivery ──
      if (dpType === 'delhivery') {
        const gstin    = extractGstin(text);
        const invNoM   = text.match(/Invoice\s*Number\s*[:\s]+([\w]+)/i);
        const invNo    = invNoM ? invNoM[1].trim() : '';
        const invDateM = text.match(/Invoice\s*Date\s*[:\s]+([\w\-]+)/i);
        const invDate  = invDateM ? invDateM[1].trim() : '';
        const subM     = text.match(/Sub\s*Total\s*([\d,]+\.?\d*)/i);
        const subTotal = subM ? subM[1].trim() : '';

        let gstType = '';
        let gstRate = '18%';
        const cgstM = text.match(/CGST\s*@?\s*(\d+)%/i);
        const sgstM = text.match(/SGST\s*@?\s*(\d+)%/i);
        const igstM = text.match(/IGST\s*@?\s*(\d+)%/i);
        if (cgstM && sgstM) {
          gstType = 'CGST+SGST';
          gstRate = String(parseInt(cgstM[1]) * 2) + '%';
        } else if (igstM) {
          gstType = 'IGST';
          gstRate = igstM[1] + '%';
        } else {
          gstType = gstin.startsWith('27') ? 'CGST+SGST' : 'IGST';
        }

        return { ok: true, rows: [{
          sr_no: 1, invoice_number: invNo, area: '', invoice_date: invDate,
          invoice_amount: subTotal, gstin, format: 'delhivery',
          gst_type: gstType, gst_rate: gstRate, is_subtotal: true,
        }] };
      }

      // ── DTDC PDF ──
      if (dpType === 'dtdc') {
        const gstin    = extractGstin(text);
        const invNoM   = text.match(/Invoice\s*(?:No|Number|#)[:\s]*([A-Z0-9\-\/]+)/i);
        const invNo    = invNoM ? invNoM[1].trim() : '';
        const invDateM = text.match(/Invoice\s*Date[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
        const invDate  = invDateM ? invDateM[1].trim() : '';
        const amtM     = text.match(/(?:Total|Grand Total|Net Amount)[:\s]*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
        const amount   = amtM ? amtM[1].replace(/,/g, '') : '';
        const stateCode = invNo.length >= 4 ? invNo.slice(2, 4) : '';
        const stateName = STATE_CODE_MAP[stateCode] || '';
        const isMH = stateCode === '27';
        return { ok: true, rows: [{
          sr_no: 1, invoice_number: invNo, area: stateName, invoice_date: invDate,
          invoice_amount: amount, gstin, format: 'dtdc',
          gst_type: isMH ? 'CGST+SGST' : 'IGST', gst_rate: '18%', is_subtotal: true,
        }] };
      }

      // ── Blue Dart (default) — table-based extraction ──
      const rows: any[] = [];
      const gstin = extractGstin(text);
      const lines = text.split('\n');

      let inTable = false;
      let invNoColStart = -1;
      let invDateColStart = -1;
      let invAmtColStart = -1;

      for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const lineLower = line.toLowerCase();

        if (!inTable && lineLower.includes('invoice number') && (lineLower.includes('inv. date') || lineLower.includes('inv date'))) {
          inTable = true;
          invNoColStart   = lineLower.indexOf('invoice number');
          const dateKey   = lineLower.includes('inv. date') ? 'inv. date' : 'inv date';
          invDateColStart = lineLower.indexOf(dateKey);
          const amtKey    = lineLower.includes('inv. amt') ? 'inv. amt' : 'inv amt';
          invAmtColStart  = lineLower.indexOf(amtKey);
          continue;
        }

        if (inTable) {
          if (!line.trim() || /^(total|grand total|page)/i.test(line.trim())) { inTable = false; continue; }
          const firstToken = line.trim().split(/\s+/)[0];
          if (!/^\d+$/.test(firstToken)) continue;

          let invNo = '', invDate = '', invAmt = '';
          if (invNoColStart >= 0 && invDateColStart > invNoColStart) {
            invNo   = line.slice(invNoColStart, invDateColStart).trim();
            invDate = invDateColStart >= 0 && invAmtColStart > invDateColStart
              ? line.slice(invDateColStart, invAmtColStart).trim() : '';
            invAmt  = invAmtColStart >= 0 ? line.slice(invAmtColStart).trim().split(/\s+/)[0] : '';
          } else {
            const parts = line.trim().split(/\s{2,}/);
            invNo = parts[1] || ''; invDate = parts[2] || ''; invAmt = parts[3] || '';
          }

          if (invNo) rows.push({
            sr_no: parseInt(firstToken), invoice_number: invNo, area: '',
            invoice_date: invDate, invoice_amount: invAmt.replace(/,/g, ''), gstin, format: 'summary',
          });
          continue;
        }

        // Standard BlueDart table format
        const stdMatch = line.match(/^\s*(\d+)\s+(\S+)\s+.*?\s+(\S+)\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+([\d,]+\.\d{2})/);
        if (stdMatch) rows.push({
          sr_no: parseInt(stdMatch[1]), invoice_number: stdMatch[2], area: stdMatch[3],
          invoice_date: stdMatch[4], invoice_amount: stdMatch[5].replace(/,/g, ''), gstin, format: 'standard',
        });
      }

      if (rows.length === 0) {
        const invRe = /([A-Z0-9]{6,20})\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+([\d,]+\.\d{2})/g;
        let m; let sno = 0;
        while ((m = invRe.exec(text)) !== null) {
          sno++;
          rows.push({
            sr_no: sno, invoice_number: m[1], area: '', invoice_date: m[2],
            invoice_amount: m[3].replace(/,/g, ''), gstin, format: 'fallback',
          });
        }
      }

      return { ok: true, rows };
    } catch (err: any) {
      return { ok: false, rows: [], error: err.message };
    }
  }

  return { ok: false, rows: [], error: `Unsupported file type: ${ext}` };
}
