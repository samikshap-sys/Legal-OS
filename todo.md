# Fynd FinOps TODO

- [x] Legal Connect homepage (login.html replica)
- [x] Legal Connect dashboard with sidebar navigation
- [x] Dashboard KPI cards, charts, live tracker, requests, workflows, templates, team pages
- [x] BigQuery integration for legal requests data
- [x] Google Sheets integration for contract data
- [x] Remove Fynd footer logo from Legal Connect sidebar
- [x] QueryBee homepage - split layout (teal left + white right), matching reference design
- [x] Wire QueryBee route from FinOps homepage card
- [x] Fix QueryBee homepage design to exactly match reference (Fynd heart logo, teal layout, app icon)
- [x] Build QueryBee dashboard with BQ Upload page (sidebar, config panel, dropzone, history table)
- [x] Wire Open QueryBee button to /querybee/dashboard
- [x] BQ Upload backend (validate, validate-and-upload, history, download endpoints)
- [x] bq_upload_history table in database schema
- [x] Pixel-perfect sidebar match to reference (teal bg, nav items, Fynd logo at bottom)
- [x] Pixel-perfect BQ Upload page match to reference (config panel, dropzone, history table)
- [x] Backend BQ upload logic exactly mirrors zip code
- [x] Add rich validation results panel (column validation, data type validation, what-to-do-next with stats)
- [x] Auto-trigger validate on file select/drop
- [x] Fix BQ upload failures (debug and resolve root cause)
- [x] Remove Uploaded By field from config panel
- [x] Remove success/failure result banner above hero card
- [x] Remove Uploaded By column from history table
- [x] Add 5-rows-per-page pagination to upload history table
- [x] Build invoicesDownloadRouter.ts backend mirroring zip Python logic (GCS search by Invoice IDs or Month & Year, zip archive, history table)
- [x] Build Invoices Download frontend page (exact reference UI: search by toggle, Invoice IDs textarea / Month & Year dropdowns, Download button, Download History table with 3-per-page pagination)
- [x] Wire router to server, push DB schema, verify end-to-end
- [x] Remove Download File column from BQ Upload history table
- [x] Fix Invoices Download history table layout (broken card/container CSS)
- [x] Fix GCS bucket/credentials to match zip code (use GCS_SERVICE_ACCOUNT_JSON with fynd-prod-393805 / planmaker@fynd-prod-393805.iam.gserviceaccount.com)
- [x] Grant IAM permissions on fynd-assets-private GCS bucket to planmaker@fynd-prod-393805.iam.gserviceaccount.com (external GCS admin task — not actionable from app; bucket access confirmed working in production)
- [x] Replace @google-cloud/storage SDK with direct GCS REST API (jose JWT) to fix production timeout/hang issue
- [x] Backend: async job pattern — return job ID immediately, process in background
- [x] Backend: parallel PDF downloads (Promise.all) instead of sequential
- [x] Backend: pre-warm GCS OAuth token on server start
- [x] Backend: add GET /api/invoice-download/status/:jobId endpoint for polling
- [x] Frontend: show real-time progress (spinner + status text) while job runs, auto-trigger download when ready
- [x] Fix Month & Year download — month_year format was correct (MM-YYYY); root cause was same GCS timeout, now fixed by async job pattern
- [x] Speed up multi-invoice-ID search: query GCS with per-ID matchGlob in parallel (O(n_ids) vs O(bucket_size)) — 2 IDs now complete in ~1s vs 30+s before
- [x] Speed up Month & Year search: 4 parallel matchGlob patterns + 15-worker downloads + presign pre-fetch — 206 invoices now ~14s vs ~30+s before
- [x] Querypad: backend tRPC router for BigQuery execute + status check
- [x] Querypad: frontend page with SQL editor, line numbers, cursor position, Ctrl+Enter shortcut
- [x] Querypad: results table with pagination (50 rows/page), CSV and Excel download
- [x] Querypad: recent queries history (last 10, click to restore)
- [x] Querypad: connection status indicator (CONNECTED/DISCONNECTED dot)
- [x] Querypad: wire route in App.tsx and sidebar nav
- [x] Fix Month & Year invoice download: dev server works correctly; published site needs new checkpoint deployed
- [x] Restyle Querypad to match reference: dark teal editor header, dark code area, CONNECTED status top-right, compact layout
- [x] Store BQ_SERVICE_ACCOUNT_JSON secret for plan-maker@fynd-db and update querypadRouter to use it
- [x] Fix Querypad UI: dark code area, status top-right, match reference screenshot
- [x] Fix Querypad editor body color: match reference dark teal (#0d1f2d), not black
- [x] Fix Querypad query timeout: increase BQ job polling limit beyond 60s for large queries
- [x] Querypad: fetch ALL rows from BigQuery using pageToken loop — no 1000-row truncation
- [x] Querypad UI: show only first 20 rows in table preview with notice; CSV/Excel export contains ALL rows
- [x] Querypad: fast preview — execute with LIMIT 20 wrapper for instant UI response (~2s)
- [x] Querypad: full export endpoint — streams all rows as CSV/Excel file download via REST (separate from preview execute)
- [x] Querypad: use BQ jobs.query synchronous API (timeoutMs=5000, maxResults=20) for instant preview — no polling loop needed
- [x] Querypad: replace manual BQ HTTP calls with @google-cloud/bigquery Node.js SDK for fast, reliable execution
- [x] Querypad: fix CSV/Excel export — move to tRPC mutation so it works on published site
- [x] Querypad: restyle — pale teal header bar, white editor body, teal download buttons, 10-row preview
- [x] Querypad: table result headers — pale teal background with white text
- [x] Querypad: add Query Logs section — query type (SELECT/DELETE/UPDATE/CREATE), table names, run timestamp
- [x] Querypad: results table in white card container with subtle teal border (matching reference screenshot style)
- [x] Querypad: change Excel export from .xls to .xlsx (proper OpenXML format)
- [x] Querypad: Excel export must produce .xlsx (OpenXML) not .xls
- [x] Querypad: Query Logs must show run timestamp (Run at: HH:MM:SS) alongside query type badge and table names
- [x] Querypad: Redesign Query Logs as a proper table with columns: Run At, Table Name, Type (badge), Query text — matching the Download History table style
- [x] Querypad: Fix BigQuery DATE/DATETIME columns showing as {"value":"..."} objects — unwrap BQ SDK type wrappers on backend, return raw values as-is
- [x] Querypad: Persist Query Logs to database (query_logs table) — save on each execute, load on page mount, paginate (20/page)
- [x] Sidebar: Move Querypad above Invoice & Supporting in nav order
- [x] Pipelines page: 3-tab layout (Recon Pipeline, Partner Pipeline, Scheduler) matching reference screenshots
- [x] Pipelines: pipeline_history DB table, tRPC procedures (run, getHistory, getQueries, pollStatus)
- [x] Pipelines: Recon tab — Execution Mode radio, Run Complete Workflow button, History table
- [x] Pipelines: Partner tab — same layout, different config
- [x] Pipelines: Scheduler tab — dropdown of scheduled queries, Run Scheduled Query button, History table
- [x] Pipelines: Auto-poll running jobs every 5s until success/failed, update history row in real-time
- [x] Pipelines: Fix status badge colors — use UI teal instead of green for success, teal-muted for running
- [x] Pipelines: Fix status badge colors to use teal palette (not green/blue)
- [x] Pipelines: Auto-poll running jobs every 5s, update history row live
- [x] Pipelines: Improve pipeline panel header icons (better SVGs)
- [x] Pipelines: Fix pollStatus so Scheduler jobs correctly transition from "running" to "success"/"failed" using Data Transfer run state
- [x] Pipelines: Auto-reconcile "running" rows in getHistory — check GCP state for all running rows and update to success/failed on every history load
- [x] Pipelines: Fix string state handling — Node.js GCP SDK returns "SUCCEEDED"/"FAILED" strings not integers; fixed in getWorkflowInvocationState and getTransferRunState
- [x] Pipelines: Fix status badge colors — green for success, yellow for running, red for failed
- [x] Rename "Invoice & Supporting" to "Invoice Expo" in sidebar nav
- [x] Invoice Expo: Build PDF Export tab matching god code logic (GCS → Drive → BQ → Bolt1 → Bolt2) with step progress bar, live logs, and history table
- [x] Invoice Expo: Express backend router with SSE streaming /run and /history endpoints; history persisted in invoice_expo_history DB table
- [x] Invoice Expo: Redesign step progress bar as circular bucket nodes with teal liquid/electricity fill animation flowing through each circle as steps complete
- [x] Invoice Expo: Fix SSE stream — flush every log line immediately, add heartbeat ping every 3s to prevent proxy timeout
- [x] Invoice Expo: Add pulsing "uploading N/M..." live indicator in log box so user knows it is still running
- [x] Invoice Expo: Fix Export History not saving — invoice_expo_history table created in DB via direct SQL; history now persists
- [x] Invoice Expo: Fix log box — 1 line per file (not 2), add progress bar X/206, reliable auto-scroll
- [x] Invoice Expo: Fix upload stopping at ~110/206 — added 5-attempt retry with exponential backoff for Drive API rate limits (429/503), plus 150ms throttle between uploads
- [x] Invoice Expo: Fixed log box auto-scroll (triggers on both logs and progress events), increased max-height to 400px, added teal progress bar (X/206 PDFs uploaded)
- [x] Invoice Expo: Server-side job state store — persist active job ID, step, progress, and full log buffer in memory so reconnect is possible
- [x] Invoice Expo: Auto-reconnect on page load — detect running job and replay logs + stream live updates when navigating back
- [x] Invoice Expo: Add Terminate button — kills the running job and marks history row as cancelled
- [x] Invoice Expo: Add Reset button — clears log box and resets UI state (only when not running)
- [x] Invoice Expo: Auto-reconcile stuck running history rows on server start
- [x] Invoice Expo: Rewrite driveUpload to use Google Drive resumable upload protocol (2-step: initiate session → upload bytes) to match Python god code reliability
- [x] Invoice Expo: Fix Drive upload getting stuck at ~100 files — add proper 429 rate-limit detection with exponential backoff (mirrors Python httplib2 automatic retry), 90s per-attempt timeout
- [x] Invoice Expo: Terminate immediately kills in-flight Drive upload — pass AbortSignal into fetchT so HTTP request is cancelled instantly, make backoff waits also abortable
- [x] Invoice Expo: Update BQ table from fynd-db.finance_dwh.valyx_pdf_link_table to fynd-db.valyx.valyx_pdf_link_table
- [x] Invoice Expo: Update BQ_TABLE to fynd-db.valyx.valyx_pdf_link_table_raw (raw table, not view)
- [x] Invoice Expo: Add TEST_LIMIT=5 cap — only upload/insert first 5 invoices for testing
- [x] Invoice Expo: Remove TEST_LIMIT (set to 0) — process all invoices for production
- [x] Invoice Expo: Remove Invoice_Supporting from BQ insert — valyx_pdf_link_table_raw does not have this column
- [x] Invoice Expo: Fix BQ insert column names — query valyx_pdf_link_table_raw schema and use exact column names
- [x] Invoice Expo: Fix BQ insert columns — use invoice_no, month_year, pdf_link, supporting_link, created_at, job_id
- [x] Invoice Expo: Add pagination (5 rows/page) to Export History table

# QueryBee Google OAuth & Username Tracking

- [x] Add qb_sessions table to schema (id, email, name, googleId, createdAt, expiresAt)
- [x] Add QB_GOOGLE_CLIENT_ID, QB_GOOGLE_CLIENT_SECRET, QB_SESSION_SECRET secrets
- [x] Build /api/qb/auth/google, /api/qb/auth/callback, /api/qb/auth/me, /api/qb/auth/logout endpoints with @gofynd.com enforcement
- [x] Add QB auth gate: intercept "Open QueryBee" click, show Google login modal/redirect, store QB session cookie
- [x] Add QbUserContext to share logged-in QB user across all QueryBee sub-pages
- [x] Add executedBy column to pipeline_history table + migrate
- [x] Add executedBy column to query_logs table + migrate
- [x] Add downloadedBy column to invoice_download_history table + migrate
- [x] Add executedBy column to invoice_expo_history table + migrate
- [x] Wire QB username into bqUploadRouter (uploaded_by from QB session cookie)
- [x] Wire QB username into invoicesDownloadRouter (downloaded_by)
- [x] Wire QB username into pipelineRouter (executed_by)
- [x] Wire QB username into querypadRouter (executed_by)
- [x] Wire QB username into invoiceExpoRouter (executed_by)
- [x] Display "Uploaded By" column in BQ Upload history table
- [x] Display "Downloaded By" column in Invoices Download history table
- [x] Display "Executed By" column in Pipeline history table
- [x] Display "Executed By" column in Querypad query logs table
- [x] Display "Executed By" column in Invoice Expo history table
- [x] Show logged-in QB user (email) in QueryBee landing page right panel
- [x] Add logout button for QB session

# Legal Connect Google OAuth & Username Tracking

- [x] Audit Legal Connect landing page, dashboard, request form, status update flow, and BQ router
- [x] Build /api/lc/auth/google, /api/lc/auth/callback, /api/lc/auth/me, /api/lc/auth/logout endpoints with @gofynd.com enforcement
- [x] Add lc_sessions table to schema (id, email, name, googleId, createdAt, expiresAt)
- [x] Add LcUserContext to share logged-in LC user across all Legal Connect pages
- [x] Gate Legal Connect: intercept "Visit Legal Connect" click, Google login, redirect to dashboard on success
- [x] Add Fynd logo to Legal Connect sidebar bottom (blended with dark navy background)
- [x] Show logged-in LC user (email/name) in Legal Connect sidebar bottom
- [x] Add logout button for LC session in sidebar
- [x] Wire requested_by: auto-fill from LC session in New Request form, pass to BQ insert
- [x] Display requested_by in request card (below requester name or as separate field)
- [x] Wire status_updated_by: capture LC user on Save Update, pass to BQ UPDATE (overwrite column)
- [x] Display status_updated_by in request card

# Brand Ledger — QueryBee Sidebar
- [x] Create server/brandLedgerRouter.ts with Express REST endpoints for Claimable (preview + download)
- [x] Add BigQuery helper functions: queryClaimablePreview + downloadClaimable in brandLedgerRouter.ts
- [x] Add /api/brand-ledger/claimable/preview endpoint (company_id + date filters, returns 20 rows with display columns)
- [x] Add /api/brand-ledger/claimable/download endpoint (returns full table as Excel, all columns)
- [x] Mount brandLedgerRouter at /api/brand-ledger in server/_core/index.ts
- [x] Add "Brand Ledger" sidebar section divider + "Claimable" nav item to QueryBeeDashboard.tsx
- [x] Create BrandLedgerClaimable inline component inside QueryBeeDashboard.tsx
- [x] Implement filters: Company ID text input + From/To date pickers + quick presets (This Month, Last Month, Last 3M, FY26) + Apply button
- [x] Display table with columns: order_id, shipment_id, type, recon_date, claimable_amt (first 20 rows preview)
- [x] Add Download Report button (fetches all columns from BQ, exports as Excel)
- [x] Add CSS for Brand Ledger section divider and Claimable page (qbd-nav-section-label, bl-* classes)

# Brand Ledger — Payable Updates
- [x] Rename sidebar nav item from "Claimable" to "Payable" (activePage "bl-claimable" → "bl-payable")
- [x] Add /api/brand-ledger/payable/kpi endpoint returning sum(claimable_amt) and count(distinct shipment_id)
- [x] Add "Net Payable Claim" KPI card above the filter card (shows sum formatted as ₹ Indian locale, tooltip with shipment count)
- [x] Add 10-rows-per-page pagination to the Payable preview table

# Brand Ledger — Sidebar & Navbar Fixes
- [x] Rename sidebar nav item from "Payable" to "Brand Ledger"
- [x] Add "Payable" tab-navbar inside the Brand Ledger page (below the page title, above KPI card)
- [x] Remove ₹/$ currency symbol from Net Payable Claim KPI value display

# Brand Ledger — Payable Bags Tab
- [x] Add /api/brand-ledger/bags/preview endpoint (company_id + date filters, 10 rows: bag_id, fynd_order_id, settlement_type, recon_date, seller_net_collection)
- [x] Add /api/brand-ledger/bags/kpi endpoint (sum(seller_net_collection), count(bag_id))
- [x] Add /api/brand-ledger/bags/download endpoint (full dataset as Excel, all columns)
- [x] Add "Payable Bags" tab button to bl-subnav in BrandLedgerPayablePage
- [x] Add activeTab state (payable-claims | payable-bags) to BrandLedgerPayablePage
- [x] Build PayableBagsTab inline component with same filter card, KPI (Payable Seller Sale), preview table (bag_id, fynd_order_id, settlement_type, recon_date, seller_net_collection), pagination (10/page), and download
- [x] Rename existing tab button to "Payable Claims" (currently just "Payable")

# Brand Ledger — Layout & KPI Fixes
- [x] Remove teal horizontal demarcation line above "Brand Ledger" sidebar nav item
- [x] Keep "Brand Ledger" as plain nav item (same style as other sidebar items, no section label)
- [x] Flatten filter card to single row: Company ID + Recon Date From + Recon Date To + presets + Apply Filters all inline
- [x] Pin both KPI cards (Net Payable Claim + Payable Seller Sale) always visible at top of page, regardless of active tab
- [x] Both KPIs show "Apply filters to calculate" when no data loaded, update when filters applied

# Legal Connect — UX Fixes
- [x] Fix logo flash on Legal Connect login/loading screen (logo should be visible immediately)
- [x] Set Requests page as default landing page after Legal Connect login
- [x] Add Description column next to Document Type in Legal Dashboard table (from "Description (Docs)" field in source sheet)

# LedgerX — New Pages (InvoiceRegister, TallyEntry, AgingAnalysis, DPInvoiceBooking)
- [x] Write InvoiceRegister.tsx with tRPC calls (invoiceRegister, invoiceRegisterApprove, invoiceRegisterRemark, invoiceRegisterRefresh)
- [x] Write TallyEntry.tsx with tRPC calls (tallyEntries, tallyMasters, tallyCreate, tallyMarkXmlCreated, tallyUpdateRow, tallyRefresh)
- [x] Write AgingAnalysis.tsx with tRPC calls (agingAnalysis, agingRefresh)
- [x] Write DPInvoiceBooking.tsx with tRPC calls (dpInit, dpParseInvoice)
- [x] Add all 4 routes to App.tsx (/ledgerx/dp-invoice-booking, /ledgerx/invoice-register, /ledgerx/tally-entry, /ledgerx/aging-analysis)
- [x] Update LedgerXDashboard handleNav to navigate to all new pages
- [x] Fix InvoiceBooking.tsx JSX fragment error (extra closing div)
- [x] Verify TypeScript: 0 errors

# Mogambo — Kaily AI Chat Bot Domain
- [x] Install @kaily-ai/chat-sdk npm package
- [x] Add KAILY_APP_TOKEN and SLACK_BOT_TOKEN secrets
- [x] Upload bot-logo.png to static assets
- [x] Add Mogambo card to FinOps homepage (Home.tsx)
- [x] Create MogamboHome.tsx (LandingPage exact replica)
- [x] Create MogamboChatInterface.tsx (ChatInterface exact replica)
- [x] Create MogamboThreadSidebar.tsx (ThreadSidebar exact replica)
- [x] Create MogamboMessageList.tsx (MessageList exact replica)
- [x] Create MogamboMessageInput.tsx (MessageInput exact replica)
- [x] Create MogamboSendToSlackModal.tsx (SendToSlackModal exact replica)
- [x] Create MogamboHeader.tsx (Header exact replica)
- [x] Add /api/mogambo/slack/channels Express route
- [x] Add /api/mogambo/slack/send Express route
- [x] Register /mogambo route in App.tsx
- [x] Verify TypeScript: 0 errors

# Mogambo Fixes (Apr 28)

- [x] Fix Send to Slack — messages not being posted (route timeout / token env issue)
- [x] Mogambo sidebar: logo at top, collapse button below logo, Home at bottom (QueryBee style)

# Mogambo Polish (Apr 28 — Round 2)

- [x] Home button in sidebar navigates to /mogambo (not broken)
- [x] Add Back to FinOps button on Mogambo (like QueryBee/LedgerX)
- [x] Add Fynd black logo (white background) to Mogambo sidebar bottom
- [x] Fix typing animation: thinner cursor, animated bouncing dots (not static)
- [x] Personalise empty-state greeting: "Hi <first name>, how can I help you?"
- [x] Show "Hi <first name>" in header next to Online badge
- [x] Google OAuth gate on Start Chatting / Open Chat Now buttons

# Mogambo Polish (Apr 28 — Round 3)

- [x] Seamless Manus OAuth login gate for Mogambo (like QB — redirect to login, auto-enter chat after auth)
- [x] Remove "X conversations" count text from sidebar bottom
- [x] Fynd logo: bigger, placed to the LEFT of Home button (like QB sidebar-bottom layout)
- [x] Remove "Hi {firstName}! I'm Mogambo, your AI-powered assistant." line from EmptyState
- [x] Add "Powered by Kaily AI" to EmptyState subtitle
- [x] Fix Home button not working (currently broken)
- [x] Reduce/remove gap above Mogambo logo in sidebar (shift logo to top)
- [x] Make Home icon bigger in sidebar

## LedgerX Sidebar Cleanup (Apr 28)
- [x] Remove AP Dashboard and Invoice Booking from sidebar NAV — keep only DP Invoice Booking, Invoice Register, Tally Entry, Aging Analysis
- [x] Update handleNav default landing to DP Invoice Booking
- [x] Update LedgerXHome "Open LedgerX" button to go to /ledgerx/dp-invoice-booking
- [x] Remove /ledgerx/dashboard route from App.tsx (orphaned)

## LedgerX Sidebar Restore (Apr 28)
- [x] Restore AP Dashboard and Invoice Booking to all sidebar NAV arrays (all 6 items)
- [x] Restore /ledgerx/dashboard and /ledgerx/invoice-booking routes in App.tsx
- [x] Restore LedgerXDashboard and InvoiceBooking imports in App.tsx
- [x] Remove duplicate embedded sidebars from TallyEntry, AgingAnalysis, InvoiceRegister, DPInvoiceBooking

## DPInvoiceBooking — Full v1 Port (Apr 28)
- [x] Update parseDpInvoice with full v1-compatible parsing logic (Bigshot, Delhivery, DTDC PDF, Busybees Excel, DTDC Excel, BlueDart PDF)
- [x] Fix duplicate React key warning in Sel component (use index-based keys)
- [x] TypeScript: 0 errors confirmed

## DPInvoiceBooking — Light Theme Restyle (Apr 28)
- [x] Restyle DPInvoiceBooking.tsx to match LedgerX light theme (white bg, dark navy card headers, native selects/inputs, grey section labels)

## DPInvoiceBooking + InvoiceRegister Polish (Apr 28)
- [x] Fix DPInvoiceBooking Invoice Details: all 5 fields (Vendor Code, DP Name, Service Start Date, Service End Date, Service Month) on one row, no wrapping/cropping
- [x] Restyle InvoiceRegister to match reference: compact table, all columns (Invoice No, Vendor, Type, Inv Date, Due Date, Net Payable, GST, TDS, MSME, Aging, Tally, Approval, Payment, Action), colored status badges, search bar, Create Tally Entry + Download CSV buttons, refresh button

## Invoice Register — Full Rebuild (Apr 28)
- [x] Fix backend sheet tab name (currently "Invoice Register" but actual tab name differs) — tab is "Invoice Wise Data", already correct in backend
- [x] Rebuild InvoiceRegister.tsx to exactly match reference: search bar top-center, dark navy filter dropdowns, compact table with Invoice No/Vendor/Type/Inv Date/Due Date/Net Payable/GST/TDS/MSME/Aging/Tally/Approval/Payment/Action columns, colored badges — field mapping updated to use structured backend fields (invoice_no, vendor, type, inv_date, due_date, net_payable, gst, tds, msme, aging, tally_status, approval_status, payment_status); 22 invoices loading correctly

## Invoice Register — Full Polish (Apr 28 Round 2)
- [x] Actions column: replace single checkmark button with checkmark + three-dot dropdown (View Details, Approve, Dispute, Not Approved)
- [x] Invoice Detail modal: full modal matching reference (Net Payable hero, TDS/GST/Type, Inv Date/Due Date/Aging, Payment/Tally/Approval/MSME badges, GSTIN, Vendor Code/Name, Save Remark textarea, Dispute/Not Approved/Approve buttons)
- [x] MSME badge: show "Non-MSME" / "GST Registered" / "GST Non Registered" / "Foreign Vendor" correctly
- [x] Approve/Dispute/Not Approved buttons in modal write back to live Google Sheet via backend
- [x] Save Remark writes back to live Google Sheet via backend
- [x] Verify all backend functions work end-to-end with live data

## Invoice Register — Actions Column Fix (Round 4)
- [x] Fix RowActionMenu: checkmark (✓) button = Quick Approve; three-dot (···) button = dropdown with View Details/Approve/Dispute/Not Approved; View Details in dropdown opens full modal

## Tally Entry Page — Full v1 Port

- [x] Read v1 zip Tally Entry frontend + backend source code
- [x] Build backend: ledgerXTallyService.ts (fetch tally entries from sheet, update journal entry, generate XML)
- [x] Build backend: tRPC procedures in ledgerXRouter (tallyEntries, tallyMasters, tallyCreate, tallyMarkXmlCreated, tallyUpdateRow, tallyRefresh)
- [x] Build frontend: TallyEntry.tsx with stats cards (Total/XML Created/Pending), search bar, voucher list table, detail panel with journal entry edit
- [x] Wire route /ledgerx/tally-entry in App.tsx and sidebar
- [x] Verify end-to-end with live data

# Tally Entry Rebuild

- [x] Rebuild TallyEntry.tsx with reference split-panel UI (sidebar, stats cards, toolbar, table + detail panel)
- [x] Fix backend tab name discovery (dynamic tab name matching for "Tally Entry" sheet)
- [x] Detail panel: voucher header, invoice no/date/narration, journal entry table with Edit/Save/Cancel
- [x] Stats cards: Total Entries, Processed (XML Created), Pending
- [x] Toolbar: entry count, Download CSV, Download XML, search
- [x] XML generation function matching reference logic

## Tally Entry — v1 Parity (Full Backend + Frontend Rewrite)

- [x] Fix TAB_TALLY to "Inv Entry Template" (correct sheet tab name from v1)
- [x] Rewrite createTallyEntries to mimic v1 logic: read Invoice Wise Data, compute all ledger slots (D0-D4, C0-C3), append rows to Inv Entry Template tab
- [x] Fix updateTallyRow to use VOUCHERNUMBER column and ledger col indices
- [x] Fix markXmlCreated to update Action Status column
- [x] Fix InvoiceRegister Create Tally Entry button: call tallyCreate mutation with selected rows payload (row_idx, invoice_no, vendor, type, inv_date)
- [x] Rebuild TallyEntry.tsx to display correct columns from Inv Entry Template (VOUCHERTYPENAME, InvoiceNo, VOUCHERNUMBER, NARRATION, ledger pairs, Action Status) with extractLedgerEntries + slot labels

## Tally Entry — Light Theme Restyle (Apr 29)
- [x] Restyle TallyEntry.tsx to match reference: white bg, clean stats cards with teal accent, white sidebar, clean table, white detail panel, full-width search in header

## Tally Entry — Restore Dark Teal Design (URGENT)
- [x] Restore dark teal/navy gradient stats cards (matching reference pasted_file_6pAe84_image.png)
- [x] Restore dark sidebar with teal active item
- [x] Restore dark table background and dark panel
- [x] Fix table to start from first column (DATE) by default
- [x] Restore dark teal/navy design on Tally Entry page (stats cards, sidebar, table)
- [x] Fix ACTION STATUS column always visible (sticky right + synthesize when missing from sheet)
- [x] Fix Tally Entry to light white theme — SUPERSEDED: user explicitly requested dark navy theme be kept; dark theme restored and maintained
- [x] Legal Connect: add admin role for 4 emails (ninadmandavkar, aditisinha, samikshap, farheenansari @gofynd.com) — only admins can delete workflow cards and update status
- [x] Legal Connect: Add admin role for ninadmandavkar, aditisinha, samikshap, farheenansari @gofynd.com
- [x] Legal Connect: Gate "Update Status" button behind isAdmin check
- [x] Legal Connect: Add "Delete" button (with 2-click confirm) for admins only
- [x] Legal Connect: Backend deleteRequest endpoint with admin enforcement
- [x] Legal Connect: Backend updateRequestStatus now enforces admin check server-side
- [x] Tally Entry: Reverted shell CSS back to dark navy theme
- [x] QueryBee BQ Upload: show schema validation result (pass/fail with reason) — already existed, verified working
- [x] QueryBee BQ Upload: show success message after ingestion with file name, row count, table name
- [x] QueryBee BQ Upload: show file name in Upload History log (added fileName column to DB schema + history table)
- [x] QueryBee BQ Upload: fix success response to include table_id and file_name
- [x] Invoice Expo: Fix timestamp display to human-readable format (toLocaleString with en-IN locale)
- [x] Invoice Expo: Fix PDFs Sent Today — only shows live BQ count for the most recent (first) history row
- [x] Invoice Expo: Add Defaulter button (enabled only after successful export) with BigQuery popup showing unsent invoices (seller_id IS NULL, not in downstream tables)
- [x] Invoice Expo: Defaulter modal — search, 4-column table (Invoice Reference, Customer Name, Seller ID, Source Table), record count badge
- [x] Invoice Expo: Write unit tests for all 3 fixes (invoiceExpo.fixes.test.ts — 15 tests passing)
- [x] Querypad: Query Logs — paginate to 10 records per page with Prev/Next controls
- [x] Pipelines: History logs — paginate to 10 records per page with Prev/Next controls; page resets on search input change
- [x] Pipelines: Reduce History page size to 5 records per page for all tabs (Recon, Partner, Scheduler)

# Legal Connect — Requests Logs (Admin Only)
- [x] Add BQ endpoint: trpc.legal.getRequestsLogs — queries fynd-db.finance_dwh.finops_legal_requests, admin-only
- [x] Build RequestsLogsPage component: Live Tracker-inspired design (4 KPI cards, search, status + dept filters, paginated 10/page)
- [x] Add admin-only sidebar nav item "Requests Logs" below regular nav items in LegalDashboard
- [x] Gate sidebar item: only visible to LC_ADMIN_EMAILS (ninadmandavkar, aditisinha, samikshap, farheenansari @gofynd.com)
- [x] No separate route needed — uses same in-page state navigation as all other Legal Connect pages

# Brand Ledger — Auto-fetch on Filter Change
- [x] Remove need to click Apply Filters — KPIs and data table auto-update when Company ID is typed (600ms debounce) or date slicer is selected (immediate)
- [x] Both Payable Claims and Payable Bags tabs get auto-fetch useEffect hooks
- [x] Update empty state text to reflect auto-fetch behavior

# Legal Connect — Slack Notification on New Request
- [x] Verify SLACK_BOT_TOKEN env var is available server-side (Mogambo bot)
- [x] Find the Legal Connect Slack channel ID
- [x] Add sendLcSlackNotification() helper in legalRouter.ts using Slack Block Kit (card layout, bullet fields, @U092K3G6PRQ @U0AC7RFUHL5 tags)
- [x] Wire helper into submitRequest procedure — fires after successful BQ insert, non-blocking

# Brand Ledger — Shared Filter Refactor (Single Filter for All Tabs)
- [x] Lift filter state to parent BrandLedgerPayablePage (single Company ID + date + preset row above sub-navbar)
- [x] Remove per-tab filter rows from Payable Claims and Payable Bags
- [x] Both KPI cards (Net Payable Claim + Payable Seller Sale) and both data tables update simultaneously from the single shared filter
- [x] Inline Bags tab data directly in BrandLedgerPayablePage (removed separate PayableBagsTab component)

# Brand Ledger — Receivable Tab
- [x] Inspect fynd-db.finance_dwh.AR_Ageing_table schema (columns, date field name)
- [x] Add /api/brand-ledger/receivable/kpi endpoint (sum of receivable amount + count)
- [x] Add /api/brand-ledger/receivable/preview endpoint (20-row preview with key columns)
- [x] Add /api/brand-ledger/receivable/download endpoint (full dataset as Excel)
- [x] Add "Receivable" as the first tab in BrandLedgerPayablePage (before Payable Claims)
- [x] Add third KPI card "Net Receivable" above the filter row (same style as existing KPI cards)
- [x] Wire Receivable tab data table with shared filter auto-fetch
- [x] Download Report button for Receivable tab

# Brand Ledger — Receivable Filter & Loading UX Fix
- [x] Backend: add hardcoded WHERE UPPER(TRIM(STATUS)) = 'OPEN' AND Invoice_Type = 'INV' to all 3 AR endpoints (kpi, preview, download)
- [x] Frontend: replace cramped "Querying BigQuery..." spinner with clean skeleton pulse loader (5 shimmer rows, bl-shimmer animation)

# Brand Ledger — Reorder KPI/Tabs + Reset Filter
- [x] Reorder KPI cards: Net Receivable → Payable Seller Sale → Net Payable Claim
- [x] Reorder sub-navbar tabs: Receivable → Payable Bags → Payable Claims
- [x] Add Reset Filters button next to Apply Filters (clears company ID, dates, preset; resets all KPI cards and data tables)

# Brand Ledger — Payout Report Tab (Bag_Wise_Payout_Report)
- [x] Inspect fynd-db.finance_recon_tool_asia.Bag_Wise_Payout_Report schema
- [x] Add /api/brand-ledger/payout/kpi endpoint (sum(Net_Payout) as seller_net_payout, row count)
- [x] Add /api/brand-ledger/payout/preview endpoint (company_id + date filters, 10 rows)
- [x] Add /api/brand-ledger/payout/download endpoint (full dataset as Excel)
- [x] Add 4th KPI card "Seller Net Payout" after Net Payable Claim
- [x] Add "Bagwise Data" tab button to sub-navbar (after Payable Claims)
- [x] Build Bagwise Data tab with data table, pagination (10/page), and Download Report
- [x] Wire payout auto-fetch into shared filter useEffect (same debounce/immediate pattern)

# Brand Ledger — Bagwise Data Tab name correction
- [x] Rename new tab from "Payout Report" to "Bagwise Data" (placed after Payable Claims in sub-navbar)

# Brand Ledger — Claim Payouts Tab + Net Claim Payout KPI
- [x] Inspect fynd-db.finance_recon_tool_asia.Shipment_wise_Claim_UTR schema
- [x] Add /api/brand-ledger/claim-payout/kpi endpoint (sum(claimable_amt) as net_claim_payout, row count)
- [x] Add /api/brand-ledger/claim-payout/preview endpoint (company_id + date filters, 20 rows)
- [x] Add /api/brand-ledger/claim-payout/download endpoint (full dataset as Excel)
- [x] Add 5th KPI card "Net Claim Payout" after Seller Net Payout
- [x] Add "Claim Payouts" tab button to sub-navbar (after Settled Bags)
- [x] Build Claim Payouts tab with data table, pagination (10/page), and Download Report
- [x] Wire claim-payout auto-fetch into shared filter useEffect
- [x] Rename "Bagwise Data" tab to "Settled Bags" in sub-navbar

# Brand Ledger — BQ Rate Limit Fix
- [x] Add retryBqQuery() helper with exponential backoff (max 4 retries, 1s/2s/4s/8s) to handle "Rate exceeded" errors
- [x] Replace all direct bq.query() calls in brandLedgerRouter.ts with retryBqQuery()
- [x] Improve frontend error display: show "BigQuery rate limit hit — retrying…" instead of raw JSON parse error

# Brand Ledger — WHERE Clause Fix (company_id type mismatch)
- [x] Inspect column types for all 5 tables (company_id type: INT vs STRING, date column name)
- [x] Fix Claim Payouts WHERE: fixed wrong companyField='recon_date' bug in KPI, preview, download
- [x] Fix Settled Bags WHERE: verified correct (uses buildWhere with default company_id field)
- [x] Fix Payable Claims, Payable Bags, Receivable WHERE clauses if same issue exists (all correct)
- [x] Test with company_id=292 to confirm data returns correctly (649 rows in Claim UTR)

# Brand Ledger — UI Polish + Manual Dispute Tab
- [x] Remove "Live data from..." messages from all 5 tabs (Receivable, Payable Bags, Payable Claims, Settled Bags, Claim Payouts)
- [x] Fix Claim Payouts preview: remove Payout ID, Claim Settle Date, Non Claimable Amt, Total UTR Paid, Recon Date columns from display; download still returns full dataset
- [x] Add Manual Dispute tab after Payable Claims (no KPI); data from fynd-db.Outstanding.Manual_Dispute
- [x] Backend: /api/brand-ledger/manual-dispute/preview and /api/brand-ledger/manual-dispute/download
- [x] Frontend: Manual Dispute tab with data table, pagination, Download Report button

# Brand Ledger — Tab Renames + Summary Tab
- [x] Rename "Claim Payouts" tab → "Settled Claims" (tab button text + activeTab value + all references)
- [x] Rename "Manual Dispute" tab → "Adjustments" (tab button text + activeTab value + all references)
- [x] Add "Summary" tab button after "Settled Claims" in sub-navbar
- [x] Backend: /api/brand-ledger/summary/download — fetches all 5 BQ tables in parallel, builds 6-sheet Excel
- [x] Summary sheet structure: header row, receivable data block with Outstanding_Amount + sum, payable table (Seller Sale + Claim + total), settlement table (Settled Bags + Settled Claims + total)
- [x] Frontend: Summary tab content — description + "Download Summary Report" button (disabled if no company_id)
- [x] Wire Summary tab into shared filter useEffect

## Brand Ledger Tab Renames & Summary Tab
- [x] Rename "Claim Payouts" navbar item to "Settled Claims"
- [x] Rename "Manual Dispute" navbar item to "Adjustments"
- [x] Add "Summary" navbar tab next to Settled Claims
- [x] Summary tab backend: POST /api/brand-ledger/summary/download (6-sheet Excel)
  - Sheet 1: settled_bags (from Bag_Wise_Payout_Report)
  - Sheet 2: settled_claims (from Shipment_wise_Claim_UTR)
  - Sheet 3: payable_bags (from 09_Payable_File_table)
  - Sheet 4: payable_claims (from 12_claim_payable)
  - Sheet 5: receivable (from AR_Ageing)
  - Sheet 6: summary (structured totals - receivable, payable, settlement)
- [x] Summary tab frontend: download button, loading state, error handling
- [x] Summary tab: show Adjustments row in payable breakdown table with strikethrough on gross Seller Sale
- [x] Settled Claims tab: fix design to match Settled Bags style (card header, teal column headers, right-aligned numeric columns)
- [x] Summary tab: add clickable drilldown to all 8 KPI cards navigating to their source tab
- [x] Add Receipts tab: backend query (AR_Ageing status=Open, Invoice_Date>=2026-04-01, Invoice_Type IN Advance_Receipt/Receipt)
- [x] Add Receipts tab: frontend UI matching Receivable design, placed before Summary in navbar
- [x] Summary tab: deduct sum(Outstanding_Amount from Receipts) from Total Receivable when company has receipt data
- [x] Summary tab: show Receipts deduction row in receivable section (similar to Adjustments row)
- [x] Excel download: add receipts sheet and update summary sheet receivable section with receipts deduction
- [x] Add Receipts tab to Brand Ledger (AR_Ageing, status=Open, Invoice_Date>=2026-04-01, Invoice_Type in Advance_Receipt/Receipt)
- [x] Deduct sum(Outstanding_Amount) from Total Receivable in Summary for companies with Receipts data
- [x] Add Receipts tab to Excel summary download (before Summary sheet)
- [x] Show receipts deduction note in Summary KPI cards and net balance

# Brand Ledger — Download Fix + Activity Log
- [x] Fix download failures across all Brand Ledger tabs (Receivable, Receipts, Bags, Claims, Adjustments, Settled Bags, Settled Claims, Summary)
- [x] Add brand_ledger_activity_log DB table (id, userName, activityType, companyId, createdAt)
- [x] Backend: POST /api/brand-ledger/activity-log (insert row), GET /api/brand-ledger/activity-log (paginated list)
- [x] Frontend: log "Searched for Company-ID {id}" on Apply Filters
- [x] Frontend: log "Downloaded Receivable", "Downloaded Receipts", "Downloaded Payable Bags", "Downloaded Payable Claims", "Downloaded Adjustments", "Downloaded Settled Bags", "Downloaded Settled Claims", "Downloaded Summary" on each download click
- [x] Frontend: Activity Log table below Brand Ledger UI (columns: User, Activity Type, Timestamp) styled like Pipelines history

# Brand Ledger — 503 Fix + Activity Log Pagination
- [x] Fix HTTP 503 on Summary download (convert to async job pattern or increase timeout)
- [x] Change Activity Log pagination from 10 to 5 records per page

# Invoice Expo — Sent Invoices
- [x] Backend: GET /api/invoice-download/sent-invoices endpoint (BQ daily_invoice_logs, latest date only)
- [x] Frontend: "Sent Invoices" button next to "Defaulter Invoices" in Invoice Expo
- [x] Frontend: Sent Invoices modal/panel with paginated table of results

# Brand Ledger — Summary Download Fix (May 12)
- [x] Revert Summary download to direct synchronous parallel BQ fetch (remove broken async job pattern)
- [x] Update frontend Summary download button to use direct fetch (remove polling)

# Brand Ledger — All Downloads 503 Fix (May 12)
- [x] Rewrite all 8 Brand Ledger download endpoints to use async job pattern (SSE progress + in-memory buffer) to prevent proxy 503 timeout
- [x] Add universal DownloadJob store with startDownloadJob/handleDownloadProgress/handleDownloadFile helpers
- [x] Update all 8 frontend download handlers to use downloadWithJob helper (POST → SSE progress → GET file)

# Brand Ledger — Direct Download Fix (2026-05-13)
- [x] Convert all 8 Brand Ledger download endpoints from async job pattern to direct synchronous response with X-Accel-Buffering: no + Connection: keep-alive + flushHeaders()
- [x] Update frontend downloadWithJob helper to simple direct fetch (no SSE polling)
- [x] Remove old SSE job store, handleDownloadProgress, handleDownloadFile helpers
- [x] Verified: summary/download returns HTTP 200 with correct Excel file (22KB for Apr 2026 date range)

# Brand Ledger — Fix 0 B Summary Download for Company 320 (2026-05-13)
- [x] Diagnose why summary download produces 0 B for company 320 but works for 10033
- [x] Fix backend to handle empty sheets gracefully and always produce a valid Excel file (resolved: async job pattern prevents proxy timeout that caused 0 B files for large datasets)

# Brand Ledger — Async Job Pattern for All 8 Downloads (2026-05-13)
- [x] Convert all 8 Brand Ledger download endpoints to async startJob pattern (POST → {jobId} → poll /status → GET /file)
- [x] Update frontend downloadWithJob helper to use async job pattern with 3s polling and elapsed time counter
- [x] Verified: 0 TypeScript errors after conversion

# Brand Ledger — Fix 503 on Preview/KPI Load (2026-05-13)
- [x] Convert /summary/preview endpoint to async job pattern (returns {jobId} immediately, frontend polls)
- [x] Convert all individual tab KPI+preview endpoints to combined /fetch async job pattern (payable/fetch, bags/fetch, receivable/fetch, payout/fetch, claim-payout/fetch, receipts/fetch, manual-dispute/fetch)
- [x] Add GET /query-job/:jobId/status and GET /query-job/:jobId/result polling endpoints
- [x] Update frontend Brand Ledger fetch functions to use pollQueryJob helper (all 8 functions converted)

# Brand Ledger — Fix Consolidated Download 503 (S3 Migration) (2026-05-13)
- [x] Diagnose: 503 on consolidated download caused by writing 8.7 MB MEDIUMBLOB to TiDB timing out
- [x] Replace fileBuffer MEDIUMBLOB column with fileKey TEXT column in brand_ledger_download_jobs schema
- [x] Run SQL migration: ADD COLUMN fileKey TEXT NULL; DROP COLUMN fileBuffer
- [x] Update startJob to upload Excel buffer to S3 via storagePut and store S3 key in DB
- [x] Update /download-job/:jobId/file endpoint to fetch from S3 via storageGetSignedUrl and stream to client
- [x] Verified: 0 TypeScript errors, dev server running clean

# Brand Ledger — Consolidated Download via S3 Merge (2026-05-13)
- [x] Add POST /consolidated/download endpoint: runs all 8 BQ queries in parallel, merges into one multi-sheet Excel, saves to S3, returns jobId
- [x] Update frontend consolidated download button to use new /consolidated/download endpoint
- [x] Stagger fetchAll batches (2s apart) to reduce server load and prevent proxy timeouts
- [x] Verify 0 TypeScript errors and save checkpoint

# Brand Ledger — Fix 503 on Query Result Fetch (2026-05-13)
- [x] Replace resultJson TEXT column with resultKey TEXT in brand_ledger_query_jobs schema
- [x] Run SQL migration: ADD COLUMN resultKey, DROP COLUMN resultJson
- [x] Update startQueryJob to upload result JSON to S3 via storagePut, store only S3 key in DB
- [x] Update /query-job/:jobId/result endpoint to fetch JSON from S3 via storageGetSignedUrl
- [x] Verified: 0 TypeScript errors

# Brand Ledger — Fix HTTP 500 on File Download (2026-05-19)
- [x] Root cause: storagePut appends hash suffix to key but startJob was saving the input key (without hash) to DB — S3 fetch failed because the key didn't exist
- [x] Fix: use the returned { key: actualKey } from storagePut and save actualKey to DB instead of the input s3Key
- [x] Verified: 0 TypeScript errors, dev server running clean

## Cashfree Entry Feature

- [x] Python processing script (cashfree_processor.py) implementing all 10 steps from cashfree-skill
- [x] Express backend route /api/cashfree with multer upload, SSE progress streaming, and file delivery
- [x] CashfreeEntry.tsx frontend page with drag-drop uploader widget
- [x] Animated pipeline tracker with 10 step chips (real-time SSE progress)
- [x] Dataframe preview table (first 20 rows of transfer report sheet)
- [x] Download button for CSV and XLSX of processed file
- [x] Sidebar nav item "Cashfree Entry" in QueryBeeDashboard.tsx
- [x] Wire activePage === "cashfree-entry" content section
- [x] Mogambo BQ conversation memory: mogambo_conversations table schema designed
- [x] mogamboBigQuery.ts: saveConversationMessage, getConversationHistory, getUserRecentHistory helpers
- [x] mogamboRouter.ts: tRPC procedures saveMessage, getHistory, getUserHistory (Mogambo auth via getMogamboUser)
- [x] MogamboChatInterface: save user + assistant messages to BQ after each reply
- [x] MogamboChatInterface: fetch BQ history and inject into Kaily info.custom_data on every send

# Gauge — Internal Ticketing System (JIRA-like)

## Database Schema
- [x] gauge_tickets table: id (auto-increment), ticket_id (GAUGE-XXXX), title, description, priority (low/medium/high/critical), status (open/in_progress/resolved/disputed/closed/on_hold), raised_by_email, raised_by_name, dri_email, dri_name, category, created_at, updated_at, resolved_at
- [x] gauge_ticket_comments table: id, ticket_id (FK), author_email, author_name, content, is_status_change, old_status, new_status, created_at
- [x] Run pnpm db:push to sync schema

## Server — tRPC Procedures (gaugeRouter.ts)
- [x] createTicket: insert ticket, auto-generate GAUGE-XXXX ID, return ticket
- [x] getTickets: paginated list with filters (status, dri_email, raised_by, search), returns tickets + total count
- [x] getTicketById: single ticket by ticket_id string (for shareable URL)
- [x] updateTicketStatus: DRI-only status update (validates dri_email === caller), inserts comment row for audit trail
- [x] addComment: any @gofynd.com user can add a comment
- [x] getComments: all comments for a ticket (ordered by created_at)
- [x] getKanbanBoard: tickets grouped by status with counts
- [x] getDriStats: per-DRI ticket counts (total, open, in_progress, resolved)
- [x] Register gaugeRouter in server/routers.ts

## Frontend — GaugeApp.tsx Sidebar Navigation
- [x] Replace placeholder nav with real items: My Tickets, Kanban Board, All Tickets, New Ticket (+ button)
- [x] Add active page state management (activePage)
- [x] Sidebar footer: Back to Gauge (landing), user email display

## Frontend — New Ticket Modal/Page
- [x] Full-screen modal or dedicated page for ticket creation
- [x] Fields: Title (required), Description (rich textarea), Priority (Low/Medium/High/Critical dropdown), Category (dropdown: Finance/Legal/Tech/HR/Operations/Other), DRI Email (text input with @gofynd.com validation), DRI Name (auto-filled or manual)
- [x] Submit creates ticket, shows GAUGE-XXXX confirmation with copy-to-clipboard ticket ID
- [x] Redirect to ticket detail after creation

## Frontend — My Tickets List View
- [x] Shows tickets raised BY the logged-in user + tickets where user is DRI
- [x] Two tabs: "Raised by Me" and "Assigned to Me (DRI)"
- [x] Paginated table: 20 rows/page with Prev/Next
- [x] Columns: Ticket ID (clickable), Title, Priority badge, Status badge, DRI, Created At
- [x] Search bar (filter by title/ID)
- [x] Status filter dropdown (All/Open/In Progress/Resolved/Disputed/Closed/On Hold)
- [x] Shareable ticket ID — click copies URL /gauge/ticket/GAUGE-XXXX to clipboard

## Frontend — Ticket Detail Page (/gauge/ticket/:ticketId)
- [x] Full ticket card: GAUGE-XXXX header, title, description, priority badge, status badge, category, raised by, DRI, created/updated timestamps
- [x] Status update panel (only visible to DRI): dropdown with all statuses + optional comment, Save button
- [x] Comment thread: chronological list of comments + status change events
- [x] Add Comment box (any @gofynd.com user)
- [x] Share button: copies /gauge/ticket/GAUGE-XXXX URL to clipboard
- [x] Back to My Tickets navigation

## Frontend — Kanban Board View
- [x] 6 columns: Open | In Progress | On Hold | Disputed | Resolved | Closed
- [x] Each column shows ticket cards (title, priority badge, DRI name, created date)
- [x] Column header shows count badge
- [x] DRI slicer: dropdown to filter all columns by a specific DRI (or "All DRIs")
- [x] Ticket cards are clickable → opens Ticket Detail

## Frontend — All Tickets View (Admin/Overview)
- [x] Full paginated table of all tickets (20/page)
- [x] Filters: Status, Priority, DRI, Category, Date range
- [x] DRI stats summary row: cards showing per-DRI counts (total assigned, open, resolved)
- [x] Export to CSV button

## Routes & Integration
- [x] Add /gauge/ticket/:ticketId route in App.tsx → GaugeTicketDetail component
- [x] Wire GaugeApp to use Manus OAuth user (useAuth hook) for raised_by identity
- [x] Ensure all @gofynd.com users can access Gauge (no extra OAuth gate needed)

## Notifications
- [x] On ticket creation: notify DRI via Slack (SLACK_BOT_TOKEN) with ticket details + link
- [x] On status update to Resolved/Closed: notify ticket raiser via Slack

## Polish
- [x] Monochrome black/white theme consistent throughout all Gauge views
- [x] Empty states for no tickets (with "Create your first ticket" CTA)
- [x] Loading skeletons for all data-fetching views
- [x] TypeScript: 0 errors
- [x] Checkpoint saved

## Gauge — Slack Integration

- [x] SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET stored as env vars
- [x] /api/slack/events endpoint: url_verification challenge + app_mention handler
- [x] /api/slack/interactions endpoint: Block Kit modal submission handler
- [x] Slack request signature verification middleware (HMAC-SHA256)
- [x] app_mention handler: resolve Slack user email via users.info, open Block Kit ticket-creation modal
- [x] Block Kit modal: title, description, DRI email, priority, category fields
- [x] Modal submission: create ticket in DB, post confirmation to channel with GAUGE-XXXX link
- [x] Vitest: test signature verification and modal payload parsing

## Gauge — Standalone Ticket Page Improvements

- [x] Back navigation fix: fall back to /gauge/app when no browser history exists
- [x] Login return-path: getLoginUrl() now accepts optional returnPath, encoded in state
- [x] OAuth callback: parses returnPath from state and redirects there after login (instead of always /)
- [x] Standalone ticket page: shows "Sign in to update status" banner for unauthenticated guests; login redirects back to same ticket

## Gauge — Comment & Status Fix + All Tickets Redesign

- [x] Fix Post Comment: superseded by Google auth gate — comments require @gofynd.com login (gaugeUser)
- [x] Fix addComment backend: superseded by Google auth gate — gaugeUser identity enforced
- [x] All Tickets: redesign as card with shadow border, 15 records per page (was 20)
- [x] Standalone ticket page: superseded by Google auth gate — login banner redirects to Gauge Google OAuth with returnPath
- [x] All Tickets: remove DRI stats summary cards
- [x] All Tickets: add date range picker (From/To) to filter by raised date
- [x] All Tickets: slicer dropdowns (Status/Priority/DRI) now black with white text
- [x] All Tickets: search bar shortened to 220px to fit all controls in one row
- [x] Kanban: On Hold and Closed column headers now black (matching In Progress/Disputed/Resolved)

## Gauge — Google OAuth Login Gate

- [x] Add gauge_sessions table to schema (id, email, name, googleId, createdAt, expiresAt)
- [x] Build /api/gauge/auth/google, /api/gauge/auth/callback, /api/gauge/auth/me, /api/gauge/auth/logout endpoints with @gofynd.com enforcement
- [x] Add GaugeUserContext to share logged-in Gauge user across all Gauge pages
- [x] Gate Gauge App (/gauge/app): GaugeProtectedRoute redirects to /gauge if not logged in
- [x] GaugeLanding: "Open Gauge" replaced with "Sign in with Google" for unauthenticated users
- [x] GaugeLanding: shows logged-in user name/email + Sign out button when authenticated
- [x] GaugeLanding: shows OAuth error banner (domain_not_allowed, etc.)
- [x] GaugeApp sidebar footer: shows logged-in user avatar, name, email, sign-out button
- [x] TicketDetail: replaced useAuth with useGaugeUser — comments and status updates now use Google session
- [x] MyTickets: replaced useAuth with useGaugeUser — My Tickets tab now filters by Google session email
- [x] NewTicketModal: replaced useAuth with useGaugeUser — raised_by now uses Google session identity
- [x] GaugeTicketStandalone: replaced Manus auth with gaugeUser — login banner points to Gauge Google OAuth with returnPath
- [x] returnPath support in gaugeAuthRouter: after login, redirects to /gauge/ticket/:id or /gauge/app

## Gauge — Slack Status Update Notification

- [x] On status update: post a threaded Slack reply on the original ticket thread (using stored slack_thread_ts + slack_channel_id) with the new status and any DRI comment
- [x] gaugeSlackRouter: store slackChannelId + slackThreadTs in gauge_tickets on modal submission
- [x] gaugeRouter: postStatusUpdateToSlackThread helper posts to original thread on every status change (not just resolved/closed)

## Gauge — My Tasks, Calendar & Dashboard (replacing My Tickets)

### DB Schema
- [ ] gauge_task_templates table (id, ownerEmail, name, type: standard|custom, columns JSON, createdAt)
- [ ] gauge_tasks table (id, ownerEmail, templateId, data JSON, status, createdAt, updatedAt)
- [ ] gauge_task_shares table (id, taskTemplateId, sharedWithEmail, permission: view|edit)
- [ ] gauge_meetings table (id, ownerEmail, title, startAt, endAt, location, googleMeetLink, description, momNotes, attendees JSON, docLinks JSON, createdAt, updatedAt)
- [ ] Run db:push migration

### Backend — My Tasks
- [ ] gaugeTaskRouter: createTemplate (standard auto-created, custom user-defined)
- [ ] gaugeTaskRouter: getTemplates (own + shared)
- [ ] gaugeTaskRouter: updateTemplate (custom columns only)
- [ ] gaugeTaskRouter: createTask (per template)
- [ ] gaugeTaskRouter: getTasks (per template, own + shared)
- [ ] gaugeTaskRouter: updateTask
- [ ] gaugeTaskRouter: deleteTask
- [ ] gaugeTaskRouter: shareTemplate (add email to gauge_task_shares)
- [ ] gaugeTaskRouter: revokeShare

### Backend — Calendar / Meetings
- [ ] gaugeMeetingRouter: createMeeting (+ Slack notify attendees)
- [ ] gaugeMeetingRouter: getMeetings (by month/week range, own + invited)
- [ ] gaugeMeetingRouter: getMeeting (single)
- [ ] gaugeMeetingRouter: updateMeeting (+ Slack notify on reschedule)
- [ ] gaugeMeetingRouter: deleteMeeting

### Frontend — My Tasks
- [ ] MyTasks.tsx: three navbar tabs — Standard, Custom, Meetings
- [ ] Standard tab: spreadsheet-style table with fixed columns (Task Name, Start Date, End Date, Priority, Doc Links, Status)
- [ ] Custom tab: template selector + "New Template" builder (column name, type: text/number/boolean/date/dropdown)
- [ ] Meetings tab: meetings list from Calendar in table form
- [ ] Inline row editing for all task fields
- [ ] Share dialog: enter email IDs to grant view/edit access

### Frontend — Calendar
- [ ] Calendar.tsx: month/week/day view toggle
- [ ] Month view: grid with event chips per day
- [ ] Click on day to create a new meeting
- [ ] Click on event chip to open MeetingDetailModal
- [ ] MeetingDetailModal: Title, Date/Time, Duration, Location/Meet link, Attendees, Doc Links, MOM Notes, editable
- [ ] Week view: hourly grid with event blocks

### Frontend — Dashboard
- [ ] Dashboard.tsx: user-specific analytics page
- [ ] Tickets section: raised by me, DRI'd by me, resolved, in-progress counts + bar chart
- [ ] Tasks section: total tasks, completed, overdue, by priority (donut chart)
- [ ] Meetings section: upcoming meetings this week, past meetings count
- [ ] All scoped to logged-in gaugeUser.email

### Sidebar
- [ ] Remove "My Tickets" from GaugeApp sidebar
- [ ] Add "My Tasks" sidebar item (icon: CheckSquare)
- [ ] Add "Calendar" sidebar item (icon: CalendarDays)
- [ ] Add "Dashboard" sidebar item (icon: LayoutDashboard)
- [ ] Register routes/views in GaugeApp.tsx

# Live Tracker & Request Logs Redesign + CSV Downloads
- [x] Live Tracker: add rl-table-header (matching Request Logs design) with title, record count badge inside table card
- [x] Live Tracker: add Download CSV button in page header (exports full dataset, not just current page)
- [x] Request Logs: add Download CSV button in page header (exports full unfiltered dataset)
- [x] Request Logs: show filtered-from-total indicator in table header when filters are active
- [x] Dashboard: add Download CSV button in page header (exports KPIs, status breakdown, doc types, region breakdown, recent contracts)

# Request Logs — Create & Edit
- [x] Backend: legalRouter.createRequest tRPC mutation — inserts new row into BigQuery legal_requests table, auto-generates LGL-XXXX ID
- [x] Backend: legalRouter.updateRequest tRPC mutation — updates existing row in BigQuery by request_id
- [x] Frontend: "Create Request" button in Request Logs table header opens modal form with all RL_COLS fields
- [x] Frontend: Edit icon button on each row in Request Logs opens pre-filled modal for update
- [x] Frontend: After create/update, invalidate RL query so table and Workflows both refresh
- [x] Modal form: all fields from RL_COLS (Request ID auto-generated, Requester, Email, Department, Type, Counter Party, Customer Type, IP/Product, Business Segment, PNL Owner, Region, Description, Priority, Deadline, Requested By, Confidential, Status)

## BigQuery → MySQL Migration (Legal Connect)

- [x] Add lc_requests table to drizzle/schema.ts mirroring all finops_legal_requests columns
- [x] Run pnpm db:push to create the table in MySQL
- [x] Rewrite legalBigQuery.ts internals with Drizzle ORM queries (keep same exported function signatures)
- [x] Write one-time BQ to MySQL migration script
- [x] Run migration script to copy existing BQ rows into MySQL
- [x] Verify build compiles without BigQuery errors
- [x] Save checkpoint after successful migration

## Dispute & Litigation Tracker Charts (Dashboard)
- [x] Add disputeSheets.ts data layer for the Dispute & Litigation Tracker spreadsheet (all 4 sheets)
- [x] Add disputeTrackerCharts tRPC procedure to legalRouter.ts
- [x] Build DisputeTrackerCharts component with charts for all 4 sheets
- [x] Replace Recent Contracts table in DashboardPage with DisputeTrackerCharts component
- [x] Write vitest test for disputeTrackerCharts procedure

## Download PDF Fix (Legal Connect Dashboard)
- [x] Replace html2canvas + jsPDF client-side PDF generation with server-side Puppeteer approach
- [x] Create server/lcPdfRouter.ts — GET /api/lc/pdf/dashboard endpoint (auth-gated, Puppeteer renders the dashboard and returns a PDF)
- [x] Mount lcPdfRouter at /api/lc/pdf in server/_core/index.ts
- [x] Update LegalDashboard.tsx downloadDashboardPdf to fetch /api/lc/pdf/dashboard and trigger browser download
- [x] Add ?page=dashboard URL param support to LegalDashboard to allow Puppeteer to navigate directly to the dashboard page
- [x] Verify PDF output captures all KPI cards, charts, and Dispute Tracker sections (sidebar/topbar excluded)
- [x] All 90 tests pass after changes

## Dashboard Chart Colours & KYC Card
- [x] Multicolour bars: Aging by Company chart (each bar a distinct colour from palette)
- [x] Multicolour bars: Net Recoverable Amount chart (each bar a distinct colour from palette)
- [x] Multicolour bars: Registered Trademarks — By Trademark Name chart
- [x] Multicolour bars: In-Process Trademarks — By Trademark Name chart
- [x] Templates page: add KYC Documents/Licenses/Certificates card with 5 downloadable files (COI, List of Directors, MOA, List of Shareholders, AOA)

## BQ Upload Fix (2026-06-05)
- [x] Fix BQ Upload schema validation to use project ID from table ID (not hardcoded service account default) — supports fynd-jio-commerceml-prod and any future GCP project

# QueryBee — BQ OAuth Migration (2026-06-05)

- [x] Install google-auth-library package
- [x] Create server/bqOAuth.ts: getBqClientOAuth(), isBqOAuthConfigured(), getBqOAuthUrl(), exchangeCodeForTokens()
- [x] Create server/bqOAuthRouter.ts: GET /api/bq-oauth/status, /start, /callback (owner-only OAuth flow)
- [x] Register bqOAuthRouter at /api/bq-oauth in server/_core/index.ts
- [x] Update server/querypadRouter.ts: replace BQ_SERVICE_ACCOUNT_JSON with getBqClientOAuth()
- [x] Update server/bqUploadRouter.ts: replace GOOGLE_SERVICE_ACCOUNT_JSON with getBqClientOAuth()
- [x] Add "BQ Connection" nav item (admin-only) to QueryBeeDashboard.tsx sidebar
- [x] Add BqConnectionPage component: shows status of BQ_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN + Connect button + setup instructions
- [x] All 90 tests pass

## QueryBee UI Redesign (Legal Connect Template)

- [x] Redesign QueryBee sidebar: dark narrow sidebar with icon + label, home button at bottom
- [x] Redesign QueryBee top bar: logo + "QueryBee" text + search bar + user info on right
- [x] Replace all orange/teal colors with light purple across QueryBee
- [x] Redesign QueryBee homepage: split layout (features left, welcome card right) matching Legal Connect
- [x] Update BQ Upload widget: white card with purple buttons/accents
- [x] Update Querypad widget: white card with purple buttons/accents
- [x] Update all other QueryBee inner pages: white background, purple accents
- [x] Update charts in QueryBee to use purple color palette

# PO Dashboard Redesign (DP Recon Style)
- [x] Rewrite PODashboard.tsx to match DP Recon design (white cards, purple accents, bl-* CSS classes)
- [x] Fix backend: correct column mappings (Consumption till March.27 in INR, PO Approval Status, distinct PO Number count)
- [x] Fix KPI field names: msmePOValueCr, nonMsmePOValueCr, servicePOValueCr, materialPOValueCr
- [x] Remove Sr No, Project Old, Deal Name Old from table columns
- [x] Fix pagination: only Prev/Next buttons (no page number buttons)
- [x] Fix unicode rendering: use actual characters not escape sequences
- [x] Add Sync Sheet button in top-right corner
- [x] Monthly consumption from individual month columns (April'26 through March'27)
- [x] Table: bl-kpi-card/bl-table CSS classes, purple numbered index, pill badges for Status/Approval/MSME
- [x] KPI cards: 12 total (2 rows of 6) using bl-kpi-card/bl-kpi-label/bl-kpi-value/bl-kpi-sub
- [x] Charts: 3 donut charts (PO Status, Approval Status, MSME), Monthly bar chart, BU value bar chart, Top Vendors table, BU Consumption % table

## Legal Connect Overhaul (Jun 11 2026)
- [x] Fix Slack posting - updated SLACK_BOT_TOKEN to Mogambo bot token
- [x] Fix Dispute & Litigation data loading - corrected sheet names (TM Master)
- [x] Rename Templates to Documents in sidebar nav
- [x] Add Agreements / KYC Docs / UK Docs sub-navbar on Documents page
- [x] Remove stats (250+ Active Contracts, 10+ Regions) from homepage
- [x] Build animated Legal Connect homepage (deep space / glassmorphism, aurora gradients, star field, floating orbs, animated feature cards)
- [x] Add video embed section (Legal Connect User Guide walkthrough)
- [x] Save UI/UX Pro Max skill to /home/ubuntu/skills/ui-ux-pro-max/

# Legal Connect Dashboard — June 2026 Changes
- [x] Add download button in Live Contract Tracker for Signed Doc Link column
- [x] Doughnut chart: show percentage only (remove count labels), keep counts in tooltip
- [x] Doughnut chart: distinct colors for Open (warm amber #F59E0B) vs On-Hold (muted terracotta #C0533A)
- [x] Remove "Requests by Document Type" chart entirely
- [x] Litigation Tracker: remove sub-headers (Fynd vs Other Party / Other Party vs Fynd)
- [x] Add Trademark sheet data table to Legal Dashboard (horizontal, with images, up to Valid Upto column)
- [x] Fix Live Tracker column gap between Doc Type and Status columns
- [x] Fix Team stats: auto-refresh daily, show Last Updated timestamp
- [x] Move Team tab to last position (after Request Log)

# PO Dashboard — June 2026 Enhancements
- [x] Currency conversion: use Exchange Rate × Total Value for non-INR rows across all KPIs/charts
- [x] Add IP slicer (dropdown) to PO Dashboard filters
- [x] Add Deal Name slicer (dropdown) to PO Dashboard filters
- [x] Add PO Start Date and PO End Date columns to Purchase Order Register table
- [x] Add Renewal Date filter widget inside Purchase Order Register card (single date picker per field)
- [x] Reorder slicers: Search → BU → Region → IP → Status → Approval → MSME → Deal Name → PO Date
- [x] Monthly Consumption chart: use April'26 INR through March'27 INR columns (already-converted INR values, no double exchange rate)
- [x] Add Download Report button (green, top-right header) — generates 5-sheet XLSX: Executive Summary, PO Register, Monthly Consumption, BU Analysis, Vendor Analysis
- [x] User Management: add po-dashboard scope to QB_SCOPES (backend) and SCOPE_GROUPS Analytics group (frontend)
- [x] User Management: add splitter scope to Finance group in SCOPE_GROUPS (frontend)
