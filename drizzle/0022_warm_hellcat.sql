CREATE TABLE `qb_user_scopes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT '',
	`scopes` text NOT NULL DEFAULT ('[]'),
	`assignedBy` varchar(320) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qb_user_scopes_id` PRIMARY KEY(`id`),
	CONSTRAINT `qb_user_scopes_email_unique` UNIQUE(`email`)
);
