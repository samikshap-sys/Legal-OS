/**
 * disputeSheets.ts — Google Sheets data layer for Dispute & Litigation Tracker
 * Spreadsheet: https://docs.google.com/spreadsheets/d/10kf-4A7f9nna4TU7xwOAZQ8nHd96unTkiHBEUVERarY
 */
import { google } from 'googleapis';

const SPREADSHEET_ID = '10kf-4A7f9nna4TU7xwOAZQ8nHd96unTkiHBEUVERarY';
const CACHE_TTL_MS   = 5 * 60 * 1000; // 5 minutes

let sheetsClient: ReturnType<typeof google.sheets> | null = null;

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

async function fetchSheet(sheetName: string): Promise<Record<string, string>[]> {
  const sheets = await getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheetName}'`,
  });
  const raw = resp.data.values || [];
  if (raw.length < 2) return [];
  // Normalise headers: trim whitespace AND newlines, use lowercase for lookup
  const headers = (raw[0] as string[]).map((h: string) => h.trim().replace(/\s+/g, ' '));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as string[];
    const obj: Record<string, string> = {};
    let hasData = false;
    for (let j = 0; j < headers.length; j++) {
      const val = (row[j] != null ? String(row[j]) : '').trim();
      obj[headers[j]] = val;
      if (val) hasData = true;
    }
    // Skip rows where the first meaningful column (index 0 or 1) is empty
    const firstVal = (row[0] || '').trim() || (row[1] || '').trim();
    if (hasData && firstVal) rows.push(obj);
  }
  return rows;
}

