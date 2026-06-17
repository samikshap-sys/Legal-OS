CREATE TABLE `qb_sessions` (
	`id` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT '',
	`googleId` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `qb_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `invoice_download_history` ADD `downloadedBy` varchar(255) DEFAULT '';--> statement-breakpoint
ALTER TABLE `invoice_expo_history` ADD `executedBy` varchar(255) DEFAULT '';--> statement-breakpoint
ALTER TABLE `pipeline_history` ADD `executedBy` varchar(255) DEFAULT '';--> statement-breakpoint
ALTER TABLE `query_logs` ADD `executedBy` varchar(255) DEFAULT '';