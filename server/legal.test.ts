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

describe("legal router", () => {
  it("kpis returns numeric totals", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const kpis = await caller.legal.kpis();
    expect(typeof kpis.total).toBe("number");
    expect(typeof kpis.open_count).toBe("number");
    expect(typeof kpis.closed_count).toBe("number");
    expect(typeof kpis.on_hold_count).toBe("number");
    expect(typeof kpis.pending_count).toBe("number");
    expect(kpis.total).toBeGreaterThan(0);
  });

  it("chartStatus returns an array of status counts", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const data = await caller.legal.chartStatus();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0]).toHaveProperty("status");
    expect(data[0]).toHaveProperty("cnt");
  });

  it("chartRegion returns region breakdown", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const data = await caller.legal.chartRegionStatus();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("recent returns up to 10 contracts", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const data = await caller.legal.recent();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeLessThanOrEqual(10);
  });
});
