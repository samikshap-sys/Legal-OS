CREATE TABLE `brand_ledger_download_jobs` (
	`id` varchar(64) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'running',
	`filename` varchar(255) NOT NULL DEFAULT '',
	`fileKey` text,
	`errorMsg` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `brand_ledger_download_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `brand_ledger_query_jobs` (
	`id` varchar(64) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'running',
	`resultKey` text,
	`errorMsg` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `brand_ledger_query_jobs_id` PRIMARY KEY(`id`)
);
