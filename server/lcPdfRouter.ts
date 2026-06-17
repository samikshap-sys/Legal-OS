/**
 * Legal Connect — Dashboard PDF generation
 *
 * GET /api/lc/pdf/dashboard
 *   - Requires a valid `lc_session` cookie (same as the Legal Connect auth)
 *   - Launches a headless Chromium browser via @sparticuz/chromium (works in
 *     both local dev and the Manus production container — no system Chromium needed),
 *     navigates to the dashboard, waits for charts to render, captures the
 *     content area as a full-page PDF, and returns it as a PDF attachment.
 */

import { Router, Request, Response } from "express";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { getLcUser } from "./lcAuthRouter";

export const lcPdfRouter = Router();

// GET /api/lc/pdf/dashboard
lcPdfRouter.get("/dashboard", async (req: Request, res: Response) => {
  // 1. Authenticate — must have a valid LC session
  const lcUser = await getLcUser(req);
  if (!lcUser) {
    res.status(401).json({ error: "Unauthorized — please log in to Legal Connect first." });
    return;
  }

  // 2. Determine the local URL of this server so Puppeteer can visit it
  //    Always use localhost to avoid external proxy round-trips.
  const localPort = (req.socket as any)?.localPort || process.env.PORT || 3000;
  const localBaseUrl = `http://localhost:${localPort}`;
  const dashboardUrl = `${localBaseUrl}/legal-connect/dashboard?page=dashboard`;

  // 3. Forward the lc_session cookie so Puppeteer is authenticated
  const lcSessionCookie = req.cookies?.["lc_session"];

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    // Resolve Chromium executable — @sparticuz/chromium extracts its bundled
    // binary to /tmp on first use, which works in all environments including
    // the Manus production container where /usr/bin/chromium is not available.
    const execPath = await chromium.executablePath();

    browser = await puppeteer.launch({
      executablePath: execPath,
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
      headless: true,
    });

    const page = await browser.newPage();

    // Set viewport wide enough for the dashboard layout
    await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 2 });

    // Navigate to the base URL first so we can set cookies for the domain
    await page.goto(`${localBaseUrl}/`, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Inject the lc_session cookie now that we have a page context for localhost
    if (lcSessionCookie) {
      await page.setCookie({
        name: "lc_session",
        value: lcSessionCookie,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        secure: false, // localhost is never https
      });
    }

    // Navigate to the dashboard page with the cookie set
    await page.goto(dashboardUrl, { waitUntil: "networkidle0", timeout: 60000 });

    // Wait for the dashboard content to render (KPI cards + charts)
    await page.waitForSelector(".lc-pg-content", { timeout: 30000 });

    // Give charts extra time to fully render (Recharts animations + data fetch)
    await new Promise((r) => setTimeout(r, 4000));

    // Hide the sidebar and topbar for a clean PDF capture
    await page.evaluate(() => {
      const sidebar = document.querySelector(".lc-sidebar") as HTMLElement | null;
      const topbar = document.querySelector(".lc-topbar") as HTMLElement | null;
      if (sidebar) sidebar.style.display = "none";
      if (topbar) topbar.style.display = "none";

      // Remove the left margin from lc-main since sidebar is hidden
      const main = document.querySelector(".lc-main") as HTMLElement | null;
      if (main) {
        main.style.marginLeft = "0";
        main.style.marginTop = "0";
        main.style.height = "auto";
        main.style.overflow = "visible";
      }

      // Make the shell fill the full viewport height
      const shell = document.querySelector(".lc-shell") as HTMLElement | null;
      if (shell) {
        shell.style.height = "auto";
        shell.style.overflow = "visible";
      }
    });

    // Wait a bit more after DOM manipulation
    await new Promise((r) => setTimeout(r, 500));

    // Get the full height of the content area
    const contentHeight = await page.evaluate(() => {
      const content = document.querySelector(".lc-pg-content") as HTMLElement | null;
      return content ? content.scrollHeight : document.body.scrollHeight;
    });

    console.log(`[lcPdfRouter] Content height: ${contentHeight}px for user ${lcUser.email}`);

    // Resize viewport to match full content height
    await page.setViewport({
      width: 1600,
      height: Math.max(900, contentHeight + 100),
      deviceScaleFactor: 2,
    });

    // Generate PDF with the full page
    const pdfBuffer = await page.pdf({
      width: "1600px",
      height: `${Math.max(900, contentHeight + 100)}px`,
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    });

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="legal-dashboard-${today}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    res.send(Buffer.from(pdfBuffer));
  } catch (err: any) {
    console.error("[lcPdfRouter] PDF generation error:", err);
    res.status(500).json({ error: "PDF generation failed", details: String(err?.message || err) });
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
});
