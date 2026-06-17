import { bigint, customType, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

// Custom MEDIUMBLOB type for Drizzle
const mediumblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return "mediumblob"; },
  toDriver(value: Buffer) { return value; },
  fromDriver(value: Buffer) { return value; },
});

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
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

// QueryBee Google OAuth sessions
export const qbSessions = mysqlTable("qb_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }).notNull().default(""),
  googleId: varchar("googleId", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

export type QbSession = typeof qbSessions.$inferSelect;
export type InsertQbSession = typeof qbSessions.$inferInsert;

// Legal Connect Google OAuth sessions
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

// Mogambo Google OAuth sessions
export const mogamboSessions = mysqlTable("mogambo_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }).notNull().default(""),
  googleId: varchar("googleId", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});
export type MogamboSession = typeof mogamboSessions.$inferSelect;
export type InsertMogamboSession = typeof mogamboSessions.$inferInsert;

// Gauge Google OAuth sessions
export const gaugeSessions = mysqlTable("gauge_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }).notNull().default(""),
  googleId: varchar("googleId", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});
export type GaugeSession = typeof gaugeSessions.$inferSelect;
export type InsertGaugeSession = typeof gaugeSessions.$inferInsert;

// BQ Upload History table
export const bqUploadHistory = mysqlTable("bq_upload_history", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tableId: varchar("tableId", { length: 512 }).notNull(),
  fileType: varchar("fileType", { length: 10 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("success"),
  totalColumns: int("totalColumns").default(0),
  totalRows: int("totalRows").default(0),
  uploadedAt: timestamp("uploadedAt").defaultNow().notNull(),
  uploadedBy: varchar("uploadedBy", { length: 255 }).default(""),
  fileKey: varchar("fileKey", { length: 512 }).default(""),
  fileUrl: varchar("fileUrl", { length: 1024 }).default(""),
  fileName: varchar("fileName", { length: 512 }).default(""),
  errorMsg: text("errorMsg"),
});

export type BqUploadHistory = typeof bqUploadHistory.$inferSelect;
export type InsertBqUploadHistory = typeof bqUploadHistory.$inferInsert;

// BQ Load Jobs table — persists job state so status polling works across restarts/instances
export const bqLoadJobsTable = mysqlTable("bq_load_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | running | done | failed
  logs: text("logs"),                   // JSON array of log strings (nullable)
  result: text("result"),               // JSON object or null
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type BqLoadJob = typeof bqLoadJobsTable.$inferSelect;
export type InsertBqLoadJob = typeof bqLoadJobsTable.$inferInsert;

// Invoice Download History table
export const invoiceDownloadHistory = mysqlTable("invoice_download_history", {
  id: varchar("id", { length: 64 }).primaryKey(),
  requestType: varchar("requestType", { length: 20 }).notNull(), // 'invoice_ids' | 'month_year'
  query: varchar("query", { length: 1024 }).notNull(),
  invoiceCount: int("invoiceCount").default(0),
  fileNames: text("fileNames").default(""), // JSON array as string
  status: varchar("status", { length: 20 }).notNull().default("success"), // 'success' | 'failed' | 'triggered'
  fileKey: varchar("fileKey", { length: 512 }).default(""),
  errorMsg: text("errorMsg"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  downloadedBy: varchar("downloadedBy", { length: 255 }).default(""),
});

export type InvoiceDownloadHistory = typeof invoiceDownloadHistory.$inferSelect;
export type InsertInvoiceDownloadHistory = typeof invoiceDownloadHistory.$inferInsert;

// Querypad Query Logs table
export const queryLogs = mysqlTable("query_logs", {
  id: int("id").autoincrement().primaryKey(),
  query: text("query").notNull(),
  queryType: varchar("queryType", { length: 20 }).notNull().default("OTHER"),
  tables: text("tables").default(""), // JSON array as string
  rowCount: int("rowCount").default(0),
  elapsed: varchar("elapsed", { length: 20 }).default(""),
  runAt: timestamp("runAt").defaultNow().notNull(),
  executedBy: varchar("executedBy", { length: 255 }).default(""),
});

export type QueryLog = typeof queryLogs.$inferSelect;
export type InsertQueryLog = typeof queryLogs.$inferInsert;

// Pipeline History table
export const pipelineHistory = mysqlTable("pipeline_history", {
  id: int("id").autoincrement().primaryKey(),
  status: varchar("status", { length: 20 }).notNull().default("running"), // 'running' | 'success' | 'failed'
  jobType: varchar("jobType", { length: 64 }).notNull(), // 'Recon Pipeline' | 'Partner Pipeline' | 'Scheduler'
  executionMode: varchar("executionMode", { length: 32 }).notNull(), // 'Full Workflow' | 'Single Query' | 'Scheduled Query'
  query: varchar("query", { length: 1024 }).notNull().default("—"),
  invocationId: varchar("invocationId", { length: 512 }).default(""),
  runRef: varchar("runRef", { length: 1024 }).default(""),
  errorMsg: text("errorMsg"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  executedBy: varchar("executedBy", { length: 255 }).default(""),
});

export type PipelineHistory = typeof pipelineHistory.$inferSelect;
export type InsertPipelineHistory = typeof pipelineHistory.$inferInsert;

// Invoice Expo (PDF Export) History table
export const invoiceExpoHistory = mysqlTable("invoice_expo_history", {
  id: varchar("id", { length: 64 }).primaryKey(),
  monthYear: varchar("monthYear", { length: 10 }).notNull(), // MM-YYYY
  status: varchar("status", { length: 20 }).notNull().default("running"), // 'running' | 'success' | 'failed' | 'cancelled'
  pdfCount: int("pdfCount").default(0),
  errorMsg: text("errorMsg"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  executedBy: varchar("executedBy", { length: 255 }).default(""),
});

export type InvoiceExpoHistory = typeof invoiceExpoHistory.$inferSelect;
export type InsertInvoiceExpoHistory = typeof invoiceExpoHistory.$inferInsert;

// Brand Ledger Download Jobs (async Excel generation)
export const brandLedgerDownloadJobs = mysqlTable("brand_ledger_download_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  status: varchar("status", { length: 20 }).notNull().default("running"), // 'running' | 'done' | 'error'
  filename: varchar("filename", { length: 255 }).notNull().default(""),
  fileKey: text("fileKey"),   // S3 storage key (replaces MEDIUMBLOB)
  errorMsg: text("errorMsg"),
  progressMsg: varchar("progressMsg", { length: 255 }),  // e.g. "Fetching Receivable… 1/7"
  progressStep: int("progressStep").default(0),          // 0–8
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});
export type BrandLedgerDownloadJob = typeof brandLedgerDownloadJobs.$inferSelect;
export type InsertBrandLedgerDownloadJob = typeof brandLedgerDownloadJobs.$inferInsert;

// Brand Ledger Query Jobs (async KPI/preview results)
export const brandLedgerQueryJobs = mysqlTable("brand_ledger_query_jobs", {
  id: varchar("id", { length: 64 }).primaryKey(),
  status: varchar("status", { length: 20 }).notNull().default("running"), // 'running' | 'done' | 'error'
  resultKey: text("resultKey"), // S3 key for the JSON result (avoids large TEXT in DB)
  errorMsg: text("errorMsg"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});
export type BrandLedgerQueryJob = typeof brandLedgerQueryJobs.$inferSelect;
export type InsertBrandLedgerQueryJob = typeof brandLedgerQueryJobs.$inferInsert;

// QueryBee User Scopes — admin-assigned sidebar access per QB email
export const qbUserScopes = mysqlTable("qb_user_scopes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull().default(""),
  scopes: text("scopes"), // JSON array of scope IDs (nullable, null = no scopes assigned)
  assignedBy: varchar("assignedBy", { length: 320 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type QbUserScope = typeof qbUserScopes.$inferSelect;
export type InsertQbUserScope = typeof qbUserScopes.$inferInsert;

// Legal Connect User Scopes
export const lcUserScopes = mysqlTable("lc_user_scopes", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull().default(""),
  scopes: text("scopes"), // JSON array of scope IDs (nullable, null = no scopes assigned)
  assignedBy: varchar("assignedBy", { length: 320 }).notNull().default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LcUserScope = typeof lcUserScopes.$inferSelect;
export type InsertLcUserScope = typeof lcUserScopes.$inferInsert;

// Brand Ledger Activity Log
export const brandLedgerActivityLog = mysqlTable("brand_ledger_activity_log", {
  id: int("id").autoincrement().primaryKey(),
  userName: varchar("userName", { length: 255 }).notNull().default(""),
  activityType: varchar("activityType", { length: 128 }).notNull(),
  companyId: varchar("companyId", { length: 64 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type BrandLedgerActivityLog = typeof brandLedgerActivityLog.$inferSelect;
export type InsertBrandLedgerActivityLog = typeof brandLedgerActivityLog.$inferInsert;

// ── Gauge Ticketing System ──────────────────────────────────────────────────

export const gaugeTickets = mysqlTable("gauge_tickets", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: varchar("ticketId", { length: 32 }).notNull().unique(), // GAUGE-0001
  title: varchar("title", { length: 512 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).notNull().default("medium"),
  status: mysqlEnum("status", ["open", "in_progress", "on_hold", "disputed", "resolved", "closed"]).notNull().default("open"),
  category: varchar("category", { length: 128 }).notNull().default("General"),
  raisedByEmail: varchar("raisedByEmail", { length: 320 }).notNull(),
  raisedByName: varchar("raisedByName", { length: 255 }).notNull().default(""),
  driEmail: varchar("driEmail", { length: 320 }).notNull(),
  driName: varchar("driName", { length: 255 }).notNull().default(""),
  resolvedAt: timestamp("resolvedAt"),
  slackThreadTs: varchar("slackThreadTs", { length: 64 }).default(""),
  slackChannelId: varchar("slackChannelId", { length: 128 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GaugeTicket = typeof gaugeTickets.$inferSelect;
export type InsertGaugeTicket = typeof gaugeTickets.$inferInsert;

export const gaugeTicketComments = mysqlTable("gauge_ticket_comments", {
  id: int("id").autoincrement().primaryKey(),
  ticketId: varchar("ticketId", { length: 32 }).notNull(), // FK to gaugeTickets.ticketId
  authorEmail: varchar("authorEmail", { length: 320 }).notNull(),
  authorName: varchar("authorName", { length: 255 }).notNull().default(""),
  content: text("content").notNull(),
  isStatusChange: int("isStatusChange").notNull().default(0), // 0 = comment, 1 = status change event
  oldStatus: varchar("oldStatus", { length: 32 }).default(""),
  newStatus: varchar("newStatus", { length: 32 }).default(""),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GaugeTicketComment = typeof gaugeTicketComments.$inferSelect;
export type InsertGaugeTicketComment = typeof gaugeTicketComments.$inferInsert;

// Counter table for auto-incrementing GAUGE-XXXX IDs
export const gaugeTicketCounter = mysqlTable("gauge_ticket_counter", {
  id: int("id").autoincrement().primaryKey(),
  lastValue: int("lastValue").notNull().default(0),
});

// ── Gauge My Tasks ──────────────────────────────────────────────────────────

// Task templates — standard (predefined columns) or custom (user-defined columns)
export const gaugeTaskTemplates = mysqlTable("gauge_task_templates", {
  id: int("id").autoincrement().primaryKey(),
  ownerEmail: varchar("ownerEmail", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["standard", "custom"]).notNull().default("standard"),
  // JSON array of column definitions: [{name, type: 'text'|'number'|'boolean'|'date'|'dropdown', options?: string[]}]
  columns: text("columns").notNull().default("[]"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GaugeTaskTemplate = typeof gaugeTaskTemplates.$inferSelect;
export type InsertGaugeTaskTemplate = typeof gaugeTaskTemplates.$inferInsert;

// Individual tasks belonging to a template
export const gaugeTasks = mysqlTable("gauge_tasks", {
  id: int("id").autoincrement().primaryKey(),
  ownerEmail: varchar("ownerEmail", { length: 320 }).notNull(),
  templateId: int("templateId").notNull(), // FK to gaugeTaskTemplates.id
  // JSON object: {taskName, startDate, endDate, priority, docLinks, status, ...custom fields}
  data: text("data").notNull().default("{}"),
  status: varchar("status", { length: 32 }).notNull().default("todo"), // todo | in_progress | done | blocked
  position: int("position").notNull().default(0), // for row ordering
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GaugeTask = typeof gaugeTasks.$inferSelect;
export type InsertGaugeTask = typeof gaugeTasks.$inferInsert;

// Task template sharing — allows other @gofynd.com users to view/edit a template
export const gaugeTaskShares = mysqlTable("gauge_task_shares", {
  id: int("id").autoincrement().primaryKey(),
  templateId: int("templateId").notNull(), // FK to gaugeTaskTemplates.id
  sharedWithEmail: varchar("sharedWithEmail", { length: 320 }).notNull(),
  permission: mysqlEnum("permission", ["view", "edit"]).notNull().default("view"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type GaugeTaskShare = typeof gaugeTaskShares.$inferSelect;
export type InsertGaugeTaskShare = typeof gaugeTaskShares.$inferInsert;

// ── Gauge Calendar / Meetings ────────────────────────────────────────────────

export const gaugeMeetings = mysqlTable("gauge_meetings", {
  id: int("id").autoincrement().primaryKey(),
  ownerEmail: varchar("ownerEmail", { length: 320 }).notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  startAt: bigint("startAt", { mode: "number" }).notNull(), // UTC ms timestamp
  endAt: bigint("endAt", { mode: "number" }).notNull(),     // UTC ms timestamp
  location: varchar("location", { length: 512 }).default(""),
  googleMeetLink: varchar("googleMeetLink", { length: 512 }).default(""),
  description: text("description"),
  momNotes: text("momNotes"),
  // JSON array of {email, name} objects
  attendees: text("attendees").notNull().default("[]"),
  // JSON array of {label, url} objects
  docLinks: text("docLinks").notNull().default("[]"),
  slackNotified: int("slackNotified").notNull().default(0), // 0 | 1
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type GaugeMeeting = typeof gaugeMeetings.$inferSelect;
export type InsertGaugeMeeting = typeof gaugeMeetings.$inferInsert;

// ── Legal Connect Requests ───────────────────────────────────────────────────
// Mirrors fynd-db.finance_dwh.finops_legal_requests (migrated from BigQuery)
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

// ── Invoice Splitter Jobs ────────────────────────────────────────────────────
export const splitterJobs = mysqlTable("splitter_jobs", {
  id: int("id").autoincrement().primaryKey(),
  userEmail: varchar("userEmail", { length: 320 }).notNull().default(""),
  userName: varchar("userName", { length: 255 }).notNull().default(""),
  filename: varchar("filename", { length: 512 }).notNull().default(""),
  status: varchar("status", { length: 32 }).notNull().default("processing"),
  invoiceCol: varchar("invoiceCol", { length: 255 }).notNull().default(""),
  numericCol: varchar("numericCol", { length: 255 }).notNull().default(""),
  totalInvoices: int("totalInvoices").notNull().default(0),
  skippedRows: int("skippedRows").notNull().default(0),
  zipKey: varchar("zipKey", { length: 512 }).notNull().default(""),
  summaryJson: text("summaryJson").notNull().default("[]"),
  bqQuery: text("bqQuery").notNull().default(""),
  logs: text("logs").notNull().default("[]"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SplitterJob = typeof splitterJobs.$inferSelect;
export type InsertSplitterJob = typeof splitterJobs.$inferInsert;
