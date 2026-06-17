import { BigQuery } from "@google-cloud/bigquery";
import { readFileSync } from "fs";
import { config } from "dotenv";

config();

const bqJson = process.env.BQ_SERVICE_ACCOUNT_JSON;
if (!bqJson) {
  console.error("BQ_SERVICE_ACCOUNT_JSON not set");
  process.exit(1);
}

const credentials = JSON.parse(bqJson);
const bq = new BigQuery({ credentials, projectId: credentials.project_id });

async function main() {
  const TABLE = "fynd-db.finance_recon_tool_asia.Bag_Wise_Payout_Report";
  
  // Get schema
  const [dataset] = TABLE.split(".").slice(0, 2);
  const tableName = TABLE.split(".")[2];
  
  console.log(`\nQuerying schema for: ${TABLE}`);
  
  // Use INFORMATION_SCHEMA
  const schemaQuery = `
    SELECT column_name, data_type, is_nullable
    FROM \`fynd-db.finance_recon_tool_asia.INFORMATION_SCHEMA.COLUMNS\`
    WHERE table_name = 'Bag_Wise_Payout_Report'
    ORDER BY ordinal_position
  `;
  
  try {
    const [rows] = await bq.query({ query: schemaQuery });
    console.log(`\nColumns (${rows.length} total):`);
    rows.forEach(r => {
      console.log(`  ${r.column_name} | ${r.data_type} | nullable=${r.is_nullable}`);
    });
    
    // Also get a sample row
    const sampleQuery = `SELECT * FROM \`${TABLE}\` LIMIT 2`;
    const [sample] = await bq.query({ query: sampleQuery });
    console.log(`\nSample row keys: ${Object.keys(sample[0] || {}).join(", ")}`);
    if (sample[0]) {
      console.log("\nSample row values:");
      Object.entries(sample[0]).forEach(([k, v]) => {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      });
    }
  } catch (e) {
    console.error("Error:", e.message);
    
    // Try a simpler approach - just SELECT * LIMIT 1
    try {
      const [sample] = await bq.query({ query: `SELECT * FROM \`${TABLE}\` LIMIT 1` });
      console.log(`\nSample row keys: ${Object.keys(sample[0] || {}).join(", ")}`);
      if (sample[0]) {
        Object.entries(sample[0]).forEach(([k, v]) => {
          console.log(`  ${k}: ${JSON.stringify(v)}`);
        });
      }
    } catch (e2) {
      console.error("Sample query also failed:", e2.message);
    }
  }
}

main().catch(console.error);
