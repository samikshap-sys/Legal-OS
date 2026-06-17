/**
 * mogamboBigQuery.ts — BigQuery data layer for Mogambo conversation memory
 *
 * Table: fynd-db.finance_dwh.mogambo_conversations
 * Columns: conversation_id, user_email, user_name, role, message,
 *          message_index, created_at (TIMESTAMP), session_date (DATE)
 */

import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = 'fynd-db';
const DATASET = 'finance_dwh';
const TABLE = 'mogambo_conversations';
const FULL_TABLE = `\`${PROJECT_ID}.${DATASET}.${TABLE}\``;

function getBigQueryClient(): BigQuery {
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!saJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  const credentials = JSON.parse(saJson);
  return new BigQuery({ projectId: PROJECT_ID, credentials });
}

export interface ConversationMessage {
  conversation_id: string;
  user_email: string;
  user_name: string;
  role: 'user' | 'assistant';
  message: string;
  message_index: number;
  created_at: string;
  session_date: string;
}

/**
 * Insert a single message row into mogambo_conversations.
 * message_index is auto-derived as (current max + 1) for the conversation.
 * Uses streaming insert (insertRows) which is more reliable than DML for single rows.
 */
export async function saveConversationMessage(params: {
  conversation_id: string;
  user_email: string;
  user_name: string;
  role: 'user' | 'assistant';
  message: string;
}): Promise<void> {
  const bq = getBigQueryClient();

  // Get current max message_index for this conversation
  let messageIndex = 1;
  try {
    const countQuery = `
      SELECT COALESCE(MAX(message_index), 0) AS max_idx
      FROM ${FULL_TABLE}
      WHERE conversation_id = @conversation_id
    `;
    const [countRows] = await bq.query({
      query: countQuery,
      params: { conversation_id: params.conversation_id },
    });
    messageIndex = Number(countRows[0]?.max_idx ?? 0) + 1;
  } catch (countErr) {
    console.warn('[BQ] Could not get max message_index, defaulting to 1:', countErr);
  }

  const now = new Date();
  // Use streaming insert (insertRows) — avoids DML type casting issues
  const dataset = bq.dataset(DATASET);
  const table = dataset.table(TABLE);

  const row = {
    conversation_id: params.conversation_id,
    user_email: params.user_email,
    user_name: params.user_name || '',
    role: params.role,
    message: params.message,
    message_index: messageIndex,
    // BigQuery streaming insert accepts ISO strings for TIMESTAMP and DATE
    created_at: now.toISOString().replace('T', ' ').replace('Z', ' UTC'),
    session_date: now.toISOString().slice(0, 10),
  };

  console.log('[BQ] Inserting row:', JSON.stringify({ ...row, message: row.message.slice(0, 50) + '...' }));

  const [apiResponse] = await table.insert([row], { skipInvalidRows: false, ignoreUnknownValues: false });
  console.log('[BQ] Insert response:', JSON.stringify(apiResponse ?? 'OK'));
}

/**
 * Fetch all messages for a given conversation, ordered by message_index.
 * Returns them as { role, content } pairs ready for LLM context injection.
 */
export async function getConversationHistory(conversation_id: string): Promise<
  Array<{ role: 'user' | 'assistant'; content: string; created_at: string }>
> {
  const bq = getBigQueryClient();

  const query = `
    SELECT role, message AS content, CAST(created_at AS STRING) AS created_at
    FROM ${FULL_TABLE}
    WHERE conversation_id = @conversation_id
    ORDER BY message_index ASC
  `;

  const [rows] = await bq.query({
    query,
    params: { conversation_id },
  });

  return (rows as Array<{ role: string; content: string; created_at: string }>).map((r) => ({
    role: r.role as 'user' | 'assistant',
    content: r.content,
    created_at: r.created_at,
  }));
}

/**
 * Fetch distinct conversations (threads) for a user, ordered by most recent activity.
 * Returns conversation_id, title (first user message), and last_active timestamp.
 * Used to restore the sidebar thread list on page load.
 */
export async function getUserThreads(
  user_email: string,
  limit = 100,
): Promise<Array<{ conversation_id: string; title: string; last_active: string; message_count: number }>> {
  const bq = getBigQueryClient();

  const query = `
    SELECT
      conversation_id,
      -- Use the first user message as the thread title
      ARRAY_AGG(message ORDER BY message_index ASC LIMIT 1)[OFFSET(0)] AS title,
      CAST(MAX(created_at) AS STRING) AS last_active,
      COUNT(*) AS message_count
    FROM ${FULL_TABLE}
    WHERE user_email = @user_email
    GROUP BY conversation_id
    ORDER BY MAX(created_at) DESC
    LIMIT @limit
  `;

  const [rows] = await bq.query({
    query,
    params: { user_email, limit },
  });

  return (rows as Array<{ conversation_id: string; title: string; last_active: string; message_count: number }>).map((r) => ({
    conversation_id: r.conversation_id,
    title: r.title?.slice(0, 60) ?? 'Conversation',
    last_active: r.last_active,
    message_count: Number(r.message_count),
  }));
}

/**
 * Fetch recent conversation history for a user across all conversations
 * (last N messages, most recent first). Useful for cross-session context.
 */
export async function getUserRecentHistory(
  user_email: string,
  limit = 50,
): Promise<Array<{ conversation_id: string; role: 'user' | 'assistant'; content: string; created_at: string }>> {
  const bq = getBigQueryClient();

  const query = `
    SELECT conversation_id, role, message AS content, CAST(created_at AS STRING) AS created_at
    FROM ${FULL_TABLE}
    WHERE user_email = @user_email
    ORDER BY created_at DESC
    LIMIT @limit
  `;

  const [rows] = await bq.query({
    query,
    params: { user_email, limit },
  });

  return (rows as Array<{ conversation_id: string; role: string; content: string; created_at: string }>).map((r) => ({
    conversation_id: r.conversation_id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    created_at: r.created_at,
  }));
}

/**
 * Delete all messages for a given conversation_id belonging to a specific user.
 * Uses DML DELETE — safe because we only delete by exact conversation_id + user_email.
 */
export async function deleteConversation(
  conversation_id: string,
  user_email: string,
): Promise<void> {
  const bq = getBigQueryClient();
  const query = `
    DELETE FROM ${FULL_TABLE}
    WHERE conversation_id = @conversation_id
      AND user_email = @user_email
  `;
  await bq.query({
    query,
    params: { conversation_id, user_email },
  });
}
