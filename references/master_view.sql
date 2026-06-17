-- ============================================================
-- Fynd FinOps — Brand Ledger Master View
-- ============================================================
-- Purpose : Union all 7 Brand Ledger tabs into a single view.
--           Each row carries a `sheet_type` column so the
--           consolidated download can split rows into sheets.
--
-- Usage   : CREATE OR REPLACE VIEW `fynd-db.<dataset>.brand_ledger_master_view` AS <this query>
--
-- Filters : Apply company_id / from_date / to_date OUTSIDE this
--           view (i.e. WHERE company_id = X AND recon_date BETWEEN …)
--           so the view stays generic and reusable.
--
-- Columns : All source-specific columns are present; columns that
--           don't exist in a given tab are filled with NULL.
-- ============================================================

-- ── 1. RECEIVABLE  (fynd-db.finance_dwh.AR_Ageing) ──────────────────────────
-- Filter applied in view: Invoice_Type NOT IN ('Advance_Receipt','Receipt')
--   AND status != 'Open' (or whatever the AR tab uses — adjust as needed)
-- NOTE: The AR_Ageing table is shared by Receivable AND Receipts.
--       The view separates them by Invoice_Type filter.
SELECT
  'Receivable'                                        AS sheet_type,

  -- identity
  CAST(Company_ID       AS STRING)                    AS company_id,
  Seller_Name                                         AS company_name,

  -- invoice / AR fields
  Business                                            AS business,
  Channel                                             AS channel,
  Transaction_Type                                    AS transaction_type,
  Invoice_No                                          AS invoice_no,
  Invoice_Type                                        AS invoice_type,
  CAST(Invoice_Date     AS STRING)                    AS invoice_date,
  CAST(Due_Date         AS STRING)                    AS due_date,
  Invoice_Amount                                      AS invoice_amount,
  Outstanding_Amount                                  AS outstanding_amount,
  Company_Level_Due                                   AS company_level_due,
  Days                                                AS days,
  Aging_Bucket                                        AS aging_bucket,
  STATUS                                              AS status,
  TOTAL_COLLECTIONS                                   AS total_collections,

  -- bag / settlement fields (NULL for this tab)
  NULL                                                AS bag_id,
  NULL                                                AS forward_shipment_id,
  NULL                                                AS current_shipment_id,
  NULL                                                AS fynd_order_id,
  NULL                                                AS settlement_type,
  NULL                                                AS recon_status,
  NULL                                                AS seller_net_collection,
  NULL                                                AS Net_Payout,
  CAST(NULL AS STRING)                                AS recon_date,
  CAST(NULL AS STRING)                                AS order_date,
  NULL                                                AS brand_name,
  NULL                                                AS store_state,
  NULL                                                AS sales_channel,

  -- claim / UTR fields (NULL for this tab)
  NULL                                                AS claimable_amt,
  CAST(NULL AS STRING)                                AS Payment_Date,
  NULL                                                AS SF_UTR,

  -- manual dispute / adjustments fields (NULL for this tab)
  NULL                                                AS ordering_channel,
  NULL                                                AS order_type,
  NULL                                                AS sale_channel,
  CAST(NULL AS STRING)                                AS sett_date,
  NULL                                                AS entry_type,
  NULL                                                AS fiscal_Year,
  NULL                                                AS sett_id,
  NULL                                                AS dispute_amount,
  NULL                                                AS Comment

FROM `fynd-db.finance_dwh.AR_Ageing`
WHERE
  Invoice_Type NOT IN ('Advance_Receipt', 'Receipt')

UNION ALL

