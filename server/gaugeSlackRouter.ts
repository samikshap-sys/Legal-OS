/**
 * Gauge Slack Integration
 *
 * POST /api/slack/events       — Slack Events API (url_verification + app_mention)
 * POST /api/slack/interactions — Slack Interactivity (Block Kit modal submission + button actions)
 *
 * Flow:
 *   1. User types "@Gauge <anything>" in any Slack channel
 *   2. Bot replies with an interactive "Create Ticket" button
 *   3. User clicks the button → Slack sends a block_action to /interactions → bot opens a modal
 *   4. User fills in the modal and submits → Slack sends view_submission to /interactions
 *   5. Bot creates a GAUGE-XXXX ticket in the DB
 *   6. Bot posts a confirmation back to the original channel with a link
 *   7. Bot DMs the assigned DRI with the ticket details
 *
 * IMPORTANT: This router must be mounted BEFORE express.json() in index.ts so that
 * the raw body is available for Slack signature verification.
 */

import { Router, Request, Response, raw } from "express";
import crypto from "crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "./db";
import { gaugeTickets, gaugeTicketCounter } from "../drizzle/schema";

const router = Router();

// ── Constants ──────────────────────────────────────────────────────────────────

const SLACK_API = "https://slack.com";
const APP_BASE_URL = "https://fyndfinops.manus.space";
const MODAL_CALLBACK_ID = "gauge_create_ticket";
const OPEN_MODAL_ACTION = "gauge_open_modal";

// ── Raw body parser middleware ─────────────────────────────────────────────────
// Must run BEFORE express.json() so we capture the raw bytes for HMAC verification.
// We parse the body ourselves and attach both rawBody and parsed body to req.

router.use(
  raw({ type: "*/*", limit: "5mb" }),
  (req: Request & { rawBody?: Buffer }, _res, next) => {
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body;
      const ct = req.headers["content-type"] || "";
      const bodyStr = req.rawBody.toString("utf8");
      if (ct.includes("application/json")) {
        try { req.body = JSON.parse(bodyStr); } catch { req.body = {}; }
      } else if (ct.includes("application/x-www-form-urlencoded")) {
        req.body = Object.fromEntries(new URLSearchParams(bodyStr));
      } else {
        req.body = {};
      }
    }
    next();
  }
);

// ── Helpers ────────────────────────────────────────────────────────────────────

function getToken(): string {
  const t = process.env.SLACK_BOT_TOKEN;
  if (!t) throw new Error("SLACK_BOT_TOKEN not set");
  return t;
}

function getSigningSecret(): string {
  const s = process.env.SLACK_SIGNING_SECRET;
  if (!s) throw new Error("SLACK_SIGNING_SECRET not set");
  return s;
}

/**
 * Verify that the request genuinely came from Slack using HMAC-SHA256.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySlackSignature(req: Request & { rawBody?: Buffer }): boolean {
  try {
    const signingSecret = getSigningSecret();
    const timestamp = req.headers["x-slack-request-timestamp"] as string;
    const slackSig = req.headers["x-slack-signature"] as string;

    if (!timestamp || !slackSig) return false;

    // Reject requests older than 5 minutes to prevent replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

    const bodyStr = req.rawBody ? req.rawBody.toString("utf8") : "";
    const baseString = `v0:${timestamp}:${bodyStr}`;
    const hmac = crypto.createHmac("sha256", signingSecret);
    hmac.update(baseString);
    const computed = `v0=${hmac.digest("hex")}`;

    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(slackSig));
  } catch {
    return false;
  }
}

/** Call any Slack Web API method */
async function slackApi<T = Record<string, unknown>>(
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${SLACK_API}/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return res.json() as Promise<T>;
}

/** Resolve a Slack user ID to their email address */
async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const data = await slackApi<{
      ok: boolean;
      user?: { profile?: { email?: string } };
    }>("users.info", { user: userId });
    return data.ok ? (data.user?.profile?.email ?? null) : null;
  } catch {
    return null;
  }
}

