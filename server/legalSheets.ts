/**
 * Google Sheets data layer for Legal Connect dashboard
 * Mirrors the exact logic from the original finops_v1/finops_legal/server.js
 * Also fetches cell hyperlinks for the "Signed Doc Link" column (column P = index 15)
 */

import { google } from 'googleapis';

const SPREADSHEET_ID = '1WDJvLMJw_9Fz2CwV0IYentqOXEoc8vbo-x1vhrvQw3k';
const SHEET_RANGE    = 'Sheet1';
const CACHE_TTL_MS   = 60 * 1000; // refresh every 60 seconds

// Column P (0-indexed = 15) is "Signed Doc Link"
const SIGNED_DOC_COL_INDEX = 15;

let sheetsClient: ReturnType<typeof google.sheets> | null = null;
let cachedRows: Record<string, string>[] = [];
let cacheExpiry = 0;
let lastFetchedAt: Date | null = null;

export function getSheetLastFetched(): Date | null { return lastFetchedAt; }

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

/**
 * Fetch hyperlinks for column P (Signed Doc Link) using spreadsheets.get
 * Returns a map of row index (1-based, data rows) → hyperlink URL
 */
async function fetchSignedDocHyperlinks(): Promise<Map<number, string>> {
  const sheets = await getSheetsClient();
  const hyperlinks = new Map<number, string>();

  try {
    const resp = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      ranges: [`Sheet1!P2:P`],
      fields: 'sheets.data.rowData.values.hyperlink',
    });

    const rowData = resp.data.sheets?.[0]?.data?.[0]?.rowData || [];
    for (let i = 0; i < rowData.length; i++) {
      const cell = rowData[i]?.values?.[0];
      const link = cell?.hyperlink;
      if (link) {
        hyperlinks.set(i + 2, link); // row index 2 = first data row
      }
    }
  } catch (err) {
    console.warn('[GSheet] Could not fetch hyperlinks for Signed Doc column:', err);
  }

  return hyperlinks;
}

export async function getSheetData(): Promise<Record<string, string>[]> {
  const now = Date.now();
  if (cachedRows.length > 0 && now < cacheExpiry) return cachedRows;

  const sheets = await getSheetsClient();

  // Fetch values and hyperlinks in parallel
  const [valuesResp, hyperlinks] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: SHEET_RANGE,
    }),
    fetchSignedDocHyperlinks(),
  ]);

  const raw = valuesResp.data.values || [];
  if (raw.length < 2) {
    cachedRows = [];
    cacheExpiry = now + CACHE_TTL_MS;
    return [];
  }

  const headers = (raw[0] as string[]).map((h: string) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < raw.length; i++) {
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (raw[i] && raw[i][j] != null ? String(raw[i][j]) : '').trim();
    }
    // Skip blank trailing rows
    if (!obj['Request Date'] && !obj['Counter Party Legal Name'] && !obj['Status']) continue;

    // Overwrite the Signed Doc Link with the actual hyperlink URL if available
    const sheetRowIndex = i + 1; // sheet row number (1-based, row 1 = header)
    const driveUrl = hyperlinks.get(sheetRowIndex);
    if (driveUrl) {
      obj['Signed Doc Link'] = driveUrl;
    }

    rows.push(obj);
  }

  cachedRows  = rows;
  cacheExpiry = now + CACHE_TTL_MS;
  lastFetchedAt = new Date();
  console.log(`[GSheet] Refreshed cache: ${rows.length} rows at ${lastFetchedAt.toISOString()}`);
  return rows;
}

export function normalizeStatus(raw: string): string {
  const s = (raw || '').toLowerCase().trim();
  if (s === 'open') return 'Open';
  if (s.startsWith('closed')) return 'Closed';
  if (s.includes('hold')) return 'On Hold';
  if (s.startsWith('pending')) return 'Pending';
  return (raw || '').trim();
}
