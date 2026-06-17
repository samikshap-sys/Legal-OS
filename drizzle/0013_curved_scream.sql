CREATE TABLE `brand_ledger_query_jobs` (
	`id` varchar(64) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'running',
	`resultJson` mediumtext,
	`errorMsg` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `brand_ledger_query_jobs_id` PRIMARY KEY(`id`)
);
