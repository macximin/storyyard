CREATE TABLE `publication_content` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`parent_source_id` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publication_content_source_unique` ON `publication_content` (`publication_id`,`kind`,`source_id`);--> statement-breakpoint
CREATE INDEX `publication_content_lookup_idx` ON `publication_content` (`publication_id`,`kind`,`sort_order`);