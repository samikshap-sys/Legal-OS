import path from "path";
import type { Express } from "express";
import { ENV } from "./env";

export function registerStorageProxy(app: Express) {
  /**
   * GET /api/download?key=<storage-key>&name=<filename>
   * Fetches the file from S3 server-side and streams it to the browser
   * with Content-Disposition: attachment so it downloads directly.
   */
  app.get("/api/download", async (req, res) => {
    const key = (req.query.key as string || "").replace(/^\/+/, "");
    const name = (req.query.name as string || path.basename(key));

    if (!key) {
      res.status(400).send("Missing key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage not configured");
      return;
    }

    try {
      // 1. Get a fresh presigned GET URL
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        res.status(502).send("Storage backend error");
        return;
      }

      const { url: s3Url } = (await forgeResp.json()) as { url: string };
      if (!s3Url) {
        res.status(502).send("Empty signed URL");
        return;
      }

      // 2. Fetch file bytes from S3 server-side
      const fileResp = await fetch(s3Url);
      if (!fileResp.ok) {
        res.status(502).send(`S3 fetch failed: ${fileResp.status}`);
        return;
      }

      // 3. Stream back to browser with download headers
      const contentType = fileResp.headers.get("content-type") || "application/octet-stream";
      const contentLength = fileResp.headers.get("content-length");
      const safeFilename = encodeURIComponent(name);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${name}"; filename*=UTF-8''${safeFilename}`);
      res.setHeader("Cache-Control", "no-store");
      if (contentLength) res.setHeader("Content-Length", contentLength);

      const arrayBuffer = await fileResp.arrayBuffer();
      res.end(Buffer.from(arrayBuffer));
    } catch (err) {
      console.error("[DownloadProxy] failed:", err);
      res.status(502).send("Download proxy error");
    }
  });

  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
