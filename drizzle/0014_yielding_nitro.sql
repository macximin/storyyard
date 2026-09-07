CREATE TABLE `firefly_canary_archives` (
	`canary_id` text PRIMARY KEY NOT NULL,
	`archived` integer NOT NULL,
	`reason` text NOT NULL,
	`replacement_id` text,
	`actor_user_id` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `firefly_review_snapshots_schema_generated_idx` ON `firefly_review_snapshots` (`schema_version`,`generated_at`,`packet_id`);