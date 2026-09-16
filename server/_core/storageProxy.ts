import path from "path";
import type { Express } from "express";
import { storageGetStream } from "../storage";

export function registerStorageProxy(app: Express) {
  /**
   * GET /api/download?key=<storage-key>&name=<filename>
   * Streams the file from Drive server-side (the service account holds
   * the only credential with access) with Content-Disposition: attachment
   * so it downloads directly in the browser.
   */
  app.get("/api/download", async (req, res) => {
    const key = (req.query.key as string || "").replace(/^\/+/, "");
    const name = (req.query.name as string || path.basename(key));

    if (!key) {
      res.status(400).send("Missing key");
      return;
    }

    try {
      const { stream, contentType, size } = await storageGetStream(key);
      const safeFilename = encodeURIComponent(name);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${name}"; filename*=UTF-8''${safeFilename}`);
      res.setHeader("Cache-Control", "no-store");
      if (size) res.setHeader("Content-Length", String(size));

      stream.on("error", (err) => {
        console.error("[DownloadProxy] stream failed:", err);
        if (!res.headersSent) res.status(502).send("Download stream error");
        else res.end();
      });
      stream.pipe(res);
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
      const { stream, contentType, size } = await storageGetStream(key);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store");
      if (size) res.setHeader("Content-Length", String(size));

      stream.on("error", (err) => {
        console.error("[StorageProxy] stream failed:", err);
        if (!res.headersSent) res.status(502).send("Storage stream error");
        else res.end();
      });
      stream.pipe(res);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send(err instanceof Error ? err.message : "Storage proxy error");
    }
  });
}
