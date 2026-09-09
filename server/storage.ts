// Storage helpers backed by Google Cloud Storage, reusing the same
// GOOGLE_SERVICE_ACCOUNT_JSON credential already used for Sheets access.
// Uploads go straight to GCS; downloads are served through short-lived
// signed GET URLs (the bucket itself stays private).

import { Storage } from "@google-cloud/storage";
import { ENV } from "./_core/env";

let _storage: Storage | null = null;

function getBucket() {
  if (!ENV.googleServiceAccountJson || !ENV.gcsBucketName) {
    throw new Error(
      "Storage config missing: set GOOGLE_SERVICE_ACCOUNT_JSON and GCS_BUCKET_NAME",
    );
  }
  if (!_storage) {
    const credentials = JSON.parse(ENV.googleServiceAccountJson);
    _storage = new Storage({ credentials });
  }
  return _storage.bucket(ENV.gcsBucketName);
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const bucket = getBucket();
  const key = appendHashSuffix(normalizeKey(relKey));

  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
  await bucket.file(key).save(body, { contentType, resumable: false });

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const bucket = getBucket();
  const key = normalizeKey(relKey);

  const [url] = await bucket.file(key).getSignedUrl({
    action: "read",
    expires: Date.now() + 60 * 60 * 1000,
  });
  return url;
}
