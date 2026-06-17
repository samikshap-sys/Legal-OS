/**
 * ledgerXInvoiceService.ts
 * Google Sheets + Drive service for Invoice Booking.
 * Mirrors the Python app.py endpoints:
 *   /api/invoice/init       → getInvoiceMasters()
 *   /api/invoice/vendors    → searchVendors()
 *   /api/invoice/upload     → uploadInvoiceFile()
 *   /api/invoice/submit     → submitInvoice()
 *   /api/invoice/pending    → getPendingInvoice()
 */
import { google } from 'googleapis';
import { Readable } from 'stream';

const SPREADSHEET_ID = '1lNa90wnhWFkSOcG-4HfY4Phl_ZLfR9R4jK4oSRZ4xJE';
const COMPANY_STATE  = 'MH';
const INVOICE_FOLDER   = 'AP Invoice Uploads FY26-27';
const PENDING_FOLDER   = 'Pending Invoices';
const PROCESSED_FOLDER = 'Processed Invoices';

const SHEETS = {
  INVOICE:          'Invoice Wise Data',
  VENDOR:           'Vendor Master',
  VENDOR_SERVICE:   'Vendor Service',
  MASTERS:          'Masters',
};

// ── Auth helpers ────────────────────────────────────────────────────────────
function getCredentials() {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  return JSON.parse(saJson);
}

function getSheetsClient() {
  const credentials = getCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  return google.sheets({ version: 'v4', auth });
}

function getDriveClient() {
  const credentials = getCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive',
    ],
  });
  return google.drive({ version: 'v3', auth });
}

// ── Utility ──────────────────────────────────────────────────────────────────
function indexMap(header: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = h.replace(/\s+/g, ' ').trim();
    if (key) result[key] = i;
  });
  return result;
}

function getColValues(values: string[][], header: string[], colName: string): string[] {
  const idx = header.indexOf(colName);
  if (idx < 0) return [];
  return values.slice(1)
    .map(row => (idx < row.length ? (row[idx] || '').trim() : ''))
    .filter(Boolean);
}

function toNum(x: any): number {
  const n = parseFloat(String(x ?? ''));
  return isNaN(n) ? 0 : n;
}

