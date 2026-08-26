CREATE TABLE `firefly_review_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`packet_id` text NOT NULL,
	`packet_sha256` text NOT NULL,
	`book_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`candidate_id` text DEFAULT '' NOT NULL,
	`candidate_sha256` text DEFAULT '' NOT NULL,
	`decision` text NOT NULL,
	`comment` text DEFAULT '' NOT NULL,
	`actor_user_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`applied_at` text,
	`apply_receipt_path` text
);
--> statement-breakpoint
CREATE INDEX `firefly_review_decisions_packet_created_idx` ON `firefly_review_decisions` (`packet_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `firefly_review_decisions_pending_idx` ON `firefly_review_decisions` (`status`,`book_id`);--> statement-breakpoint
CREATE TABLE `firefly_review_snapshots` (
	`packet_id` text PRIMARY KEY NOT NULL,
	`packet_sha256` text NOT NULL,
	`schema_version` text NOT NULL,
	`book_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`source_revision` text NOT NULL,
	`generated_at` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `firefly_review_snapshots_sha_unique` ON `firefly_review_snapshots` (`packet_sha256`);--> statement-breakpoint
CREATE INDEX `firefly_review_snapshots_book_generated_idx` ON `firefly_review_snapshots` (`book_id`,`generated_at`);--> statement-breakpoint
ALTER TABLE `projects` ADD `lifecycle` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `source_system` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `archived_at` text;--> statement-breakpoint
UPDATE `projects`
SET `lifecycle` = 'legacy',
    `source_system` = 'v3-foundry',
    `archived_at` = '2026-08-26T00:00:00.000Z';--> statement-breakpoint
UPDATE `publications` SET `status` = 'archived' WHERE `status` = 'published';
