CREATE TABLE `invoice_expo_history` (
	`id` varchar(64) NOT NULL,
	`monthYear` varchar(10) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'running',
	`pdfCount` int DEFAULT 0,
	`errorMsg` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_expo_history_id` PRIMARY KEY(`id`)
);
