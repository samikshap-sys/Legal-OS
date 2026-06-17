/**
 * QueryBee Google OAuth Router
 *
 * Endpoints:
 *   GET  /api/qb/auth/google          — redirect to Google OAuth consent screen
 *   GET  /api/qb/auth/callback        — handle Google callback, enforce @gofynd.com, set cookie
 *   GET  /api/qb/auth/me              — return current QB session user (or 401)
 *   POST /api/qb/auth/logout          — clear QB session cookie
 *
 * Session: JWT signed with QB_SESSION_SECRET, stored in httpOnly cookie "qb_session".
 * Domain enforcement: only @gofynd.com emails are allowed.
 */

import { Router, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { getDb } from "./db";
import { qbSessions, lcSessions, mogamboSessions } from "../drizzle/schema";
import { eq, lt } from "drizzle-orm";
import { ENV } from "./_core/env";

export const qbAuthRouter = Router();

const QB_COOKIE = "qb_session";
const MOGAMBO_COOKIE = "mogambo_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const ALLOWED_DOMAIN = "gofynd.com";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(ENV.qbSessionSecret || "qb-fallback-secret");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function getQbUser(req: Request): Promise<{ email: string; name: string; googleId: string } | null> {
  const token = req.cookies?.[QB_COOKIE];
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

// GET /api/qb/auth/google — start OAuth flow
qbAuthRouter.get("/google", (req: Request, res: Response) => {
  const clientId = ENV.qbGoogleClientId;
  if (!clientId) {
    res.status(500).json({ error: "QB_GOOGLE_CLIENT_ID not configured" });
    return;
  }

   // Determine redirect URI from request origin
  const origin = (req.query.origin as string) || `${req.protocol}://${req.get("host")}`;
  const flow = (req.query.flow as string) || "qb"; // "qb" or "lc"
  const redirectUri = `${origin}/api/qb/auth/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state: Buffer.from(JSON.stringify({ origin, flow })).toString("base64url"),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});;

// GET /api/qb/auth/callback — handle Google callback
qbAuthRouter.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const stateRaw = req.query.state as string;

   let origin = `${req.protocol}://${req.get("host")}`;
  let flow = "qb";
  try {
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
    if (state.origin) origin = state.origin;
    if (state.flow) flow = state.flow;
  } catch { /* ignore */ }
  const redirectUri = `${origin}/api/qb/auth/callback`;
  const isLc = flow === "lc";
  const isMogambo = flow === "mogambo";
  if (!code) {
    if (isMogambo) res.redirect(`${origin}/mogambo?mogambo_error=no_code`);
    else if (isLc) res.redirect(`${origin}/legal-connect?lc_error=no_code`);
    else res.redirect(`${origin}/querybee?qb_error=no_code`);
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
      console.error("[QB Auth] Token exchange failed:", err);
      if (isMogambo) res.redirect(`${origin}/mogambo?mogambo_error=token_exchange`);
      else if (isLc) res.redirect(`${origin}/legal-connect?lc_error=token_exchange`);
      else res.redirect(`${origin}/querybee?qb_error=token_exchange`);
      return;
    }

    const tokens = await tokenResp.json() as { access_token: string; id_token?: string };

    // Fetch user info
    const userResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userResp.ok) {
      if (isMogambo) res.redirect(`${origin}/mogambo?mogambo_error=userinfo`);
      else if (isLc) res.redirect(`${origin}/legal-connect?lc_error=userinfo`);
      else res.redirect(`${origin}/querybee?qb_error=userinfo`);
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
      if (isMogambo) res.redirect(`${origin}/mogambo?mogambo_error=domain_not_allowed&email=${encodeURIComponent(email)}`);
      else if (isLc) res.redirect(`${origin}/legal-connect?lc_error=domain_not_allowed&email=${encodeURIComponent(email)}`);
      else res.redirect(`${origin}/querybee?qb_error=domain_not_allowed&email=${encodeURIComponent(email)}`);
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
    if (isMogambo) {
      // Mogambo flow — set Mogambo cookie and redirect to Mogambo chat
      await db!.insert(mogamboSessions).values({
        id: sessionId,
        email,
        name,
        googleId,
        expiresAt,
      }).onDuplicateKeyUpdate({ set: { email, name, expiresAt } });
      res.cookie(MOGAMBO_COOKIE, jwt, {
        httpOnly: true,
        secure: ENV.isProduction,
        sameSite: ENV.isProduction ? "none" : "lax",
        maxAge: SESSION_TTL_MS,
        path: "/",
      });
      res.redirect(`${origin}/mogambo?mogambo_auth=success`);
    } else if (isLc) {
      // Legal Connect flow — set LC cookie and redirect to LC dashboard
      const LC_COOKIE = "lc_session";
      await db!.insert(lcSessions).values({
        id: sessionId,
        email,
        name,
        googleId,
        expiresAt,
      }).onDuplicateKeyUpdate({ set: { email, name, expiresAt } });
      res.cookie(LC_COOKIE, jwt, {
        httpOnly: true,
        secure: ENV.isProduction,
        sameSite: ENV.isProduction ? "none" : "lax",
        maxAge: SESSION_TTL_MS,
        path: "/",
      });
      res.redirect(`${origin}/legal-connect/dashboard`);
    } else {
      // QueryBee flow — set QB cookie and redirect to QB dashboard
      await db!.insert(qbSessions).values({
        id: sessionId,
        email,
        name,
        googleId,
        expiresAt,
      }).onDuplicateKeyUpdate({ set: { email, name, expiresAt } });
      res.cookie(QB_COOKIE, jwt, {
        httpOnly: true,
        secure: ENV.isProduction,
        sameSite: ENV.isProduction ? "none" : "lax",
        maxAge: SESSION_TTL_MS,
        path: "/",
      });
      res.redirect(`${origin}/querybee/dashboard`);
    }
  } catch (e: any) {
    console.error("[QB Auth] Callback error:", e);
    if (isMogambo) res.redirect(`${origin}/mogambo?mogambo_error=server_error`);
    else if (isLc) res.redirect(`${origin}/legal-connect?lc_error=server_error`);
    else res.redirect(`${origin}/querybee?qb_error=server_error`);
  }
});

// GET /api/qb/auth/me — return current session user
qbAuthRouter.get("/me", async (req: Request, res: Response) => {
  const user = await getQbUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: "Not authenticated" });
    return;
  }
  res.json({ ok: true, user });
});

// POST /api/qb/auth/logout — clear session
qbAuthRouter.post("/logout", async (req: Request, res: Response) => {
  res.clearCookie(QB_COOKIE, { path: "/" });
  res.json({ ok: true });
});
