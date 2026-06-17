/**
 * fetchDisputeSheets.mjs
 * Reads all 4 sheets from the Dispute & Litigation Tracker spreadsheet
 * and prints headers + first 3 rows for each sheet.
 */
import { google } from 'googleapis';

const SPREADSHEET_ID = '10kf-4A7f9nna4TU7xwOAZQ8nHd96unTkiHBEUVERarY';
const SHEETS = [
  'Fynd Vs. Other Party',
  'Other Party Vs. Fynd',
  'Registered TM',
  'In Process TM',
];

async function main() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) { console.error('GOOGLE_SERVICE_ACCOUNT_JSON not set'); process.exit(1); }
  const credentials = JSON.parse(saJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  for (const sheetName of SHEETS) {
    console.log(`\n========== ${sheetName} ==========`);
    try {
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${sheetName}'`,
      });
      const raw = resp.data.values || [];
      if (raw.length === 0) { console.log('(empty)'); continue; }
      const headers = raw[0];
      console.log('HEADERS:', JSON.stringify(headers));
      console.log(`TOTAL ROWS: ${raw.length - 1}`);
      for (let i = 1; i <= Math.min(3, raw.length - 1); i++) {
        const row = {};
        headers.forEach((h, j) => { row[h] = raw[i][j] || ''; });
        console.log(`ROW ${i}:`, JSON.stringify(row));
      }
    } catch (err) {
      console.error(`Error reading ${sheetName}:`, err.message);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
