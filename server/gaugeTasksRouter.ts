/**
 * Gauge My Tasks — tRPC Router
 * Handles task templates (standard + custom), individual tasks, and sharing.
 */
import { z } from "zod";
import { eq, and, or, desc } from "drizzle-orm";
import { getDb } from "./db";
import { gaugeTaskTemplates, gaugeTasks, gaugeTaskShares } from "../drizzle/schema";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

// ── Column definition schema ───────────────────────────────────────────────

const ColumnDefSchema = z.object({
  name: z.string().min(1).max(128),
  type: z.enum(["text", "number", "boolean", "date", "dropdown"]),
  options: z.array(z.string()).optional(), // for dropdown type
  required: z.boolean().optional(),
});

// Standard template columns (predefined)
const STANDARD_COLUMNS = [
  { name: "Task Name", type: "text", required: true },
  { name: "Start Date", type: "date", required: false },
  { name: "End Date", type: "date", required: false },
  { name: "Priority", type: "dropdown", options: ["Low", "Medium", "High", "Critical"], required: false },
  { name: "Status", type: "dropdown", options: ["To Do", "In Progress", "Done", "Blocked"], required: false },
  { name: "Doc Links", type: "text", required: false },
  { name: "Notes", type: "text", required: false },
];

function assertGofyndEmail(email: string | null | undefined) {
  if (!email || !email.endsWith("@gofynd.com")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only @gofynd.com accounts can access Gauge." });
  }
}

