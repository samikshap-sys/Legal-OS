import { BigQuery } from "@google-cloud/bigquery";
import { readFileSync } from "fs";

const raw = process.env.BQ_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!raw) { console.error("No BQ credentials env found"); process.exit(1); }

const creds = JSON.parse(raw);
const bq = new BigQuery({ credentials: creds, projectId: creds.project_id });

const TABLE = "fynd-db.finance_recon_tool_asia.Shipment_wise_Claim_UTR";

async function main() {
  // Get schema
  const [meta] = await bq.dataset("finance_recon_tool_asia", { projectId: "fynd-db" })
    .table("Shipment_wise_Claim_UTR").getMetadata();
  const fields = meta.schema.fields;
  console.log("=== COLUMNS ===");
  fields.forEach(f => console.log(`  ${f.name} (${f.type})`));
  console.log(`\nTotal columns: ${fields.length}`);

  // Sample 3 rows
  const [rows] = await bq.query({
    query: `SELECT * FROM \`${TABLE}\` LIMIT 3`,
    location: "US",
  });
  console.log("\n=== SAMPLE ROWS ===");
  rows.forEach((r, i) => console.log(`Row ${i+1}:`, JSON.stringify(r, null, 2)));
}

main().catch(e => { console.error(e.message); process.exit(1); });
