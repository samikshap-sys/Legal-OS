CREATE TABLE `brand_ledger_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userName` varchar(255) NOT NULL DEFAULT '',
	`activityType` varchar(128) NOT NULL,
	`companyId` varchar(64) DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `brand_ledger_activity_log_id` PRIMARY KEY(`id`)
);
