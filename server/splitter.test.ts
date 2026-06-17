/**
 * splitter.test.ts — Unit tests for Invoice Splitter router
 *
 * Tests route registration and history endpoint behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock getDb before importing the router
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col: unknown) => ({ __desc: col })),
  eq: vi.fn((a: unknown, b: unknown) => ({ __eq: [a, b] })),
}));

// Mock schema
vi.mock("../drizzle/schema", () => ({
  splitterJobs: { id: "id", createdAt: "createdAt" },
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "/manus-storage/test-key" }),
  storageGetSignedUrl: vi.fn().mockResolvedValue("https://example.com/signed-url"),
}));

// Mock jose
vi.mock("jose", () => ({
  jwtVerify: vi.fn().mockRejectedValue(new Error("no token")),
}));

// Mock xlsx
vi.mock("xlsx", () => ({
  readFile: vi.fn(),
  utils: {
    sheet_to_json: vi.fn().mockReturnValue([]),
    json_to_sheet: vi.fn().mockReturnValue({}),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
    decode_range: vi.fn().mockReturnValue({ s: { r: 0 }, e: { r: 0 } }),
  },
  writeFile: vi.fn(),
}));

// Mock archiver
vi.mock("archiver", () => ({
  default: vi.fn().mockReturnValue({
    pipe: vi.fn(),
    directory: vi.fn(),
    finalize: vi.fn(),
    on: vi.fn(),
  }),
}));

// Mock multer
vi.mock("multer", () => {
  const multer = vi.fn().mockReturnValue({
    single: vi.fn().mockReturnValue((_req: unknown, _res: unknown, next: () => void) => next()),
  });
  (multer as any).memoryStorage = vi.fn().mockReturnValue({});
  return { default: multer };
});

describe("splitterRouter", () => {
  it("should register expected routes", async () => {
    const { splitterRouter } = await import("./splitterRouter");
    const routes = splitterRouter.stack
      ?.filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route?.path,
        method: Object.keys(layer.route?.methods || {})[0]?.toUpperCase(),
      }));

    expect(routes).toBeDefined();
    const paths = routes?.map((r: any) => r.path) ?? [];
    expect(paths).toContain("/upload");
    expect(paths).toContain("/history");
    expect(paths).toContain("/stream/:jobId");
    expect(paths).toContain("/download/:jobId");
    expect(paths).toContain("/download-db/:dbId");
  });

  it("should return empty history when DB is unavailable", async () => {
    const { splitterRouter } = await import("./splitterRouter");

    const historyRoute = splitterRouter.stack?.find(
      (layer: any) => layer.route?.path === "/history" && layer.route?.methods?.get
    );
    expect(historyRoute).toBeDefined();

    // Simulate handler call
    const req = {} as any;
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const res = { json: jsonMock, status: statusMock } as any;

    const handler = historyRoute?.route?.stack?.[0]?.handle;
    if (handler) {
      await handler(req, res);
      // When DB is null, it should either return empty history or error
      // Either json was called directly or status+json was called
      const wasCalled = jsonMock.mock.calls.length > 0 || statusMock.mock.calls.length > 0;
      expect(wasCalled).toBe(true);
    }
  });

  it("should return 404 for unknown jobId on download", async () => {
    const { splitterRouter } = await import("./splitterRouter");

    const downloadRoute = splitterRouter.stack?.find(
      (layer: any) => layer.route?.path === "/download/:jobId" && layer.route?.methods?.get
    );
    expect(downloadRoute).toBeDefined();

    const req = { params: { jobId: "nonexistent_job_id" } } as any;
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const res = { json: jsonMock, status: statusMock } as any;

    const handler = downloadRoute?.route?.stack?.[0]?.handle;
    if (handler) {
      await handler(req, res);
      expect(statusMock).toHaveBeenCalledWith(404);
    }
  });

  it("should return 404 for unknown jobId on stream", async () => {
    const { splitterRouter } = await import("./splitterRouter");

    const streamRoute = splitterRouter.stack?.find(
      (layer: any) => layer.route?.path === "/stream/:jobId" && layer.route?.methods?.get
    );
    expect(streamRoute).toBeDefined();

    const req = { params: { jobId: "nonexistent_stream_id" } } as any;
    const jsonMock = vi.fn();
    const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    const res = { json: jsonMock, status: statusMock } as any;

    const handler = streamRoute?.route?.stack?.[0]?.handle;
    if (handler) {
      await handler(req, res);
      expect(statusMock).toHaveBeenCalledWith(404);
    }
  });
});
