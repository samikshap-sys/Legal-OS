/**
 * poDashboardRouter.ts — Purchase Order Dashboard
 * Reads "Purchase Order Final 26-27" sheet from the Invoice Tracking spreadsheet.
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1RsSkkzsseMrNLKI7pkbzz9pVSC_PAtpsu1glqjgIyVo
 */
import { Router } from "express";
import { google } from "googleapis";

const SPREADSHEET_ID = "1RsSkkzsseMrNLKI7pkbzz9pVSC_PAtpsu1glqjgIyVo";
const SHEET_NAME = "Purchase Order Final 26-27";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let sheetsClient: ReturnType<typeof google.sheets> | null = null;
let cachedRows: Record<string, string>[] | null = null;
let cacheExpiry = 0;

async function getSheetsClient() {
  if (sheetsClient) return sheetsClient;
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not set");
  const credentials = JSON.parse(saJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

async function fetchPORows(): Promise<Record<string, string>[]> {
  const now = Date.now();
  if (cachedRows && now < cacheExpiry) return cachedRows;

  const sheets = await getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${SHEET_NAME}'`,
  });

  const raw = resp.data.values || [];
  if (raw.length < 2) return [];

  const headers = (raw[0] as string[]).map((h: string) =>
    (h || "").trim().replace(/\s+/g, " ")
  );

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as string[];
    const obj: Record<string, string> = {};
    let hasData = false;
    for (let j = 0; j < headers.length; j++) {
      const val = (row[j] || "").trim();
      if (headers[j]) {
        obj[headers[j]] = val;
        if (val) hasData = true;
      }
    }
    if (hasData) rows.push(obj);
  }

  cachedRows = rows;
  cacheExpiry = now + CACHE_TTL_MS;
  return rows;
}

