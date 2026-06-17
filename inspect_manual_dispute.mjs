import { BigQuery } from "@google-cloud/bigquery";
import dotenv from "dotenv";
dotenv.config();

const bq = new BigQuery({
  projectId: "fynd-db",
  credentials: JSON.parse(process.env.BQ_SERVICE_ACCOUNT_JSON),
});

const [meta] = await bq.dataset("Outstanding", { projectId: "fynd-db" }).table("Manual_Dispute").getMetadata();
const fields = meta.schema?.fields ?? [];
console.log(`\nManual_Dispute — ${fields.length} columns:\n`);
fields.forEach((f, i) => {
  console.log(`  ${String(i+1).padStart(2)}. ${f.name.padEnd(35)} ${f.type}`);
});

// Sample row count
const [rows] = await bq.query({
  query: "SELECT COUNT(*) as cnt FROM `fynd-db.Outstanding.Manual_Dispute` LIMIT 1",
  useLegacySql: false,
});
console.log(`\nTotal rows: ${rows[0].cnt}`);

// Sample data
const [sample] = await bq.query({
  query: "SELECT * FROM `fynd-db.Outstanding.Manual_Dispute` LIMIT 3",
  useLegacySql: false,
});
console.log("\nSample row keys:", sample.length ? Object.keys(sample[0]) : "no rows");