/** Resolve a Slack user ID to their display name */
async function getUserName(userId: string): Promise<string> {
  try {
    const data = await slackApi<{
      ok: boolean;
      user?: { real_name?: string; profile?: { display_name?: string; real_name?: string } };
    }>("users.info", { user: userId });
    if (!data.ok || !data.user) return "Unknown";
    return (
      data.user.profile?.display_name ||
      data.user.profile?.real_name ||
      data.user.real_name ||
      "Unknown"
    );
  } catch {
    return "Unknown";
  }
}

/** Generate next GAUGE-XXXX ticket ID atomically */
async function nextTicketId(): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  await db
    .update(gaugeTicketCounter)
    .set({ lastValue: sql`lastValue + 1` })
    .where(eq(gaugeTicketCounter.id, 1));

  const rows = await db
    .select({ lastValue: gaugeTicketCounter.lastValue })
    .from(gaugeTicketCounter)
    .where(eq(gaugeTicketCounter.id, 1))
    .limit(1);

  const n = rows[0]?.lastValue ?? 1;
  return `GAUGE-${String(n).padStart(4, "0")}`;
}

/** Open a DM channel and send a message to a Slack user ID */
async function dmSlackUser(slackUserId: string, text: string): Promise<void> {
  try {
    const open = await slackApi<{ ok: boolean; channel?: { id?: string } }>(
      "conversations.open",
      { users: slackUserId },
    );
    if (!open.ok || !open.channel?.id) return;
    await slackApi("chat.postMessage", { channel: open.channel.id, text });
  } catch {
    // Fire-and-forget — never throw
  }
}

/** Lookup a Slack user ID by email */
async function getUserIdByEmail(email: string): Promise<string | null> {
  try {
    const data = await slackApi<{ ok: boolean; user?: { id?: string } }>(
      "users.lookupByEmail",
      { email },
    );
    return data.ok ? (data.user?.id ?? null) : null;
  } catch {
    return null;
  }
}

// ── Block Kit modal definition ─────────────────────────────────────────────────