-- ── 2. RECEIPTS  (fynd-db.finance_dwh.AR_Ageing — Advance_Receipt / Receipt) ─
-- Fixed date floor: 2026-04-01  (matches RECEIPTS_DATE_FLOOR in code)
SELECT
  'Receipts'                                          AS sheet_type,

  CAST(Company_ID       AS STRING)                    AS company_id,
  Seller_Name                                         AS company_name,

  Business                                            AS business,
  Channel                                             AS channel,
  Transaction_Type                                    AS transaction_type,
  Invoice_No                                          AS invoice_no,
  Invoice_Type                                        AS invoice_type,
  CAST(Invoice_Date     AS STRING)                    AS invoice_date,
  CAST(Due_Date         AS STRING)                    AS due_date,
  Invoice_Amount                                      AS invoice_amount,
  Outstanding_Amount                                  AS outstanding_amount,
  Company_Level_Due                                   AS company_level_due,
  Days                                                AS days,
  Aging_Bucket                                        AS aging_bucket,
  STATUS                                              AS status,
  TOTAL_COLLECTIONS                                   AS total_collections,

  NULL                                                AS bag_id,
  NULL                                                AS forward_shipment_id,
  NULL                                                AS current_shipment_id,
  NULL                                                AS fynd_order_id,
  NULL                                                AS settlement_type,
  NULL                                                AS recon_status,
  NULL                                                AS seller_net_collection,
  NULL                                                AS Net_Payout,
  CAST(NULL AS STRING)                                AS recon_date,
  CAST(NULL AS STRING)                                AS order_date,
  NULL                                                AS brand_name,
  NULL                                                AS store_state,
  NULL                                                AS sales_channel,

  NULL                                                AS claimable_amt,
  CAST(NULL AS STRING)                                AS Payment_Date,
  NULL                                                AS SF_UTR,

  NULL                                                AS ordering_channel,
  NULL                                                AS order_type,
  NULL                                                AS sale_channel,
  CAST(NULL AS STRING)                                AS sett_date,
  NULL                                                AS entry_type,
  NULL                                                AS fiscal_Year,
  NULL                                                AS sett_id,
  NULL                                                AS dispute_amount,
  NULL                                                AS Comment

FROM `fynd-db.finance_dwh.AR_Ageing`
WHERE
  UPPER(TRIM(status)) = 'OPEN'
  AND DATE(Invoice_Date) >= DATE('2026-04-01')
  AND Invoice_Type IN ('Advance_Receipt', 'Receipt')

UNION ALL

-- ── 3. PAYABLE BAGS  (fynd-db.Outstanding.09_Payable_File_table) ─────────────
SELECT
  'Payable Bags'                                      AS sheet_type,

  CAST(company_id       AS STRING)                    AS company_id,
  company_name                                        AS company_name,

  NULL                                                AS business,
  NULL                                                AS channel,
  transaction_type                                    AS transaction_type,
  NULL                                                AS invoice_no,
  NULL                                                AS invoice_type,
  NULL                                                AS invoice_date,
  NULL                                                AS due_date,
  NULL                                                AS invoice_amount,
  NULL                                                AS outstanding_amount,
  NULL                                                AS company_level_due,
  NULL                                                AS days,
  NULL                                                AS aging_bucket,
  NULL                                                AS status,
  NULL                                                AS total_collections,

  CAST(bag_id           AS STRING)                    AS bag_id,
  forward_shipment_id                                 AS forward_shipment_id,
  NULL                                                AS current_shipment_id,
  fynd_order_id                                       AS fynd_order_id,
  settlement_type                                     AS settlement_type,
  recon_status                                        AS recon_status,
  seller_net_collection                               AS seller_net_collection,
  NULL                                                AS Net_Payout,
  CAST(recon_date       AS STRING)                    AS recon_date,
  NULL                                                AS order_date,
  NULL                                                AS brand_name,
  NULL                                                AS store_state,
  NULL                                                AS sales_channel,

  NULL                                                AS claimable_amt,
  CAST(NULL AS STRING)                                AS Payment_Date,
  NULL                                                AS SF_UTR,

  NULL                                                AS ordering_channel,
  NULL                                                AS order_type,
  NULL                                                AS sale_channel,
  CAST(NULL AS STRING)                                AS sett_date,
  NULL                                                AS entry_type,
  NULL                                                AS fiscal_Year,
  NULL                                                AS sett_id,
  NULL                                                AS dispute_amount,
  NULL                                                AS Comment

FROM `fynd-db.Outstanding.09_Payable_File_table`

UNION ALL

