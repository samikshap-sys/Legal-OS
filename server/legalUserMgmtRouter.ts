/**
 * legalUserMgmtRouter — Legal Connect User Management
 *
 * Admin identification: hardcoded set of 4 admin emails (all @gofynd.com).
 * All LC users authenticate via Google OAuth (lc_session cookie).
 * Scope records are keyed by email and stored in lc_user_scopes table.
 *
 * Procedures:
 *   legalUserMgmt.isAdmin            — check if current LC user is admin
 *   legalUserMgmt.listUsers          — list all users with their scopes (any LC user can read)
 *   legalUserMgmt.assignScopes       — upsert scopes for a user (admin only)
 *   legalUserMgmt.removeUser         — delete a user's scope record (admin only)
 *   legalUserMgmt.getMyScopes        — return current LC user's scopes
 *   legalUserMgmt.getScopeDefinitions — return available scope definitions
 */

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { lcUserScopes } from "../drizzle/schema";
import { publicProcedure, router } from "./_core/trpc";
import { getLcUser } from "./lcAuthRouter";

// ── Admin emails — all 4 Legal Connect admins ────────────────────────────────
const LC_ADMIN_EMAILS = new Set([
  "ninadmandavkar@gofynd.com",
  "aditisinha@gofynd.com",
  "samikshap@gofynd.com",
  "farheenansari@gofynd.com",
]);

function isAdminEmail(email: string): boolean {
  return LC_ADMIN_EMAILS.has(email.toLowerCase().trim());
}

// ── All available Legal Connect sidebar scopes ───────────────────────────────
export const LC_SCOPES = [
  { id: "dashboard",      label: "Dashboard",      group: "Core" },
  { id: "tracker",        label: "Live Tracker",   group: "Core" },
  { id: "requests",       label: "Requests",       group: "Core" },
  { id: "workflows",      label: "Workflows",      group: "Operations" },
  { id: "templates",      label: "Templates",      group: "Operations" },
  { id: "team",           label: "Team",           group: "Operations" },
  { id: "requests-logs",  label: "Request Logs",   group: "Admin" },
] as const;

export type LcScopeId = typeof LC_SCOPES[number]["id"];

// ── Router ────────────────────────────────────────────────────────────────────
export const legalUserMgmtRouter = router({
  // Check if the current LC session user is admin
  isAdmin: publicProcedure.query(async ({ ctx }) => {
    const lcUser = await getLcUser(ctx.req);
    if (!lcUser) return { isAdmin: false, email: null as string | null };
    return { isAdmin: isAdminEmail(lcUser.email), email: lcUser.email };
  }),

  // List all users with their scopes (any authenticated LC user can view)
  listUsers: publicProcedure.query(async ({ ctx }) => {
    const lcUser = await getLcUser(ctx.req);
    if (!lcUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "LC session required" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const rows = await db.select().from(lcUserScopes).orderBy(lcUserScopes.updatedAt);
    return rows.map((r: typeof lcUserScopes.$inferSelect) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      scopes: r.scopes ? (JSON.parse(r.scopes) as string[]) : [],
      assignedBy: r.assignedBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }),

  // Assign (upsert) scopes for a user — admin only
  assignScopes: publicProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().default(""),
      scopes: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const lcUser = await getLcUser(ctx.req);
      if (!lcUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "LC session required" });
      if (!isAdminEmail(lcUser.email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can assign scopes" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const scopesJson = JSON.stringify(input.scopes);
      const existing = await db.select().from(lcUserScopes).where(eq(lcUserScopes.email, input.email));
      if (existing.length > 0) {
        await db.update(lcUserScopes)
          .set({ scopes: scopesJson, name: input.name || existing[0].name, assignedBy: lcUser.email })
          .where(eq(lcUserScopes.email, input.email));
      } else {
        await db.insert(lcUserScopes).values({
          email: input.email,
          name: input.name,
          scopes: scopesJson,
          assignedBy: lcUser.email,
        });
      }
      return { success: true };
    }),

  // Remove a user's scope record — admin only
  removeUser: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const lcUser = await getLcUser(ctx.req);
      if (!lcUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "LC session required" });
      if (!isAdminEmail(lcUser.email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can remove users" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(lcUserScopes).where(eq(lcUserScopes.email, input.email));
      return { success: true };
    }),

  // Get current LC user's scopes
  getMyScopes: publicProcedure.query(async ({ ctx }) => {
    const lcUser = await getLcUser(ctx.req);
    if (!lcUser) return { email: null as string | null, scopes: [] as string[], isAdmin: false, hasRecord: false };
    if (isAdminEmail(lcUser.email)) {
      // Admins have all scopes automatically
      return { email: lcUser.email, scopes: LC_SCOPES.map(s => s.id) as string[], isAdmin: true, hasRecord: true };
    }
    const db = await getDb();
    if (!db) return { email: lcUser.email, scopes: [] as string[], isAdmin: false, hasRecord: false };
    const rows = await db.select().from(lcUserScopes).where(eq(lcUserScopes.email, lcUser.email));
    // hasRecord = true means admin has explicitly configured this user's access
    const hasRecord = rows.length > 0;
    const scopes = hasRecord && rows[0].scopes ? (JSON.parse(rows[0].scopes) as string[]) : null;
    return { email: lcUser.email, scopes: scopes ?? [], isAdmin: false, hasRecord };
  }),

  // Get available scope definitions (used by admin UI to render checkboxes)
  getScopeDefinitions: publicProcedure.query(() => LC_SCOPES),
});
