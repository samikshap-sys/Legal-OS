import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── Legal Connect Google OAuth sessions ──────────────────────────────────────
export const lcSessions = mysqlTable("lc_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }).notNull().default(""),
  googleId: varchar("googleId", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});
export type LcSession = typeof lcSessions.$inferSelect;
export type InsertLcSession = typeof lcSessions.$inferInsert;

// ── Legal Connect User Scopes ─────────────────────────────────────────────────
export const lcUserScopes = mysqlTable("lc_user_scopes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull().default(""),
  scopes: text("scopes"),
  assignedBy: varchar("assignedBy", { length: 320 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LcUserScope = typeof lcUserScopes.$inferSelect;
export type InsertLcUserScope = typeof lcUserScopes.$inferInsert;

// ── Legal Connect Requests ────────────────────────────────────────────────────
export const lcRequests = mysqlTable("lc_requests", {
  request_id:        varchar("request_id",        { length: 32  }).primaryKey(),
  requester_name:    varchar("requester_name",    { length: 255 }).notNull().default(""),
  requester_email:   varchar("requester_email",   { length: 320 }).notNull().default(""),
  department:        varchar("department",        { length: 255 }).notNull().default(""),
  request_type:      varchar("request_type",      { length: 255 }).notNull().default(""),
  priority:          varchar("priority",          { length: 64  }).notNull().default(""),
  deadline:          varchar("deadline",          { length: 64  }).notNull().default(""),
  description:       text("description"),
  doc_link:          text("doc_link"),
  counter_party:     varchar("counter_party",     { length: 512 }).notNull().default(""),
  customer_type:     varchar("customer_type",     { length: 255 }).notNull().default(""),
  ip_product:        varchar("ip_product",        { length: 255 }).notNull().default(""),
  biz_segment:       varchar("biz_segment",       { length: 255 }).notNull().default(""),
  pnl_owner:         varchar("pnl_owner",         { length: 255 }).notNull().default(""),
  region:            varchar("region",            { length: 255 }).notNull().default(""),
  current_status:    varchar("current_status",    { length: 128 }).notNull().default("request-raised"),
  status_note:       text("status_note"),
  history_json:      text("history_json"),
  status_updated_by: varchar("status_updated_by", { length: 320 }).notNull().default(""),
  requested_by:      varchar("requested_by",      { length: 320 }).notNull().default(""),
  is_confidential:   int("is_confidential").notNull().default(0),
  submitted_at:      varchar("submitted_at",      { length: 64  }).notNull().default(""),
  updated_at:        varchar("updated_at",        { length: 64  }).notNull().default(""),
});
export type LcRequest = typeof lcRequests.$inferSelect;
export type InsertLcRequest = typeof lcRequests.$inferInsert;
