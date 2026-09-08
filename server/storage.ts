// Storage helpers backed directly by AWS S3.
// Uploads go straight to S3 via the SDK; downloads are served through
// short-lived presigned GET URLs (the bucket itself stays private).

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

let _client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!ENV.awsAccessKeyId || !ENV.awsSecretAccessKey || !ENV.awsRegion || !ENV.awsS3Bucket) {
    throw new Error(
      "Storage config missing: set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, and AWS_S3_BUCKET",
    );
  }
  if (!_client) {
    _client = new S3Client({
      region: ENV.awsRegion,
      credentials: {
        accessKeyId: ENV.awsAccessKeyId,
        secretAccessKey: ENV.awsSecretAccessKey,
      },
    });
  }
  return _client;
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
  const client = getS3Client();
  const key = appendHashSuffix(normalizeKey(relKey));

  await client.send(new PutObjectCommand({
    Bucket: ENV.awsS3Bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
  }));

  return { key, url: `/manus-storage/${key}` };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const client = getS3Client();
  const key = normalizeKey(relKey);

  const command = new GetObjectCommand({ Bucket: ENV.awsS3Bucket, Key: key });
  return await getSignedUrl(client, command, { expiresIn: 3600 });
}
