import { BigQuery } from "@google-cloud/bigquery";
import { config } from "dotenv";
config();

const BQ_PROJECT = "fynd-db";
const credentials = JSON.parse(process.env.BQ_SERVICE_ACCOUNT_JSON || "{}");
const bq = new BigQuery({ projectId: BQ_PROJECT, credentials });

const TABLES = [
  { name: "Shipment_wise_Claim_UTR",  table: "fynd-db.finance_recon_tool_asia.Shipment_wise_Claim_UTR" },
  { name: "Bag_Wise_Payout_Report",   table: "fynd-db.finance_recon_tool_asia.Bag_Wise_Payout_Report" },
  { name: "12_claim_payable",         table: "fynd-db.Outstanding.12_claim_payable" },
  { name: "09_Payable_File_table",    table: "fynd-db.Outstanding.09_Payable_File_table" },
  { name: "AR_Ageing",                table: "fynd-db.finance_dwh.AR_Ageing" },
];

for (const { name, table } of TABLES) {
  try {
    const [rows] = await bq.query({
      query: `SELECT * FROM \`${table}\` LIMIT 1`,
      useLegacySql: false,
    });
    // Get schema via information_schema
    const [dataset, tbl] = table.replace("fynd-db.", "").split(".");
    const [schemaRows] = await bq.query({
      query: `
        SELECT column_name, data_type
        FROM \`fynd-db.${dataset}.INFORMATION_SCHEMA.COLUMNS\`
        WHERE table_name = '${tbl}'
        ORDER BY ordinal_position
      `,
      useLegacySql: false,
    });
    
    console.log(`\n=== ${name} ===`);
    const companyCol = schemaRows.filter(r => r.column_name.toLowerCase().includes("company"));
    const dateCol = schemaRows.filter(r => r.column_name.toLowerCase().includes("date") || r.column_name.toLowerCase().includes("recon"));
    
    console.log("Company-related columns:");
    companyCol.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
    console.log("Date-related columns:");
    dateCol.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));
    
    // Also show a sample row for company_id
    if (rows.length > 0) {
      const row = rows[0];
      const companyKeys = Object.keys(row).filter(k => k.toLowerCase().includes("company"));
      console.log("Sample company values:", companyKeys.map(k => `${k}=${JSON.stringify(row[k])}`).join(", "));
    }
  } catch (err) {
    console.error(`Error for ${name}:`, err.message);
  }
}
