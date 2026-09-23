/**
 * nexusOneSheet.ts — Google Sheets data layer for the Nexus One tab
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1F0ID-sfMMT8lK2JAfKDfJyC87cqHzCm2HqiyrZcThQc
 *
 * Sheet layout ("List of Brands & Agreement Status" tab): 3 header rows
 * (group header / blank / column header), then data rows. Brand Name (col C)
 * and the Status group (col J "TOTs Status", col K "Seller Agreement Status")
 * are the only columns this tab needs. A Sr No. group can span several brand
 * rows with its Status cells merged — the Sheets API only returns a value in
 * the top-left cell of a merge, so TOTs/Seller Agreement Status are
 * forward-filled down within each group.
 */
import { google } from 'googleapis';

const SPREADSHEET_ID = '1F0ID-sfMMT8lK2JAfKDfJyC87cqHzCm2HqiyrZcThQc';
const SHEET_NAME = 'List of Brands & Agreement Status';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const COL_BRAND_NAME = 2;  // C
const COL_TOTS_STATUS = 9; // J
const COL_SELLER_AGREEMENT_STATUS = 10; // K
const HEADER_ROWS = 3;

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

export interface NexusOneRow {
  brandName: string;
  totsStatus: string;
  sellerAgreementStatus: string;
}

let cachedRows: NexusOneRow[] | null = null;
let cacheExpiry = 0;

export async function getNexusOneRows(): Promise<NexusOneRow[]> {
  const now = Date.now();
  if (cachedRows && now < cacheExpiry) return cachedRows;

  const sheets = await getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'`,
  });
  const raw = (resp.data.values || []) as string[][];

  const rows: NexusOneRow[] = [];
  let lastTots = '';
  let lastSellerAgreement = '';
  for (let i = HEADER_ROWS; i < raw.length; i++) {
    const row = raw[i] || [];
    const brandName = (row[COL_BRAND_NAME] || '').trim();
    const totsRaw = (row[COL_TOTS_STATUS] || '').trim();
    const sellerRaw = (row[COL_SELLER_AGREEMENT_STATUS] || '').trim();
    if (totsRaw) lastTots = totsRaw;
    if (sellerRaw) lastSellerAgreement = sellerRaw;
    if (!brandName) continue;
    rows.push({
      brandName,
      totsStatus: lastTots,
      sellerAgreementStatus: lastSellerAgreement,
    });
  }

  cachedRows = rows;
  cacheExpiry = now + CACHE_TTL_MS;
  return rows;
}