/** Parse Indian number strings like "1,00,000" → number */
function parseINR(val: string): number {
  if (!val || val === "-" || val === "") return 0;
  const cleaned = val.replace(/[₹,\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function toCr(val: number): number {
  return Math.round((val / 1e7) * 100) / 100;
}

export const poDashboardRouter = Router();

// GET /api/po-dashboard/rows — return all PO rows + headers
poDashboardRouter.get("/rows", async (_req, res) => {
  try {
    const rows = await fetchPORows();
    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    res.json({ success: true, rows, headers, total: rows.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PO Dashboard] fetchPORows error:", msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// GET /api/po-dashboard/analytics — full analytics for the dashboard
poDashboardRouter.get("/analytics", async (_req, res) => {
  try {
    const rows = await fetchPORows();

    // Use the pre-converted INR columns for monthly chart (already in INR, no exchange rate needed)
    const MONTHLY_COLS = [
      "April'26 INR", "May'26 INR", "June'26 INR", "July'26 INR", "Aug'26 INR", "Sept'26 INR",
      "Oct'26 INR", "Nov'26 INR", "Dec'26 INR", "Jan'27 INR", "Feb'27 INR", "March'27 INR",
    ];
    const MONTH_LABELS = [
      "Apr'26", "May'26", "Jun'26", "Jul'26", "Aug'26", "Sep'26",
      "Oct'26", "Nov'26", "Dec'26", "Jan'27", "Feb'27", "Mar'27",
    ];

    let totalPOValue = 0;
    let totalConsumed = 0;
    const poNumberSet = new Set<string>();
    const vendorSet = new Set<string>();
    const buSet = new Set<string>();

    const byPOStatus: Record<string, number> = {};
    const byApprovalStatus: Record<string, number> = {};
    const byFrequency: Record<string, number> = {};
    const byMSME: Record<string, number> = {};
    const byPOType: Record<string, number> = {};

    const buValue: Record<string, number> = {};
    const buConsumed: Record<string, number> = {};
    const vendorValue: Record<string, number> = {};
    const typeValue: Record<string, number> = {};
    const monthlyConsumed: number[] = new Array(12).fill(0);
    // rowMonthlyConsumed[i] = per-row sum of all monthly columns (used for BU consumed + total consumed)
    // This ensures KPI "Consumed" == sum of all monthly chart bars

    let msmePOs = 0;
    let nonMsmePOs = 0;
    let servicePOs = 0;
    let materialPOs = 0;
    let servicePOValue = 0;
    let materialPOValue = 0;
    let msmePOValue = 0;
    let nonMsmePOValue = 0;
    let pendingApproval = 0;

    for (const row of rows) {
      const poNumber = (row["PO Number"] || "").trim();
      const poVal = parseINR(row["Total Value in INR"] || "");
      const vendor = (row["Vendor Name"] || "").trim();
      const bu = (row["BU"] || "").trim();
      const msme = (row["MSME/ Non MSME"] || "").trim();
      const poType = (row["PO Type"] || "").trim();
      const type = (row["Type"] || "").trim();
      const approval = (row["PO Approval Status"] || "").trim();
      const status = (row["Status"] || "").trim();
      const freq = (row["Invoice Frequency"] || "").trim();

      const consumed = parseINR(row["Consumption till March.27 in INR"] || "");

      if (poNumber) poNumberSet.add(poNumber);
      totalPOValue += poVal;
      totalConsumed += consumed;

      if (vendor) vendorSet.add(vendor);
      if (bu) {
        buSet.add(bu);
        buValue[bu] = (buValue[bu] || 0) + poVal;
        buConsumed[bu] = (buConsumed[bu] || 0) + consumed;
      }

      // Monthly consumption from individual month columns (for the chart only)
      for (let mi = 0; mi < MONTHLY_COLS.length; mi++) {
        const val = parseINR(row[MONTHLY_COLS[mi]] || "");
        monthlyConsumed[mi] += val;
      }

      if (status) byPOStatus[status] = (byPOStatus[status] || 0) + 1;
      if (approval) byApprovalStatus[approval] = (byApprovalStatus[approval] || 0) + 1;
      if (freq) byFrequency[freq] = (byFrequency[freq] || 0) + 1;
      if (msme) byMSME[msme] = (byMSME[msme] || 0) + 1;
      if (poType) byPOType[poType] = (byPOType[poType] || 0) + 1;

      if (vendor && poVal > 0) vendorValue[vendor] = (vendorValue[vendor] || 0) + poVal;
      if (type && poVal > 0) typeValue[type] = (typeValue[type] || 0) + poVal;

      if (msme.toLowerCase().includes("msme") && !msme.toLowerCase().includes("non")) {
        msmePOs++; msmePOValue += poVal;
      } else {
        nonMsmePOs++; nonMsmePOValue += poVal;
      }

      if (poType === "Service") { servicePOs++; servicePOValue += poVal; }
      else if (poType === "Material") { materialPOs++; materialPOValue += poVal; }

      if (approval === "Sent for Approval" || approval === "Pending") pendingApproval++;
    }

    const topVendors = Object.entries(vendorValue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, val]) => ({ name, valueCr: toCr(val) }));

    const topCategories = Object.entries(typeValue)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, val]) => ({ name, valueCr: toCr(val) }));

    const buValueList = Object.entries(buValue)
      .sort((a, b) => b[1] - a[1])
      .map(([bu, val]) => ({
        bu,
        valueCr: toCr(val),
        consumedCr: toCr(buConsumed[bu] || 0),
        consumptionPct: val > 0 ? Math.round(((buConsumed[bu] || 0) / val) * 1000) / 10 : 0,
      }));

    const monthlyList = MONTH_LABELS.map((month, i) => ({
      month,
      valueCr: toCr(monthlyConsumed[i]),
    }));

    const openPOs = byPOStatus["Open"] || 0;
    const closedPOs = byPOStatus["Closed"] || 0;
    const approvedPOs = byApprovalStatus["Approved"] || 0;

    res.json({
      success: true,
      kpis: {
        totalPOs: poNumberSet.size,
        totalRows: rows.length,
        totalPOValueCr: toCr(totalPOValue),
        totalConsumedCr: toCr(totalConsumed),
        balanceCr: toCr(totalPOValue - totalConsumed),
        consumedPct: totalPOValue > 0 ? Math.round((totalConsumed / totalPOValue) * 1000) / 10 : 0,
        uniqueVendors: vendorSet.size,
        uniqueBUs: buSet.size,
        msmePOs,
        nonMsmePOs,
        msmePOValueCr: toCr(msmePOValue),
        nonMsmePOValueCr: toCr(nonMsmePOValue),
        pendingApproval,
        pendingPct: poNumberSet.size > 0 ? Math.round((pendingApproval / poNumberSet.size) * 1000) / 10 : 0,
        openPOs,
        closedPOs,
        approvedPOs,
        servicePOs,
        materialPOs,
        servicePOValueCr: toCr(servicePOValue),
        materialPOValueCr: toCr(materialPOValue),
      },
      charts: {
        byPOStatus,
        byApprovalStatus,
        byFrequency,
        byMSME,
        byPOType,
        buValueList,
        topVendors,
        topCategories,
        monthlyConsumed: monthlyList,
      },
      lastRefreshed: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PO Dashboard] analytics error:", msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// Report helper constants and functions
const REPORT_MONTHLY_INR_COLS = [
  "April'26 INR", "May'26 INR", "June'26 INR", "July'26 INR", "Aug'26 INR", "Sept'26 INR",
  "Oct'26 INR", "Nov'26 INR", "Dec'26 INR", "Jan'27 INR", "Feb'27 INR", "March'27 INR",
];
const REPORT_MONTH_LABELS = [
  "Apr'26", "May'26", "Jun'26", "Jul'26", "Aug'26", "Sep'26",
  "Oct'26", "Nov'26", "Dec'26", "Jan'27", "Feb'27", "Mar'27",
];
const parseINRReport = (val: string): number => {
  if (!val || val === "-" || val === "") return 0;
  const n = parseFloat(val.replace(/[₹,\s]/g, ""));
  return isNaN(n) ? 0 : n;
};
const toCrReport = (val: number): number => Math.round((val / 1e7) * 100) / 100;
const fmtINR = (n: number): string => n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

// POST /api/po-dashboard/report — generate Word (.docx) report matching the PDF format
poDashboardRouter.post("/report", async (req, res) => {
  try {
    const {
      Document, Packer, Paragraph, Table, TableRow, TableCell,
      TextRun, HeadingLevel, AlignmentType, WidthType, BorderStyle,
      ShadingType, TableLayoutType,
    } = await import("docx");

    const { rows: filteredRows = [] } = req.body as { rows: Record<string, string>[] };
    const parseINRLocal = parseINRReport;
    const toCrLocal = toCrReport;
    const fmt = fmtINR;
    const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "long", year: "numeric" });
    const reportDate = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" });

    // ── Compute aggregates ──────────────────────────────────────────────────
    const totalPOValue = filteredRows.reduce((s, r) => s + parseINRLocal(r["Total Value in INR"] || ""), 0);
    const totalConsumed = filteredRows.reduce((s, r) => s + parseINRLocal(r["Consumption till March.27 in INR"] || ""), 0);
    const balance = totalPOValue - totalConsumed;
    const consumedPct = totalPOValue > 0 ? Math.round((totalConsumed / totalPOValue) * 1000) / 10 : 0;
    const uniquePOs = new Set(filteredRows.map(r => r["PO Number"]).filter(Boolean)).size;
    const uniqueVendors = new Set(filteredRows.map(r => r["Vendor Name"]).filter(Boolean)).size;
    const uniqueBUs = new Set(filteredRows.map(r => r["BU"]).filter(Boolean)).size;
    const openPOs = filteredRows.filter(r => r["Status"] === "Open").length;
    const closedPOs = filteredRows.filter(r => r["Status"] === "Closed").length;
    const msmePOs = filteredRows.filter(r => r["MSME/ Non MSME"]?.toLowerCase().includes("msme") && !r["MSME/ Non MSME"]?.toLowerCase().includes("non")).length;

    const buMap: Record<string, { value: number; consumed: number }> = {};
    filteredRows.forEach(r => {
      const bu = r["BU"] || "Unknown";
      if (!buMap[bu]) buMap[bu] = { value: 0, consumed: 0 };
      buMap[bu].value += parseINRLocal(r["Total Value in INR"] || "");
      buMap[bu].consumed += parseINRLocal(r["Consumption till March.27 in INR"] || "");
    });

    const ipMap: Record<string, { value: number; consumed: number }> = {};
    filteredRows.forEach(r => {
      const ip = r["IP"] || "Unknown";
      if (!ipMap[ip]) ipMap[ip] = { value: 0, consumed: 0 };
      ipMap[ip].value += parseINRLocal(r["Total Value in INR"] || "");
      ipMap[ip].consumed += parseINRLocal(r["Consumption till March.27 in INR"] || "");
    });

    const monthTotals: number[] = new Array(12).fill(0);
    filteredRows.forEach(r => {
      REPORT_MONTHLY_INR_COLS.forEach((col, i) => {
        monthTotals[i] += parseINRLocal(r[col] || "");
      });
    });

    const vendorMap: Record<string, number> = {};
    filteredRows.forEach(r => {
      const vendor = r["Vendor Name"] || "Unknown";
      vendorMap[vendor] = (vendorMap[vendor] || 0) + parseINRLocal(r["Total Value in INR"] || "");
    });

    // ── Style helpers ───────────────────────────────────────────────────────
    const PURPLE = "7C5CFC";
    const PURPLE_LIGHT = "F0ECFF";
    const DARK = "1F2937";
    const GRAY = "6B7280";
    const WHITE = "FFFFFF";
    const HEADER_BG = "7C5CFC";
    const ROW_ALT = "F9FAFB";

    const hdr = (text: string) => new Paragraph({
      children: [new TextRun({ text, bold: true, size: 20, color: WHITE, font: "Calibri" })],
      alignment: AlignmentType.CENTER,
      shading: { type: ShadingType.SOLID, color: HEADER_BG, fill: HEADER_BG },
      spacing: { before: 60, after: 60 },
    });

    const sectionTitle = (text: string) => new Paragraph({
      children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22, color: PURPLE, font: "Calibri" })],
      spacing: { before: 240, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: PURPLE } },
    });

    const bodyText = (text: string, opts?: { bold?: boolean; color?: string; size?: number }) => new Paragraph({
      children: [new TextRun({ text, bold: opts?.bold, color: opts?.color || DARK, size: opts?.size || 18, font: "Calibri" })],
      spacing: { before: 40, after: 40 },
    });

    const makeTableCell = (text: string, opts?: {
      bold?: boolean; bg?: string; color?: string; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType];
    }) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text, bold: opts?.bold ?? false, size: 16, color: opts?.color || DARK, font: "Calibri" })],
        alignment: opts?.align || AlignmentType.LEFT,
        spacing: { before: 40, after: 40 },
      })],
      shading: opts?.bg ? { type: ShadingType.SOLID, color: opts.bg, fill: opts.bg } : undefined,
      width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
      margins: { top: 60, bottom: 60, left: 80, right: 80 },
    });

    const tableHeaderRow = (cols: string[]) => new TableRow({
      children: cols.map(c => makeTableCell(c, { bold: true, bg: HEADER_BG, color: WHITE })),
      tableHeader: true,
    });

    // ── Cover Page ──────────────────────────────────────────────────────────
    const coverSection: InstanceType<typeof Paragraph>[] = [
      new Paragraph({ spacing: { before: 1200 } }),
      new Paragraph({
        children: [new TextRun({ text: "Fynd | Finance & Strategy", bold: true, size: 52, color: PURPLE, font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Purchase Order Dashboard Report", bold: true, size: 36, color: DARK, font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `FY 2026-27  |  Reporting Period: ${reportDate}  |  Internal`, size: 22, color: GRAY, font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `As of ${today}`, size: 20, color: GRAY, font: "Calibri", italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 400 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Prepared for Founders & CXOs  |  Confidential", size: 18, color: GRAY, font: "Calibri" })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
      }),
      new Paragraph({
        children: [new TextRun({ text: "Prepared by Finance & Strategy Team", size: 18, color: GRAY, font: "Calibri", italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
      }),
    ];

    // ── Executive Summary ───────────────────────────────────────────────────
    const kpiTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            makeTableCell(`Total PO Value\n${toCrLocal(totalPOValue)} Cr`, { bold: true, bg: PURPLE_LIGHT, align: AlignmentType.CENTER }),
            makeTableCell(`Total Consumed\n${toCrLocal(totalConsumed)} Cr`, { bold: true, bg: PURPLE_LIGHT, align: AlignmentType.CENTER }),
            makeTableCell(`Balance\n${toCrLocal(balance)} Cr`, { bold: true, bg: PURPLE_LIGHT, align: AlignmentType.CENTER }),
            makeTableCell(`Consumption %\n${consumedPct}%`, { bold: true, bg: PURPLE_LIGHT, align: AlignmentType.CENTER }),
          ],
        }),
        new TableRow({
          children: [
            makeTableCell(`${uniquePOs} POs`, { align: AlignmentType.CENTER }),
            makeTableCell(`${uniqueVendors} Vendors`, { align: AlignmentType.CENTER }),
            makeTableCell(`${uniqueBUs} BUs`, { align: AlignmentType.CENTER }),
            makeTableCell(`${openPOs} Open / ${closedPOs} Closed`, { align: AlignmentType.CENTER }),
          ],
        }),
      ],
    });

    // ── BU Breakdown Table ──────────────────────────────────────────────────
    const buRows = Object.entries(buMap)
      .sort((a, b) => b[1].value - a[1].value)
      .map(([bu, d], idx) => new TableRow({
        children: [
          makeTableCell(bu, { bg: idx % 2 === 0 ? WHITE : ROW_ALT }),
          makeTableCell(`${toCrLocal(d.value)} Cr`, { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
          makeTableCell(`${toCrLocal(d.consumed)} Cr`, { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
          makeTableCell(`${toCrLocal(d.value - d.consumed)} Cr`, { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
          makeTableCell(d.value > 0 ? `${Math.round((d.consumed / d.value) * 1000) / 10}%` : "0%", { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
        ],
      }));

    const buTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        tableHeaderRow(["Business Unit", "PO Value (Cr)", "Consumed (Cr)", "Balance (Cr)", "Consumption %"]),
        ...buRows,
      ],
    });

    // ── IP / Domain Breakdown Table ─────────────────────────────────────────
    const ipRows = Object.entries(ipMap)
      .sort((a, b) => b[1].value - a[1].value)
      .map(([ip, d], idx) => new TableRow({
        children: [
          makeTableCell(ip, { bg: idx % 2 === 0 ? WHITE : ROW_ALT }),
          makeTableCell(`${toCrLocal(d.value)} Cr`, { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
          makeTableCell(`${toCrLocal(d.consumed)} Cr`, { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
          makeTableCell(d.value > 0 ? `${Math.round((d.consumed / d.value) * 1000) / 10}%` : "0%", { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
          makeTableCell(totalPOValue > 0 ? `${Math.round((d.value / totalPOValue) * 1000) / 10}%` : "0%", { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
        ],
      }));

    const ipTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        tableHeaderRow(["Expense IP / Domain", "PO Value (Cr)", "Consumed (Cr)", "Consumption %", "% of Total"]),
        ...ipRows,
      ],
    });

    // ── Monthly Consumption Table ───────────────────────────────────────────
    const monthRows = REPORT_MONTH_LABELS.map((m, i) => new TableRow({
      children: [
        makeTableCell(m, { bg: i % 2 === 0 ? WHITE : ROW_ALT }),
        makeTableCell(fmt(monthTotals[i]), { bg: i % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
        makeTableCell(`${toCrLocal(monthTotals[i])} Cr`, { bg: i % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
      ],
    }));
    const monthTotal = monthTotals.reduce((a, b) => a + b, 0);
    const monthTable = new Table({
      width: { size: 60, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        tableHeaderRow(["Month", "Consumption (INR)", "Consumption (Cr)"]),
        ...monthRows,
        new TableRow({
          children: [
            makeTableCell("Total", { bold: true, bg: PURPLE_LIGHT }),
            makeTableCell(fmt(monthTotal), { bold: true, bg: PURPLE_LIGHT, align: AlignmentType.RIGHT }),
            makeTableCell(`${toCrLocal(monthTotal)} Cr`, { bold: true, bg: PURPLE_LIGHT, align: AlignmentType.RIGHT }),
          ],
        }),
      ],
    });

    // ── Top Vendors Table ───────────────────────────────────────────────────
    const topVendors = Object.entries(vendorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    const vendorRows = topVendors.map(([name, val], idx) => new TableRow({
      children: [
        makeTableCell(String(idx + 1), { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.CENTER }),
        makeTableCell(name, { bg: idx % 2 === 0 ? WHITE : ROW_ALT }),
        makeTableCell(`${toCrLocal(val)} Cr`, { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
        makeTableCell(totalPOValue > 0 ? `${Math.round((val / totalPOValue) * 1000) / 10}%` : "0%", { bg: idx % 2 === 0 ? WHITE : ROW_ALT, align: AlignmentType.RIGHT }),
      ],
    }));
    const vendorTable = new Table({
      width: { size: 80, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        tableHeaderRow(["Rank", "Vendor Name", "PO Value (Cr)", "% of Total"]),
        ...vendorRows,
      ],
    });

    // ── PO Register Table ───────────────────────────────────────────────────
    const PO_REG_COLS = [
      "PO Number", "PO Date", "PO Start Date", "PO End Date", "Renewal Date",
      "Region", "BU", "IP", "Deal Name", "Vendor Name", "Type",
      "Currency", "QTY", "UOM", "Unit Rate", "Total Value", "Exchange Rate",
      "Total Value in INR", "Consumption till March.27 in INR", "Balance PO Value in INR",
      "Invoice Frequency", "MSME/ Non MSME", "PO Approval Status", "Status",
    ];
    const poRegRows = filteredRows.map((r, idx) => new TableRow({
      children: PO_REG_COLS.map(c => makeTableCell(r[c] || "", { bg: idx % 2 === 0 ? WHITE : ROW_ALT })),
    }));
    const poRegTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      rows: [
        tableHeaderRow(PO_REG_COLS),
        ...poRegRows,
      ],
    });

    // ── Assemble Document ───────────────────────────────────────────────────
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: "Calibri", size: 18, color: DARK },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: { top: 720, bottom: 720, left: 900, right: 900 },
            },
          },
          children: [
            // Cover
            ...coverSection,
            new Paragraph({ pageBreakBefore: true }),

            // Section 1: Executive Summary
            sectionTitle("Executive Summary"),
            bodyText(`Report Date: ${today}  |  Total Rows: ${filteredRows.length}  |  FY 2026-27`, { color: GRAY }),
            new Paragraph({ spacing: { before: 120, after: 120 } }),
            kpiTable,
            new Paragraph({ spacing: { before: 120, after: 0 } }),
            bodyText(`MSME POs: ${msmePOs}  |  Non-MSME POs: ${filteredRows.length - msmePOs}`, { color: GRAY }),

            // Section 2: BU Breakdown
            sectionTitle("Business Unit Breakdown"),
            bodyText("PO value and consumption by Business Unit (sorted by PO value)", { color: GRAY }),
            new Paragraph({ spacing: { before: 80, after: 80 } }),
            buTable,

            // Section 3: Domain / IP Analysis
            sectionTitle("Domain by Expense IP"),
            bodyText("PO value and consumption grouped by Expense IP / Domain", { color: GRAY }),
            new Paragraph({ spacing: { before: 80, after: 80 } }),
            ipTable,

            // Section 4: Monthly Consumption
            sectionTitle("Monthly Consumption Trend — FY 2026-27"),
            bodyText("Month-by-month consumption in INR (April 2026 – March 2027)", { color: GRAY }),
            new Paragraph({ spacing: { before: 80, after: 80 } }),
            monthTable,

            // Section 5: Top Vendors
            sectionTitle("Top Vendors by PO Value"),
            bodyText("Top 20 vendors ranked by total PO value", { color: GRAY }),
            new Paragraph({ spacing: { before: 80, after: 80 } }),
            vendorTable,

            // Section 6: PO Register
            sectionTitle("Purchase Order Register"),
            bodyText(`Full register — ${filteredRows.length} rows (all active filters applied)`, { color: GRAY }),
            new Paragraph({ spacing: { before: 80, after: 80 } }),
            poRegTable,

            // Footer note
            new Paragraph({ spacing: { before: 240 } }),
            bodyText("Prepared for Founders & CXOs  |  Confidential  |  Fynd Finance & Strategy", { color: GRAY }),
          ],
        },
      ],
    });

    const buf = await Packer.toBuffer(doc);
    const filename = `PO_Dashboard_Report_${today.replace(/\s/g, "_").replace(/,/g, "")}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[PO Dashboard] report error:", msg);
    res.status(500).json({ success: false, error: msg });
  }
});

// POST /api/po-dashboard/refresh — bust cache
poDashboardRouter.post("/refresh", (_req, res) => {
  cachedRows = null;
  cacheExpiry = 0;
  sheetsClient = null;
  res.json({ success: true, message: "Cache cleared" });
});
