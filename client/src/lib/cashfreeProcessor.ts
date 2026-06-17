/**
 * Cashfree Entry — Client-side processor
 * All 10 transformation steps run entirely in the browser using SheetJS.
 * No server, no SSE, no timeouts.
 */
import * as XLSX from "xlsx";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StepResult {
  step: number;
  total: number;
  label: string;
  detail: string;
}

export type ProgressCallback = (result: StepResult) => void;

export interface PivotDataRow {
  date: string;       // formatted date string
  particulars: string;
  amount: number;
  sc: number;
  st: number;
  net: number;
}

export interface ProcessResult {
  workbook: XLSX.WorkBook;
  previewRows: Record<string, string>[];
  previewCols: string[];
  pivotData: PivotDataRow[];
  summary: {
    removed: number;
    suffixFixed: number;
    dupCount: number;
    tallyRows: number;
    reconciliation: { field: string; tr: number; acct: number; match: boolean }[];
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function fmtDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

function tallyDate(d: Date): number {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return parseInt(`${yyyy}${mm}${dd}`);
}

function parseDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(d.y, d.m - 1, d.d);
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekEndSunday(d: Date): string {
  const copy = new Date(d);
  const day = copy.getDay(); // 0=Sun
  const daysToSun = day === 0 ? 0 : 7 - day;
  copy.setDate(copy.getDate() + daysToSun);
  return dateOnly(copy);
}

function sheetToRows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function setCell(
  ws: XLSX.WorkSheet,
  col: number,
  row: number,
  value: unknown,
  style?: Record<string, unknown>
) {
  const addr = XLSX.utils.encode_cell({ c: col, r: row });
  const cell: XLSX.CellObject = { v: value as XLSX.CellObject['v'], t: typeof value === "number" ? "n" : "s" };
  if (style) (cell as any).s = style;
  ws[addr] = cell;
}

function setFormula(
  ws: XLSX.WorkSheet,
  col: number,
  row: number,
  formula: string,
  style?: Record<string, unknown>
) {
  const addr = XLSX.utils.encode_cell({ c: col, r: row });
  const cell: XLSX.CellObject = { f: formula, t: "n" };
  if (style) (cell as any).s = style;
  ws[addr] = cell;
}

// ─── Main Processor ──────────────────────────────────────────────────────────

type AnyRow = Record<string, unknown>;

export async function processCashfree(
  file: File,
  onProgress: ProgressCallback
): Promise<ProcessResult> {
  // Yield to UI between steps so animations render
  const tick = () => new Promise<void>((r) => setTimeout(r, 60));

  // ── Read file ──
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });

  const trSheetName = wb.SheetNames.find((n) =>
    n.toLowerCase().includes("transfer")
  ) ?? wb.SheetNames[0];
  const acctSheetName = wb.SheetNames.find((n) =>
    n.toLowerCase().includes("account")
  ) ?? wb.SheetNames[1];

  let tr: AnyRow[] = sheetToRows(wb.Sheets[trSheetName]);
  let acct: AnyRow[] = sheetToRows(wb.Sheets[acctSheetName]);

  // Normalise column name: Cashfree exports truncate "Transfer Id" to "Tra"
  tr = tr.map((row: AnyRow) => {
    const r = { ...row };
    if ("Tra" in r && !("Transfer Id" in r)) {
      r["Transfer Id"] = r["Tra"];
      delete r["Tra"];
    }
    // Drop pre-existing countif column — we'll regenerate it
    delete r["countif"];
    return r;
  });

  // Drop pre-existing count column from account statement — we'll regenerate
  acct = acct.map((row: AnyRow) => {
    const r = { ...row };
    delete r["count"];
    return r;
  });

  onProgress({ step: 0, total: 10, label: "Read", detail: `Loaded ${tr.length} transfer rows, ${acct.length} account rows.` });
  await tick();

  // ── STEP 1 — Filter rows ──
  // Rules:
  //   1. FAILED / REJECTED  → always remove
  //   2. SUCCESS / RECEIVED → remove if Service Charge == 0 OR Service Tax == 0 / blank
  const maskFR = (r: AnyRow) => {
    const s = String(r["Status"] ?? "").toUpperCase();
    return s === "FAILED" || s === "REJECTED";
  };
  const maskZeroCharges = (r: AnyRow) =>
    toNum(r["Service Charge"]) === 0 || toNum(r["Service Tax"]) === 0;

  const removedFR = tr.filter((r) => maskFR(r)).length;
  const removedZC = tr.filter((r) => !maskFR(r) && maskZeroCharges(r)).length;
  const removed = removedFR + removedZC;
  const trClean = tr.filter((r) => !maskFR(r) && !maskZeroCharges(r));

