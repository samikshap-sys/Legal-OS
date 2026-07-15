/**
 * Legal Connect Google OAuth Router
 *
 * Endpoints:
 *   GET  /api/lc/auth/google          — redirect to Google OAuth consent screen
 *   GET  /api/lc/auth/callback        — handle Google callback, enforce @gofynd.com, set cookie
 *   GET  /api/lc/auth/me              — return current LC session user (or 401)
 *   POST /api/lc/auth/logout          — clear LC session cookie
 *
 * Session: JWT signed with QB_SESSION_SECRET (reused), stored in httpOnly cookie "lc_session".
 * Domain enforcement: only @gofynd.com emails are allowed.
 * Reuses the same Google OAuth client credentials as QueryBee (same app, different cookie).
 */
import { Router, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { getDb } from "./db";
import { lcSessions } from "../drizzle/schema";
import { ENV } from "./_core/env";

export const lcAuthRouter = Router();

const LC_COOKIE = "lc_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ALLOWED_DOMAIN = "gofynd.com";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(ENV.qbSessionSecret || "lc-fallback-secret");
}

// ── Helper: extract LC user from cookie ──────────────────────────────────────
export async function getLcUser(req: Request): Promise<{ email: string; name: string; googleId: string } | null> {
  const token = req.cookies?.[LC_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const email = payload.email as string;
    const name = (payload.name as string) || "";
    const googleId = (payload.googleId as string) || "";
    if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) return null;
    return { email, name, googleId };
  } catch {
    return null;
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/lc/auth/google — start OAuth flow
lcAuthRouter.get("/google", (req: Request, res: Response) => {
  const clientId = ENV.qbGoogleClientId;
  if (!clientId) {
    res.status(500).json({ error: "QB_GOOGLE_CLIENT_ID not configured" });
    return;
  }
  const origin = (req.query.origin as string) || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${origin}/api/lc/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state: Buffer.from(JSON.stringify({ origin })).toString("base64url"),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/lc/auth/callback — handle Google callback
lcAuthRouter.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const stateRaw = req.query.state as string;
  let origin = `${req.protocol}://${req.get("host")}`;
  try {
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
    if (state.origin) origin = state.origin;
  } catch { /* ignore */ }
  const redirectUri = `${origin}/api/lc/auth/callback`;
  if (!code) {
    res.redirect(`${origin}/legal-connect?lc_error=no_code`);
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
      console.error("[LC Auth] Token exchange failed:", err);
      res.redirect(`${origin}/legal-connect?lc_error=token_exchange`);
      return;
    }
    const tokens = await tokenResp.json() as { access_token: string; id_token?: string };
    // Fetch user info
    const userResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userResp.ok) {
      res.redirect(`${origin}/legal-connect?lc_error=userinfo`);
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
      res.redirect(`${origin}/legal-connect?lc_error=domain_not_allowed&email=${encodeURIComponent(email)}`);
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
    const sessionToken = randomUUID();
    await db!.insert(lcSessions).values({
      id: sessionId,
      email,
      name,
      googleId,
      sessionToken,
      expiresAt,
    }).onConflictDoUpdate({ target: lcSessions.id, set: { email, name, expiresAt, sessionToken } });
    // Set cookie
    res.cookie(LC_COOKIE, jwt, {
      httpOnly: true,
      secure: ENV.isProduction,
      sameSite: ENV.isProduction ? "none" : "lax",
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
    res.redirect(`${origin}/legal-connect/dashboard`);
  } catch (e: any) {
    console.error("[LC Auth] Callback error:", e);
    res.redirect(`${origin}/legal-connect?lc_error=server_error`);
  }
});

// GET /api/lc/auth/me — return current session user
lcAuthRouter.get("/me", async (req: Request, res: Response) => {
  const user = await getLcUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: "Not authenticated" });
    return;
  }
  res.json({ ok: true, user });
});

// POST /api/lc/auth/logout — clear session
lcAuthRouter.post("/logout", async (req: Request, res: Response) => {
  res.clearCookie(LC_COOKIE, { path: "/" });
  res.json({ ok: true });
});
