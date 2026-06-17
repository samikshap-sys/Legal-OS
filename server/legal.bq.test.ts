/**
 * Tests for Legal Connect request procedures
 * (migrated from BigQuery to MySQL/TiDB via Drizzle ORM)
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("legal request procedures (MySQL)", () => {
  it("getRequests returns an array", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const data = await caller.legal.getRequests();
    expect(Array.isArray(data)).toBe(true);
  });

  it("getRequests rows have expected fields", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const data = await caller.legal.getRequests();
    if (data.length > 0) {
      const row = data[0];
      expect(row).toHaveProperty("request_id");
      expect(row).toHaveProperty("requester_name");
      expect(row).toHaveProperty("current_status");
      expect(row).toHaveProperty("history_json");
      expect(typeof row.request_id).toBe("string");
      expect(row.request_id).toMatch(/^LGL-\d{4}$/);
    }
  });

  it("getRequests returns rows ordered by submitted_at DESC", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const data = await caller.legal.getRequests();
    if (data.length >= 2) {
      const t1 = new Date(data[0].submitted_at).getTime();
      const t2 = new Date(data[1].submitted_at).getTime();
      expect(t1).toBeGreaterThanOrEqual(t2);
    }
  });

  it("legalBigQuery.ts does not import @google-cloud/bigquery", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("./legalBigQuery.ts", import.meta.url).pathname,
      "utf-8"
    );
    expect(content).not.toContain("@google-cloud/bigquery");
    expect(content).not.toContain("getBigQueryClient");
    expect(content).toContain("getDb");
    expect(content).toContain("lcRequests");
  });
});