-- ── 4. PAYABLE CLAIMS  (fynd-db.Outstanding.12_claim_payable) ────────────────
SELECT
  'Payable Claims'                                    AS sheet_type,

  CAST(company_id       AS STRING)                    AS company_id,
  NULL                                                AS company_name,

  NULL                                                AS business,
  NULL                                                AS channel,
  transaction_type                                    AS transaction_type,
  NULL                                                AS invoice_no,
  NULL                                                AS invoice_type,
  NULL                                                AS invoice_date,
  NULL                                                AS due_date,
  NULL                                                AS invoice_amount,
  NULL                                                AS outstanding_amount,
  NULL                                                AS company_level_due,
  NULL                                                AS days,
  NULL                                                AS aging_bucket,
  NULL                                                AS status,
  NULL                                                AS total_collections,

  NULL                                                AS bag_id,
  forward_shipment_id                                 AS forward_shipment_id,
  NULL                                                AS current_shipment_id,
  fynd_order_id                                       AS fynd_order_id,
  NULL                                                AS settlement_type,
  NULL                                                AS recon_status,
  claimable_amt                                       AS seller_net_collection,
  NULL                                                AS Net_Payout,
  CAST(recon_date       AS STRING)                    AS recon_date,
  NULL                                                AS order_date,
  NULL                                                AS brand_name,
  NULL                                                AS store_state,
  NULL                                                AS sales_channel,

  claimable_amt                                       AS claimable_amt,
  CAST(NULL AS STRING)                                AS Payment_Date,
  NULL                                                AS SF_UTR,

  NULL                                                AS ordering_channel,
  NULL                                                AS order_type,
  NULL                                                AS sale_channel,
  CAST(NULL AS STRING)                                AS sett_date,
  NULL                                                AS entry_type,
  NULL                                                AS fiscal_Year,
  NULL                                                AS sett_id,
  NULL                                                AS dispute_amount,
  NULL                                                AS Comment

FROM `fynd-db.Outstanding.12_claim_payable`

UNION ALL

-- ── 5. ADJUSTMENTS  (fynd-db.Outstanding.Manual_Dispute) ─────────────────────
SELECT
  'Adjustments'                                       AS sheet_type,

  CAST(company_id       AS STRING)                    AS company_id,
  company_name                                        AS company_name,

  NULL                                                AS business,
  NULL                                                AS channel,
  entry_type                                          AS transaction_type,
  NULL                                                AS invoice_no,
  NULL                                                AS invoice_type,
  NULL                                                AS invoice_date,
  NULL                                                AS due_date,
  NULL                                                AS invoice_amount,
  NULL                                                AS outstanding_amount,
  NULL                                                AS company_level_due,
  NULL                                                AS days,
  NULL                                                AS aging_bucket,
  NULL                                                AS status,
  NULL                                                AS total_collections,

  NULL                                                AS bag_id,
  NULL                                                AS forward_shipment_id,
  NULL                                                AS current_shipment_id,
  NULL                                                AS fynd_order_id,
  NULL                                                AS settlement_type,
  NULL                                                AS recon_status,
  dispute_amount                                      AS seller_net_collection,
  NULL                                                AS Net_Payout,
  CAST(NULL AS STRING)                                AS recon_date,
  NULL                                                AS order_date,
  NULL                                                AS brand_name,
  NULL                                                AS store_state,
  sale_channel                                        AS sales_channel,

  NULL                                                AS claimable_amt,
  CAST(NULL AS STRING)                                AS Payment_Date,
  NULL                                                AS SF_UTR,

  ordering_channel                                    AS ordering_channel,
  order_type                                          AS order_type,
  sale_channel                                        AS sale_channel,
  CAST(sett_date        AS STRING)                    AS sett_date,
  entry_type                                          AS entry_type,
  fiscal_Year                                         AS fiscal_Year,
  sett_id                                             AS sett_id,
  dispute_amount                                      AS dispute_amount,
  Comment                                             AS Comment

FROM `fynd-db.Outstanding.Manual_Dispute`

UNION ALL

