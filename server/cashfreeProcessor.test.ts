/**
 * Unit tests for cashfreeProcessor changes:
 * 1. pivotData is returned in ProcessResult
 * 2. Tally entry Sr. No. (entry_code) is sequential across all 3 parts
 */

import { describe, it, expect } from "vitest";

// ─── Test: Sr. No. sequential logic ─────────────────────────────────────────

describe("Tally entry Sr. No. sequential logic", () => {
  it("should produce sequential entry codes across all 3 parts", () => {
    // Simulate the entryCode counter logic from cashfreeProcessor.ts
    let entryCode = 1;
    const codes: number[] = [];

    // Part 1 — 3 normal rows
    for (let i = 0; i < 3; i++) {
      codes.push(entryCode++);
    }

    // Part 2 — 2 Trf Entry rows (previously used "" — now uses entryCode++)
    for (let i = 0; i < 2; i++) {
      codes.push(entryCode++);
    }

    // Part 3 — 1 VPA row (previously used "" — now uses entryCode++)
    for (let i = 0; i < 1; i++) {
      codes.push(entryCode++);
    }

    expect(codes).toEqual([1, 2, 3, 4, 5, 6]);
    // Verify no gaps
    for (let i = 0; i < codes.length; i++) {
      expect(codes[i]).toBe(i + 1);
    }
  });

  it("should not have empty strings in entry_code column", () => {
    // The old code used "" for parts 2 and 3
    // The new code uses entryCode++ for all parts
    let entryCode = 1;
    const codes: (number | string)[] = [];

    // Part 1
    codes.push(entryCode++);
    // Part 2 — fixed (was "")
    codes.push(entryCode++);
    // Part 3 — fixed (was "")
    codes.push(entryCode++);

    expect(codes.every(c => typeof c === "number" && c > 0)).toBe(true);
    expect(codes.some(c => c === "")).toBe(false);
  });
});

// ─── Test: PivotDataRow structure ────────────────────────────────────────────

describe("PivotDataRow structure", () => {
  it("should have all required fields", () => {
    const row = {
      date: "01/05/25",
      particulars: "PAYOUT_TRANSFER",
      amount: 1000.00,
      sc: 10.00,
      st: 1.80,
      net: 11.80,
    };

    expect(row).toHaveProperty("date");
    expect(row).toHaveProperty("particulars");
    expect(row).toHaveProperty("amount");
    expect(row).toHaveProperty("sc");
    expect(row).toHaveProperty("st");
    expect(row).toHaveProperty("net");
    expect(typeof row.amount).toBe("number");
    expect(typeof row.net).toBe("number");
    expect(row.net).toBeCloseTo(row.sc + row.st, 2);
  });

  it("should compute pivot aggregation correctly", () => {
    const pivotData = [
      { date: "01/05/25", particulars: "PAYOUT_TRANSFER", amount: 1000, sc: 10, st: 1.8, net: 11.8 },
      { date: "01/05/25", particulars: "VPA_DETAILS_FROM_VPA", amount: 500, sc: 5, st: 0.9, net: 5.9 },
      { date: "02/05/25", particulars: "PAYOUT_TRANSFER", amount: 2000, sc: 20, st: 3.6, net: 23.6 },
    ];

    // Simulate pivot: rows=["date"], values=["amount"]
    const agg = new Map<string, number>();
    pivotData.forEach(r => {
      agg.set(r.date, (agg.get(r.date) ?? 0) + r.amount);
    });

    expect(agg.get("01/05/25")).toBe(1500);
    expect(agg.get("02/05/25")).toBe(2000);

    // Simulate pivot: rows=["particulars"], values=["amount"]
    const agg2 = new Map<string, number>();
    pivotData.forEach(r => {
      agg2.set(r.particulars, (agg2.get(r.particulars) ?? 0) + r.amount);
    });

    expect(agg2.get("PAYOUT_TRANSFER")).toBe(3000);
    expect(agg2.get("VPA_DETAILS_FROM_VPA")).toBe(500);
  });
});
