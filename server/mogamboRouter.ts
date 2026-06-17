/**
 * mogamboRouter.ts — tRPC procedures for Mogambo BigQuery conversation memory
 *
 * Auth strategy: user identity is passed explicitly in the tRPC payload
 * (user_email + user_name). This avoids cookie domain issues between the
 * Mogambo session cookie and the tRPC server. The frontend already has the
 * user identity from MogamboUserContext (fetched via /api/mogambo/auth/me).
 *
 * Security note: these endpoints are internal-only (gofynd.com users) and the
 * data is non-sensitive chat history. The user_email in the payload is validated
 * to be a @gofynd.com address before writing to BQ.
 *
 * Procedures:
 *  - mogambo.saveMessage    — persist a single message (user or assistant) to BQ
 *  - mogambo.getHistory     — fetch ordered history for a conversation_id
 *  - mogambo.getUserHistory — fetch recent cross-session history for a user
 */

import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure, router } from './_core/trpc';
import {
  saveConversationMessage,
  getConversationHistory,
  getUserRecentHistory,
  getUserThreads,
  deleteConversation,
} from './mogamboBigQuery';

const ALLOWED_DOMAIN = 'gofynd.com';

function validateEmail(email: string): void {
  if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only @gofynd.com users can use Mogambo memory' });
  }
}

export const mogamboRouter = router({
  /**
   * Save a single message (user or assistant) to BigQuery.
   * Called from the frontend after each user send and after each assistant reply.
   */
  saveMessage: publicProcedure
    .input(
      z.object({
        conversation_id: z.string().min(1),
        role: z.enum(['user', 'assistant']),
        message: z.string().min(1),
        user_email: z.string().email(),
        user_name: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      validateEmail(input.user_email);

      await saveConversationMessage({
        conversation_id: input.conversation_id,
        user_email: input.user_email,
        user_name: input.user_name ?? '',
        role: input.role,
        message: input.message,
      });
      return { success: true };
    }),

  /**
   * Fetch all messages for a specific conversation, ordered by message_index.
   * Returns { role, content, created_at }[] — ready to inject into LLM context.
   */
  getHistory: publicProcedure
    .input(z.object({
      conversation_id: z.string().min(1),
      user_email: z.string().email(),
    }))
    .query(async ({ input }) => {
      validateEmail(input.user_email);

      const messages = await getConversationHistory(input.conversation_id);
      return { messages };
    }),

  /**
   * Fetch recent messages across all conversations for a user.
   * Useful for cross-session context injection (last 50 messages by default).
   */
  getUserHistory: publicProcedure
    .input(z.object({
      user_email: z.string().email(),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      validateEmail(input.user_email);

      const messages = await getUserRecentHistory(input.user_email, input.limit);
      return { messages };
    }),

  /**
   * Fetch all distinct conversations for a user, ordered by most recent activity.
   * Used to restore the sidebar thread list on page load/refresh.
   * Returns: conversation_id, title (first user message), last_active, message_count.
   */
  getUserThreads: publicProcedure
    .input(z.object({
      user_email: z.string().email(),
      limit: z.number().int().min(1).max(200).default(100),
    }))
    .query(async ({ input }) => {
      validateEmail(input.user_email);

      const threads = await getUserThreads(input.user_email, input.limit);
      return { threads };
    }),
  /**
   * Delete all messages for a conversation from BigQuery.
   * Only deletes rows belonging to the requesting user (user_email guard).
   */
  deleteThread: publicProcedure
    .input(z.object({
      conversation_id: z.string().min(1),
      user_email: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      validateEmail(input.user_email);
      await deleteConversation(input.conversation_id, input.user_email);
      return { success: true };
    }),
});
