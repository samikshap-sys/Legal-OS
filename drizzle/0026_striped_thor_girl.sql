CREATE TABLE `gauge_meetings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerEmail` varchar(320) NOT NULL,
	`title` varchar(512) NOT NULL,
	`startAt` bigint NOT NULL,
	`endAt` bigint NOT NULL,
	`location` varchar(512) DEFAULT '',
	`googleMeetLink` varchar(512) DEFAULT '',
	`description` text,
	`momNotes` text,
	`attendees` text NOT NULL DEFAULT ('[]'),
	`docLinks` text NOT NULL DEFAULT ('[]'),
	`slackNotified` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gauge_meetings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gauge_task_shares` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateId` int NOT NULL,
	`sharedWithEmail` varchar(320) NOT NULL,
	`permission` enum('view','edit') NOT NULL DEFAULT 'view',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gauge_task_shares_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gauge_task_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerEmail` varchar(320) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('standard','custom') NOT NULL DEFAULT 'standard',
	`columns` text NOT NULL DEFAULT ('[]'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gauge_task_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gauge_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerEmail` varchar(320) NOT NULL,
	`templateId` int NOT NULL,
	`data` text NOT NULL DEFAULT ('{}'),
	`status` varchar(32) NOT NULL DEFAULT 'todo',
	`position` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gauge_tasks_id` PRIMARY KEY(`id`)
);
