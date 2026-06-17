CREATE TABLE `bq_upload_history` (
	`id` varchar(64) NOT NULL,
	`tableId` varchar(512) NOT NULL,
	`fileType` varchar(10) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'success',
	`totalColumns` int DEFAULT 0,
	`totalRows` int DEFAULT 0,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`uploadedBy` varchar(255) DEFAULT '',
	`fileKey` varchar(512) DEFAULT '',
	`fileUrl` varchar(1024) DEFAULT '',
	`errorMsg` text,
	CONSTRAINT `bq_upload_history_id` PRIMARY KEY(`id`)
);
