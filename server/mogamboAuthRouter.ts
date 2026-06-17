/**
 * Mogambo Google OAuth Router
 *
 * Endpoints:
 *   GET  /api/mogambo/auth/google    — redirect to Google OAuth consent screen
 *   GET  /api/mogambo/auth/callback  — handle Google callback, enforce @gofynd.com, set cookie
 *   GET  /api/mogambo/auth/me        — return current Mogambo session user (or 401)
 *   POST /api/mogambo/auth/logout    — clear Mogambo session cookie
 *
 * Session: JWT signed with QB_SESSION_SECRET (shared), stored in httpOnly cookie "mogambo_session".
 * Domain enforcement: only @gofynd.com emails are allowed.
 */
import { Router, Request, Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { getDb } from "./db";
import { mogamboSessions } from "../drizzle/schema";
import { ENV } from "./_core/env";

export const mogamboAuthRouter = Router();

const MOGAMBO_COOKIE = "mogambo_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const ALLOWED_DOMAIN = "gofynd.com";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(ENV.qbSessionSecret || "mogambo-fallback-secret");
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export async function getMogamboUser(req: Request): Promise<{ email: string; name: string; googleId: string } | null> {
  const token = req.cookies?.[MOGAMBO_COOKIE];
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
// GET /api/mogambo/auth/google — proxy to QB auth with flow=mogambo
mogamboAuthRouter.get("/google", (req: Request, res: Response) => {
  const origin = (req.query.origin as string) || `${req.protocol}://${req.get("host")}`;
  res.redirect(`${origin}/api/qb/auth/google?origin=${encodeURIComponent(origin)}&flow=mogambo`);
});

// GET /api/mogambo/auth/callback — handle Google callback
mogamboAuthRouter.get("/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const stateRaw = req.query.state as string;
  let origin = `${req.protocol}://${req.get("host")}`;
  try {
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString());
    if (state.origin) origin = state.origin;
  } catch { /* ignore */ }

  const redirectUri = `${origin}/api/qb/auth/callback`;

  if (!code) {
    res.redirect(`${origin}/mogambo?mogambo_error=no_code`);
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
      console.error("[Mogambo Auth] Token exchange failed:", err);
      res.redirect(`${origin}/mogambo?mogambo_error=token_exchange`);
      return;
    }
    const tokens = await tokenResp.json() as { access_token: string; id_token?: string };

    // Fetch user info
    const userResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userResp.ok) {
      res.redirect(`${origin}/mogambo?mogambo_error=userinfo`);
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
      res.redirect(`${origin}/mogambo?mogambo_error=domain_not_allowed&email=${encodeURIComponent(email)}`);
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
    await db!.insert(mogamboSessions).values({
      id: sessionId,
      email,
      name,
      googleId,
      expiresAt,
    }).onDuplicateKeyUpdate({ set: { email, name, expiresAt } });

    // Set cookie and redirect to Mogambo chat
    res.cookie(MOGAMBO_COOKIE, jwt, {
      httpOnly: true,
      secure: ENV.isProduction,
      sameSite: ENV.isProduction ? "none" : "lax",
      maxAge: SESSION_TTL_MS,
      path: "/",
    });
    // Redirect to /mogambo with a flag to auto-open chat
    res.redirect(`${origin}/mogambo?mogambo_auth=success`);
  } catch (e: unknown) {
    console.error("[Mogambo Auth] Callback error:", e);
    res.redirect(`${origin}/mogambo?mogambo_error=server_error`);
  }
});

// GET /api/mogambo/auth/me — return current session user
mogamboAuthRouter.get("/me", async (req: Request, res: Response) => {
  const user = await getMogamboUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: "Not authenticated" });
    return;
  }
  res.json({ ok: true, user });
});

// POST /api/mogambo/auth/logout — clear session
mogamboAuthRouter.post("/logout", async (_req: Request, res: Response) => {
  res.clearCookie(MOGAMBO_COOKIE, { path: "/" });
  res.json({ ok: true });
});