  onProgress({
    step: 1, total: 10,
    label: "Clean rows",
    detail: `Removed ${removed} rows (${removedFR} FAILED/REJECTED, ${removedZC} with zero Service Charge or Service Tax). Remaining: ${trClean.length}`,
  });
  await tick();

  // ── STEP 2 — Normalise Transfer IDs ──
  const cleanTid = (tid: unknown): string =>
    String(tid ?? "").trim().replace(/n\d+$/i, "");

  let suffixFixed = 0;
  const trNorm = trClean.map((r) => {
    const orig = String(r["Transfer Id"] ?? "");
    const cleaned = cleanTid(orig);
    if (orig !== cleaned) suffixFixed++;
    return { ...r, "Transfer Id": cleaned };
  });

  onProgress({
    step: 2, total: 10,
    label: "Normalise Transfer IDs",
    detail: `Stripped n-suffixes from ${suffixFixed} Transfer IDs.`,
  });
  await tick();

  // ── STEP 3 — Duplicate check ──
  const tidCounts = new Map<string, number>();
  trNorm.forEach((r) => {
    const tid = String(r["Transfer Id"]);
    tidCounts.set(tid, (tidCounts.get(tid) ?? 0) + 1);
  });
  const dupTids = new Set(Array.from(tidCounts.entries()).filter(([, c]) => c > 1).map(([k]) => k));
  const dupCount = trNorm.filter((r) => dupTids.has(String(r["Transfer Id"]))).length;

  onProgress({
    step: 3, total: 10,
    label: "Duplicate check",
    detail: dupCount > 0
      ? `Found ${dupCount} duplicate rows across ${dupTids.size} Transfer IDs. Highlighted in yellow.`
      : "No duplicates — all Transfer IDs are unique.",
  });
  await tick();

  // ── STEP 4 — Subtotal reconciliation ──
  const trSuccess = trNorm.filter((r: AnyRow) => String(r["Status"]).toUpperCase() === "SUCCESS");
  const acctPT = acct.filter((r) => String(r["Particulars"]) === "PAYOUT_TRANSFER");

  const reconciliation: { field: string; tr: number; acct: number; match: boolean }[] = [];
  const pairs: [string, string][] = [
    ["Amount", "Amount (INR)"],
    ["Service Charge", "Service Charge (INR)"],
    ["Service Tax", "Service Tax (INR)"],
  ];
  for (const [trCol, acCol] of pairs) {
    const trVal = Math.round(trSuccess.reduce((s: number, r: AnyRow) => s + toNum(r[trCol]), 0) * 100) / 100;
    const acVal = Math.round(acctPT.reduce((s: number, r: AnyRow) => s + toNum(r[acCol]), 0) * 100) / 100;
    reconciliation.push({ field: trCol, tr: trVal, acct: acVal, match: trVal === acVal });
  }

  const recoDetail = reconciliation
    .map((r) => `${r.field}: TR=${r.tr.toLocaleString()} Acct=${r.acct.toLocaleString()} → ${r.match ? "MATCH ✓" : `MISMATCH diff=${(r.tr - r.acct).toFixed(2)}`}`)
    .join(" | ");

  onProgress({ step: 4, total: 10, label: "Subtotal reconciliation", detail: recoDetail });
  await tick();

  // ── STEP 5 — Write transfer report sheet ──
  // Build new workbook
  const outWb = XLSX.utils.book_new();

  // Build transfer report: move Transfer Id + count to right after Amount
  const trHeaders = Object.keys(trNorm[0] ?? {} as AnyRow);
  // Build ordered headers: Added On | Amount | Transfer Id | count | (rest without Transfer Id)
  const trHeadersWithoutTid = trHeaders.filter((h) => h !== "Transfer Id");
  const amtIdxInFiltered = trHeadersWithoutTid.indexOf("Amount");
  const trFinalHeaders = [
    ...trHeadersWithoutTid.slice(0, amtIdxInFiltered + 1),
    "Transfer Id",
    "count",
    ...trHeadersWithoutTid.slice(amtIdxInFiltered + 1),
  ];

  // ── Shared style palette ──
  // Dark teal (matches sidebar #1E596B)
  const DARK_TEAL  = "1E596B"; // header fills
  const MID_TEAL   = "2A7F8F"; // sub-header / config rows
  const LIGHT_TEAL = "EDF5F7"; // alternating row stripe
  const LIGHT_GREEN = "E2EFDA"; // PT data rows
  const AMBER      = "FFC000"; // Trf/VPA highlight
  const GRAND_BG   = "BDD7EE"; // grand total row
  const CONFIG_BG  = "D6E8ED"; // pivot config area

