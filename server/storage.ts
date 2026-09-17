// Storage helpers backed by Google Drive, reusing the same
// GOOGLE_SERVICE_ACCOUNT_JSON credential already used for Sheets access.
// Uploads go into a single Drive folder shared with the service account
// as Editor (sidesteps GCP bucket IAM entirely — folder sharing is a
// plain "Share" action, not a project-level permission grant). Downloads
// are streamed back through our own server so the folder never needs to
// be made public.

import { Readable } from "stream";
import { google } from "googleapis";
import { ENV } from "./_core/env";

let _drive: ReturnType<typeof google.drive> | null = null;

function getDrive() {
  if (!ENV.googleServiceAccountJson || !ENV.driveFolderId) {
    throw new Error(
      "Storage config missing: set GOOGLE_SERVICE_ACCOUNT_JSON and DRIVE_FOLDER_ID",
    );
  }
  if (!_drive) {
    const credentials = JSON.parse(ENV.googleServiceAccountJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    _drive = google.drive({ version: "v3", auth });
  }
  return _drive;
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

// Drive files aren't addressed by nested paths, so the "/"-separated key
// (which still encodes region/category/name for readability) is flattened
// into a single Drive filename. The real organisation lives in Postgres
// (lc_downloads / lc_requests columns), not in Drive folder structure.
function toDriveName(key: string): string {
  return key.replace(/\//g, "__");
}

function describeGoogleError(err: unknown): Error {
  const e = err as {
    message?: string;
    response?: { data?: unknown; status?: number };
    errors?: unknown;
  };
  const detail = JSON.stringify({
    status: e?.response?.status,
    data: e?.response?.data,
    errors: e?.errors,
  });
  return new Error(`${e?.message ?? "Unknown Drive error"} | detail=${detail}`);
}

async function findFileId(driveName: string): Promise<string> {
  const drive = getDrive();
  const escaped = driveName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const res = await drive.files.list({
    q: `name = '${escaped}' and '${ENV.driveFolderId}' in parents and trashed = false`,
    fields: "files(id)",
    spaces: "drive",
    corpora: "allDrives",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });
  const file = res.data.files?.[0];
  if (!file?.id) throw new Error(`File not found in Drive: ${driveName}`);
  return file.id;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const drive = getDrive();
  const key = appendHashSuffix(normalizeKey(relKey));
  const driveName = toDriveName(key);
  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);

  try {
    const created = await drive.files.create({
      requestBody: { name: driveName, parents: [ENV.driveFolderId] },
      fields: "id",
      supportsAllDrives: true,
    });
    const fileId = created.data.id;
    if (!fileId) throw new Error("Drive did not return a file id on create");
    await drive.files.update({
      fileId,
      media: { mimeType: contentType, body: Readable.from(body) },
      supportsAllDrives: true,
    });
  } catch (err) {
    throw describeGoogleError(err);
  }

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetStream(
  relKey: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType: string; size?: number }> {
  const drive = getDrive();
  const key = normalizeKey(relKey);
  const driveName = toDriveName(key);
  const fileId = await findFileId(driveName);

  const meta = await drive.files.get({ fileId, fields: "mimeType, size", supportsAllDrives: true });
  const resp = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "stream" },
  );

  return {
    stream: resp.data as unknown as NodeJS.ReadableStream,
    contentType: meta.data.mimeType || "application/octet-stream",
    size: meta.data.size ? Number(meta.data.size) : undefined,
  };
}
