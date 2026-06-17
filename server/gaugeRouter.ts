/**
 * Gauge Ticketing System — tRPC Router
 * All @gofynd.com users can raise tickets and comment.
 * Only the assigned DRI can update ticket status.
 */
import { z } from "zod";
import { eq, desc, and, or, like, sql, gte, lte } from "drizzle-orm";
import { getDb } from "./db";
import { gaugeTickets, gaugeTicketComments, gaugeTicketCounter } from "../drizzle/schema";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { isGaugeAdmin } from "./gaugeAuthRouter";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Generate next GAUGE-XXXX ticket ID atomically */
async function nextTicketId(): Promise<string> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

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

/** Ensure caller has a @gofynd.com email */
function assertGofyndEmail(email: string | null | undefined) {
  if (!email || !email.endsWith("@gofynd.com")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only @gofynd.com accounts can access Gauge." });
  }
}

// ── Status & Priority labels ───────────────────────────────────────────────

const TICKET_STATUSES = ["open", "in_progress", "on_hold", "disputed", "resolved", "closed"] as const;
const TICKET_PRIORITIES = ["low", "medium", "high", "critical"] as const;
const TICKET_CATEGORIES = ["Finance", "Legal", "Tech", "HR", "Operations", "Marketing", "General"] as const;

// ── Router ─────────────────────────────────────────────────────────────────

