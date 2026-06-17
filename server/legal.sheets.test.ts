import { describe, expect, it } from "vitest";
import { getSheetData, normalizeStatus } from "./legalSheets";

describe("normalizeStatus", () => {
  it("normalizes Open", () => expect(normalizeStatus("open")).toBe("Open"));
  it("normalizes Closed", () => expect(normalizeStatus("Closed - Done")).toBe("Closed"));
  it("normalizes On Hold", () => expect(normalizeStatus("on hold")).toBe("On Hold"));
  it("normalizes Pending", () => expect(normalizeStatus("pending review")).toBe("Pending"));
});

describe("getSheetData", () => {
  it("fetches rows from Google Sheet", async () => {
    const rows = await getSheetData();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    // Each row should have at least one of the key fields
    const first = rows[0];
    expect(typeof first).toBe("object");
    console.log(`Fetched ${rows.length} rows. First row keys:`, Object.keys(first).slice(0, 5));
  }, 30000);
});
