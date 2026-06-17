/**
 * bqOAuth.ts — Shared BigQuery OAuth 2.0 helper
 *
 * The owner does a one-time "Connect Google Account" in QueryBee Settings.
 * The resulting refresh token is stored as BQ_OAUTH_REFRESH_TOKEN.
 * All QueryBee BQ operations use this token transparently — every QueryBee
 * user benefits from the owner's BigQuery access rights.
 *
 * Required env vars:
 *   BQ_OAUTH_CLIENT_ID      — GCP OAuth 2.0 Web Application client ID
 *   BQ_OAUTH_CLIENT_SECRET  — GCP OAuth 2.0 Web Application client secret
 *   BQ_OAUTH_REFRESH_TOKEN  — Stored refresh token from owner's one-time login
 */

import { BigQuery } from "@google-cloud/bigquery";
import { OAuth2Client } from "google-auth-library";
import { ENV } from "./_core/env";

// In-process token cache to avoid refreshing on every request
let _cachedAccessToken: string | null = null;
let _tokenExpiresAt: number = 0;

function makeOAuth2Client(): OAuth2Client {
  const clientId = ENV.bqOAuthClientId;
  const clientSecret = ENV.bqOAuthClientSecret;
  if (!clientId || !clientSecret) {
    throw new Error(
      "BQ_OAUTH_CLIENT_ID and BQ_OAUTH_CLIENT_SECRET are not set. " +
      "Please connect your Google Account in QueryBee Settings."
    );
  }
  return new OAuth2Client(clientId, clientSecret);
}

/**
 * Returns a BigQuery client authenticated with the owner's stored refresh token.
 * Automatically refreshes the access token when it expires.
 *
 * @param projectId - GCP project to bill queries to (parsed from table ID)
 */
export async function getBqClientOAuth(projectId?: string): Promise<BigQuery> {
  const refreshToken = ENV.bqOAuthRefreshToken;
  if (!refreshToken) {
    throw new Error(
      "BQ_OAUTH_REFRESH_TOKEN is not set. " +
      "Please connect your Google Account in QueryBee Settings."
    );
  }

  const oauth2Client = makeOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  // Refresh access token if expired or about to expire (within 60s)
  const now = Date.now();
  if (!_cachedAccessToken || now >= _tokenExpiresAt - 60_000) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    _cachedAccessToken = credentials.access_token!;
    _tokenExpiresAt = credentials.expiry_date ?? now + 3_600_000;
    oauth2Client.setCredentials(credentials);
  } else {
    oauth2Client.setCredentials({
      refresh_token: refreshToken,
      access_token: _cachedAccessToken,
      expiry_date: _tokenExpiresAt,
    });
  }

  return new BigQuery({
    projectId,
    authClient: oauth2Client as any,
  });
}

/**
 * Returns true if all three OAuth env vars are set.
 */
export function isBqOAuthConfigured(): boolean {
  return !!(
    ENV.bqOAuthClientId &&
    ENV.bqOAuthClientSecret &&
    ENV.bqOAuthRefreshToken
  );
}

/**
 * Build the Google OAuth authorization URL for BigQuery scopes.
 * The owner visits this URL once to grant access.
 */
export function getBqOAuthUrl(redirectUri: string, state?: string): string {
  const oauth2Client = makeOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Always get refresh_token
    scope: [
      "https://www.googleapis.com/auth/bigquery",
      "https://www.googleapis.com/auth/cloud-platform",
      "https://www.googleapis.com/auth/devstorage.read_write",
      "email",
      "profile",
    ],
    redirect_uri: redirectUri,
    state,
  });
}

/**
 * Exchange an authorization code for tokens.
 * Returns the refresh token to be stored as BQ_OAUTH_REFRESH_TOKEN.
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ refreshToken: string; email: string }> {
  const oauth2Client = makeOAuth2Client();
  const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri });

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh token returned. " +
      "Make sure you use access_type=offline and prompt=consent."
    );
  }

  oauth2Client.setCredentials(tokens);
  const tokenInfo = await oauth2Client.getTokenInfo(tokens.access_token!);

  return {
    refreshToken: tokens.refresh_token,
    email: tokenInfo.email ?? "unknown",
  };
}
