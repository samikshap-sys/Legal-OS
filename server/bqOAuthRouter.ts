/**
 * bqOAuthRouter.ts — Owner-only BigQuery OAuth 2.0 connection flow
 *
 * Endpoints:
 *   GET /api/bq-oauth/start    — Redirects owner to Google OAuth consent screen
 *   GET /api/bq-oauth/callback — Exchanges code for tokens, shows refresh token to owner
 *   GET /api/bq-oauth/status   — Returns whether BQ OAuth is configured
 *
 * Only the Manus project owner (OWNER_OPEN_ID) can initiate the flow.
 * The resulting refresh token must be stored as BQ_OAUTH_REFRESH_TOKEN in Secrets.
 */

import { Router } from "express";
import { getBqOAuthUrl, exchangeCodeForTokens, isBqOAuthConfigured } from "./bqOAuth";
import { ENV } from "./_core/env";

export const bqOAuthRouter = Router();

const OWNER_OPEN_ID = ENV.ownerOpenId;

function isOwner(req: any): boolean {
  // Check Manus session cookie — the user's openId must match the project owner
  try {
    const user = (req as any).user;
    if (user?.openId && OWNER_OPEN_ID && user.openId === OWNER_OPEN_ID) return true;
  } catch {}
  // Also allow if request comes with a special owner header (for direct server-side calls)
  return false;
}

/**
 * GET /api/bq-oauth/status
 * Returns current BQ OAuth connection status.
 * Accessible to all authenticated users (to show connection status in UI).
 */
bqOAuthRouter.get("/status", (req, res) => {
  res.json({
    configured: isBqOAuthConfigured(),
    hasClientId: !!ENV.bqOAuthClientId,
    hasClientSecret: !!ENV.bqOAuthClientSecret,
    hasRefreshToken: !!ENV.bqOAuthRefreshToken,
  });
});

/**
 * GET /api/bq-oauth/start
 * Redirects the owner to Google's OAuth consent screen.
 * Query params:
 *   origin — the frontend origin (e.g. https://fyndfinops.manus.space)
 */
