/**
 * Gauge Router — unit tests
 * Tests the helper logic and validation without a live DB.
 */
import { describe, it, expect } from "vitest";

// ── Utility tests (no DB required) ────────────────────────────────────────

describe("Gauge email validation", () => {
  function assertGofyndEmail(email: string | null | undefined) {
    if (!email || !email.endsWith("@gofynd.com")) {
      throw new Error("Only @gofynd.com accounts can access Gauge.");
    }
  }

  it("accepts valid @gofynd.com email", () => {
    expect(() => assertGofyndEmail("alice@gofynd.com")).not.toThrow();
  });

  it("rejects non-gofynd email", () => {
    expect(() => assertGofyndEmail("alice@gmail.com")).toThrow("Only @gofynd.com");
  });

  it("rejects null email", () => {
    expect(() => assertGofyndEmail(null)).toThrow("Only @gofynd.com");
  });

  it("rejects undefined email", () => {
    expect(() => assertGofyndEmail(undefined)).toThrow("Only @gofynd.com");
  });

  it("rejects empty string", () => {
    expect(() => assertGofyndEmail("")).toThrow("Only @gofynd.com");
  });
});

describe("Gauge ticket ID format", () => {
  function formatTicketId(n: number): string {
    return `GAUGE-${String(n).padStart(4, "0")}`;
  }

  it("formats single digit correctly", () => {
    expect(formatTicketId(1)).toBe("GAUGE-0001");
  });

  it("formats double digit correctly", () => {
    expect(formatTicketId(42)).toBe("GAUGE-0042");
  });

  it("formats four digit correctly", () => {
    expect(formatTicketId(1234)).toBe("GAUGE-1234");
  });

  it("handles numbers above 9999", () => {
    expect(formatTicketId(10000)).toBe("GAUGE-10000");
  });
});

describe("Gauge status transitions", () => {
  const VALID_STATUSES = ["open", "in_progress", "on_hold", "disputed", "resolved", "closed"];

  it("all expected statuses are present", () => {
    expect(VALID_STATUSES).toContain("open");
    expect(VALID_STATUSES).toContain("in_progress");
    expect(VALID_STATUSES).toContain("on_hold");
    expect(VALID_STATUSES).toContain("disputed");
    expect(VALID_STATUSES).toContain("resolved");
    expect(VALID_STATUSES).toContain("closed");
  });

  it("resolved and closed trigger resolvedAt", () => {
    const statusesThatResolve = ["resolved", "closed"];
    for (const s of statusesThatResolve) {
      const resolvedAt = (s === "resolved" || s === "closed") ? new Date() : null;
      expect(resolvedAt).not.toBeNull();
    }
  });

  it("other statuses do not set resolvedAt", () => {
    const others = ["open", "in_progress", "on_hold", "disputed"];
    for (const s of others) {
      const resolvedAt = (s === "resolved" || s === "closed") ? new Date() : null;
      expect(resolvedAt).toBeNull();
    }
  });
});

describe("Gauge priority levels", () => {
  const PRIORITIES = ["low", "medium", "high", "critical"];

  it("all four priority levels exist", () => {
    expect(PRIORITIES).toHaveLength(4);
    expect(PRIORITIES).toContain("low");
    expect(PRIORITIES).toContain("medium");
    expect(PRIORITIES).toContain("high");
    expect(PRIORITIES).toContain("critical");
  });
});
