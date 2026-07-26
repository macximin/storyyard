CREATE TABLE `canon_bindings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`work_slug` text NOT NULL,
	`source_commit` text NOT NULL,
	`bundle_sha256` text NOT NULL,
	`revision_set_sha256` text NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `canon_bindings_work_slug_idx` ON `canon_bindings` (`work_slug`);--> statement-breakpoint
ALTER TABLE `manuscripts` ADD `meta` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `publication_episodes` ADD `meta` text DEFAULT '{}' NOT NULL;