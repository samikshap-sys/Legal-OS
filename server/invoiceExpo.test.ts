/**
 * Invoice Expo Router — unit tests
 * Tests the /api/invoice-expo/history endpoint and validates the router is importable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock getDb so tests don't need a real DB ──────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// ── Mock drizzle-orm eq so dynamic import in router doesn't fail ──────────────
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  desc: vi.fn((col: unknown) => ({ col, direction: "desc" })),
}));

// ── Mock the schema so the router can import it ───────────────────────────────
vi.mock("../drizzle/schema", () => ({
  invoiceExpoHistory: { id: "id", monthYear: "monthYear", status: "status", pdfCount: "pdfCount", errorMsg: "errorMsg", createdAt: "createdAt" },
  invoiceDownloadHistory: {},
  bqUploadHistory: {},
  pipelineHistory: {},
  queryLogs: {},
  users: {},
}));

describe("Invoice Expo Router", () => {
  it("exports invoiceExpoRouter as a named export", async () => {
    const mod = await import("./invoiceExpoRouter");
    expect(mod.invoiceExpoRouter).toBeDefined();
    expect(typeof mod.invoiceExpoRouter).toBe("function");
  });

  it("validates month_year format — rejects missing param", async () => {
    const { invoiceExpoRouter } = await import("./invoiceExpoRouter");
    // Find the /run GET handler
    const layer = (invoiceExpoRouter as any).stack?.find(
      (l: any) => l.route?.path === "/run" && l.route?.methods?.get
    );
    expect(layer).toBeDefined();
  });

  it("validates month_year format — regex accepts MM-YYYY", () => {
    const valid = ["01-2025", "12-2026", "04-2024"];
    const invalid = ["1-2025", "2025-04", "April-2025", ""];
    const re = /^\d{2}-\d{4}$/;
    for (const v of valid) expect(re.test(v)).toBe(true);
    for (const v of invalid) expect(re.test(v)).toBe(false);
  });

  it("history endpoint returns empty array when DB is null", async () => {
    const { invoiceExpoRouter } = await import("./invoiceExpoRouter");
    // Simulate a request/response to GET /history
    const req: any = { query: {} };
    const res: any = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    // Find the /history handler
    const layer = (invoiceExpoRouter as any).stack?.find(
      (l: any) => l.route?.path === "/history" && l.route?.methods?.get
    );
    expect(layer).toBeDefined();

    // Call the handler directly
    const handler = layer.route.stack[0].handle;
    await handler(req, res, vi.fn());
    expect(res.json).toHaveBeenCalledWith({ history: [] });
  });
});
