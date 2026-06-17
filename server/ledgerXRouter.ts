/**
 * tRPC router for LedgerX (AP Dashboard + Invoice Booking + Invoice Register + Tally + Aging + DP)
 */
import { z } from 'zod';
import { router, publicProcedure } from './_core/trpc';
import { getAPDashboardData, bustAPDashboardCache } from './ledgerXSheets';
import {
  getInvoiceMasters,
  searchVendors,
  uploadInvoiceFile,
  submitInvoice,
  getPendingInvoice,
} from './ledgerXInvoiceService';
import {
  loadInvoiceRegister,
  approveInvoices,
  remarkInvoice,
  bustCache,
  loadAgingAnalysis,
  loadTallyEntries,
  getTallyMasters,
  createTallyEntries,
  markXmlCreated,
  updateTallyRow,
  getDpInit,
  parseDpInvoice,
} from './ledgerXRegisterService';

export const ledgerXRouter = router({
  apDashboard: publicProcedure.query(async () => {
    try { const data = await getAPDashboardData(); return { ok: true, ...data }; }
    catch (err: any) { return { ok: false, error: err?.message ?? 'Failed', kpis: null, charts: null }; }
  }),
  apRefresh: publicProcedure.mutation(async () => {
    bustAPDashboardCache();
    try { const data = await getAPDashboardData(); return { ok: true, ...data }; }
    catch (err: any) { return { ok: false, error: err?.message ?? 'Refresh failed', kpis: null, charts: null }; }
  }),
  invoiceInit: publicProcedure.query(async () => {
    try { return await getInvoiceMasters(); }
    catch (err: any) { return { ok: false, error: err?.message }; }
  }),
  invoiceVendors: publicProcedure
    .input(z.object({ q: z.string().default(''), limit: z.number().default(50) }))
    .mutation(async ({ input }) => {
      try { return await searchVendors(input.q, input.limit); }
      catch (err: any) { return { ok: false, error: err?.message, vendors: [] }; }
    }),
  invoiceUpload: publicProcedure
    .input(z.object({ fileName: z.string(), mimeType: z.string(), base64: z.string() }))
    .mutation(async ({ input }) => {
      try { const buffer = Buffer.from(input.base64, 'base64'); return await uploadInvoiceFile(input.fileName, input.mimeType, buffer); }
      catch (err: any) { return { ok: false, error: err?.message }; }
    }),
  invoiceSubmit: publicProcedure
    .input(z.object({
      vendor: z.object({ code: z.string(), name: z.string(), gstin: z.string(), pan: z.string(), state: z.string(), gstRegistered: z.string() }),
      invoice: z.record(z.string(), z.any()),
      userEmail: z.string().default('local@finops.app'),
      pendingFileId: z.string().default(''),
    }))
    .mutation(async ({ input }) => {
      try { return await submitInvoice(input); }
      catch (err: any) { return { ok: false, message: err?.message || 'Submission failed' }; }
    }),
  invoicePending: publicProcedure.input(z.object({})).mutation(async () => {
    try { return await getPendingInvoice(); }
    catch (err: any) { return { ok: false, error: err?.message, file: null }; }
  }),
  invoiceRegister: publicProcedure.query(async () => {
    try { const r = await loadInvoiceRegister(); return { ok: true, rows: r.rows }; }
    catch (err: any) { return { ok: false, error: err?.message ?? 'Failed', rows: [] as any[] }; }
  }),
  invoiceRegisterApprove: publicProcedure
    .input(z.object({ rowIndices: z.array(z.number()), status: z.string() }))
    .mutation(async ({ input }) => {
      try { return await approveInvoices(input.rowIndices, input.status); }
      catch (err: any) { return { ok: false, error: err?.message }; }
    }),
  invoiceRegisterRemark: publicProcedure
    .input(z.object({ rowIdx: z.number(), remark: z.string() }))
    .mutation(async ({ input }) => {
      try { return await remarkInvoice(input.rowIdx, input.remark); }
      catch (err: any) { return { ok: false, error: err?.message }; }
    }),
  invoiceRegisterRefresh: publicProcedure.mutation(async () => {
    bustCache('invoice_register');
    try { const r = await loadInvoiceRegister(); return { ok: true, rows: r.rows }; }
    catch (err: any) { return { ok: false, error: err?.message ?? 'Refresh failed', rows: [] as any[] }; }
  }),
  agingAnalysis: publicProcedure.query(async () => {
    try { const r = await loadAgingAnalysis(); return { ok: true, ...r }; }
    catch (err: any) { return { ok: false, error: err?.message ?? 'Failed', vendors: [] as any[], buckets: [] as string[], totalsByBucket: {} as Record<string,number>, msmeCount: 0, nonMsmeCount: 0, totalOutstanding: 0 }; }
  }),
  agingRefresh: publicProcedure.mutation(async () => {
    bustCache('aging_analysis');
    try { const r = await loadAgingAnalysis(); return { ok: true, ...r }; }
    catch (err: any) { return { ok: false, error: err?.message ?? 'Refresh failed', vendors: [] as any[], buckets: [] as string[], totalsByBucket: {} as Record<string,number>, msmeCount: 0, nonMsmeCount: 0, totalOutstanding: 0 }; }
  }),
  tallyEntries: publicProcedure.query(async () => {
    try { const r = await loadTallyEntries(); return { ok: true, headers: r.headers, rows: r.rows }; }
    catch (err: any) { return { ok: false, error: err?.message ?? 'Failed', headers: [] as string[], rows: [] as string[][] }; }
  }),
  tallyMasters: publicProcedure.query(async () => {
    try { return await getTallyMasters(); }
    catch (err: any) { return { ok: false, error: err?.message, companies: [] as string[], ledgers: [] as string[], costCentres: [] as string[] }; }
  }),
  tallyCreate: publicProcedure
    .input(z.object({ invoices: z.array(z.record(z.string(), z.any())) }))
    .mutation(async ({ input }) => {
      try { return await createTallyEntries(input.invoices); }
      catch (err: any) { return { ok: false, error: err?.message }; }
    }),
  tallyMarkXmlCreated: publicProcedure
    .input(z.object({ invoiceNos: z.array(z.string()) }))
    .mutation(async ({ input }) => {
      try { return await markXmlCreated(input.invoiceNos); }
      catch (err: any) { return { ok: false, error: err?.message }; }
    }),
  tallyUpdateRow: publicProcedure
    .input(z.object({
      voucherNumber: z.string(),
      invoiceNo: z.string(),
      updates: z.array(z.object({
        ledger_col_idx: z.number().optional(),
        ledger_val: z.string().optional(),
        amount_col_idx: z.number().optional(),
        amount_val: z.string().optional(),
      }))
    }))
    .mutation(async ({ input }) => {
      try { return await updateTallyRow(input.voucherNumber, input.invoiceNo, input.updates); }
      catch (err: any) { return { ok: false, error: err?.message }; }
    }),
  tallyRefresh: publicProcedure.mutation(async () => {
    bustCache('tally_entries');
    try { const r = await loadTallyEntries(); return { ok: true, headers: r.headers, rows: r.rows }; }
    catch (err: any) { return { ok: false, error: err?.message ?? 'Refresh failed', headers: [] as string[], rows: [] as string[][] }; }
  }),
  dpInit: publicProcedure.query(async () => {
    try { return await getDpInit(); }
    catch (err: any) { return { ok: false, error: err?.message, dpNames: [] as string[], dpVendorDefaults: {} as Record<string,any>, serviceMonths: [] as string[], pnlHeads: [] as string[], groupLedgers: [] as string[], ledgerExpNames: [] as string[], cgstLedgers: [] as string[], sgstLedgers: [] as string[], igstLedgers: [] as string[], tdsLedgers: [] as string[], voucherTypes: [] as string[], frequencies: [] as string[], vendorStates: [] as string[], invoiceTypes: [] as string[], eInvoiceOptions: [] as string[] }; }
  }),
  dpParseInvoice: publicProcedure
    .input(z.object({ dpType: z.string(), fileName: z.string(), mimeType: z.string(), base64: z.string() }))
    .mutation(async ({ input }) => {
      try { const buffer = Buffer.from(input.base64, 'base64'); return await parseDpInvoice(input.dpType, buffer, input.fileName); }
      catch (err: any) { return { ok: false, error: err?.message, rows: [] }; }
    }),
});
