CREATE TABLE `gauge_ticket_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` varchar(32) NOT NULL,
	`authorEmail` varchar(320) NOT NULL,
	`authorName` varchar(255) NOT NULL DEFAULT '',
	`content` text NOT NULL,
	`isStatusChange` int NOT NULL DEFAULT 0,
	`oldStatus` varchar(32) DEFAULT '',
	`newStatus` varchar(32) DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gauge_ticket_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gauge_ticket_counter` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lastValue` int NOT NULL DEFAULT 0,
	CONSTRAINT `gauge_ticket_counter_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gauge_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` varchar(32) NOT NULL,
	`title` varchar(512) NOT NULL,
	`description` text,
	`priority` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','in_progress','on_hold','disputed','resolved','closed') NOT NULL DEFAULT 'open',
	`category` varchar(128) NOT NULL DEFAULT 'General',
	`raisedByEmail` varchar(320) NOT NULL,
	`raisedByName` varchar(255) NOT NULL DEFAULT '',
	`driEmail` varchar(320) NOT NULL,
	`driName` varchar(255) NOT NULL DEFAULT '',
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gauge_tickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `gauge_tickets_ticketId_unique` UNIQUE(`ticketId`)
);
--> statement-breakpoint
CREATE TABLE `lc_user_scopes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT '',
	`scopes` text,
	`assignedBy` varchar(320) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lc_user_scopes_id` PRIMARY KEY(`id`),
	CONSTRAINT `lc_user_scopes_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `qb_user_scopes` MODIFY COLUMN `scopes` text;