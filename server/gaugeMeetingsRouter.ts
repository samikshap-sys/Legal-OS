/**
 * Gauge Calendar / Meetings — tRPC Router
 * Handles meeting CRUD and Slack notifications to attendees.
 */
import { z } from "zod";
import { eq, and, gte, lte, or } from "drizzle-orm";
import { getDb } from "./db";
import { gaugeMeetings } from "../drizzle/schema";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

function assertGofyndEmail(email: string | null | undefined) {
  if (!email || !email.endsWith("@gofynd.com")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only @gofynd.com accounts can access Gauge." });
  }
}

const AttendeeSchema = z.object({
  email: z.string().email(),
  name: z.string().default(""),
});

const DocLinkSchema = z.object({
  label: z.string(),
  url: z.string().url(),
});

export const gaugeMeetingsRouter = router({

  /** Get meetings for a user within a date range (UTC ms) */
  getMeetings: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      from: z.number().optional(), // UTC ms
      to: z.number().optional(),   // UTC ms
    }))
    .query(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) return [];

      // Get meetings owned by caller OR where caller is an attendee
      // We'll fetch all caller's meetings and filter attendees in JS for simplicity
      const rows = await db
        .select()
        .from(gaugeMeetings)
        .where(eq(gaugeMeetings.ownerEmail, input.callerEmail));

      let results = rows;

      if (input.from !== undefined) {
        results = results.filter((m) => m.endAt >= input.from!);
      }
      if (input.to !== undefined) {
        results = results.filter((m) => m.startAt <= input.to!);
      }

      return results.sort((a, b) => a.startAt - b.startAt);
    }),

  /** Get a single meeting by ID */
  getMeeting: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      meetingId: z.number(),
    }))
    .query(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select()
        .from(gaugeMeetings)
        .where(eq(gaugeMeetings.id, input.meetingId))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      return rows[0];
    }),

  /** Create a meeting */
  createMeeting: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      title: z.string().min(1).max(512),
      startAt: z.number(), // UTC ms
      endAt: z.number(),   // UTC ms
      location: z.string().max(512).default(""),
      googleMeetLink: z.string().max(512).default(""),
      description: z.string().max(5000).default(""),
      attendees: z.array(AttendeeSchema).default([]),
      docLinks: z.array(DocLinkSchema).default([]),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [result] = await db.insert(gaugeMeetings).values({
        ownerEmail: input.callerEmail,
        title: input.title,
        startAt: input.startAt,
        endAt: input.endAt,
        location: input.location,
        googleMeetLink: input.googleMeetLink,
        description: input.description,
        attendees: JSON.stringify(input.attendees),
        docLinks: JSON.stringify(input.docLinks),
        slackNotified: 0,
      });

      const meetingId = (result as any).insertId as number;

      // Notify attendees via Slack
      notifyAttendeesSlack(
        meetingId,
        input.title,
        input.startAt,
        input.endAt,
        input.callerEmail,
        input.attendees,
        input.googleMeetLink,
        "created",
      ).catch(() => {});

      return { id: meetingId };
    }),

  /** Update a meeting */
  updateMeeting: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      meetingId: z.number(),
      title: z.string().min(1).max(512).optional(),
      startAt: z.number().optional(),
      endAt: z.number().optional(),
      location: z.string().max(512).optional(),
      googleMeetLink: z.string().max(512).optional(),
      description: z.string().max(5000).optional(),
      momNotes: z.string().max(10000).optional(),
      attendees: z.array(AttendeeSchema).optional(),
      docLinks: z.array(DocLinkSchema).optional(),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db
        .select()
        .from(gaugeMeetings)
        .where(eq(gaugeMeetings.id, input.meetingId))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      if (rows[0].ownerEmail !== input.callerEmail) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the meeting owner can edit it." });
      }

      const updates: Record<string, unknown> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.startAt !== undefined) updates.startAt = input.startAt;
      if (input.endAt !== undefined) updates.endAt = input.endAt;
      if (input.location !== undefined) updates.location = input.location;
      if (input.googleMeetLink !== undefined) updates.googleMeetLink = input.googleMeetLink;
      if (input.description !== undefined) updates.description = input.description;
      if (input.momNotes !== undefined) updates.momNotes = input.momNotes;
      if (input.attendees !== undefined) updates.attendees = JSON.stringify(input.attendees);
      if (input.docLinks !== undefined) updates.docLinks = JSON.stringify(input.docLinks);

      await db.update(gaugeMeetings).set(updates).where(eq(gaugeMeetings.id, input.meetingId));

      // If time changed, notify attendees of rescheduling
      const timeChanged = input.startAt !== undefined || input.endAt !== undefined;
      if (timeChanged) {
        const meeting = rows[0];
        const attendees: { email: string; name: string }[] = JSON.parse(meeting.attendees || "[]");
        notifyAttendeesSlack(
          input.meetingId,
          input.title ?? meeting.title,
          input.startAt ?? meeting.startAt,
          input.endAt ?? meeting.endAt,
          input.callerEmail,
          attendees,
          input.googleMeetLink ?? meeting.googleMeetLink ?? "",
          "rescheduled",
        ).catch(() => {});
      }

      return { success: true };
    }),

  /** Delete a meeting */
  deleteMeeting: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      meetingId: z.number(),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db
        .select()
        .from(gaugeMeetings)
        .where(eq(gaugeMeetings.id, input.meetingId))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      if (rows[0].ownerEmail !== input.callerEmail) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the meeting owner can delete it." });
      }

      await db.delete(gaugeMeetings).where(eq(gaugeMeetings.id, input.meetingId));
      return { success: true };
    }),
});

// ── Slack notification helper ──────────────────────────────────────────────

async function notifyAttendeesSlack(
  meetingId: number,
  title: string,
  startAt: number,
  endAt: number,
  ownerEmail: string,
  attendees: { email: string; name: string }[],
  googleMeetLink: string,
  action: "created" | "rescheduled",
) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token || attendees.length === 0) return;

  const startDate = new Date(startAt);
  const endDate = new Date(endAt);
  const dateStr = startDate.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const timeStr = `${startDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} – ${endDate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;

  const emoji = action === "created" ? "📅" : "🔄";
  const verb = action === "created" ? "invited you to a meeting" : "rescheduled a meeting";

  const meetingUrl = `https://fyndfinops.manus.space/gauge/app`;

  for (const attendee of attendees) {
    if (!attendee.email || attendee.email === ownerEmail) continue;

    const text = `${emoji} *${ownerEmail} ${verb}*\n\n` +
      `*Title:* ${title}\n` +
      `*Date:* ${dateStr}\n` +
      `*Time:* ${timeStr}` +
      (googleMeetLink ? `\n*Meet:* ${googleMeetLink}` : "") +
      `\n\nView in Gauge: ${meetingUrl}`;

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: attendee.email, // Slack accepts email as channel for DMs
        text,
      }),
    }).catch(() => {});
  }
}
