/**
 * Validates BQ_SERVICE_ACCOUNT_JSON is set and can obtain a BigQuery OAuth token
 */
import { describe, it, expect } from "vitest";

describe("BQ_SERVICE_ACCOUNT_JSON", () => {
  it("should be set and parseable", () => {
    const raw = process.env.BQ_SERVICE_ACCOUNT_JSON;
    expect(raw, "BQ_SERVICE_ACCOUNT_JSON env var must be set").toBeTruthy();
    const creds = JSON.parse(raw!);
    expect(creds.type).toBe("service_account");
    expect(creds.project_id).toBe("fynd-db");
    expect(creds.client_email).toBe("plan-maker@fynd-db.iam.gserviceaccount.com");
    expect(creds.private_key).toContain("BEGIN PRIVATE KEY");
  });

  it("should obtain a valid BigQuery OAuth token", async () => {
    const raw = process.env.BQ_SERVICE_ACCOUNT_JSON!;
    const creds = JSON.parse(raw);
    const { SignJWT, importPKCS8 } = await import("jose");
    const privateKey = await importPKCS8(creds.private_key, "RS256");
    const now = Math.floor(Date.now() / 1000);
    const jwt = await new SignJWT({
      iss: creds.client_email,
      sub: creds.client_email,
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/bigquery",
      iat: now,
      exp: now + 3600,
    })
      .setProtectedHeader({ alg: "RS256" })
      .sign(privateKey);

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const body = await resp.json() as any;
    expect(resp.ok, `Token fetch failed: ${resp.status} ${JSON.stringify(body)}`).toBe(true);
    expect(body.access_token).toBeTruthy();
  }, 30000);
});
