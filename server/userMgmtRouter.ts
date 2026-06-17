/**
 * userMgmtRouter — QueryBee User Management
 *
 * Admin identification: email stored in QB_ADMIN_EMAIL env var.
 * All QB users authenticate via Google OAuth (qb_sessions), so we key
 * scope records by email rather than Manus openId.
 *
 * Procedures:
 *   userMgmt.isAdmin            — check if current QB user is admin
 *   userMgmt.listUsers          — list all users with their scopes (any QB user can read)
 *   userMgmt.assignScopes       — upsert scopes for a user (admin only)
 *   userMgmt.removeUser         — delete a user's scope record (admin only)
 *   userMgmt.getMyScopes        — return current QB user's scopes
 *   userMgmt.getScopeDefinitions — return available scope definitions
 */

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./db";
import { qbUserScopes } from "../drizzle/schema";
import { publicProcedure, router } from "./_core/trpc";
import { Request } from "express";
import { jwtVerify } from "jose";
import { ENV } from "./_core/env";

// ── QB session helper (mirrors qbAuthRouter) ─────────────────────────────────
const QB_COOKIE = "qb_session";
const ALLOWED_DOMAIN = "gofynd.com";

function getSecret(): Uint8Array {
  return new TextEncoder().encode(ENV.qbSessionSecret || "qb-fallback-secret");
}

async function getQbUserFromReq(req: Request): Promise<{ email: string; name: string } | null> {
  const token = req.cookies?.[QB_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const email = payload.email as string;
    const name = (payload.name as string) || "";
    if (!email || !email.endsWith(`@${ALLOWED_DOMAIN}`)) return null;
    return { email, name };
  } catch {
    return null;
  }
}

// ── Admin check helper ────────────────────────────────────────────────────────
function getAdminEmail(): string {
  return (process.env.QB_ADMIN_EMAIL ?? "").toLowerCase().trim();
}

function isAdminEmail(email: string): boolean {
  const admin = getAdminEmail();
  if (!admin) return false;
  return email.toLowerCase().trim() === admin;
}

// ── All available QB sidebar scopes ──────────────────────────────────────────
export const QB_SCOPES = [
  { id: "data-upload",        label: "BQ Upload",          group: "Data" },
  { id: "invoice-download",   label: "Invoices Download",  group: "Data" },
  { id: "pipelines",          label: "Pipelines",          group: "Data" },
  { id: "querypad",           label: "Querypad",           group: "Data" },
  { id: "invoice-supporting", label: "Invoice Export",     group: "Finance" },
  { id: "bl-payable",         label: "Brand Ledger",       group: "Finance" },
  { id: "cashfree-entry",     label: "Cashfree Entry",     group: "Finance" },
  { id: "dp-recon",           label: "DP Recon",           group: "Analytics" },
  { id: "po-dashboard",        label: "PO Dashboard",        group: "Analytics" },
  { id: "splitter",            label: "Splitter",           group: "Finance" },
] as const;

export type QbScopeId = typeof QB_SCOPES[number]["id"];

// ── Router ────────────────────────────────────────────────────────────────────
export const userMgmtRouter = router({
  // Check if the current QB session user is admin
  isAdmin: publicProcedure.query(async ({ ctx }) => {
    const qbUser = await getQbUserFromReq(ctx.req);
    if (!qbUser) return { isAdmin: false, email: null };
    return { isAdmin: isAdminEmail(qbUser.email), email: qbUser.email };
  }),

  // List all users with their scopes (any authenticated QB user can view)
  listUsers: publicProcedure.query(async ({ ctx }) => {
    const qbUser = await getQbUserFromReq(ctx.req);
    if (!qbUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "QB session required" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
    const rows = await db.select().from(qbUserScopes).orderBy(qbUserScopes.updatedAt);
    return rows.map((r: typeof qbUserScopes.$inferSelect) => ({
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
      const qbUser = await getQbUserFromReq(ctx.req);
      if (!qbUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "QB session required" });
      if (!isAdminEmail(qbUser.email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the admin can assign scopes" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const scopesJson = JSON.stringify(input.scopes);
      const existing = await db.select().from(qbUserScopes).where(eq(qbUserScopes.email, input.email));
      if (existing.length > 0) {
        await db.update(qbUserScopes)
          .set({ scopes: scopesJson, name: input.name || existing[0].name, assignedBy: qbUser.email })
          .where(eq(qbUserScopes.email, input.email));
      } else {
        await db.insert(qbUserScopes).values({
          email: input.email,
          name: input.name,
          scopes: scopesJson,
          assignedBy: qbUser.email,
        });
      }
      return { success: true };
    }),

  // Remove a user's scope record — admin only
  removeUser: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const qbUser = await getQbUserFromReq(ctx.req);
      if (!qbUser) throw new TRPCError({ code: "UNAUTHORIZED", message: "QB session required" });
      if (!isAdminEmail(qbUser.email)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the admin can remove users" });
      }
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await db.delete(qbUserScopes).where(eq(qbUserScopes.email, input.email));
      return { success: true };
    }),

  // Get current QB user's scopes
  getMyScopes: publicProcedure.query(async ({ ctx }) => {
    const qbUser = await getQbUserFromReq(ctx.req);
    if (!qbUser) return { email: null as string | null, scopes: [] as string[], isAdmin: false, hasRecord: false };
    if (isAdminEmail(qbUser.email)) {
      return { email: qbUser.email, scopes: QB_SCOPES.map(s => s.id) as string[], isAdmin: true, hasRecord: true };
    }
    const db = await getDb();
    if (!db) return { email: qbUser.email, scopes: [] as string[], isAdmin: false, hasRecord: false };
    const rows = await db.select().from(qbUserScopes).where(eq(qbUserScopes.email, qbUser.email));
    // hasRecord = true means admin has explicitly configured this user's access
    const hasRecord = rows.length > 0;
    const scopes = hasRecord && rows[0].scopes ? (JSON.parse(rows[0].scopes) as string[]) : null;
    return { email: qbUser.email, scopes: scopes ?? [], isAdmin: false, hasRecord };
  }),

  // Get available scope definitions (public — used by admin UI to render checkboxes)
  getScopeDefinitions: publicProcedure.query(() => QB_SCOPES),
});