function countBy(rows: Record<string, string>[], key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const val = (row[key] || '').trim();
    if (val) counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CompanyAging {
  company: string;
  agingDays: number;
  status: string;
}

export interface CompanyAmount {
  company: string;
  amountINR: number;
  status: string;
}

export interface DisputeChartData {
  // Fynd Vs. Other Party
  fyndVsOther: {
    statusCounts: Record<string, number>;
    causeCounts: Record<string, number>;
    totalRows: number;
    totalAmountINR: number;
    companyAging: CompanyAging[];
    companyAmounts: CompanyAmount[];
  };
  // Other Party Vs. Fynd
  otherVsFynd: {
    statusCounts: Record<string, number>;
    causeCounts: Record<string, number>;
    totalRows: number;
    totalAmountUSD: number;
  };
  // Registered TM
  registeredTM: {
    byName: Record<string, number>;
    byNature: Record<string, number>;
    byClass: Record<string, number>;
    totalRows: number;
  };
  // In Process TM
  inProcessTM: {
    byStatus: Record<string, number>;
    byNature: Record<string, number>;
    byName: Record<string, number>;
    byClass: Record<string, number>;
    totalRows: number;
  };
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cachedData: DisputeChartData | null = null;
let cacheExpiry = 0;

// ── Raw TM Master rows (for table display) ───────────────────────────────────
let cachedTMRows: Record<string, string>[] | null = null;
let tmRowsCacheExpiry = 0;

export async function getTMSheetRows(): Promise<Record<string, string>[]> {
  const now = Date.now();
  if (cachedTMRows && now < tmRowsCacheExpiry) return cachedTMRows;
  const rows = await fetchSheet('TM Master');
  cachedTMRows = rows;
  tmRowsCacheExpiry = now + CACHE_TTL_MS;
  return rows;
}

export async function getDisputeChartData(): Promise<DisputeChartData> {
  const now = Date.now();
  if (cachedData && now < cacheExpiry) return cachedData;

  const [fyndRows, otherRows, tmRows] = await Promise.all([
    fetchSheet('Fynd Vs. Other Party'),
    fetchSheet('Other Party Vs. Fynd'),
    fetchSheet('TM Master'), // Previously 'Registered TM' + 'In Process TM' — now merged into TM Master
  ]);
  // Split TM Master into registered (Status = 'Registered') and in-process (all others)
  const regRows = tmRows.filter(r => (r['Status'] || '').trim().toLowerCase() === 'registered');
  const inProcRows = tmRows.filter(r => (r['Status'] || '').trim().toLowerCase() !== 'registered');

  // ── Fynd Vs. Other Party ──────────────────────────────────────────────────
  // Column names (with whitespace/newline normalised):
  //   "Company Name ", "Date of Default", "Net Recoverable Amount  (Amount in INR)",
  //   "Ageing Analysis", "Status ", "Cause of Action"
  // Helper: find a key by partial match (handles trailing spaces / newlines in headers)
  const findKey = (row: Record<string, string>, partial: string): string => {
    const k = Object.keys(row).find(k => k.toLowerCase().includes(partial.toLowerCase()));
    return k ? (row[k] || '').trim() : '';
  };

  const fyndStatusCounts = countBy(fyndRows, Object.keys(fyndRows[0] || {}).find(k => k.toLowerCase().startsWith('status')) || 'Status');
  const fyndCauseCounts  = countBy(fyndRows, 'Cause of Action');

  let totalAmountINR = 0;
  const companyAging: CompanyAging[] = [];
  const companyAmounts: CompanyAmount[] = [];

  for (const row of fyndRows) {
    const companyKey = Object.keys(row).find(k => k.toLowerCase().includes('company name')) || '';
    const statusKey  = Object.keys(row).find(k => k.toLowerCase().startsWith('status')) || '';
    const company = companyKey ? (row[companyKey] || '').trim() : '';
    const status  = statusKey  ? (row[statusKey]  || '').trim() : '';

    // Net Recoverable Amount
    const amtKey = Object.keys(row).find(k => k.toLowerCase().includes('net recoverable'));
    const amtRaw = amtKey ? row[amtKey] : '';
    const amtVal = parseFloat((amtRaw || '0').replace(/[₹,\s]/g, ''));
    if (!isNaN(amtVal) && amtVal > 0) {
      totalAmountINR += amtVal;
      if (company) {
        companyAmounts.push({ company, amountINR: amtVal, status });
      }
    }

    // Aging days — use "Ageing Analysis" column (pre-computed in sheet)
    const agingKey = Object.keys(row).find(k => k.toLowerCase().includes('ageing') || k.toLowerCase().includes('aging'));
    const agingRaw = agingKey ? row[agingKey] : '';
    const agingDays = parseInt((agingRaw || '').replace(/[^0-9]/g, ''), 10);
    if (company && !isNaN(agingDays) && agingDays > 0) {
      companyAging.push({ company, agingDays, status });
    }
  }

  // Sort by aging desc
  companyAging.sort((a, b) => b.agingDays - a.agingDays);
  // Sort by amount desc
  companyAmounts.sort((a, b) => b.amountINR - a.amountINR);

  // ── Other Party Vs. Fynd ─────────────────────────────────────────────────
  const otherStatusKey = Object.keys(otherRows[0] || {}).find(k => k.toLowerCase().startsWith('status')) || 'Status';
  const otherStatusCounts = countBy(otherRows, otherStatusKey);
  const otherCauseCounts  = countBy(otherRows, 'Cause of Action');
  let totalAmountUSD = 0;
  for (const row of otherRows) {
    const amt = parseFloat((row['Amount in Dispute'] || '0').replace(/[$,\s]/g, ''));
    if (!isNaN(amt)) totalAmountUSD += amt;
  }

  // ── Registered TM ────────────────────────────────────────────────────────
  const regByName   = countBy(regRows, 'Trademark Name');
  const regByNature = countBy(regRows, 'Nature');
  const regByClass  = countBy(regRows, 'Class');

  // ── In Process TM ────────────────────────────────────────────────────────
  // TM Master: Status column for in-process TMs (Pending, Objected, Opposed, etc.)
  const ipByStatus = countBy(inProcRows, 'Status');
  const ipByNature = countBy(inProcRows, 'Nature');
  const ipByName   = countBy(inProcRows, 'Trademark Name');
  const ipByClass  = countBy(inProcRows, 'Class');

  cachedData = {
    fyndVsOther: {
      statusCounts:   fyndStatusCounts,
      causeCounts:    fyndCauseCounts,
      totalRows:      fyndRows.length,
      totalAmountINR,
      companyAging,
      companyAmounts,
    },
    otherVsFynd: {
      statusCounts:   otherStatusCounts,
      causeCounts:    otherCauseCounts,
      totalRows:      otherRows.length,
      totalAmountUSD,
    },
    registeredTM: {
      byName:    regByName,
      byNature:  regByNature,
      byClass:   regByClass,
      totalRows: regRows.length,
    },
    inProcessTM: {
      byStatus:  ipByStatus,
      byNature:  ipByNature,
      byName:    ipByName,
      byClass:   ipByClass,
      totalRows: inProcRows.length,
    },
  };
  cacheExpiry = now + CACHE_TTL_MS;
  return cachedData;
}
