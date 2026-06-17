CREATE TABLE `pipeline_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'running',
	`jobType` varchar(64) NOT NULL,
	`executionMode` varchar(32) NOT NULL,
	`query` varchar(1024) NOT NULL DEFAULT '—',
	`invocationId` varchar(512) DEFAULT '',
	`runRef` varchar(1024) DEFAULT '',
	`errorMsg` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pipeline_history_id` PRIMARY KEY(`id`)
);