  const mkHdr = (fill = DARK_TEAL) => ({
    font: { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 11 },
    fill: { fgColor: { rgb: fill } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: { bottom: { style: "thin", color: { rgb: "FFFFFF" } } },
  });
  const mkData = (stripe: boolean, numFmt?: string) => ({
    font: { name: "Calibri", sz: 10 },
    fill: { fgColor: { rgb: stripe ? LIGHT_TEAL : "FFFFFF" } },
    alignment: { horizontal: "left", vertical: "center" },
    ...(numFmt ? { numFmt } : {}),
  });
  const mkNum = (stripe: boolean) => ({
    font: { name: "Calibri", sz: 10 },
    fill: { fgColor: { rgb: stripe ? LIGHT_TEAL : "FFFFFF" } },
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "#,##0.00",
  });
  const mkGrand = () => ({
    font: { bold: true, name: "Calibri", sz: 10 },
    fill: { fgColor: { rgb: GRAND_BG } },
    alignment: { horizontal: "right", vertical: "center" },
    numFmt: "#,##0.00",
  });
  const mkGrandLabel = () => ({
    font: { bold: true, name: "Calibri", sz: 10 },
    fill: { fgColor: { rgb: GRAND_BG } },
    alignment: { horizontal: "left", vertical: "center" },
  });

  // Transfer report sheet — data starts at row 0 (no processing log header rows)
  const trWs: XLSX.WorkSheet = {};

  // Header row at row 0
  const headerStyle = mkHdr(DARK_TEAL);
  const countHeaderStyle = mkHdr(MID_TEAL);
  const countDataStyle = { font: { name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: LIGHT_GREEN } }, alignment: { horizontal: "center" } };

  trFinalHeaders.forEach((h, ci) => {
    setCell(trWs, ci, 0, h, h === "count" ? countHeaderStyle : headerStyle);
  });

  // Data rows starting at row 1
  const countColIdx = trFinalHeaders.indexOf("count");
  const tidColLetter = XLSX.utils.encode_col(trFinalHeaders.indexOf("Transfer Id"));

  trNorm.forEach((row: AnyRow, ri: number) => {
    const dataRow = ri + 1; // 0-indexed row in sheet, data starts at row 1
    const stripe = ri % 2 === 1;
    trFinalHeaders.forEach((h: string, ci: number) => {
      if (h === "count") {
        // COUNTIF formula — row index is 1-based in Excel formulas
        const formula = `COUNTIF($${tidColLetter}:$${tidColLetter},IFERROR(LEFT(${tidColLetter}${dataRow + 1},FIND("n",${tidColLetter}${dataRow + 1},LEN(${tidColLetter}${dataRow + 1})-3)-1),${tidColLetter}${dataRow + 1})&"*")`;
        setFormula(trWs, ci, dataRow, formula, countDataStyle);
      } else {
        const val = (row as AnyRow)[h];
        const isDup = h === "Transfer Id" && dupTids.has(String(val));
        const style = isDup
          ? { font: { bold: true, color: { rgb: "7B0000" } }, fill: { fgColor: { rgb: "FFFF00" } }, alignment: { horizontal: "left" } }
          : mkData(stripe);
        setCell(trWs, ci, dataRow, val ?? "", style);
      }
    });
  });

