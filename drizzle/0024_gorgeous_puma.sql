CREATE TABLE `gauge_sessions` (
	`id` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(255) NOT NULL DEFAULT '',
	`googleId` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `gauge_sessions_id` PRIMARY KEY(`id`)
);
