CREATE TABLE `bq_load_jobs` (
	`id` varchar(64) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`logs` text DEFAULT (''),
	`result` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bq_load_jobs_id` PRIMARY KEY(`id`)
);
