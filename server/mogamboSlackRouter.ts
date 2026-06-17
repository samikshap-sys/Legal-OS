/**
 * Mogambo Slack API routes
 * GET  /api/mogambo/slack/channels  → list Slack channels/DMs (with timeouts)
 * POST /api/mogambo/slack/send      → post a conversation to a Slack channel
 * GET  /api/mogambo/slack/debug     → verify token health
 */
import { Router, Request, Response } from 'express';

const router = Router();

const SLACK_TIMEOUT_MS = 10_000;

// ── helpers ───────────────────────────────────────────────────────────────────

async function slackGet<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  return res.json() as Promise<T>;
}

async function fetchAllConversations(
  types: string,
  token: string,
): Promise<Array<{ id: string; name: string; user?: string }>> {
  const results: Array<{ id: string; name: string; user?: string }> = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      types,
      limit: '200',
      exclude_archived: 'true',
    });
    if (cursor) params.set('cursor', cursor);

    const data = await slackGet<{
      ok: boolean;
      channels?: Array<{ id: string; name: string; user?: string }>;
      response_metadata?: { next_cursor?: string };
    }>(`https://slack.com/api/conversations.list?${params}`, token);

    if (!data.ok) break;
    results.push(...(data.channels ?? []));
    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return results;
}

async function resolveUserName(userId: string, token: string): Promise<string> {
  try {
    const data = await slackGet<{
      ok: boolean;
      user?: { real_name?: string; name?: string; profile?: { display_name?: string; real_name?: string } };
    }>(`https://slack.com/api/users.info?user=${userId}`, token);
    if (data.ok && data.user) {
      return (
        data.user.profile?.display_name ||
        data.user.real_name ||
        data.user.name ||
        userId
      );
    }
  } catch {
    // fall through
  }
  return userId;
}

// ── GET /api/mogambo/slack/channels ──────────────────────────────────────────

router.get('/channels', async (_req: Request, res: Response) => {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });
  }

  try {
    // Fetch public/private channels and DMs in parallel
    const [publicChannels, privateChannels, ims] = await Promise.all([
      fetchAllConversations('public_channel', token),
      fetchAllConversations('private_channel', token),
      fetchAllConversations('im', token),
    ]);

    const channels: { id: string; name: string; type: 'channel' | 'dm' | 'group' }[] = [];

    // Add public + private channels
    for (const ch of [...publicChannels, ...privateChannels]) {
      channels.push({ id: ch.id, name: `#${ch.name}`, type: 'channel' });
    }

    // Resolve DM user names in parallel (cap at 100 to avoid timeout)
    const imsToResolve = ims.filter((dm) => dm.user).slice(0, 100);
    const dmResolved = await Promise.all(
      imsToResolve.map(async (dm) => {
        const name = await resolveUserName(dm.user!, token);
        return { id: dm.id, name: `@${name}`, type: 'dm' as const };
      }),
    );
    channels.push(...dmResolved);

    // Sort: DMs first (alphabetical), then channels (alphabetical)
    channels.sort((a, b) => {
      const order: Record<string, number> = { dm: 0, group: 1, channel: 2 };
      if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
      return a.name.localeCompare(b.name);
    });

    return res.json({ channels });
  } catch (err) {
    console.error('[mogambo/slack/channels]', err);
    return res.status(500).json({ error: 'Failed to fetch channels' });
  }
});

// ── POST /api/mogambo/slack/send ─────────────────────────────────────────────

interface SlackMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface SendBody {
  channelId: string;
  messages: SlackMessage[];
  note?: string;
  threadTitle?: string;
}

router.post('/send', async (req: Request, res: Response) => {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'SLACK_BOT_TOKEN not configured' });
  }

  const { channelId, messages, note, threadTitle } = req.body as SendBody;

  if (!channelId || !messages?.length) {
    return res.status(400).json({ error: 'channelId and messages are required' });
  }

  // Build Slack Block Kit payload
  const blocks: object[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: threadTitle ? `💬 ${threadTitle}` : '💬 Mogambo Conversation',
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Shared from *Mogambo* · ${new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}`,
        },
      ],
    },
  ];

  if (note) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `📝 *Note:* ${note}` },
    });
  }

  blocks.push({ type: 'divider' });

  for (const msg of messages) {
    const isUser = msg.role === 'user';
    const label = isUser ? '*You*' : '*Mogambo 🤖*';
    const time = new Date(msg.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    // Slack mrkdwn text limit is 3000 chars
    const content =
      msg.content.length > 2900 ? msg.content.slice(0, 2900) + '…' : msg.content;
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${label}  _${time}_\n${content}`,
      },
    });
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: '_Sent via Mogambo · Fynd FinOps_' }],
  });

  // Slack limits 50 blocks per message — split into thread replies if needed
  const BLOCK_LIMIT = 50;
  const chunks: object[][] = [];
  for (let i = 0; i < blocks.length; i += BLOCK_LIMIT) {
    chunks.push(blocks.slice(i, i + BLOCK_LIMIT));
  }

  try {
    let ts: string | undefined;
    for (const chunk of chunks) {
      const payload: Record<string, unknown> = {
        channel: channelId,
        blocks: chunk,
        text: threadTitle || 'Mogambo Conversation',
        unfurl_links: false,
        unfurl_media: false,
      };
      if (ts) payload.thread_ts = ts;

      const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const data = (await slackRes.json()) as { ok: boolean; error?: string; ts?: string };
      if (!data.ok) {
        console.error('[mogambo/slack/send] Slack API error:', data.error);
        return res.status(500).json({ error: data.error ?? 'Slack API error' });
      }
      if (!ts) ts = data.ts;
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[mogambo/slack/send]', err);
    return res.status(500).json({ error: String(err) });
  }
});

// ── GET /api/mogambo/slack/debug ─────────────────────────────────────────────
router.get('/debug', async (_req: Request, res: Response) => {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return res.json({ ok: false, error: 'SLACK_BOT_TOKEN not set', tokenSet: false });
  try {
    const d = await slackGet<{ ok: boolean; error?: string; team?: string; user?: string }>(
      'https://slack.com/api/auth.test',
      token,
    );
    return res.json({ ok: d.ok, team: d.team, user: d.user, error: d.error, tokenPrefix: token.slice(0, 12) + '...' });
  } catch (err) {
    return res.json({ ok: false, error: String(err), tokenPrefix: token.slice(0, 12) + '...' });
  }
});

export default router;
