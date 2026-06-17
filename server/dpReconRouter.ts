/**
 * DP Recon Router — powered by fynd-db.finance_dwh.DP_monthly_Rev
 * Single source of truth for all DP Recon dashboard tabs.
 *
 * Table schema:
 *   DP_NAME, Service_type, Company_Id, Company_Name, ordering_channel,
 *   billing_date (TIMESTAMP), Month (STRING), Querter (STRING), FY (STRING),
 *   LAPA__NONLAPA (STRING), Business_Unit (STRING), ordering_channel2 (STRING),
 *   Merge (STRING), Count_of_shipment_id (INTEGER),
 *   Sum_of_total_dp_cost (FLOAT), Sum_of_logistic_rev (STRING),
 *   Sum_of_variance (STRING)
 *
 * Notes:
 *  - Sum_of_logistic_rev is a STRING with commas e.g. "13,260.52" or "-" (Non-LAPA)
 *  - Revenue is only available for LAPA rows; Non-LAPA rows have "-"
 *  - Margin = Revenue - DP Cost (LAPA only)
 *  - All procedures accept an optional `fy` input to filter by FY column
 */

import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { BigQuery } from "@google-cloud/bigquery";

const TABLE = "`fynd-db.finance_dwh.DP_monthly_Rev`";

// Parse the service account JSON from env
function getBQClient() {
  const creds = JSON.parse(process.env.BQ_SERVICE_ACCOUNT_JSON || "{}");
  return new BigQuery({ credentials: creds, projectId: creds.project_id });
}

async function bqQuery<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const bq = getBQClient();
  const [rows] = await bq.query({ query: sql });
  return rows as T[];
}

/** Parse Sum_of_logistic_rev string to number. Returns 0 for "-" or invalid. */
function parseRevSQL(col: string) {
  return `COALESCE(SAFE_CAST(REPLACE(REPLACE(${col}, ',', ''), ' ', '') AS FLOAT64), 0)`;
}

const MONTH_ORDER = `MIN(billing_date)`;

/** Build a WHERE clause fragment for FY filtering. Returns empty string if fy is null/undefined. */
function fyWhere(fy: string | null | undefined, prefix = "WHERE") {
  if (!fy || fy === "ALL") return "";
  // Sanitise: only allow alphanumeric, dash, space
  const safe = fy.replace(/[^a-zA-Z0-9\-\s]/g, "");
  return `${prefix} FY = '${safe}'`;
}

/** Build an AND clause fragment for FY filtering (when WHERE already exists). */
function fyAnd(fy: string | null | undefined) {
  if (!fy || fy === "ALL") return "";
  const safe = fy.replace(/[^a-zA-Z0-9\-\s]/g, "");
  return `AND FY = '${safe}'`;
}

const fyInput = z.object({ fy: z.string().optional().nullable() }).optional();

