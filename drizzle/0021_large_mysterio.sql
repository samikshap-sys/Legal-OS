ALTER TABLE `brand_ledger_download_jobs` ADD `progressMsg` varchar(255);--> statement-breakpoint
ALTER TABLE `brand_ledger_download_jobs` ADD `progressStep` int DEFAULT 0;