/**
 * Gauge Slack Integration — Unit Tests
 * Tests signature verification logic, modal payload parsing, and env validation.
 */
import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";

// ── Helpers replicated from gaugeSlackRouter for unit testing ──────────────────

function computeSlackSignature(signingSecret: string, timestamp: string, body: string): string {
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(baseString);
  return `v0=${hmac.digest("hex")}`;
}

function isValidSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  providedSig: string,
): boolean {
  const computed = computeSlackSignature(signingSecret, timestamp, body);
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(providedSig));
  } catch {
    return false;
  }
}

function isReplayAttack(timestamp: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - parseInt(timestamp, 10)) > 300;
}

function formatTicketId(n: number): string {
  return `GAUGE-${String(n).padStart(4, "0")}`;
}

function isGofyndEmail(email: string): boolean {
  return typeof email === "string" && email.endsWith("@gofynd.com");
}

function extractModalValues(values: Record<string, Record<string, { value?: string; selected_option?: { value: string } }>>) {
  return {
    title: values?.title_block?.title_input?.value ?? "",
    description: values?.description_block?.description_input?.value ?? "",
    driEmail: (values?.dri_email_block?.dri_email_input?.value ?? "").trim().toLowerCase(),
    driName: values?.dri_name_block?.dri_name_input?.value ?? "",
    priority: values?.priority_block?.priority_select?.selected_option?.value ?? "medium",
    category: values?.category_block?.category_select?.selected_option?.value ?? "General",
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Gauge Slack — Signature Verification", () => {
  const SECRET = "test_signing_secret_abc123";

  it("accepts a valid signature", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{"type":"event_callback"}';
    const sig = computeSlackSignature(SECRET, ts, body);
    expect(isValidSignature(SECRET, ts, body, sig)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{"type":"event_callback"}';
    const sig = computeSlackSignature(SECRET, ts, body);
    const tamperedBody = '{"type":"malicious_payload"}';
    expect(isValidSignature(SECRET, ts, tamperedBody, sig)).toBe(false);
  });

  it("rejects a wrong signing secret", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const body = '{"type":"event_callback"}';
    const sig = computeSlackSignature("wrong_secret", ts, body);
    expect(isValidSignature(SECRET, ts, body, sig)).toBe(false);
  });

  it("rejects a replay attack (timestamp > 5 minutes old)", () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 400); // 400s ago
    expect(isReplayAttack(oldTs)).toBe(true);
  });

  it("accepts a fresh timestamp", () => {
    const freshTs = String(Math.floor(Date.now() / 1000) - 60); // 60s ago
    expect(isReplayAttack(freshTs)).toBe(false);
  });
});

describe("Gauge Slack — Ticket ID Format", () => {
  it("formats single digit as GAUGE-0001", () => {
    expect(formatTicketId(1)).toBe("GAUGE-0001");
  });

  it("formats double digit as GAUGE-0042", () => {
    expect(formatTicketId(42)).toBe("GAUGE-0042");
  });

  it("formats triple digit as GAUGE-0123", () => {
    expect(formatTicketId(123)).toBe("GAUGE-0123");
  });

  it("formats four digit as GAUGE-1234", () => {
    expect(formatTicketId(1234)).toBe("GAUGE-1234");
  });
});

describe("Gauge Slack — Email Validation", () => {
  it("accepts @gofynd.com emails", () => {
    expect(isGofyndEmail("ninad@gofynd.com")).toBe(true);
    expect(isGofyndEmail("test.user@gofynd.com")).toBe(true);
  });

  it("rejects non-gofynd emails", () => {
    expect(isGofyndEmail("user@gmail.com")).toBe(false);
    expect(isGofyndEmail("user@fynd.com")).toBe(false);
    expect(isGofyndEmail("")).toBe(false);
  });

  it("rejects emails that contain but don't end with @gofynd.com", () => {
    expect(isGofyndEmail("user@gofynd.com.evil.com")).toBe(false);
  });
});

describe("Gauge Slack — Modal Payload Parsing", () => {
  const sampleValues = {
    title_block: { title_input: { value: "Fix the BQ pipeline" } },
    description_block: { description_input: { value: "The pipeline fails every Monday morning." } },
    dri_email_block: { dri_email_input: { value: "  Ninad@gofynd.com  " } },
    dri_name_block: { dri_name_input: { value: "Ninad Mandavkar" } },
    priority_block: { priority_select: { selected_option: { value: "high" } } },
    category_block: { category_select: { selected_option: { value: "Tech" } } },
  };

  it("extracts all fields correctly", () => {
    const result = extractModalValues(sampleValues);
    expect(result.title).toBe("Fix the BQ pipeline");
    expect(result.description).toBe("The pipeline fails every Monday morning.");
    expect(result.driEmail).toBe("ninad@gofynd.com"); // trimmed + lowercased
    expect(result.driName).toBe("Ninad Mandavkar");
    expect(result.priority).toBe("high");
    expect(result.category).toBe("Tech");
  });

  it("defaults priority to medium when missing", () => {
    const values = { ...sampleValues, priority_block: { priority_select: {} } };
    const result = extractModalValues(values as typeof sampleValues);
    expect(result.priority).toBe("medium");
  });

  it("defaults category to General when missing", () => {
    const values = { ...sampleValues, category_block: { category_select: {} } };
    const result = extractModalValues(values as typeof sampleValues);
    expect(result.category).toBe("General");
  });

  it("trims and lowercases DRI email", () => {
    const values = {
      ...sampleValues,
      dri_email_block: { dri_email_input: { value: "  JOHN.DOE@GOFYND.COM  " } },
    };
    const result = extractModalValues(values as typeof sampleValues);
    expect(result.driEmail).toBe("john.doe@gofynd.com");
  });
});

describe("Gauge Slack — Env Variables", () => {
  it("SLACK_BOT_TOKEN is set and non-empty", () => {
    const token = process.env.SLACK_BOT_TOKEN;
    expect(token).toBeTruthy();
    expect(token?.startsWith("xoxb-")).toBe(true);
  });

  it("SLACK_SIGNING_SECRET is set and non-empty", () => {
    const secret = process.env.SLACK_SIGNING_SECRET;
    expect(secret).toBeTruthy();
    expect(secret?.length).toBeGreaterThan(10);
  });
});
