import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { bqUploadRouter } from "../bqUploadRouter";
import { bqOAuthRouter } from "../bqOAuthRouter";
import { querypadExportRouter } from "../querypadRouter";
import { invoicesDownloadRouter } from "../invoicesDownloadRouter";
import { invoiceExpoRouter } from "../invoiceExpoRouter";
import { qbAuthRouter } from "../qbAuthRouter";
import { lcAuthRouter } from "../lcAuthRouter";
import { lcPdfRouter } from "../lcPdfRouter";
import { brandLedgerRouter } from "../brandLedgerRouter";
import { invoiceFileProxyRouter } from "../invoiceFileProxyRouter";
import mogamboSlackRouter from "../mogamboSlackRouter";
import { mogamboAuthRouter } from "../mogamboAuthRouter";
import { cashfreeRouter } from "../cashfreeRouter";
import { splitterRouter } from "../splitterRouter";
import { poDashboardRouter } from "../poDashboardRouter";
import gaugeSlackRouter from "../gaugeSlackRouter";
import { gaugeAuthRouter } from "../gaugeAuthRouter";
import cookieParser from "cookie-parser";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── Gauge Slack MUST be mounted BEFORE express.json() ──────────────────────
  // The gaugeSlackRouter uses its own raw body parser for Slack HMAC verification.
  // If express.json() runs first, the stream is already consumed and the raw body
  // is lost, causing Slack's url_verification challenge to fail.
  app.use("/api/slack", gaugeSlackRouter);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // QueryBee Google OAuth
  app.use("/api/qb/auth", qbAuthRouter);
  // Legal Connect Google OAuth
  app.use("/api/lc/auth", lcAuthRouter);
  // Legal Connect PDF generation
  app.use("/api/lc/pdf", lcPdfRouter);
  // BQ OAuth — owner-only Connect Google Account flow
  app.use("/api/bq-oauth", bqOAuthRouter);
  // BQ Upload REST API (uses multer for file uploads, not tRPC)
  app.use("/api/bq", bqUploadRouter);
  // Querypad full export REST API
  app.use("/api/querypad", querypadExportRouter);
  // Invoices Download REST API
  app.use("/api/invoice-download", invoicesDownloadRouter);
  // Invoice Expo REST API (GCS → Drive → BQ → Bolt1 → Bolt2)
  app.use("/api/invoice-expo", invoiceExpoRouter);
  // Brand Ledger REST API (Claimable — fynd-db.Outstanding.12_claim_payable)
  app.use("/api/brand-ledger", brandLedgerRouter);
  // Invoice File Proxy (streams Google Drive files for PDF preview)
  app.use("/api/invoice/file", invoiceFileProxyRouter);
  // Mogambo Google OAuth
  app.use("/api/mogambo/auth", mogamboAuthRouter);
  // Gauge Google OAuth
  app.use("/api/gauge/auth", gaugeAuthRouter);
  // Mogambo Slack API (channels list + send conversation)
  app.use("/api/mogambo/slack", mogamboSlackRouter);
  // Cashfree Entry — upload + process + download
  app.use("/api/cashfree", cashfreeRouter);
  // Invoice Splitter — upload + SSE stream + download + history
  app.use("/api/splitter", splitterRouter);
  // PO Dashboard — Purchase Order Final 26-27 Google Sheet
  app.use("/api/po-dashboard", poDashboardRouter);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Allow long-running BQ queries up to 5 minutes
  server.timeout = 5 * 60 * 1000;
  server.requestTimeout = 5 * 60 * 1000;
  server.keepAliveTimeout = 5 * 60 * 1000;
  server.headersTimeout = 5 * 60 * 1000 + 1000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