export const gaugeTasksRouter = router({

  // ── Template CRUD ──────────────────────────────────────────────────────

  /** Get all templates accessible by the caller (owned + shared) */
  getTemplates: publicProcedure
    .input(z.object({ callerEmail: z.string().email() }))
    .query(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) return [];

      // Owned templates
      const owned = await db
        .select()
        .from(gaugeTaskTemplates)
        .where(eq(gaugeTaskTemplates.ownerEmail, input.callerEmail))
        .orderBy(desc(gaugeTaskTemplates.createdAt));

      // Shared templates
      const shares = await db
        .select({ templateId: gaugeTaskShares.templateId, permission: gaugeTaskShares.permission })
        .from(gaugeTaskShares)
        .where(eq(gaugeTaskShares.sharedWithEmail, input.callerEmail));

      const sharedTemplates = shares.length > 0
        ? await Promise.all(
            shares.map(async (s) => {
              const rows = await db
                .select()
                .from(gaugeTaskTemplates)
                .where(eq(gaugeTaskTemplates.id, s.templateId))
                .limit(1);
              return rows[0] ? { ...rows[0], sharedPermission: s.permission } : null;
            })
          ).then((arr) => arr.filter(Boolean))
        : [];

      return [
        ...owned.map((t) => ({ ...t, isOwner: true, sharedPermission: "edit" as const })),
        ...sharedTemplates.map((t) => ({ ...t!, isOwner: false })),
      ];
    }),

  /** Create a new template */
  createTemplate: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      name: z.string().min(1).max(255),
      type: z.enum(["standard", "custom"]),
      columns: z.array(ColumnDefSchema).optional(),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const columns = input.type === "standard"
        ? STANDARD_COLUMNS
        : (input.columns ?? []);

      const [result] = await db.insert(gaugeTaskTemplates).values({
        ownerEmail: input.callerEmail,
        name: input.name,
        type: input.type,
        columns: JSON.stringify(columns),
      });

      return { id: (result as any).insertId as number };
    }),

  /** Update a template's name or columns */
  updateTemplate: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      templateId: z.number(),
      name: z.string().min(1).max(255).optional(),
      columns: z.array(ColumnDefSchema).optional(),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db
        .select()
        .from(gaugeTaskTemplates)
        .where(eq(gaugeTaskTemplates.id, input.templateId))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found." });
      if (rows[0].ownerEmail !== input.callerEmail) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can edit this template." });
      }

      const updates: Record<string, unknown> = {};
      if (input.name) updates.name = input.name;
      if (input.columns) updates.columns = JSON.stringify(input.columns);

      await db.update(gaugeTaskTemplates).set(updates).where(eq(gaugeTaskTemplates.id, input.templateId));
      return { success: true };
    }),

  /** Delete a template and all its tasks */
  deleteTemplate: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      templateId: z.number(),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const rows = await db
        .select()
        .from(gaugeTaskTemplates)
        .where(eq(gaugeTaskTemplates.id, input.templateId))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      if (rows[0].ownerEmail !== input.callerEmail) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can delete this template." });
      }

      await db.delete(gaugeTasks).where(eq(gaugeTasks.templateId, input.templateId));
      await db.delete(gaugeTaskShares).where(eq(gaugeTaskShares.templateId, input.templateId));
      await db.delete(gaugeTaskTemplates).where(eq(gaugeTaskTemplates.id, input.templateId));
      return { success: true };
    }),

  // ── Task CRUD ──────────────────────────────────────────────────────────

  /** Get all tasks for a template */
  getTasks: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      templateId: z.number(),
    }))
    .query(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) return [];

      // Check access: owner or shared
      const template = await db
        .select()
        .from(gaugeTaskTemplates)
        .where(eq(gaugeTaskTemplates.id, input.templateId))
        .limit(1);

      if (!template[0]) throw new TRPCError({ code: "NOT_FOUND" });

      if (template[0].ownerEmail !== input.callerEmail) {
        const share = await db
          .select()
          .from(gaugeTaskShares)
          .where(and(
            eq(gaugeTaskShares.templateId, input.templateId),
            eq(gaugeTaskShares.sharedWithEmail, input.callerEmail),
          ))
          .limit(1);
        if (!share[0]) throw new TRPCError({ code: "FORBIDDEN" });
      }

      return db
        .select()
        .from(gaugeTasks)
        .where(eq(gaugeTasks.templateId, input.templateId))
        .orderBy(gaugeTasks.position, gaugeTasks.createdAt);
    }),

  /** Create a task */
  createTask: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      templateId: z.number(),
      data: z.record(z.string(), z.unknown()),
      status: z.string().default("todo"),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Count existing tasks for position
      const existing = await db
        .select({ id: gaugeTasks.id })
        .from(gaugeTasks)
        .where(eq(gaugeTasks.templateId, input.templateId));

      const [result] = await db.insert(gaugeTasks).values({
        ownerEmail: input.callerEmail,
        templateId: input.templateId,
        data: JSON.stringify(input.data),
        status: input.status,
        position: existing.length,
      });

      return { id: (result as any).insertId as number };
    }),

  /** Update a task's data or status */
  updateTask: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      taskId: z.number(),
      data: z.record(z.string(), z.unknown()).optional(),
      status: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const updates: Record<string, unknown> = {};
      if (input.data !== undefined) updates.data = JSON.stringify(input.data);
      if (input.status !== undefined) updates.status = input.status;

      await db.update(gaugeTasks).set(updates).where(eq(gaugeTasks.id, input.taskId));
      return { success: true };
    }),

  /** Delete a task */
  deleteTask: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      taskId: z.number(),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.delete(gaugeTasks).where(eq(gaugeTasks.id, input.taskId));
      return { success: true };
    }),

  // ── Sharing ────────────────────────────────────────────────────────────

  /** Get all shares for a template */
  getShares: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      templateId: z.number(),
    }))
    .query(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(gaugeTaskShares)
        .where(eq(gaugeTaskShares.templateId, input.templateId));
    }),

  /** Share a template with another @gofynd.com user */
  shareTemplate: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      templateId: z.number(),
      sharedWithEmail: z.string().email(),
      permission: z.enum(["view", "edit"]).default("view"),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      assertGofyndEmail(input.sharedWithEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Verify ownership
      const rows = await db
        .select()
        .from(gaugeTaskTemplates)
        .where(eq(gaugeTaskTemplates.id, input.templateId))
        .limit(1);

      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
      if (rows[0].ownerEmail !== input.callerEmail) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can share this template." });
      }

      // Upsert share
      const existing = await db
        .select()
        .from(gaugeTaskShares)
        .where(and(
          eq(gaugeTaskShares.templateId, input.templateId),
          eq(gaugeTaskShares.sharedWithEmail, input.sharedWithEmail),
        ))
        .limit(1);

      if (existing[0]) {
        await db
          .update(gaugeTaskShares)
          .set({ permission: input.permission })
          .where(eq(gaugeTaskShares.id, existing[0].id));
      } else {
        await db.insert(gaugeTaskShares).values({
          templateId: input.templateId,
          sharedWithEmail: input.sharedWithEmail,
          permission: input.permission,
        });
      }

      return { success: true };
    }),

  /** Remove a share */
  removeShare: publicProcedure
    .input(z.object({
      callerEmail: z.string().email(),
      templateId: z.number(),
      sharedWithEmail: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      assertGofyndEmail(input.callerEmail);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db
        .delete(gaugeTaskShares)
        .where(and(
          eq(gaugeTaskShares.templateId, input.templateId),
          eq(gaugeTaskShares.sharedWithEmail, input.sharedWithEmail),
        ));

      return { success: true };
    }),

  /** Get standard column definitions */
  getStandardColumns: publicProcedure
    .query(() => STANDARD_COLUMNS),
});