  // Set sheet range
  trWs["!ref"] = XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: trFinalHeaders.length - 1, r: trNorm.length },
  });

  // Column widths
  trWs["!cols"] = trFinalHeaders.map((h) => ({ wch: h === "count" ? 8 : h.length + 4 }));

  XLSX.utils.book_append_sheet(outWb, trWs, "transfer report");

  onProgress({
    step: 5, total: 10,
    label: "Write transfer report",
    detail: `Transfer report written with ${trNorm.length} rows + count column.`,
  });
  await tick();

  // ── STEP 6 — Enrich account statement ──
  // Build Reference Id → Transfer Id lookup from trNorm
  // cc = Transfer Id from transfer report where Reference Id matches account statement's Reference Id
  const refIdToTid = new Map<string, string>();
  trNorm.forEach((r: AnyRow) => {
    const refId = String(r["Reference Id"] ?? "");
    const tid = String(r["Transfer Id"] ?? "");
    if (refId) refIdToTid.set(refId, tid);
  });

  const acctHeaders = Object.keys(acct[0] ?? {} as AnyRow);
  const eventIdIdx = acctHeaders.indexOf("Event Id");
  const acctFinalHeaders = [
    ...acctHeaders.slice(0, eventIdIdx + 1),
    "cc",
    "count",
    ...acctHeaders.slice(eventIdIdx + 1),
  ];

  const acctWs: XLSX.WorkSheet = {};
  const acctHeaderStyle = mkHdr(DARK_TEAL);
  const acctCcHdrStyle = mkHdr(MID_TEAL);

  acctFinalHeaders.forEach((h, ci) => {
    setCell(acctWs, ci, 0, h, (h === "cc" || h === "count") ? acctCcHdrStyle : acctHeaderStyle);
  });

  acct.forEach((row: AnyRow, ri: number) => {
    const dataRow = ri + 1;
    const stripe = ri % 2 === 1;
    acctFinalHeaders.forEach((h: string, ci: number) => {
      if (h === "cc") {
        // Match account statement Event Id against transfer report Reference Id
        const eventId = String(row["Event Id"] ?? "");
        const cc = refIdToTid.get(eventId) ?? "";
        setCell(acctWs, ci, dataRow, cc, mkData(stripe));
      } else if (h === "count") {
        // Count of Event Id occurrences in account statement
        const eventId = String(row["Event Id"] ?? "");
        const cnt = acct.filter((r) => String(r["Event Id"]) === eventId).length;
        setCell(acctWs, ci, dataRow, cnt, { font: { name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: LIGHT_GREEN } }, alignment: { horizontal: "center" } });
      } else {
        setCell(acctWs, ci, dataRow, (row as AnyRow)[h] ?? "", mkData(stripe));
      }
    });
  });

  acctWs["!ref"] = XLSX.utils.encode_range({
    s: { c: 0, r: 0 },
    e: { c: acctFinalHeaders.length - 1, r: acct.length },
  });
  acctWs["!cols"] = acctFinalHeaders.map((h) => ({ wch: h.length + 4 }));

  XLSX.utils.book_append_sheet(outWb, acctWs, "account statement");

  onProgress({
    step: 6, total: 10,
    label: "Enrich account statement",
    detail: `Account statement enriched: cc + count columns added. Rows: ${acct.length}.`,
  });
  await tick();

  // ── STEP 7 — Build Summary sheet ──
  const summaryWs: XLSX.WorkSheet = {};
  let summaryRow = 0;

  // Build date-grouped pivot from account statement
  type DayData = { date: Date; amount: number; sc: number; st: number; particulars: string };
  const dayMap = new Map<string, DayData[]>();

  acct.forEach((row) => {
    const d = parseDate(row["Added On"]);
    if (!d) return;
    const key = dateOnly(d);
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key)!.push({
      date: d,
      amount: toNum(row["Amount (INR)"]),
      sc: toNum(row["Service Charge (INR)"]),
      st: toNum(row["Service Tax (INR)"]),
      particulars: String(row["Particulars"] ?? ""),
    });
  });

  const sortedDates = Array.from(dayMap.keys()).sort();

  const pivotHeaderStyle = mkHdr(DARK_TEAL);
  const grandTotalStyle = mkGrand();
  const lightGreenStyle = { font: { name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: LIGHT_GREEN } }, alignment: { horizontal: "right" }, numFmt: "#,##0.00" };
  const lightGreenLabel = { font: { name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: LIGHT_GREEN } }, alignment: { horizontal: "left" } };
  const orangeStyle = { font: { bold: true, name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: AMBER } }, alignment: { horizontal: "right" }, numFmt: "#,##0.00" };
  const orangeLabelStyle = { font: { bold: true, name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: AMBER } }, alignment: { horizontal: "left" } };

  // ── Section A: Pivot Table Configuration block ──
  const titleStyle = { font: { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 13 }, fill: { fgColor: { rgb: DARK_TEAL } }, alignment: { horizontal: "center", vertical: "center" } };
  const cfgHdrStyle = { font: { bold: true, color: { rgb: "FFFFFF" }, name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: MID_TEAL } }, alignment: { horizontal: "left", vertical: "center" } };
  const cfgLabelStyle = { font: { bold: true, name: "Calibri", sz: 10, color: { rgb: "1E596B" } }, fill: { fgColor: { rgb: CONFIG_BG } }, alignment: { horizontal: "left" } };
  const cfgValueStyle = { font: { name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: CONFIG_BG } }, alignment: { horizontal: "left" } };
  const filterLabelStyle = { font: { bold: true, name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: "F2F2F2" } }, alignment: { horizontal: "left" } };
  const filterValueStyle = { font: { name: "Calibri", sz: 10 }, fill: { fgColor: { rgb: "F2F2F2" } }, alignment: { horizontal: "left" } };

  // Row 0: Title
  setCell(summaryWs, 0, summaryRow, "PIVOT TABLE CONFIGURATION — Account Statement", titleStyle);
  summaryRow++;

  // Row 1: Config header
  setCell(summaryWs, 0, summaryRow, "Area", cfgHdrStyle);
  setCell(summaryWs, 1, summaryRow, "Field", cfgHdrStyle);
  setCell(summaryWs, 2, summaryRow, "Description", cfgHdrStyle);
  summaryRow++;

  // Config rows
  const configRows = [
    ["ROWS",    "Added On (date)",                    "Groups data by transfer date"],
    ["VALUES",  "Sum of Amount (INR)",                "Total payout amount per day"],
    ["VALUES",  "Sum of Service Charge (INR)",        "Total service charges per day"],
    ["VALUES",  "Sum of Service Tax (INR)",           "Total service tax per day"],
    ["FILTERS", "Particulars",                       "PAYOUT_TRANSFER / BANK_TRANSFER / VPA_DETAILS_FROM_VPA / TRANSFER_REVERSAL"],
    ["FILTERS", "count (of Event Id)",               "Filter by occurrence count of each Event Id"],
  ];
  configRows.forEach(([area, field, desc]) => {
    setCell(summaryWs, 0, summaryRow, area, cfgLabelStyle);
    setCell(summaryWs, 1, summaryRow, field, cfgValueStyle);
    setCell(summaryWs, 2, summaryRow, desc, cfgValueStyle);
    summaryRow++;
  });

  summaryRow++; // blank gap

  // Filter label rows
  setCell(summaryWs, 0, summaryRow, "Particulars", filterLabelStyle);
  setCell(summaryWs, 1, summaryRow, "(All)", filterValueStyle);
  summaryRow++;
  setCell(summaryWs, 0, summaryRow, "count", filterLabelStyle);
  setCell(summaryWs, 1, summaryRow, "(All)", filterValueStyle);
  summaryRow += 2; // blank gap

  // ── Section B: Full pivot (all particulars) ──
  const fullPivotHeaders = ["Row Labels", "Sum of Amount (INR)", "Sum of Service Charge (INR)", "Sum of Service Tax (INR)"];
  fullPivotHeaders.forEach((h, ci) => setCell(summaryWs, ci, summaryRow, h, pivotHeaderStyle));
  summaryRow++;

  let totalAmt = 0, totalSc = 0, totalSt = 0;
  sortedDates.forEach((dk, di) => {
    const rows = dayMap.get(dk)!;
    const amt = rows.reduce((s, r) => s + r.amount, 0);
    const sc = rows.reduce((s, r) => s + r.sc, 0);
    const st = rows.reduce((s, r) => s + r.st, 0);
    totalAmt += amt; totalSc += sc; totalSt += st;
    const d = rows[0].date;
    const stripe = di % 2 === 1;
    setCell(summaryWs, 0, summaryRow, fmtDate(d), mkData(stripe));
    setCell(summaryWs, 1, summaryRow, Math.round(amt * 100) / 100, mkNum(stripe));
    setCell(summaryWs, 2, summaryRow, Math.round(sc * 100) / 100, mkNum(stripe));
    setCell(summaryWs, 3, summaryRow, Math.round(st * 100) / 100, mkNum(stripe));
    summaryRow++;
  });

  // Grand total
  setCell(summaryWs, 0, summaryRow, "Grand Total", mkGrandLabel());
  setCell(summaryWs, 1, summaryRow, Math.round(totalAmt * 100) / 100, mkGrand());
  setCell(summaryWs, 2, summaryRow, Math.round(totalSc * 100) / 100, mkGrand());
  setCell(summaryWs, 3, summaryRow, Math.round(totalSt * 100) / 100, mkGrand());
  summaryRow += 2;

  // Section C — PAYOUT_TRANSFER table (offset col 6)
  const OFF = 6;
  const ptHeaders = ["Row Labels", "Sum of Amount (INR)", "Sum of SC (INR)", "Sum of ST (INR)", "net", "Trf Entries"];
  ptHeaders.forEach((h, ci) => setCell(summaryWs, OFF + ci, summaryRow, h, pivotHeaderStyle));
  summaryRow++;

  // Build PAYOUT_TRANSFER daily pivot
  type PtRow = { dateStr: string; date: Date; amount: number; sc: number; st: number; weekEnd: string };
  const ptRows: PtRow[] = [];

  sortedDates.forEach((dk) => {
    const rows = (dayMap.get(dk) ?? []).filter((r) => r.particulars === "PAYOUT_TRANSFER");
    if (rows.length === 0) return;
    const d = rows[0].date;
    const amt = rows.reduce((s, r) => s + r.amount, 0);
    const sc = rows.reduce((s, r) => s + r.sc, 0);
    const st = rows.reduce((s, r) => s + r.st, 0);
    ptRows.push({ dateStr: dk, date: d, amount: amt, sc, st, weekEnd: weekEndSunday(d) });
  });

  // Weekly Trf Entries: sum sc+st per week, placed at last date in that week
  const weekMap = new Map<string, { lastDate: Date; lastDateStr: string; net: number; startDate: Date }>();
  ptRows.forEach((r) => {
    const we = r.weekEnd;
    if (!weekMap.has(we)) {
      weekMap.set(we, { lastDate: r.date, lastDateStr: r.dateStr, net: 0, startDate: r.date });
    }
    const wk = weekMap.get(we)!;
    wk.net += r.sc + r.st;
    if (r.date > wk.lastDate) { wk.lastDate = r.date; wk.lastDateStr = r.dateStr; }
    if (r.date < wk.startDate) wk.startDate = r.date;
  });

  // Map lastDateStr → trf entry net
  const trfByLastDate = new Map<string, { net: number; startDate: Date; endDate: Date }>();
  weekMap.forEach((wk) => {
    trfByLastDate.set(wk.lastDateStr, { net: Math.round(wk.net * 100) / 100, startDate: wk.startDate, endDate: wk.lastDate });
  });

  // Track sheet row numbers for tally entry formula references
  const ptSheetRows: number[] = []; // sheet row index for each ptRow
  let ptTotalAmt = 0, ptTotalSc = 0, ptTotalSt = 0, ptTotalNet = 0;

  ptRows.forEach((r, pi) => {
    const net = Math.round((r.sc + r.st) * 100) / 100;
    ptTotalAmt += r.amount; ptTotalSc += r.sc; ptTotalSt += r.st; ptTotalNet += net;
    ptSheetRows.push(summaryRow);
    setCell(summaryWs, OFF, summaryRow, fmtDate(r.date), lightGreenLabel);
    setCell(summaryWs, OFF + 1, summaryRow, Math.round(r.amount * 100) / 100, lightGreenStyle);
    setCell(summaryWs, OFF + 2, summaryRow, Math.round(r.sc * 100) / 100, lightGreenStyle);
    setCell(summaryWs, OFF + 3, summaryRow, Math.round(r.st * 100) / 100, lightGreenStyle);
    setCell(summaryWs, OFF + 4, summaryRow, net, lightGreenStyle); // net = sc+st
    // Trf Entries column — place weekly sum at last date of that week
    if (trfByLastDate.has(r.dateStr)) {
      setCell(summaryWs, OFF + 5, summaryRow, trfByLastDate.get(r.dateStr)!.net, orangeStyle);
    }
    summaryRow++;
  });

  // Grand total for PT
  const ptGrandRow = summaryRow;
  setCell(summaryWs, OFF, summaryRow, "Grand Total", mkGrandLabel());
  setCell(summaryWs, OFF + 1, summaryRow, Math.round(ptTotalAmt * 100) / 100, mkGrand());
  setCell(summaryWs, OFF + 2, summaryRow, Math.round(ptTotalSc * 100) / 100, mkGrand());
  setCell(summaryWs, OFF + 3, summaryRow, Math.round(ptTotalSt * 100) / 100, mkGrand());
  setCell(summaryWs, OFF + 4, summaryRow, Math.round(ptTotalNet * 100) / 100, mkGrand());
  summaryRow += 4; // gap before VPA section

  // Section D — VPA_DETAILS_FROM_VPA
  const vpaHeaders = ["Row Labels", "Sum of Amount (INR)", "Sum of SC (INR)", "Sum of ST (INR)", "net", "VPA_DETAILS_FROM_VPA"];
  vpaHeaders.forEach((h, ci) => setCell(summaryWs, OFF + ci, summaryRow, h, pivotHeaderStyle));
  summaryRow++;

  type VpaRow = { dateStr: string; date: Date; amount: number; sc: number; st: number };
  const vpaRows: VpaRow[] = [];
  sortedDates.forEach((dk) => {
    const rows = (dayMap.get(dk) ?? []).filter((r) => r.particulars === "VPA_DETAILS_FROM_VPA");
    if (rows.length === 0) return;
    const d = rows[0].date;
    const amt = rows.reduce((s, r) => s + r.amount, 0);
    const sc = rows.reduce((s, r) => s + r.sc, 0);
    const st = rows.reduce((s, r) => s + r.st, 0);
    vpaRows.push({ dateStr: dk, date: d, amount: amt, sc, st });
  });

  const vpaSheetRows: number[] = [];
  let vpaTotalNet = 0;
  vpaRows.forEach((r) => {
    const net = Math.round((r.sc + r.st) * 100) / 100;
    vpaTotalNet += net;
    vpaSheetRows.push(summaryRow);
    setCell(summaryWs, OFF, summaryRow, fmtDate(r.date), lightGreenLabel);
    setCell(summaryWs, OFF + 1, summaryRow, Math.round(r.amount * 100) / 100, lightGreenStyle);
    setCell(summaryWs, OFF + 2, summaryRow, Math.round(r.sc * 100) / 100, lightGreenStyle);
    setCell(summaryWs, OFF + 3, summaryRow, Math.round(r.st * 100) / 100, lightGreenStyle);
    setCell(summaryWs, OFF + 4, summaryRow, net, lightGreenStyle);
    setCell(summaryWs, OFF + 5, summaryRow, net, orangeStyle); // VPA_DETAILS col
    summaryRow++;
  });

  // Grand total VPA
  setCell(summaryWs, OFF, summaryRow, "Grand Total", mkGrandLabel());
  setCell(summaryWs, OFF + 4, summaryRow, Math.round(vpaTotalNet * 100) / 100, mkGrand());
  summaryRow++;

  summaryWs["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: OFF + 5, r: summaryRow } });
  summaryWs["!cols"] = Array(OFF + 6).fill({ wch: 22 });

  XLSX.utils.book_append_sheet(outWb, summaryWs, "Summary");

  onProgress({
    step: 7, total: 10,
    label: "Build Summary sheet",
    detail: `Summary: ${sortedDates.length} all-daily rows | PAYOUT: ${ptRows.length} rows | Trf Entries: ${trfByLastDate.size} | VPA: ${vpaRows.length} rows`,
  });
  await tick();

  // ── STEP 8 — Build tally entry sheet ──
  const tallyWs: XLSX.WorkSheet = {};
  const tallyHeaders = ["entry_code", "DATE", "Tally Date", "Mode", "VOUCHERTYPENAME", "NARRATION", "DebitLedger", "AmountDebitLedger", "CreditLedger", "AmountCreditLedger"];
  const tallyHeaderStyle = mkHdr(DARK_TEAL);

  tallyHeaders.forEach((h, ci) => setCell(tallyWs, ci, 0, h, tallyHeaderStyle));

  let tallyRow = 1;
  let entryCode = 1;
  const ptStartDate = ptRows.length > 0 ? ptRows[0].date : new Date();

  // Part 1 — Normal rows (one per PAYOUT_TRANSFER date)
  ptRows.forEach((r, idx) => {
    const summarySheetRow = ptSheetRows[idx] + 1; // 1-indexed for Excel formula
    const amtCreditCol = XLSX.utils.encode_col(OFF + 1); // col H in Summary (0-indexed OFF+1)
    const amtCreditFormula = `Summary!${amtCreditCol}${summarySheetRow}`;
    const amtDebitFormula = `=-J${tallyRow + 1}`;
    const stripe = idx % 2 === 1;
    const td = mkData(stripe);
    const tn = mkNum(stripe);

    setCell(tallyWs, 0, tallyRow, entryCode++, { ...td, alignment: { horizontal: "center" } });
    setCell(tallyWs, 1, tallyRow, fmtDate(r.date), td);
    setCell(tallyWs, 2, tallyRow, tallyDate(r.date), td);
    setCell(tallyWs, 3, tallyRow, "Journal", td);
    setCell(tallyWs, 4, tallyRow, "P- JV- MH", td);
    setCell(tallyWs, 5, tallyRow, `Refund Done through Cashfree  on ${r.dateStr}`, td);
    setCell(tallyWs, 6, tallyRow, "Refund Pay to Customer-COD", td);
    setFormula(tallyWs, 7, tallyRow, amtDebitFormula, tn);
    setCell(tallyWs, 8, tallyRow, "Cashfree Payments India(Pasfar) Pvt Ltd-C", td);
    setFormula(tallyWs, 9, tallyRow, amtCreditFormula, tn);
    tallyRow++;
  });

  // Part 2 — Trf Entry rows (one per weekly window)
  const trfEntries = Array.from(trfByLastDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  trfEntries.forEach(([dateStr, info]) => {
    const summarySheetRow = ptSheetRows[ptRows.findIndex((r) => r.dateStr === dateStr)] + 1;
    const trfColLetter = XLSX.utils.encode_col(OFF + 5); // Trf Entries col
    const amtCreditFormula = `Summary!${trfColLetter}${summarySheetRow}`;
    const amtDebitFormula = `=-J${tallyRow + 1}`;

    setCell(tallyWs, 0, tallyRow, entryCode++, { ...orangeLabelStyle, alignment: { horizontal: "center" } });
    setCell(tallyWs, 1, tallyRow, fmtDate(info.endDate), orangeLabelStyle);
    setCell(tallyWs, 2, tallyRow, tallyDate(info.endDate), orangeLabelStyle);
    setCell(tallyWs, 3, tallyRow, "Journal", orangeLabelStyle);
    setCell(tallyWs, 4, tallyRow, "P- JV- MH", orangeLabelStyle);
    setCell(tallyWs, 5, tallyRow, `Inv Trf Entries from ${dateOnly(info.startDate)} to ${dateOnly(info.endDate)}`, orangeLabelStyle);
    setCell(tallyWs, 6, tallyRow, "Cashfree Payments India(Pasfar) Pvt Ltd-V", orangeLabelStyle);
    setFormula(tallyWs, 7, tallyRow, amtDebitFormula, orangeStyle);
    setCell(tallyWs, 8, tallyRow, "Cashfree Payments India(Pasfar) Pvt Ltd-C", orangeLabelStyle);
    setFormula(tallyWs, 9, tallyRow, amtCreditFormula, orangeStyle);
    tallyRow++;
  });

  // Part 3 — VPA Entry rows
  vpaRows.forEach((r, idx) => {
    const summarySheetRow = vpaSheetRows[idx] + 1;
    const vpaColLetter = XLSX.utils.encode_col(OFF + 5);
    const amtCreditFormula = `Summary!${vpaColLetter}${summarySheetRow}`;
    const amtDebitFormula = `=-J${tallyRow + 1}`;
    const ptStart = ptStartDate;

    setCell(tallyWs, 0, tallyRow, entryCode++, { ...orangeLabelStyle, alignment: { horizontal: "center" } });
    setCell(tallyWs, 1, tallyRow, fmtDate(r.date), orangeLabelStyle);
    setCell(tallyWs, 2, tallyRow, tallyDate(r.date), orangeLabelStyle);
    setCell(tallyWs, 3, tallyRow, "Journal", orangeLabelStyle);
    setCell(tallyWs, 4, tallyRow, "P- JV- MH", orangeLabelStyle);
    setCell(tallyWs, 5, tallyRow, `VPA_DETAILS_FROM_VPA${dateOnly(ptStart)} to ${r.dateStr}`, orangeLabelStyle);
    setCell(tallyWs, 6, tallyRow, "Cashfree Payments India(Pasfar) Pvt Ltd-V", orangeLabelStyle);
    setFormula(tallyWs, 7, tallyRow, amtDebitFormula, orangeStyle);
    setCell(tallyWs, 8, tallyRow, "Cashfree Payments India(Pasfar) Pvt Ltd-C", orangeLabelStyle);
    setFormula(tallyWs, 9, tallyRow, amtCreditFormula, orangeStyle);
    tallyRow++;
  });

  tallyWs["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 9, r: tallyRow - 1 } });
  tallyWs["!cols"] = [8, 12, 12, 10, 14, 50, 40, 20, 40, 20].map((wch) => ({ wch }));

  XLSX.utils.book_append_sheet(outWb, tallyWs, "tally entry");

  const totalTallyRows = tallyRow - 1;
  onProgress({
    step: 8, total: 10,
    label: "Build tally entry sheet",
    detail: `Tally entry: ${ptRows.length} normal rows + ${trfEntries.length} Trf rows + ${vpaRows.length} VPA rows = ${totalTallyRows} total`,
  });
  await tick();

  // ── STEP 9 — Finalise workbook ──
  // Enforce sheet order: transfer report | account statement | Summary | tally entry
  const desired = ["transfer report", "account statement", "Summary", "tally entry"];
  outWb.SheetNames.sort((a, b) => {
    const ai = desired.indexOf(a);
    const bi = desired.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  onProgress({
    step: 9, total: 10,
    label: "Finalise & save",
    detail: `Workbook finalised. 4 sheets: ${outWb.SheetNames.join(" | ")}`,
  });
  await tick();

  // ── STEP 10 — Build preview ──
  const previewCols = trFinalHeaders.filter((h) => h !== "count").slice(0, 8);
  const previewRows: Record<string, string>[] = trNorm.slice(0, 20).map((r: AnyRow) => {
    const out: Record<string, string> = {};
    previewCols.forEach((h) => { out[h] = String(r[h] ?? ""); });
    return out;
  });

  onProgress({
    step: 10, total: 10,
    label: "Processing complete",
    detail: `All 4 sheets written. Removed ${removed} rows | Fixed ${suffixFixed} IDs | ${dupCount} duplicates | ${totalTallyRows} tally rows.`,
  });

  // ── Build pivot data for browser-side interactive pivot ──
  const pivotData: PivotDataRow[] = [];
  sortedDates.forEach((dk) => {
    const rows = dayMap.get(dk) ?? [];
    rows.forEach((r) => {
      pivotData.push({
        date: fmtDate(r.date),
        particulars: r.particulars,
        amount: Math.round(r.amount * 100) / 100,
        sc: Math.round(r.sc * 100) / 100,
        st: Math.round(r.st * 100) / 100,
        net: Math.round((r.sc + r.st) * 100) / 100,
      });
    });
  });

  return {
    workbook: outWb,
    previewRows,
    previewCols,
    pivotData,
    summary: { removed, suffixFixed, dupCount, tallyRows: totalTallyRows, reconciliation },
  };
}

/**
 * Trigger browser download of the processed workbook as XLSX.
 */
export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const wbOut = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbOut], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
