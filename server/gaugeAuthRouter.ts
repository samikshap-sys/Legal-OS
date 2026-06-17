/**
 * Gauge Google OAuth Router
 *
 * Endpoints:
 *   GET  /api/gauge/auth/google     — redirect to Google OAuth consent screen
 *   GET  /api/gauge/auth/callback   — handle Google callback, enforce @gofynd.com, set cookie
 *   GET  /api/gauge/auth/me         — return current Gauge session user (or 401)
 *   POST /api/gauge/auth/logout     — clear Gauge session cookie
 *
 * Session: JWT signed with QB_SESSION_SECRET (shared), stored in httpOnly cookie "gauge_session".
 * Domain enforcement: only @gofynd.com emails are allowed.
 */

import { Router, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { getDb } from "./db";
import { gaugeSessions } from "../drizzle/schema";
import { ENV } from "./_core/env";

export const gaugeAuthRouter = Router();

const GAUGE_COOKIE = "gauge_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const ALLOWED_DOMAIN = "gofynd.com";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(ENV.qbSessionSecret || "gauge-fallback-secret");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function isGaugeAdmin(email: string): boolean {
  const adminEmail = (process.env.QB_ADMIN_EMAIL ?? "").toLowerCase().trim();
  return !!adminEmail && email.toLowerCase().trim() === adminEmail;
}

export async function getGaugeUser(req: Request): Promise<{ email: string; name: string; googleId: string; isAdmin: boolean } | null> {
  const token = req.cookies?.[GAUGE_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const email = payload.email as string;
    const name = (payload.name as string) || "";
    const googleId = (payload.googleId as string) || "";
    if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) return null;
    return { email, name, googleId, isAdmin: isGaugeAdmin(email) };
  } catch {
    return null;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/gauge/auth/google — start OAuth flow
gaugeAuthRouter.get("/google", (req: Request, res: Response) => {
  const clientId = ENV.qbGoogleClientId;
  if (!clientId) {
    res.status(500).json({ error: "QB_GOOGLE_CLIENT_ID not configured" });
    return;
  }

  const origin = (req.query.origin as string) || `${req.protocol}://${req.get("host")}`;
  // Optional returnPath so we can redirect back to a specific ticket after login
  const returnPath = (req.query.returnPath as string) || "/gauge/app";
  const redirectUri = `${origin}/api/gauge/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state: Buffer.from(JSON.stringify({ origin, returnPath })).toString("base64url"),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/gauge/auth/callback — handle Google callback
gaugeAuthRouter.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const stateRaw = req.query.state as string;

  let origin = `${req.protocol}://${req.get("host")}`;
  let returnPath = "/gauge/app";
  try {
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
    if (state.origin) origin = state.origin;
    if (state.returnPath) returnPath = state.returnPath;
  } catch { /* ignore */ }

  const redirectUri = `${origin}/api/gauge/auth/callback`;

  if (!code) {
    res.redirect(`${origin}/gauge?gauge_error=no_code`);
    return;
  }

  try {
    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: ENV.qbGoogleClientId,
        client_secret: ENV.qbGoogleClientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      console.error("[Gauge Auth] Token exchange failed:", err);
      res.redirect(`${origin}/gauge?gauge_error=token_exchange`);
      return;
    }

    const tokens = await tokenResp.json() as { access_token: string; id_token?: string };

    // Fetch user info
    const userResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userResp.ok) {
      res.redirect(`${origin}/gauge?gauge_error=userinfo`);
      return;
    }

    const userInfo = await userResp.json() as {
      sub: string;
      email: string;
      name?: string;
      given_name?: string;
    };

    const email: string = userInfo.email || "";
    const name: string = userInfo.name || userInfo.given_name || email.split("@")[0];
    const googleId: string = userInfo.sub;

    // Enforce @gofynd.com domain
    if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
      res.redirect(`${origin}/gauge?gauge_error=domain_not_allowed&email=${encodeURIComponent(email)}`);
      return;
    }

    // Create session JWT
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const jwt = await new SignJWT({ email, name, googleId, sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(getSecret());

    // Persist session to DB
    const db = await getDb();
    await db!.insert(gaugeSessions).values({
      id: sessionId,
      email,
      name,
      googleId,
      expiresAt,
    }).onDuplicateKeyUpdate({ set: { email, name, expiresAt } });

    res.cookie(GAUGE_COOKIE, jwt, {
      httpOnly: true,
      secure: ENV.isProduction,
      sameSite: ENV.isProduction ? "none" : "lax",
      maxAge: SESSION_TTL_MS,
      path: "/",
    });

    // Redirect to the returnPath (e.g. /gauge/app or /gauge/ticket/GAUGE-0001)
    res.redirect(`${origin}${returnPath}`);

  } catch (e: any) {
    console.error("[Gauge Auth] Callback error:", e);
    res.redirect(`${origin}/gauge?gauge_error=server_error`);
  }
});

// GET /api/gauge/auth/me — return current session user
gaugeAuthRouter.get("/me", async (req: Request, res: Response) => {
  const user = await getGaugeUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: "Not authenticated" });
    return;
  }
  res.json({ ok: true, user });
});

// POST /api/gauge/auth/logout — clear session
gaugeAuthRouter.post("/logout", async (req: Request, res: Response) => {
  res.clearCookie(GAUGE_COOKIE, { path: "/" });
  res.json({ ok: true });
});
