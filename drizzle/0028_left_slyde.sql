CREATE TABLE `splitter_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userEmail` varchar(320) NOT NULL DEFAULT '',
	`userName` varchar(255) NOT NULL DEFAULT '',
	`filename` varchar(512) NOT NULL DEFAULT '',
	`status` varchar(32) NOT NULL DEFAULT 'processing',
	`invoiceCol` varchar(255) NOT NULL DEFAULT '',
	`numericCol` varchar(255) NOT NULL DEFAULT '',
	`totalInvoices` int NOT NULL DEFAULT 0,
	`skippedRows` int NOT NULL DEFAULT 0,
	`zipKey` varchar(512) NOT NULL DEFAULT '',
	`summaryJson` text NOT NULL DEFAULT ('[]'),
	`bqQuery` text NOT NULL DEFAULT (''),
	`logs` text NOT NULL DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `splitter_jobs_id` PRIMARY KEY(`id`)
);