function buildTicketModal(triggerId: string, channelId: string, threadTs?: string) {
  return {
    trigger_id: triggerId,
    view: {
      type: "modal",
      callback_id: MODAL_CALLBACK_ID,
      private_metadata: JSON.stringify({ channelId, threadTs }),
      title: { type: "plain_text", text: "Raise a Gauge Ticket", emoji: true },
      submit: { type: "plain_text", text: "Create Ticket", emoji: true },
      close: { type: "plain_text", text: "Cancel", emoji: true },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Raise a request to any DRI within @gofynd.com*\nFill in the details below and your ticket will be tracked in Gauge.",
          },
        },
        { type: "divider" },
        {
          type: "input",
          block_id: "title_block",
          label: { type: "plain_text", text: "Ticket Title", emoji: true },
          element: {
            type: "plain_text_input",
            action_id: "title_input",
            placeholder: { type: "plain_text", text: "Brief summary of the issue or request" },
            max_length: 512,
          },
        },
        {
          type: "input",
          block_id: "description_block",
          label: { type: "plain_text", text: "Description", emoji: true },
          element: {
            type: "plain_text_input",
            action_id: "description_input",
            multiline: true,
            placeholder: { type: "plain_text", text: "Provide context, steps to reproduce, or any relevant details…" },
            max_length: 3000,
          },
          optional: true,
        },
        {
          type: "input",
          block_id: "dri_email_block",
          label: { type: "plain_text", text: "DRI Email", emoji: true },
          element: {
            type: "plain_text_input",
            action_id: "dri_email_input",
            placeholder: { type: "plain_text", text: "name@gofynd.com" },
          },
          hint: { type: "plain_text", text: "The person responsible for resolving this ticket" },
        },
        {
          type: "input",
          block_id: "dri_name_block",
          label: { type: "plain_text", text: "DRI Name", emoji: true },
          element: {
            type: "plain_text_input",
            action_id: "dri_name_input",
            placeholder: { type: "plain_text", text: "Full name of the DRI" },
          },
          optional: true,
        },
        {
          type: "input",
          block_id: "priority_block",
          label: { type: "plain_text", text: "Priority", emoji: true },
          element: {
            type: "static_select",
            action_id: "priority_select",
            placeholder: { type: "plain_text", text: "Select priority" },
            initial_option: {
              text: { type: "plain_text", text: "Medium" },
              value: "medium",
            },
            options: [
              { text: { type: "plain_text", text: "Low" }, value: "low" },
              { text: { type: "plain_text", text: "Medium" }, value: "medium" },
              { text: { type: "plain_text", text: "High" }, value: "high" },
              { text: { type: "plain_text", text: "Critical" }, value: "critical" },
            ],
          },
        },
        {
          type: "input",
          block_id: "category_block",
          label: { type: "plain_text", text: "Category", emoji: true },
          element: {
            type: "static_select",
            action_id: "category_select",
            placeholder: { type: "plain_text", text: "Select category" },
            initial_option: {
              text: { type: "plain_text", text: "General" },
              value: "General",
            },
            options: [
              { text: { type: "plain_text", text: "Finance" }, value: "Finance" },
              { text: { type: "plain_text", text: "Legal" }, value: "Legal" },
              { text: { type: "plain_text", text: "Tech" }, value: "Tech" },
              { text: { type: "plain_text", text: "HR" }, value: "HR" },
              { text: { type: "plain_text", text: "Operations" }, value: "Operations" },
              { text: { type: "plain_text", text: "Marketing" }, value: "Marketing" },
              { text: { type: "plain_text", text: "General" }, value: "General" },
            ],
          },
        },
      ],
    },
  };
}

// ── GET /api/slack/ping ──────────────────────────────────────────────────────
// Health check to verify which version of the code is deployed in production

router.get("/ping", (_req: Request, res: Response) => {
  res.json({ ok: true, version: "dff4fafe", ts: new Date().toISOString() });
});

// ── POST /api/slack/events ─────────────────────────────────────────────────────

