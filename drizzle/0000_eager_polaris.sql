CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "lc_requests" (
	"request_id" varchar(32) PRIMARY KEY NOT NULL,
	"requester_name" varchar(255) DEFAULT '' NOT NULL,
	"requester_email" varchar(320) DEFAULT '' NOT NULL,
	"department" varchar(255) DEFAULT '' NOT NULL,
	"request_type" varchar(255) DEFAULT '' NOT NULL,
	"priority" varchar(64) DEFAULT '' NOT NULL,
	"deadline" varchar(64) DEFAULT '' NOT NULL,
	"description" text,
	"doc_link" text,
	"counter_party" varchar(512) DEFAULT '' NOT NULL,
	"customer_type" varchar(255) DEFAULT '' NOT NULL,
	"ip_product" varchar(255) DEFAULT '' NOT NULL,
	"biz_segment" varchar(255) DEFAULT '' NOT NULL,
	"pnl_owner" varchar(255) DEFAULT '' NOT NULL,
	"region" varchar(255) DEFAULT '' NOT NULL,
	"current_status" varchar(128) DEFAULT 'request-raised' NOT NULL,
	"status_note" text,
	"history_json" text,
	"status_updated_by" varchar(320) DEFAULT '' NOT NULL,
	"requested_by" varchar(320) DEFAULT '' NOT NULL,
	"is_confidential" integer DEFAULT 0 NOT NULL,
	"submitted_at" varchar(64) DEFAULT '' NOT NULL,
	"updated_at" varchar(64) DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lc_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(255) DEFAULT '' NOT NULL,
	"googleId" varchar(128) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lc_user_scopes" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(255) DEFAULT '' NOT NULL,
	"scopes" text,
	"assignedBy" varchar(320) DEFAULT '' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lc_user_scopes_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
