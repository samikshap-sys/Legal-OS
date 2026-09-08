import path from "path";
import type { Express } from "express";
import { storageGetSignedUrl } from "../storage";

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

    try {
      const s3Url = await storageGetSignedUrl(key);

      const fileResp = await fetch(s3Url);
      if (!fileResp.ok) {
        res.status(502).send(`S3 fetch failed: ${fileResp.status}`);
        return;
      }

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
      res.status(502).send(err instanceof Error ? err.message : "Download proxy error");
    }
  });

  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    try {
      const url = await storageGetSignedUrl(key);
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send(err instanceof Error ? err.message : "Storage proxy error");
    }
  });
}