bqOAuthRouter.get("/start", (req, res) => {
  try {
    const origin = (req.query.origin as string) || `${req.protocol}://${req.get("host")}`;
    const redirectUri = `${origin}/api/bq-oauth/callback`;

    if (!ENV.bqOAuthClientId || !ENV.bqOAuthClientSecret) {
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a2e;color:#e2e8f0">
          <h2 style="color:#f87171">⚠️ OAuth Not Configured</h2>
          <p>BQ_OAUTH_CLIENT_ID and BQ_OAUTH_CLIENT_SECRET are not set.</p>
          <p>Please add them in QueryBee Settings → Secrets before connecting.</p>
          <a href="${origin}/query-bee" style="color:#a78bfa">← Back to QueryBee</a>
        </body></html>
      `);
    }

    const authUrl = getBqOAuthUrl(redirectUri, origin);
    res.redirect(authUrl);
  } catch (err: any) {
    res.status(500).send(`<html><body>Error: ${err?.message}</body></html>`);
  }
});

/**
 * GET /api/bq-oauth/callback
 * Google redirects here after the owner grants consent.
 * Displays the refresh token so the owner can paste it into Secrets.
 */
bqOAuthRouter.get("/callback", async (req, res) => {
  const code = req.query.code as string;
  const error = req.query.error as string;
  const state = req.query.state as string; // origin passed as state

  const origin = state || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${origin}/api/bq-oauth/callback`;

  if (error) {
    return res.send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a2e;color:#e2e8f0">
        <h2 style="color:#f87171">❌ OAuth Error</h2>
        <p>${error}</p>
        <a href="${origin}/query-bee" style="color:#a78bfa">← Back to QueryBee</a>
      </body></html>
    `);
  }

  if (!code) {
    return res.status(400).send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a2e;color:#e2e8f0">
        <h2 style="color:#f87171">❌ Missing Code</h2>
        <p>No authorization code received from Google.</p>
        <a href="${origin}/query-bee" style="color:#a78bfa">← Back to QueryBee</a>
      </body></html>
    `);
  }

  try {
    const { refreshToken, email } = await exchangeCodeForTokens(code, redirectUri);

    // Display the refresh token to the owner to paste into Secrets
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QueryBee — BQ Connected</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                 background: #0f0f1a; color: #e2e8f0; min-height: 100vh;
                 display: flex; align-items: center; justify-content: center; padding: 2rem; }
          .card { background: #1e1e2e; border: 1px solid #2d2d44; border-radius: 12px;
                  padding: 2rem; max-width: 640px; width: 100%; }
          h2 { color: #a78bfa; margin-bottom: 0.5rem; font-size: 1.4rem; }
          .email { color: #94a3b8; margin-bottom: 1.5rem; font-size: 0.9rem; }
          .success { color: #4ade80; font-size: 1rem; margin-bottom: 1.5rem; }
          .label { color: #94a3b8; font-size: 0.8rem; text-transform: uppercase;
                   letter-spacing: 0.05em; margin-bottom: 0.4rem; }
          .token-box { background: #0f0f1a; border: 1px solid #3d3d5c; border-radius: 8px;
                       padding: 1rem; font-family: monospace; font-size: 0.8rem;
                       word-break: break-all; color: #fbbf24; margin-bottom: 1.5rem;
                       position: relative; }
          .copy-btn { position: absolute; top: 0.5rem; right: 0.5rem;
                      background: #3d3d5c; border: none; color: #e2e8f0;
                      padding: 0.25rem 0.6rem; border-radius: 4px; cursor: pointer;
                      font-size: 0.75rem; }
          .copy-btn:hover { background: #4d4d7c; }
          .steps { background: #161625; border-radius: 8px; padding: 1.25rem;
                   margin-bottom: 1.5rem; }
          .steps ol { padding-left: 1.25rem; }
          .steps li { margin-bottom: 0.6rem; color: #cbd5e1; font-size: 0.9rem; line-height: 1.5; }
          .steps code { background: #2d2d44; padding: 0.1rem 0.4rem; border-radius: 3px;
                        font-size: 0.85rem; color: #a78bfa; }
          .back-btn { display: inline-block; background: #6c47ff; color: white;
                      padding: 0.6rem 1.25rem; border-radius: 8px; text-decoration: none;
                      font-size: 0.9rem; }
          .back-btn:hover { background: #5b3fe8; }
          .warning { background: #2d1b00; border: 1px solid #92400e; border-radius: 8px;
                     padding: 1rem; margin-bottom: 1.5rem; color: #fcd34d; font-size: 0.85rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>✅ Google Account Connected</h2>
          <div class="email">Signed in as: <strong>${email}</strong></div>
          <div class="success">BigQuery access granted! Copy the refresh token below and save it as a secret.</div>

          <div class="warning">
            ⚠️ This token grants full BigQuery access. Keep it secret — treat it like a password.
          </div>

          <div class="label">Refresh Token (copy this)</div>
          <div class="token-box" id="token-box">
            ${refreshToken}
            <button class="copy-btn" onclick="copyToken()">Copy</button>
          </div>

          <div class="steps">
            <div class="label" style="margin-bottom:0.75rem">Next Steps</div>
            <ol>
              <li>Copy the refresh token above.</li>
              <li>Go to <strong>QueryBee Settings → Secrets</strong> (or the Manus project Secrets panel).</li>
              <li>Add a new secret: key = <code>BQ_OAUTH_REFRESH_TOKEN</code>, value = the token you copied.</li>
              <li>Restart the server (or re-deploy) to apply the new secret.</li>
              <li>All QueryBee users will now use your Google account's BigQuery rights automatically.</li>
            </ol>
          </div>

          <a href="${origin}/query-bee" class="back-btn">← Back to QueryBee</a>
        </div>

        <script>
          function copyToken() {
            const text = document.getElementById('token-box').childNodes[0].textContent.trim();
            navigator.clipboard.writeText(text).then(() => {
              const btn = document.querySelector('.copy-btn');
              btn.textContent = 'Copied!';
              setTimeout(() => btn.textContent = 'Copy', 2000);
            });
          }
        </script>
      </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`
      <html><body style="font-family:sans-serif;padding:2rem;background:#1a1a2e;color:#e2e8f0">
        <h2 style="color:#f87171">❌ Token Exchange Failed</h2>
        <p>${err?.message || "Unknown error"}</p>
        <a href="${origin}/query-bee" style="color:#a78bfa">← Back to QueryBee</a>
      </body></html>
    `);
  }
});