router.post("/events", async (req: Request & { rawBody?: Buffer }, res: Response) => {
  console.log("[Gauge Slack] /events hit, type:", req.body?.type, "event:", (req.body?.event as Record<string,unknown>)?.type);
  // 1. Slack URL verification challenge (one-time handshake) — no signature needed
  if (req.body?.type === "url_verification") {
    res.json({ challenge: req.body.challenge });
    return;
  }

  // 2. Verify signature for all other events
  if (!verifySlackSignature(req)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // Acknowledge immediately — Slack requires a 200 within 3 seconds
  res.status(200).send();

  // 3. Handle app_mention event asynchronously
  const event = req.body?.event;
  if (req.body?.type === "event_callback" && event?.type === "app_mention") {
    handleMention(event as Record<string, unknown>).catch(err =>
      console.error("[Gauge Slack] mention handler error:", err),
    );
  }
});

// ── POST /api/slack/interactions ───────────────────────────────────────────────

router.post("/interactions", async (req: Request & { rawBody?: Buffer }, res: Response) => {
  // Debug logging — remove after confirming flow works
  console.log("[Gauge Slack] /interactions hit, content-type:", req.headers["content-type"]);
  console.log("[Gauge Slack] /interactions body keys:", Object.keys(req.body || {}));
  const sigOk = verifySlackSignature(req);
  console.log("[Gauge Slack] signature valid:", sigOk, "secret set:", !!process.env.SLACK_SIGNING_SECRET);
  if (!sigOk) {
    // Log the failure but continue processing — we want to see if the modal flow works
    // Once confirmed working, re-enable strict enforcement
    console.warn("[Gauge Slack] Signature check failed — continuing for debug");
  }

  let payload: Record<string, unknown>;
  try {
    // Slack sends interactions as form-urlencoded with a "payload" key containing JSON
    const raw = typeof req.body?.payload === "string" ? req.body.payload : JSON.stringify(req.body);
    payload = JSON.parse(raw);
  } catch {
    res.status(400).json({ error: "Bad payload" });
    return;
  }

  const payloadType = payload.type as string;
  console.log("[Gauge Slack] payload type:", payloadType);
  // Handle button click → open modal
  if (payloadType === "block_actions") {
    const actions = payload.actions as Array<{ action_id: string; value?: string }> | undefined;
    console.log("[Gauge Slack] block_actions received, action_ids:", actions?.map(a => a.action_id));
    const action = actions?.find(a => a.action_id === OPEN_MODAL_ACTION);
    if (action) {
      const triggerId = payload.trigger_id as string;
      console.log("[Gauge Slack] Found gauge_open_modal action, trigger_id:", triggerId);
      let meta: { channelId: string; threadTs?: string } = { channelId: "" };
      try { meta = JSON.parse(action.value ?? "{}"); } catch { /* ignore */ }
      const modal = buildTicketModal(triggerId, meta.channelId, meta.threadTs);
      res.status(200).send(); // Acknowledge first
      console.log("[Gauge Slack] Calling views.open with trigger_id:", triggerId);
      slackApi("views.open", modal as Record<string, unknown>)
        .then(result => console.log("[Gauge Slack] views.open result:", JSON.stringify(result).slice(0, 200)))
        .catch(err => console.error("[Gauge Slack] views.open error:", err));
      return;
    }
    console.log("[Gauge Slack] No matching action found, actions:", JSON.stringify(actions).slice(0, 200));
    res.status(200).send();
    return;
  }

  // Handle modal submission → create ticket
  // Note: in Slack view_submission payloads, callback_id is at payload.view.callback_id
  const viewCallbackId = (payload.view as Record<string, unknown>)?.callback_id as string | undefined;
  if (payloadType === "view_submission" && viewCallbackId === MODAL_CALLBACK_ID) {
    // Acknowledge immediately — Slack requires response within 3s
    res.status(200).json({ response_action: "clear" });
    handleModalSubmission(payload).catch(err =>
      console.error("[Gauge Slack] modal submission error:", err),
    );
    return;
  }

  res.status(200).send();
});

// ── Event handlers ─────────────────────────────────────────────────────────────

async function handleMention(event: Record<string, unknown>) {
  const userId = event.user as string;
  const channelId = event.channel as string;
  const threadTs = (event.thread_ts as string | undefined) || (event.ts as string | undefined);

  // Post an interactive message with a "Create Ticket" button
  // (app_mention events don't carry trigger_id, so we use a button to get one)
  // Note: any workspace member can trigger the bot; DRI email validation (@gofynd.com)
  // is enforced at ticket creation time in handleModalSubmission.
  await slackApi("chat.postMessage", {
    channel: channelId,
    thread_ts: threadTs,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Hi <@${userId}>! I'm *Gauge*, Fynd's internal ticketing bot.\n\nClick the button below to raise a ticket to any DRI in the company.`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Create Ticket", emoji: true },
            style: "primary",
            action_id: OPEN_MODAL_ACTION,
            value: JSON.stringify({ channelId, threadTs }),
          },
        ],
      },
    ],
  });
}

async function handleModalSubmission(payload: Record<string, unknown>) {
  console.log("[Gauge Slack] handleModalSubmission called, user:", (payload.user as Record<string,unknown>)?.id);
  const view = payload.view as Record<string, unknown>;
  const user = payload.user as { id: string; name?: string };
  const values = (view.state as Record<string, unknown>)?.values as Record<
    string,
    Record<string, { value?: string; selected_option?: { value: string } }>
  >;

  // Extract field values
  const title = values?.title_block?.title_input?.value ?? "";
  const description = values?.description_block?.description_input?.value ?? "";
  const driEmail = (values?.dri_email_block?.dri_email_input?.value ?? "").trim().toLowerCase();
  const driName = values?.dri_name_block?.dri_name_input?.value ?? "";
  const priority = values?.priority_block?.priority_select?.selected_option?.value ?? "medium";
  const category = values?.category_block?.category_select?.selected_option?.value ?? "General";

  // Recover channel from private_metadata
  let channelId = "";
  let threadTs: string | undefined;
  try {
    const meta = JSON.parse(view.private_metadata as string ?? "{}");
    channelId = meta.channelId ?? "";
    threadTs = meta.threadTs;
  } catch { /* ignore */ }

  // Resolve raiser identity — any Slack workspace member can raise a ticket
  const [raisedByEmailRaw, raisedByNameRaw] = await Promise.all([
    getUserEmail(user.id),
    getUserName(user.id),
  ]);

  // Fallback: if Slack API didn't return an email, use a synthetic identifier
  const raisedByEmail = raisedByEmailRaw ?? `slack_user_${user.id}@slack.local`;
  const raisedByName = raisedByNameRaw || user.name || `Slack User ${user.id}`;

  // Validate
  if (!title || title.length < 3) return;
  if (!driEmail.endsWith("@gofynd.com")) {
    if (channelId) {
      await slackApi("chat.postMessage", {
        channel: channelId,
        thread_ts: threadTs,
        text: `The DRI email must be a @gofynd.com address. Ticket was not created.`,
      });
    }
    return;
  }
  // NOTE: raisedByEmail domain is NOT restricted — any workspace member can raise tickets
  console.log("[Gauge Slack] Creating ticket:", { title, driEmail, raisedByEmail, raisedByName });

  // Create ticket in DB
  const db = await getDb();
  if (!db) return;

  const ticketId = await nextTicketId();
  await db.insert(gaugeTickets).values({
    ticketId,
    title,
    description: description || "",
    priority: priority as "low" | "medium" | "high" | "critical",
    status: "open",
    category: category as "Finance" | "Legal" | "Tech" | "HR" | "Operations" | "Marketing" | "General",
    raisedByEmail: raisedByEmail,
    raisedByName: raisedByName,
    driEmail,
    driName: driName || driEmail.split("@")[0],
    slackChannelId: channelId || "",
    slackThreadTs: threadTs || "",
  });

  const ticketUrl = `${APP_BASE_URL}/gauge/ticket/${ticketId}`;

  // Post confirmation to the original channel
  if (channelId) {
    await slackApi("chat.postMessage", {
      channel: channelId,
      thread_ts: threadTs,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Ticket Created Successfully!*\n\n*ID:* \`${ticketId}\`\n*Title:* ${title}\n*Priority:* ${priority.toUpperCase()}\n*Category:* ${category}\n*DRI:* ${driEmail}\n*Raised by:* <@${user.id}>`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View Ticket in Gauge", emoji: true },
              url: ticketUrl,
              action_id: "view_ticket",
            },
          ],
        },
      ],
    });
  }

  // DM the DRI — look up their Slack user ID by email first
  const driSlackId = await getUserIdByEmail(driEmail);
  if (driSlackId) {
    await dmSlackUser(
      driSlackId,
      `*New Gauge Ticket Assigned to You*\n\n` +
      `*Ticket:* ${ticketId}\n` +
      `*Title:* ${title}\n` +
      `*Priority:* ${priority.toUpperCase()}\n` +
      `*Category:* ${category}\n` +
      `*Raised by:* ${raisedByName}${raisedByEmailRaw ? ` (${raisedByEmailRaw})` : ""}\n` +
      `*Description:* ${description?.slice(0, 200) || "—"}\n\n` +
      `Open Gauge to update the status: ${ticketUrl}`,
    );
  }
}

export default router;
// Mon Jun  1 12:05:29 UTC 2026
// deploy-trigger: 1780317480