export const dpReconRouter = router({
  // ─────────────────────────────────────────────────────────────────────────
  // FY List — distinct FY values for the global slicer
  // ─────────────────────────────────────────────────────────────────────────
  fyList: protectedProcedure.query(async () => {
    const rows = await bqQuery<{ fy: string }>(`
      SELECT DISTINCT FY AS fy
      FROM ${TABLE}
      WHERE FY IS NOT NULL AND FY != ''
      ORDER BY FY DESC
    `);
    return rows.map(r => r.fy);
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 1: Executive Overview
  // ─────────────────────────────────────────────────────────────────────────
  execOverview: protectedProcedure.input(fyInput).query(async ({ input }) => {
    const fy = input?.fy;
    const rev = parseRevSQL("Sum_of_logistic_rev");
    const w = fyWhere(fy);

    // Grand totals
    const [totals] = await bqQuery<{
      total_ships: number; total_dp_cost: number; total_rev: number;
      total_margin: number; lapa_ships: number; nonlapa_ships: number;
      india_ships: number; rbl_ships: number; distinct_dps: number; distinct_companies: number;
    }>(`
      SELECT
        SUM(Count_of_shipment_id)                                    AS total_ships,
        SUM(Sum_of_total_dp_cost)                                    AS total_dp_cost,
        SUM(${rev})                                                  AS total_rev,
        SUM(${rev}) - SUM(Sum_of_total_dp_cost)                     AS total_margin,
        COUNTIF(LAPA__NONLAPA='LAPA')                                AS lapa_ships,
        COUNTIF(LAPA__NONLAPA='Non-LAPA')                            AS nonlapa_ships,
        SUM(IF(Business_Unit='INDIA', Count_of_shipment_id, 0))      AS india_ships,
        SUM(IF(Business_Unit='RBL',   Count_of_shipment_id, 0))      AS rbl_ships,
        COUNT(DISTINCT DP_NAME)                                      AS distinct_dps,
        COUNT(DISTINCT Company_Name)                                 AS distinct_companies
      FROM ${TABLE}
      ${w}
    `);

    // BU segment split (shipments + cost)
    const buSplit = await bqQuery<{
      segment: string; ships: number; dp_cost: number; rev: number;
    }>(`
      SELECT
        CONCAT(Business_Unit, ' ', LAPA__NONLAPA) AS segment,
        SUM(Count_of_shipment_id)                 AS ships,
        SUM(Sum_of_total_dp_cost)                 AS dp_cost,
        SUM(${rev})                               AS rev
      FROM ${TABLE}
      ${w}
      GROUP BY 1 ORDER BY ships DESC
    `);

    // Monthly shipment + cost trend (all combined)
    const monthlyTrend = await bqQuery<{
      month: string; quarter: string; ships: number; dp_cost: number; rev: number;
    }>(`
      SELECT
        Month AS month, Querter AS quarter,
        SUM(Count_of_shipment_id) AS ships,
        SUM(Sum_of_total_dp_cost) AS dp_cost,
        SUM(${rev})               AS rev
      FROM ${TABLE}
      ${w}
      GROUP BY 1,2
      ORDER BY ${MONTH_ORDER}
    `);

    // Quarterly summary
    const quarterlyTrend = await bqQuery<{
      quarter: string; india_ships: number; rbl_ships: number;
      india_cost: number; rbl_cost: number; total_ships: number; total_cost: number;
    }>(`
      SELECT
        Querter AS quarter,
        SUM(IF(Business_Unit='INDIA', Count_of_shipment_id, 0)) AS india_ships,
        SUM(IF(Business_Unit='RBL',   Count_of_shipment_id, 0)) AS rbl_ships,
        SUM(IF(Business_Unit='INDIA', Sum_of_total_dp_cost, 0)) AS india_cost,
        SUM(IF(Business_Unit='RBL',   Sum_of_total_dp_cost, 0)) AS rbl_cost,
        SUM(Count_of_shipment_id)                               AS total_ships,
        SUM(Sum_of_total_dp_cost)                               AS total_cost
      FROM ${TABLE}
      ${w}
      GROUP BY 1 ORDER BY 1
    `);

    // Top 10 companies by shipments
    const top10Companies = await bqQuery<{
      company: string; bu: string; ships: number; dp_cost: number;
    }>(`
      SELECT Company_Name AS company, Business_Unit AS bu,
        SUM(Count_of_shipment_id) AS ships,
        SUM(Sum_of_total_dp_cost) AS dp_cost
      FROM ${TABLE}
      ${w ? w + " AND" : "WHERE"} Company_Name != '(blank)'
      GROUP BY 1,2 ORDER BY ships DESC LIMIT 10
    `);

    return { totals, buSplit, monthlyTrend, quarterlyTrend, top10Companies };
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 2: DP Performance
  // ─────────────────────────────────────────────────────────────────────────
  dpPerformance: protectedProcedure.input(fyInput).query(async ({ input }) => {
    const fy = input?.fy;
    const rev = parseRevSQL("Sum_of_logistic_rev");
    const w = fyWhere(fy);

    // Per-DP overall summary
    const dpSummary = await bqQuery<{
      dp: string; ships: number; dp_cost: number; rev: number;
      cost_per_ship: number; rev_per_ship: number; bu_india: number; bu_rbl: number;
    }>(`
      SELECT
        DP_NAME AS dp,
        SUM(Count_of_shipment_id)                                               AS ships,
        SUM(Sum_of_total_dp_cost)                                               AS dp_cost,
        SUM(${rev})                                                             AS rev,
        ROUND(SUM(Sum_of_total_dp_cost)/NULLIF(SUM(Count_of_shipment_id),0),2) AS cost_per_ship,
        ROUND(SUM(${rev})/NULLIF(SUM(Count_of_shipment_id),0),2)               AS rev_per_ship,
        SUM(IF(Business_Unit='INDIA', Count_of_shipment_id, 0))                AS bu_india,
        SUM(IF(Business_Unit='RBL',   Count_of_shipment_id, 0))                AS bu_rbl
      FROM ${TABLE}
      ${w}
      GROUP BY 1 ORDER BY ships DESC
    `);

    // Monthly trend per DP (shipments)
    const dpMonthly = await bqQuery<{
      dp: string; month: string; ships: number; dp_cost: number;
    }>(`
      SELECT DP_NAME AS dp, Month AS month,
        SUM(Count_of_shipment_id) AS ships,
        SUM(Sum_of_total_dp_cost) AS dp_cost
      FROM ${TABLE}
      ${w}
      GROUP BY 1,2
      ORDER BY MIN(billing_date), dp
    `);

    // DP share donut (by shipments)
    const dpShare = await bqQuery<{ dp: string; ships: number; pct: number }>(`
      SELECT DP_NAME AS dp,
        SUM(Count_of_shipment_id) AS ships,
        ROUND(SUM(Count_of_shipment_id)*100.0/SUM(SUM(Count_of_shipment_id)) OVER(),2) AS pct
      FROM ${TABLE}
      ${w}
      GROUP BY 1 ORDER BY ships DESC
    `);

    // DP cost share donut
    const dpCostShare = await bqQuery<{ dp: string; dp_cost: number; pct: number }>(`
      SELECT DP_NAME AS dp,
        SUM(Sum_of_total_dp_cost) AS dp_cost,
        ROUND(SUM(Sum_of_total_dp_cost)*100.0/SUM(SUM(Sum_of_total_dp_cost)) OVER(),2) AS pct
      FROM ${TABLE}
      ${w}
      GROUP BY 1 ORDER BY dp_cost DESC
    `);

    // Channel mix by DP
    const dpChannelMix = await bqQuery<{
      dp: string; channel: string; ships: number;
    }>(`
      SELECT DP_NAME AS dp, ordering_channel2 AS channel,
        SUM(Count_of_shipment_id) AS ships
      FROM ${TABLE}
      ${w}
      GROUP BY 1,2 ORDER BY dp, ships DESC
    `);

    return { dpSummary, dpMonthly, dpShare, dpCostShare, dpChannelMix };
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 3: India Operations
  // ─────────────────────────────────────────────────────────────────────────
  indiaOps: protectedProcedure.input(fyInput).query(async ({ input }) => {
    const fy = input?.fy;
    const rev = parseRevSQL("Sum_of_logistic_rev");
    const a = fyAnd(fy);

    // India KPIs
    const [indiaKpis] = await bqQuery<{
      lapa_ships: number; lapa_cost: number; lapa_rev: number; lapa_margin: number;
      nonlapa_ships: number; nonlapa_cost: number;
      total_ships: number; total_cost: number;
    }>(`
      SELECT
        SUM(IF(LAPA__NONLAPA='LAPA',    Count_of_shipment_id, 0)) AS lapa_ships,
        SUM(IF(LAPA__NONLAPA='LAPA',    Sum_of_total_dp_cost, 0)) AS lapa_cost,
        SUM(IF(LAPA__NONLAPA='LAPA',    ${rev}, 0))               AS lapa_rev,
        SUM(IF(LAPA__NONLAPA='LAPA',    ${rev}, 0))
          - SUM(IF(LAPA__NONLAPA='LAPA',Sum_of_total_dp_cost, 0)) AS lapa_margin,
        SUM(IF(LAPA__NONLAPA='Non-LAPA',Count_of_shipment_id, 0)) AS nonlapa_ships,
        SUM(IF(LAPA__NONLAPA='Non-LAPA',Sum_of_total_dp_cost, 0)) AS nonlapa_cost,
        SUM(Count_of_shipment_id)                                 AS total_ships,
        SUM(Sum_of_total_dp_cost)                                 AS total_cost
      FROM ${TABLE}
      WHERE Business_Unit='INDIA' ${a}
    `);

    // India quarterly breakdown
    const indiaQuarterly = await bqQuery<{
      quarter: string; lapa_ships: number; nonlapa_ships: number;
      lapa_cost: number; nonlapa_cost: number; lapa_rev: number; lapa_margin: number;
    }>(`
      SELECT Querter AS quarter,
        SUM(IF(LAPA__NONLAPA='LAPA',    Count_of_shipment_id, 0)) AS lapa_ships,
        SUM(IF(LAPA__NONLAPA='Non-LAPA',Count_of_shipment_id, 0)) AS nonlapa_ships,
        SUM(IF(LAPA__NONLAPA='LAPA',    Sum_of_total_dp_cost, 0)) AS lapa_cost,
        SUM(IF(LAPA__NONLAPA='Non-LAPA',Sum_of_total_dp_cost, 0)) AS nonlapa_cost,
        SUM(IF(LAPA__NONLAPA='LAPA',    ${rev}, 0))               AS lapa_rev,
        SUM(IF(LAPA__NONLAPA='LAPA',    ${rev}, 0))
          - SUM(IF(LAPA__NONLAPA='LAPA',Sum_of_total_dp_cost, 0)) AS lapa_margin
      FROM ${TABLE}
      WHERE Business_Unit='INDIA' ${a}
      GROUP BY 1 ORDER BY 1
    `);

    // India monthly trend
    const indiaMonthly = await bqQuery<{
      month: string; lapa_ships: number; nonlapa_ships: number;
      lapa_cost: number; nonlapa_cost: number;
    }>(`
      SELECT Month AS month,
        SUM(IF(LAPA__NONLAPA='LAPA',    Count_of_shipment_id, 0)) AS lapa_ships,
        SUM(IF(LAPA__NONLAPA='Non-LAPA',Count_of_shipment_id, 0)) AS nonlapa_ships,
        SUM(IF(LAPA__NONLAPA='LAPA',    Sum_of_total_dp_cost, 0)) AS lapa_cost,
        SUM(IF(LAPA__NONLAPA='Non-LAPA',Sum_of_total_dp_cost, 0)) AS nonlapa_cost
      FROM ${TABLE}
      WHERE Business_Unit='INDIA' ${a}
      GROUP BY 1 ORDER BY MIN(billing_date)
    `);

    // India DP breakdown
    const indiaDPs = await bqQuery<{
      dp: string; lapa_type: string; ships: number; dp_cost: number;
    }>(`
      SELECT DP_NAME AS dp, LAPA__NONLAPA AS lapa_type,
        SUM(Count_of_shipment_id) AS ships,
        SUM(Sum_of_total_dp_cost) AS dp_cost
      FROM ${TABLE}
      WHERE Business_Unit='INDIA' ${a}
      GROUP BY 1,2 ORDER BY ships DESC
    `);

    // India channel mix
    const indiaChannels = await bqQuery<{ channel: string; ships: number; dp_cost: number }>(`
      SELECT ordering_channel2 AS channel,
        SUM(Count_of_shipment_id) AS ships,
        SUM(Sum_of_total_dp_cost) AS dp_cost
      FROM ${TABLE}
      WHERE Business_Unit='INDIA' ${a}
      GROUP BY 1 ORDER BY ships DESC
    `);

    // All India companies (no limit)
    const indiaTopCompanies = await bqQuery<{
      company: string; lapa_type: string; ships: number; dp_cost: number; rev: number;
    }>(`
      SELECT Company_Name AS company, LAPA__NONLAPA AS lapa_type,
        SUM(Count_of_shipment_id) AS ships,
        SUM(Sum_of_total_dp_cost) AS dp_cost,
        SUM(${rev})               AS rev
      FROM ${TABLE}
      WHERE Business_Unit='INDIA' AND Company_Name != '(blank)' ${a}
      GROUP BY 1,2 ORDER BY ships DESC
    `);

    return { indiaKpis, indiaQuarterly, indiaMonthly, indiaDPs, indiaChannels, indiaTopCompanies };
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 4: RBL Operations
  // ─────────────────────────────────────────────────────────────────────────
  rblOps: protectedProcedure.input(fyInput).query(async ({ input }) => {
    const fy = input?.fy;
    const rev = parseRevSQL("Sum_of_logistic_rev");
    const a = fyAnd(fy);

    // RBL KPIs
    const [rblKpis] = await bqQuery<{
      total_ships: number; total_cost: number; total_rev: number; total_margin: number;
      cost_per_ship: number; rev_per_ship: number; distinct_dps: number; distinct_companies: number;
    }>(`
      SELECT
        SUM(Count_of_shipment_id)                                               AS total_ships,
        SUM(Sum_of_total_dp_cost)                                               AS total_cost,
        SUM(${rev})                                                             AS total_rev,
        SUM(${rev}) - SUM(Sum_of_total_dp_cost)                                AS total_margin,
        ROUND(SUM(Sum_of_total_dp_cost)/NULLIF(SUM(Count_of_shipment_id),0),2) AS cost_per_ship,
        ROUND(SUM(${rev})/NULLIF(SUM(Count_of_shipment_id),0),2)               AS rev_per_ship,
        COUNT(DISTINCT DP_NAME)                                                 AS distinct_dps,
        COUNT(DISTINCT Company_Name)                                            AS distinct_companies
      FROM ${TABLE}
      WHERE Business_Unit='RBL' ${a}
    `);

    // RBL quarterly breakdown
    const rblQuarterly = await bqQuery<{
      quarter: string; ships: number; dp_cost: number; rev: number; margin: number;
      cost_per_ship: number; rev_per_ship: number;
    }>(`
      SELECT Querter AS quarter,
        SUM(Count_of_shipment_id)                                               AS ships,
        SUM(Sum_of_total_dp_cost)                                               AS dp_cost,
        SUM(${rev})                                                             AS rev,
        SUM(${rev}) - SUM(Sum_of_total_dp_cost)                                AS margin,
        ROUND(SUM(Sum_of_total_dp_cost)/NULLIF(SUM(Count_of_shipment_id),0),2) AS cost_per_ship,
        ROUND(SUM(${rev})/NULLIF(SUM(Count_of_shipment_id),0),2)               AS rev_per_ship
      FROM ${TABLE}
      WHERE Business_Unit='RBL' ${a}
      GROUP BY 1 ORDER BY 1
    `);

    // RBL monthly trend
    const rblMonthly = await bqQuery<{
      month: string; ships: number; dp_cost: number; rev: number; margin: number;
    }>(`
      SELECT Month AS month,
        SUM(Count_of_shipment_id)                AS ships,
        SUM(Sum_of_total_dp_cost)                AS dp_cost,
        SUM(${rev})                              AS rev,
        SUM(${rev}) - SUM(Sum_of_total_dp_cost)  AS margin
      FROM ${TABLE}
      WHERE Business_Unit='RBL' ${a}
      GROUP BY 1 ORDER BY MIN(billing_date)
    `);

    // RBL DP breakdown
    const rblDPs = await bqQuery<{
      dp: string; ships: number; dp_cost: number; rev: number; margin: number;
      cost_per_ship: number;
    }>(`
      SELECT DP_NAME AS dp,
        SUM(Count_of_shipment_id)                                               AS ships,
        SUM(Sum_of_total_dp_cost)                                               AS dp_cost,
        SUM(${rev})                                                             AS rev,
        SUM(${rev}) - SUM(Sum_of_total_dp_cost)                                AS margin,
        ROUND(SUM(Sum_of_total_dp_cost)/NULLIF(SUM(Count_of_shipment_id),0),2) AS cost_per_ship
      FROM ${TABLE}
      WHERE Business_Unit='RBL' ${a}
      GROUP BY 1 ORDER BY ships DESC
    `);

    // All RBL companies (no limit)
    const rblTopCompanies = await bqQuery<{
      company: string; ships: number; dp_cost: number; rev: number; margin: number; margin_pct: number;
    }>(`
      SELECT Company_Name AS company,
        SUM(Count_of_shipment_id)                                                     AS ships,
        SUM(Sum_of_total_dp_cost)                                                     AS dp_cost,
        SUM(${rev})                                                                   AS rev,
        SUM(${rev}) - SUM(Sum_of_total_dp_cost)                                      AS margin,
        ROUND((SUM(${rev}) - SUM(Sum_of_total_dp_cost))/NULLIF(SUM(${rev}),0)*100,2) AS margin_pct
      FROM ${TABLE}
      WHERE Business_Unit='RBL' AND Company_Name != '(blank)' ${a}
      GROUP BY 1 ORDER BY ships DESC
    `);

    return { rblKpis, rblQuarterly, rblMonthly, rblDPs, rblTopCompanies };
  }),

  // ─────────────────────────────────────────────────────────────────────────
  // TAB 5: Monthly Trends
  // ─────────────────────────────────────────────────────────────────────────
  monthlyTrends: protectedProcedure.input(fyInput).query(async ({ input }) => {
    const fy = input?.fy;
    const rev = parseRevSQL("Sum_of_logistic_rev");
    const w = fyWhere(fy);

    // Month × DP matrix (shipments + cost)
    const monthDpMatrix = await bqQuery<{
      month: string; quarter: string; dp: string; ships: number; dp_cost: number;
    }>(`
      SELECT Month AS month, Querter AS quarter, DP_NAME AS dp,
        SUM(Count_of_shipment_id) AS ships,
        SUM(Sum_of_total_dp_cost) AS dp_cost
      FROM ${TABLE}
      ${w}
      GROUP BY 1,2,3
      ORDER BY MIN(billing_date), dp
    `);

    // Month × BU matrix
    const monthBuMatrix = await bqQuery<{
      month: string; quarter: string; bu: string; lapa_type: string;
      ships: number; dp_cost: number; rev: number;
    }>(`
      SELECT Month AS month, Querter AS quarter, Business_Unit AS bu, LAPA__NONLAPA AS lapa_type,
        SUM(Count_of_shipment_id) AS ships,
        SUM(Sum_of_total_dp_cost) AS dp_cost,
        SUM(${rev})               AS rev
      FROM ${TABLE}
      ${w}
      GROUP BY 1,2,3,4
      ORDER BY MIN(billing_date), bu, lapa_type
    `);

    // Monthly channel breakdown
    const monthChannels = await bqQuery<{
      month: string; channel: string; ships: number;
    }>(`
      SELECT Month AS month, ordering_channel2 AS channel,
        SUM(Count_of_shipment_id) AS ships
      FROM ${TABLE}
      ${w}
      GROUP BY 1,2
      ORDER BY MIN(billing_date), ships DESC
    `);

    // Month summary with variance
    const monthSummary = await bqQuery<{
      month: string; quarter: string; ships: number; dp_cost: number; rev: number;
      margin: number; cost_per_ship: number;
    }>(`
      SELECT Month AS month, Querter AS quarter,
        SUM(Count_of_shipment_id)                                               AS ships,
        SUM(Sum_of_total_dp_cost)                                               AS dp_cost,
        SUM(${rev})                                                             AS rev,
        SUM(${rev}) - SUM(Sum_of_total_dp_cost)                                AS margin,
        ROUND(SUM(Sum_of_total_dp_cost)/NULLIF(SUM(Count_of_shipment_id),0),2) AS cost_per_ship
      FROM ${TABLE}
      ${w}
      GROUP BY 1,2
      ORDER BY MIN(billing_date)
    `);

    return { monthDpMatrix, monthBuMatrix, monthChannels, monthSummary };
  }),
});
