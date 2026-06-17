/**
 * Uploads all legal template docx files to the app's S3 bucket
 * using the forge presign/put API (same bucket as storagePut).
 * Outputs a JSON map: { filename: storageKey }
 */
import "dotenv/config";
import fs from "fs";
import path from "path";

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL.replace(/\/+$/, "");
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

const DOCS = [
  { name: "Mutual NDA Fynd x Other Party.docx",                          key: "legal-templates/nda.docx" },
  { name: "MSA _ Fynd Commerce _ Enterprise Clients.docx",               key: "legal-templates/msa-enterprise.docx" },
  { name: "Service Agreement _ Fynd X RBL (Fynd Commerce Service).docx", key: "legal-templates/service-rbl.docx" },
  { name: "MSA _ Fynd X Service Provider (Non-SAAS).docx",               key: "legal-templates/vendor-nonsaas.docx" },
  { name: "MSA _ Fynd X Service Provider (SAAS).docx",                   key: "legal-templates/vendor-saas.docx" },
  { name: "MSA_ Contractual Resource Template.docx",                     key: "legal-templates/3rdparty-resource.docx" },
  { name: "Referral Partnership SOW.docx",                               key: "legal-templates/referral-sow.docx" },
  { name: "API_Integration_Agreement_Mutual_With_Schedules.docx",        key: "legal-templates/api-integration.docx" },
  { name: "1. MSA GaaS_ Fynd X Purchaser.docx",                         key: "legal-templates/purchase-gaas.docx" },
  { name: "2. MSA GaaS _ Fynd X Supplier .docx",                        key: "legal-templates/supplier-gaas.docx" },
  { name: "Fynd Kiosk Sale Agreement.docx",                              key: "legal-templates/kiosk-sale.docx" },
  { name: "Kiosk Sale Warranty Certificate.docx",                        key: "legal-templates/kiosk-warranty.docx" },
  { name: "Reseller Partner Agreement - Fynd.docx",                      key: "legal-templates/reseller.docx" },
];

const BASE = "/home/ubuntu/webdev-static-assets/legal-templates/finops_v1/finops_legal/Legal Agreements/1. STANDARD AGREEMENT";

const FILE_PATHS = {
  "Mutual NDA Fynd x Other Party.docx":                          `${BASE}/1. Non Disclore Agreement/Mutual NDA Fynd x Other Party.docx`,
  "MSA _ Fynd Commerce _ Enterprise Clients.docx":               `${BASE}/2. Fynd Commerce MSA (For Enterprise Client) /MSA _ Fynd Commerce _ Enterprise Clients.docx`,
  "Service Agreement _ Fynd X RBL (Fynd Commerce Service).docx": `${BASE}/3. Service Agreement (Fynd X Reliance)/Service Agreement _ Fynd X RBL (Fynd Commerce Service).docx`,
  "MSA _ Fynd X Service Provider (Non-SAAS).docx":               `${BASE}/4. Vendor Agreement (Fynd as Service Receiver)/MSA _ Fynd X Service Provider (Non-SAAS).docx`,
  "MSA _ Fynd X Service Provider (SAAS).docx":                   `${BASE}/4. Vendor Agreement (Fynd as Service Receiver)/MSA _ Fynd X Service Provider (SAAS).docx`,
  "MSA_ Contractual Resource Template.docx":                     `${BASE}/5. 3rd Party Contract Resources Agreement/MSA_ Contractual Resource Template.docx`,
  "Referral Partnership SOW.docx":                               `${BASE}/6. Referral Partnership (SOW)/Referral Partnership SOW.docx`,
  "API_Integration_Agreement_Mutual_With_Schedules.docx":        `${BASE}/7. API:Integration Partner Agreement/API_Integration_Agreement_Mutual_With_Schedules.docx`,
  "1. MSA GaaS_ Fynd X Purchaser.docx":                         `${BASE}/8. Purchase Agreement (for GAAS- Fynd as Seller)/1. MSA GaaS_ Fynd X Purchaser.docx`,
  "2. MSA GaaS _ Fynd X Supplier .docx":                        `${BASE}/9. Supplier Agreement (for GAAS- Fynd as Purchaser)/2. MSA GaaS _ Fynd X Supplier .docx`,
  "Fynd Kiosk Sale Agreement.docx":                              `${BASE}/10. Fynd Kiosk Agreement/Fynd Kiosk Sale Agreement.docx`,
  "Kiosk Sale Warranty Certificate.docx":                        `${BASE}/10. Fynd Kiosk Agreement/Kiosk Sale Warranty Certificate.docx`,
  "Reseller Partner Agreement - Fynd.docx":                      `${BASE}/11. Reseller Partnership Agreement/Reseller Partner Agreement - Fynd.docx`,
};

async function uploadFile(localPath, storageKey) {
  // 1. Get presigned PUT URL
  const putUrl = new URL("v1/storage/presign/put", FORGE_URL + "/");
  putUrl.searchParams.set("path", storageKey);
  const putResp = await fetch(putUrl, { headers: { Authorization: `Bearer ${FORGE_KEY}` } });
  if (!putResp.ok) throw new Error(`Presign PUT failed: ${putResp.status}`);
  const { url: s3PutUrl } = await putResp.json();

  // 2. Upload file bytes
  const fileBytes = fs.readFileSync(localPath);
  const uploadResp = await fetch(s3PutUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    body: fileBytes,
  });
  if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status}`);
  return storageKey;
}

async function main() {
  const results = {};
  for (const doc of DOCS) {
    const localPath = FILE_PATHS[doc.name];
    if (!fs.existsSync(localPath)) {
      console.error(`MISSING: ${localPath}`);
      continue;
    }
    try {
      const key = await uploadFile(localPath, doc.key);
      results[doc.name] = key;
      console.log(`✓ ${doc.name} → ${key}`);
    } catch (e) {
      console.error(`✗ ${doc.name}: ${e.message}`);
    }
  }
  console.log("\n=== STORAGE KEYS ===");
  console.log(JSON.stringify(results, null, 2));
}

main();
