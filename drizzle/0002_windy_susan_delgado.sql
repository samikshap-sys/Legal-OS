CREATE TABLE `invoice_download_history` (
	`id` varchar(64) NOT NULL,
	`requestType` varchar(20) NOT NULL,
	`query` varchar(1024) NOT NULL,
	`invoiceCount` int DEFAULT 0,
	`fileNames` text DEFAULT (''),
	`status` varchar(20) NOT NULL DEFAULT 'success',
	`fileKey` varchar(512) DEFAULT '',
	`errorMsg` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_download_history_id` PRIMARY KEY(`id`)
);