export const gaugeRouter = router({

  /** Create a new ticket */
  createTicket: publicProcedure
    .input(z.object({
      title: z.string().min(3).max(512),
      description: z.string().max(5000).default(""),
      priority: z.enum(TICKET_PRIORITIES).default("medium"),
      category: z.enum(TICKET_CATEGORIES).default("General"),
      driEmail: z.string().email(),
      driName: z.string().max(255).default(""),
      raisedByEmail: z.string().email(),
      raisedByName: z.string().max(255).default(""),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.raisedByEmail);
      if (!input.driEmail.endsWith("@gofynd.com")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "DRI must be a @gofynd.com email." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const ticketId = await nextTicketId();

      await db.insert(gaugeTickets).values({
        ticketId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: "open",
        category: input.category,
        raisedByEmail: input.raisedByEmail,
        raisedByName: input.raisedByName,
        driEmail: input.driEmail,
        driName: input.driName,
      });

      const ticket = await db
        .select()
        .from(gaugeTickets)
        .where(eq(gaugeTickets.ticketId, ticketId))
        .limit(1);

      // Fire-and-forget Slack notification to DRI
      if (ticket[0]) notifyDriSlack(ticket[0]).catch(() => {});

      return ticket[0];
    }),

  /** Get paginated list of tickets with optional filters */
  getTickets: publicProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
      status: z.enum([...TICKET_STATUSES, "all"]).default("all"),
      priority: z.enum([...TICKET_PRIORITIES, "all"]).default("all"),
      driEmail: z.string().optional(),
      raisedByEmail: z.string().optional(),
      search: z.string().optional(),
      myTickets: z.boolean().default(false),
      callerEmail: z.string().optional(),
      dateFrom: z.string().optional(), // ISO date string YYYY-MM-DD
      dateTo: z.string().optional(),   // ISO date string YYYY-MM-DD
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { tickets: [], total: 0, page: input.page, pageSize: input.pageSize };

      const conditions = [];

      if (input.status !== "all") {
        conditions.push(eq(gaugeTickets.status, input.status));
      }
      if (input.priority !== "all") {
        conditions.push(eq(gaugeTickets.priority, input.priority));
      }
      if (input.driEmail) {
        conditions.push(eq(gaugeTickets.driEmail, input.driEmail));
      }
      if (input.raisedByEmail) {
        conditions.push(eq(gaugeTickets.raisedByEmail, input.raisedByEmail));
      }
      if (input.search) {
        conditions.push(
          or(
            like(gaugeTickets.title, `%${input.search}%`),
            like(gaugeTickets.ticketId, `%${input.search}%`),
          )
        );
      }
      if (input.myTickets && input.callerEmail) {
        conditions.push(
          or(
            eq(gaugeTickets.raisedByEmail, input.callerEmail),
            eq(gaugeTickets.driEmail, input.callerEmail),
          )
        );
      }
      if (input.dateFrom) {
        const fromDate = new Date(input.dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(gaugeTickets.createdAt, fromDate));
      }
      if (input.dateTo) {
        const toDate = new Date(input.dateTo);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(gaugeTickets.createdAt, toDate));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [tickets, countResult] = await Promise.all([
        db
          .select()
          .from(gaugeTickets)
          .where(whereClause)
          .orderBy(desc(gaugeTickets.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        db
          .select({ count: sql<number>`COUNT(*)` })
          .from(gaugeTickets)
          .where(whereClause),
      ]);

      return {
        tickets,
        total: Number(countResult[0]?.count ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /** Get a single ticket by ticketId string (e.g. GAUGE-0001) */
  getTicketById: publicProcedure
    .input(z.object({ ticketId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db
        .select()
        .from(gaugeTickets)
        .where(eq(gaugeTickets.ticketId, input.ticketId))
        .limit(1);

      if (!rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Ticket ${input.ticketId} not found.` });
      }
      return rows[0];
    }),

  /** Update ticket status — only the DRI can do this */
  updateTicketStatus: publicProcedure
    .input(z.object({
      ticketId: z.string(),
      newStatus: z.enum(TICKET_STATUSES),
      comment: z.string().max(2000).default(""),
      callerEmail: z.string().email(),
      callerName: z.string().max(255).default(""),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db
        .select()
        .from(gaugeTickets)
        .where(eq(gaugeTickets.ticketId, input.ticketId))
        .limit(1);

      if (!rows[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Ticket ${input.ticketId} not found.` });
      }

      const ticket = rows[0];

      // Only DRI can update status
      if (ticket.driEmail !== input.callerEmail) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the assigned DRI can update ticket status.",
        });
      }

      const oldStatus = ticket.status;
      const resolvedAt = (input.newStatus === "resolved" || input.newStatus === "closed")
        ? new Date()
        : null;

      await db
        .update(gaugeTickets)
        .set({
          status: input.newStatus,
          ...(resolvedAt ? { resolvedAt } : {}),
        })
        .where(eq(gaugeTickets.ticketId, input.ticketId));

      // Insert status-change event into comments
      const commentContent = input.comment
        ? input.comment
        : `Status changed from ${oldStatus} to ${input.newStatus}`;

      await db.insert(gaugeTicketComments).values({
        ticketId: input.ticketId,
        authorEmail: input.callerEmail,
        authorName: input.callerName,
        content: commentContent,
        isStatusChange: 1,
        oldStatus: oldStatus,
        newStatus: input.newStatus,
      });

      // Post status update to original Slack thread (if ticket was raised via Slack)
      postStatusUpdateToSlackThread(ticket, oldStatus, input.newStatus, input.callerName, input.comment).catch(() => {});

      // Also DM the raiser if resolved/closed
      if (input.newStatus === "resolved" || input.newStatus === "closed") {
        notifyRaiserSlack(ticket, input.newStatus, input.callerName).catch(() => {});
      }

      return { success: true };
    }),

  /** Add a comment to a ticket (any @gofynd.com user) */
  addComment: publicProcedure
    .input(z.object({
      ticketId: z.string(),
      content: z.string().min(1).max(2000),
      authorEmail: z.string().email(),
      authorName: z.string().max(255).default(""),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.authorEmail);

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.insert(gaugeTicketComments).values({
        ticketId: input.ticketId,
        authorEmail: input.authorEmail,
        authorName: input.authorName,
        content: input.content,
        isStatusChange: 0,
      });

      return { success: true };
    }),

  /** Delete a ticket — admin only */
  deleteTicket: publicProcedure
    .input(z.object({
      ticketId: z.string(),
      callerEmail: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      if (!isGaugeAdmin(input.callerEmail)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can delete tickets." });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Delete comments first (FK), then ticket
      await db.delete(gaugeTicketComments).where(eq(gaugeTicketComments.ticketId, input.ticketId));
      await db.delete(gaugeTickets).where(eq(gaugeTickets.ticketId, input.ticketId));

      return { success: true };
    }),

  /** Get all comments for a ticket */
  getComments: publicProcedure
    .input(z.object({ ticketId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(gaugeTicketComments)
        .where(eq(gaugeTicketComments.ticketId, input.ticketId))
        .orderBy(gaugeTicketComments.createdAt);
    }),

  /** Get tickets grouped by status for Kanban board */
  getKanbanBoard: publicProcedure
    .input(z.object({
      driEmail: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { open: [], in_progress: [], on_hold: [], disputed: [], resolved: [], closed: [] };

      const conditions: Parameters<typeof and>[0][] = [];
      if (input.driEmail) conditions.push(eq(gaugeTickets.driEmail, input.driEmail));
      if (input.dateFrom) {
        const fromDate = new Date(input.dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        conditions.push(gte(gaugeTickets.createdAt, fromDate));
      }
      if (input.dateTo) {
        const toDate = new Date(input.dateTo);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(gaugeTickets.createdAt, toDate));
      }

      const tickets = await db
        .select()
        .from(gaugeTickets)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(gaugeTickets.createdAt));

      type TicketRow = typeof tickets[0];
      const board: Record<string, TicketRow[]> = {
        open: [],
        in_progress: [],
        on_hold: [],
        disputed: [],
        resolved: [],
        closed: [],
      };

      for (const t of tickets) {
        if (board[t.status]) {
          board[t.status].push(t);
        }
      }

      return board;
    }),

  /** Per-DRI stats: how many tickets each DRI has, broken down by status */
  getDriStats: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      const rows = await db
        .select({
          driEmail: gaugeTickets.driEmail,
          driName: gaugeTickets.driName,
          status: gaugeTickets.status,
          count: sql<number>`COUNT(*)`,
        })
        .from(gaugeTickets)
        .groupBy(gaugeTickets.driEmail, gaugeTickets.driName, gaugeTickets.status)
        .orderBy(gaugeTickets.driEmail);

      type DriStat = {
        driEmail: string;
        driName: string;
        total: number;
        open: number;
        in_progress: number;
        on_hold: number;
        disputed: number;
        resolved: number;
        closed: number;
      };

      const driMap: Record<string, DriStat> = {};

      for (const row of rows) {
        if (!driMap[row.driEmail]) {
          driMap[row.driEmail] = {
            driEmail: row.driEmail,
            driName: row.driName,
            total: 0,
            open: 0,
            in_progress: 0,
            on_hold: 0,
            disputed: 0,
            resolved: 0,
            closed: 0,
          };
        }
        const count = Number(row.count);
        driMap[row.driEmail].total += count;
        const s = row.status as keyof Omit<DriStat, "driEmail" | "driName" | "total">;
        driMap[row.driEmail][s] = count;
      }

      return Object.values(driMap).sort((a, b) => b.total - a.total);
    }),

  /** Get all unique DRIs who have tickets assigned (for slicer dropdown) */
  getDriList: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      return db
        .selectDistinct({
          driEmail: gaugeTickets.driEmail,
          driName: gaugeTickets.driName,
        })
        .from(gaugeTickets)
        .orderBy(gaugeTickets.driEmail);
    }),
});

