import { DataTransferServiceClient } from "@google-cloud/bigquery-data-transfer";
import { DataformClient } from "@google-cloud/dataform";

const bqCreds = JSON.parse(process.env.BQ_SERVICE_ACCOUNT_JSON || "{}");

// Test scheduler run
const dtClient = new DataTransferServiceClient({ credentials: bqCreds });
const schedulerRunRef = "projects/186370417883/locations/asia-south1/transferConfigs/689d1b06-0000-28d4-9b3c-34c7e93da433/runs/69e96f67-0000-2d71-955b-f40304392e24";

console.log("Testing scheduler run state...");
try {
  const [run] = await dtClient.getTransferRun({ name: schedulerRunRef });
  console.log("Scheduler run state:", run.state, "(raw:", JSON.stringify(run.state), ")");
  console.log("State type:", typeof run.state);
  console.log("State int:", parseInt(String(run.state)));
  console.log("Full state object keys:", Object.keys(run).filter(k => k.includes('state') || k.includes('State')));
} catch (e) {
  console.error("Scheduler error:", e.message);
}

// Test dataform run
const dfClient = new DataformClient({ credentials: bqCreds });
const reconRunRef = "projects/fynd-db/locations/asia-south1/repositories/finance_recon_pipeline_asia/workflowInvocations/1776848842-9593a119-a442-409a-8a52-3003450e5cf6";

console.log("\nTesting recon workflow invocation state...");
try {
  const [inv] = await dfClient.getWorkflowInvocation({ name: reconRunRef });
  console.log("Recon invocation state:", inv.state, "(raw:", JSON.stringify(inv.state), ")");
  console.log("State type:", typeof inv.state);
  console.log("State int:", parseInt(String(inv.state)));
} catch (e) {
  console.error("Recon error:", e.message);
}