async function findFolderId(drive: ReturnType<typeof getDriveClient>, name: string): Promise<string | null> {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const r = await drive.files.list({
    q,
    fields: 'files(id)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const files = r.data.files || [];
  return files[0]?.id ?? null;
}

// ── 1. Invoice Masters (dropdowns) ──────────────────────────────────────────
export async function getInvoiceMasters() {
  const sheets = getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEETS.MASTERS}!A:ZZ`,
  });
  const values = (resp.data.values || []) as string[][];
  if (values.length === 0) {
    return { ok: true, companyState: COMPANY_STATE };
  }
  const header = values[0].map(h => (h || '').trim());
  const gc = (col: string) => getColValues(values, header, col);
  return {
    ok: true,
    companyState: COMPANY_STATE,
    tdsLedgers:                  gc('TDS_Ledgers'),
    cgstLedgers:                 gc('CGST_Ledgers'),
    sgstLedgers:                 gc('SGST_Ledgers'),
    igstLedgers:                 gc('IGST_Ledgers'),
    eInvoiceOptions:             gc('E-Invoice (Y/N)'),
    vendorClassificationOptions: gc('Vendor Classification'),
    frequencyOptions:            gc('Frequency'),
    serviceMonthOptions:         gc('Service Month'),
    geoTypeOptions:              gc('Geo Type'),
    voucherTypeOptions:          gc('Voucher Type'),
    invoiceTypeOptions:          gc('Invoice Type'),
    groupLedgerOptions:          gc('Group Ledger'),
    ledgerExpNameOptions:        gc('Ledger Exp Name'),
    businessOwnerOptions:        gc('Business Owner Approval'),
    paymentStatusOptions:        gc('Payment status'),
    paymentModeOptions:          gc('Payment Mode'),
    rcmCgstLedgers:              gc('RCM CGST Ledger').length ? gc('RCM CGST Ledger')
                                   : gc('RCM-CGST Ledger').length ? gc('RCM-CGST Ledger')
                                   : gc('RCM-CGST Legder'),
    rcmSgstLedgers:              gc('RCM SGST Ledger').length ? gc('RCM SGST Ledger')
                                   : gc('RCM-SGST Ledger').length ? gc('RCM-SGST Ledger')
                                   : gc('RCM-SGST Legder'),
    rcmIgstLedgers:              gc('RCM IGST Ledger').length ? gc('RCM IGST Ledger')
                                   : gc('RCM-IGST Ledger').length ? gc('RCM-IGST Ledger')
                                   : gc('RCM-IGST Legder'),
  };
}

// ── 2. Vendor Search ─────────────────────────────────────────────────────────
export async function searchVendors(q: string, limit = 20) {
  const sheets = getSheetsClient();
  const [vendorResp, serviceResp] = await Promise.all([
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.VENDOR}!A:ZZ`,
    }),
    sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEETS.VENDOR_SERVICE}!A:ZZ`,
    }).catch(() => ({ data: { values: [] } })),
  ]);

  const vendorValues = (vendorResp.data.values || []) as string[][];
  if (vendorValues.length <= 1) return { ok: true, vendors: [] };

  const header = vendorValues[0].map(h => (h || '').trim());
  const idx = indexMap(header);

  // Build PNL head map from Vendor Service sheet
  const pnlMap: Record<string, string> = {};
  const svcValues = (serviceResp.data.values || []) as string[][];
  if (svcValues.length > 1) {
    const svcHdr = indexMap(svcValues[0].map(h => (h || '').trim()));
    const vcI = svcHdr['Vendor Code'];
    const phI = svcHdr['PNL head'] ?? svcHdr['PNL Head'];
    if (vcI !== undefined && phI !== undefined) {
      svcValues.slice(1).forEach(row => {
        const vc = (row[vcI] || '').trim();
        const ph = (row[phI] || '').trim();
        if (vc && !pnlMap[vc]) pnlMap[vc] = ph;
      });
    }
  }

  const getCol = (row: string[], colName: string) => {
    const i = idx[colName];
    return i !== undefined && i < row.length ? (row[i] || '').trim() : '';
  };

  const ql = q.toLowerCase();
  const vendors = [];
  for (const row of vendorValues.slice(1)) {
    const code = getCol(row, 'Vendor Code');
    const name = getCol(row, 'Vendor Name');
    if (!code) continue;
    if (ql && !code.toLowerCase().includes(ql) && !name.toLowerCase().includes(ql)) continue;
    const gstRegRaw = getCol(row, 'GST registered/GST Non-registered/NRI');
    const gstRegistered = gstRegRaw.toLowerCase().includes('non') ? 'N' : 'Y';
    vendors.push({
      code,
      name,
      gstin:          getCol(row, 'GSTIN No.'),
      pan:            getCol(row, 'PAN No.'),
      state:          getCol(row, 'Lenth'),
      gstRegistered,
      groupName:      getCol(row, 'Parent Group') || getCol(row, 'Group name') || getCol(row, 'Group Ledger'),
      pnlHead:        pnlMap[code] || '',
      groupLedger:    getCol(row, 'Group Ledger'),
      tdsRate:        getCol(row, 'TDS Rate'),
      gstRate:        getCol(row, 'GST Rate'),
      serviceDesc:    getCol(row, 'Service Description'),
      vendorType:     getCol(row, 'Vendor Type'),
      msmeStatus:     getCol(row, 'MSME Status') || getCol(row, 'MSME'),
    });
    if (vendors.length >= limit) break;
  }
  return { ok: true, vendors };
}

// ── 3. Upload Invoice File to Google Drive ───────────────────────────────────
export async function uploadInvoiceFile(
  fileName: string,
  mimeType: string,
  buffer: Buffer,
): Promise<{ ok: boolean; fileId?: string; fileLink?: string; error?: string }> {
  try {
    const drive = getDriveClient();
    const folderId = await findFolderId(drive, INVOICE_FOLDER);
    const metadata: any = { name: fileName };
    if (folderId) metadata.parents = [folderId];
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    const resp = await drive.files.create({
      requestBody: metadata,
      media: { mimeType, body: stream },
      fields: 'id',
      supportsAllDrives: true,
    });
    const fileId = resp.data.id || '';
    const fileLink = fileId ? `https://drive.google.com/file/d/${fileId}/view` : '';
    return { ok: true, fileId, fileLink };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ── 4. Submit Invoice to Google Sheet ────────────────────────────────────────