-- ── 6. SETTLED BAGS  (fynd-db.finance_recon_tool_asia.Bag_Wise_Payout_Report) ─
SELECT
  'Settled Bags'                                      AS sheet_type,

  CAST(company_id       AS STRING)                    AS company_id,
  company_name                                        AS company_name,

  NULL                                                AS business,
  NULL                                                AS channel,
  transaction_type                                    AS transaction_type,
  NULL                                                AS invoice_no,
  NULL                                                AS invoice_type,
  NULL                                                AS invoice_date,
  NULL                                                AS due_date,
  NULL                                                AS invoice_amount,
  NULL                                                AS outstanding_amount,
  NULL                                                AS company_level_due,
  NULL                                                AS days,
  NULL                                                AS aging_bucket,
  NULL                                                AS status,
  NULL                                                AS total_collections,

  CAST(bag_id           AS STRING)                    AS bag_id,
  NULL                                                AS forward_shipment_id,
  NULL                                                AS current_shipment_id,
  fynd_order_id                                       AS fynd_order_id,
  NULL                                                AS settlement_type,
  recon_status                                        AS recon_status,
  seller_net_collection                               AS seller_net_collection,
  Net_Payout                                          AS Net_Payout,
  CAST(recon_date       AS STRING)                    AS recon_date,
  CAST(order_date       AS STRING)                    AS order_date,
  brand_name                                          AS brand_name,
  store_state                                         AS store_state,
  sales_channel                                       AS sales_channel,

  NULL                                                AS claimable_amt,
  CAST(NULL AS STRING)                                AS Payment_Date,
  NULL                                                AS SF_UTR,

  NULL                                                AS ordering_channel,
  NULL                                                AS order_type,
  NULL                                                AS sale_channel,
  CAST(NULL AS STRING)                                AS sett_date,
  NULL                                                AS entry_type,
  NULL                                                AS fiscal_Year,
  NULL                                                AS sett_id,
  NULL                                                AS dispute_amount,
  NULL                                                AS Comment

FROM `fynd-db.finance_recon_tool_asia.Bag_Wise_Payout_Report`

UNION ALL

-- ── 7. SETTLED CLAIMS  (fynd-db.finance_recon_tool_asia.Shipment_wise_Claim_UTR) ─
SELECT
  'Settled Claims'                                    AS sheet_type,

  CAST(company_id       AS STRING)                    AS company_id,
  company_name                                        AS company_name,

  NULL                                                AS business,
  NULL                                                AS channel,
  transaction_type                                    AS transaction_type,
  NULL                                                AS invoice_no,
  NULL                                                AS invoice_type,
  NULL                                                AS invoice_date,
  NULL                                                AS due_date,
  NULL                                                AS invoice_amount,
  NULL                                                AS outstanding_amount,
  NULL                                                AS company_level_due,
  NULL                                                AS days,
  NULL                                                AS aging_bucket,
  NULL                                                AS status,
  NULL                                                AS total_collections,

  NULL                                                AS bag_id,
  NULL                                                AS forward_shipment_id,
  current_shipment_id                                 AS current_shipment_id,
  fynd_order_id                                       AS fynd_order_id,
  NULL                                                AS settlement_type,
  recon_status                                        AS recon_status,
  claimable_amt                                       AS seller_net_collection,
  NULL                                                AS Net_Payout,
  CAST(NULL AS STRING)                                AS recon_date,
  NULL                                                AS order_date,
  NULL                                                AS brand_name,
  NULL                                                AS store_state,
  sales_channel                                       AS sales_channel,

  claimable_amt                                       AS claimable_amt,
  CAST(Payment_Date     AS STRING)                    AS Payment_Date,
  SF_UTR                                              AS SF_UTR,

  NULL                                                AS ordering_channel,
  NULL                                                AS order_type,
  NULL                                                AS sale_channel,
  CAST(NULL AS STRING)                                AS sett_date,
  NULL                                                AS entry_type,
  NULL                                                AS fiscal_Year,
  NULL                                                AS sett_id,
  NULL                                                AS dispute_amount,
  NULL                                                AS Comment

FROM `fynd-db.finance_recon_tool_asia.Shipment_wise_Claim_UTR`
