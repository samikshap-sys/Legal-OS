CREATE TABLE `query_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`query` text NOT NULL,
	`queryType` varchar(20) NOT NULL DEFAULT 'OTHER',
	`tables` text DEFAULT (''),
	`rowCount` int DEFAULT 0,
	`elapsed` varchar(20) DEFAULT '',
	`runAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `query_logs_id` PRIMARY KEY(`id`)
);