interface SubmitInvoiceInput {
  vendor: {
    code: string; name: string; gstin: string; pan: string;
    state: string; gstRegistered: string;
  };
  invoice: Record<string, any>;
  userEmail: string;
  pendingFileId?: string;
}

export async function submitInvoice(input: SubmitInvoiceInput) {
  const { vendor, invoice: inv, userEmail, pendingFileId } = input;
  const sheets = getSheetsClient();

  // Get sheet headers (row 2 is headers per original)
  const metaResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEETS.INVOICE}!2:2`,
  });
  const headerRow = ((metaResp.data.values || [[]])[0] || []) as string[];
  const idx = indexMap(headerRow.map(h => h.replace(/\s+/g, ' ').trim()));

  const row: (string | number)[] = new Array(headerRow.length).fill('');
  const set = (col: string, val: any) => {
    const i = idx[col];
    if (i !== undefined) row[i] = val ?? '';
  };

  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    .replace(/\//g, '-');
  const dateStr = inv.invoiceDate || '';

  // Computed
  const cgst     = toNum(inv.cgst);
  const sgst     = toNum(inv.sgst);
  const igst     = toNum(inv.igst);
  const tdsAmt   = toNum(inv.tdsAmount);
  const netPay   = toNum(inv.netPayable);
  const gstPct   = toNum(inv.gstPercent);
  const tdsPct   = toNum(inv.tdsPercent);
  const taxable  = toNum(inv.taxableAmount);
  const tdsLedger = inv.tdsLedger || '';

  set('Created At', nowStr);
  set('Created By', userEmail || 'local@finops.app');
  set('Geo Type', inv.geoType || '');
  set('Voucher Type', inv.voucherType || '');
  set('Invoice Type', inv.invoiceType || '');
  set('E-Invoice', inv.eInvoice || '');
  set('Vendor Code', vendor.code);
  set('Group name', inv.groupName || '');
  set('Vendor Name', vendor.name);
  set('Vendor Classification', inv.vendorClassification || '');
  set('Frequency', inv.frequency || '');
  set('Vendor GSTIN', vendor.gstin);
  set('Vendor PAN', vendor.pan);
  set('Vendor State', vendor.state);
  set('GST Registered (Y/N)', vendor.gstRegistered || 'Y');
  set('Invoice No', inv.invoiceNo || '');
  set('Credit Note No', inv.creditNoteNo || '');
  set('Invoice Date', dateStr);
  set('Service Start Date', inv.serviceStartDate || '');
  set('Service start date', inv.serviceStartDate || '');
  set('Service start date (dd/mm/yy)', inv.serviceStartDate || '');
  set('Service End Date', inv.serviceEndDate || '');
  set('Service end date', inv.serviceEndDate || '');
  set('Service end date(dd/mm/yy)', inv.serviceEndDate || '');
  set('PO Ref No', inv.poRefNo || '');
  set('Service Month', inv.serviceMonth || '');
  set('Service Description', inv.serviceDescription || '');
  set('Expense Amount 1', toNum(inv.expenseAmount1));
  set('Expense Amount 2', toNum(inv.expenseAmount2));
  set('Invoice Amount (FCY)', toNum(inv.invoiceAmountFCY));
  set('Exchange Rate', toNum(inv.exchangeRate));
  set('Grossed Up', inv.grossedUp || 'No');
  set('Grossed Up (Yes/No)', inv.grossedUp || 'No');
  set('Grossed Up %', toNum(inv.grossedUpPercent));
  set('Grossed Up Percentage', toNum(inv.grossedUpPercent));
  set('Service Value (Grossed Up INR)', toNum(inv.serviceValueGrossedUp));
  set('Taxable Amount', taxable);
  set('GST %', gstPct);
  set('GST Rate %', gstPct);
  set('GST Type', inv.gstType || '');
  set('GST Avail', inv.gstAvail || 'Yes');
  set('CGST Amount', cgst); set('CGST', cgst);
  set('SGST Amount', sgst); set('SGST', sgst);
  set('IGST Amount', igst); set('IGST', igst);
  set('CGST Ledger', inv.cgstLedger || '');
  set('SGST Ledger', inv.sgstLedger || '');
  set('IGST Ledger', inv.igstLedger || '');
  set('LDC Applicability (Yes/No)', inv.ldcApplicability || '');
  set('LDC Applicability(Yes/No)', inv.ldcApplicability || '');
  set('LDC Applicability', inv.ldcApplicability || '');
  set('TDS %', tdsPct);
  set('TDS Ledger', tdsLedger);
  set('TDS Amount', tdsAmt);
  set('TDS/ Equalisation Levy Amount', tdsAmt);
  set('Net Payable', netPay);
  set('Round Off', toNum(inv.roundOff));
  set('RCM Applicability', inv.rcmApplicability || '');
  set('RCM Rate', inv.rcmRateText || '');
  set('RCM Amount', toNum(inv.rcmAmount));
  set('RCM CGST Ledger', inv.rcmCgstLedger || '');
  set('RCM-CGST Ledger', inv.rcmCgstLedger || '');
  set('RCM-CGST Legder', inv.rcmCgstLedger || '');
  set('RCM SGST Ledger', inv.rcmSgstLedger || '');
  set('RCM-SGST Ledger', inv.rcmSgstLedger || '');
  set('RCM-SGST Legder', inv.rcmSgstLedger || '');
  set('RCM IGST Ledger', inv.rcmIgstLedger || '');
  set('RCM-IGST Ledger', inv.rcmIgstLedger || '');
  set('RCM-IGST Legder', inv.rcmIgstLedger || '');
  set('Group Ledger', inv.groupLedger || '');
  set('Ledger Exp Name', inv.ledgerExpName || '');
  set('Business Owner Approval', inv.businessOwner || '');
  set('Business Owner approval', inv.businessOwner || '');
  set('Payment Status', inv.paymentStatus || '');
  set('Payment Mode', inv.paymentMode || '');
  set('Approval Status', 'Pending');
  set('Tally Entry Status', 'Pending');
  set('Remarks', inv.remarks || '');
  set('Invoice File Id', inv.fileId || '');
  set('Invoice File Link', inv.fileLink || '');
  set('Invoice File URL', inv.fileLink || '');
  set('PNL head', inv.pnlHead || '');
  set('PNL Head', inv.pnlHead || '');

  // Narration
  const narration = `Being Expenses booked for ${inv.serviceDescription || ''} against Invoice no: ${inv.invoiceNo || ''} dated ${dateStr} from period ${inv.serviceStartDate || ''} to ${inv.serviceEndDate || ''}${inv.poRefNo ? ', ' + inv.poRefNo : ''}`;
  set('Narration', narration);

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEETS.INVOICE}!A:A`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] },
  });

  // Move pending file to Processed Invoices if it came from the queue
  if (pendingFileId) {
    try {
      const drive = getDriveClient();
      const [pendingFolderId, processedFolderId] = await Promise.all([
        findFolderId(drive, PENDING_FOLDER),
        findFolderId(drive, PROCESSED_FOLDER),
      ]);
      if (pendingFolderId && processedFolderId) {
        const clean = (s: string) => s.replace(/[^\w /\-]/g, '').trim();
        const newName = `${clean(vendor.name)}_${clean(inv.invoiceNo || 'NA')}_${clean(dateStr)}.pdf`;
        await drive.files.update({
          fileId: pendingFileId,
          addParents: processedFolderId,
          removeParents: pendingFolderId,
          supportsAllDrives: true,
          requestBody: { name: newName },
          fields: 'id, parents, name',
        });
      }
    } catch (_) {
      // Don't fail submission if move fails
    }
  }

  return { ok: true, message: 'Invoice submitted successfully and added to the sheet.' };
}

// ── 5. Get Next Pending Invoice from Drive ────────────────────────────────────
export async function getPendingInvoice() {
  const drive = getDriveClient();
  const folderId = await findFolderId(drive, PENDING_FOLDER);
  if (!folderId) return { ok: true, file: null, message: 'Pending Invoices folder not found' };

  const q = `'${folderId}' in parents and trashed=false`;
  const r = await drive.files.list({
    q,
    fields: 'files(id, name, mimeType, createdTime)',
    orderBy: 'createdTime',
    pageSize: 1,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const files = r.data.files || [];
  if (!files.length) return { ok: true, file: null };
  const f = files[0];
  return {
    ok: true,
    file: {
      id: f.id!,
      name: f.name!,
      previewUrl: `/api/invoice/file/${f.id}`,
      fileLink: `https://drive.google.com/file/d/${f.id}/view`,
    },
  };
}