// ── Slack notification helpers ─────────────────────────────────────────────

async function postStatusUpdateToSlackThread(
  ticket: typeof gaugeTickets.$inferSelect,
  oldStatus: string,
  newStatus: string,
  updatedByName: string,
  comment: string,
) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;
  // Only post if the ticket was raised via Slack and we have a thread to reply to
  if (!ticket.slackChannelId || !ticket.slackThreadTs) return;

  const statusEmoji: Record<string, string> = {
    open: "🔵",
    in_progress: "🟡",
    on_hold: "⏸️",
    disputed: "🔴",
    resolved: "✅",
    closed: "🔒",
  };

  const emoji = statusEmoji[newStatus] ?? "📌";
  const ticketUrl = `https://fyndfinops.manus.space/gauge/ticket/${ticket.ticketId}`;

  let mainText = `${emoji} *Status Update — ${ticket.ticketId}*\n\n` +
    `*${oldStatus.replace("_", " ")}* → *${newStatus.replace("_", " ")}*\n` +
    `*Updated by:* ${updatedByName}`;

  if (comment && comment !== `Status changed from ${oldStatus} to ${newStatus}`) {
    mainText += `\n*Comment:* ${comment}`;
  }

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel: ticket.slackChannelId,
      thread_ts: ticket.slackThreadTs,
      text: mainText,
      blocks: [
        {
          type: "section",
          text: { type: "mrkdwn", text: mainText },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "View Ticket in Gauge", emoji: false },
              url: ticketUrl,
              action_id: "view_ticket",
            },
          ],
        },
      ],
    }),
  });
}

async function notifyDriSlack(ticket: typeof gaugeTickets.$inferSelect) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;

  const text = `🎫 *New Gauge Ticket Assigned to You*\n\n` +
    `*Ticket:* ${ticket.ticketId}\n` +
    `*Title:* ${ticket.title}\n` +
    `*Priority:* ${ticket.priority.toUpperCase()}\n` +
    `*Category:* ${ticket.category}\n` +
    `*Raised by:* ${ticket.raisedByName} (${ticket.raisedByEmail})\n` +
    `*Description:* ${ticket.description?.slice(0, 200) || "—"}\n\n` +
    `Open Gauge to update the status: https://fyndfinops.manus.space/gauge/ticket/${ticket.ticketId}`;

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel: ticket.driEmail,
      text,
    }),
  });
}

async function notifyRaiserSlack(
  ticket: typeof gaugeTickets.$inferSelect,
  newStatus: string,
  updatedByName: string,
) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;

  const emoji = newStatus === "resolved" ? "✅" : "🔒";
  const text = `${emoji} *Your Gauge Ticket has been ${newStatus}*\n\n` +
    `*Ticket:* ${ticket.ticketId}\n` +
    `*Title:* ${ticket.title}\n` +
    `*Updated by:* ${updatedByName}\n\n` +
    `View ticket: https://fyndfinops.manus.space/gauge/ticket/${ticket.ticketId}`;

  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel: ticket.raisedByEmail,
      text,
    }),
  });
}
