CREATE TABLE `canon_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`work_slug` text NOT NULL,
	`bundle_sha256` text NOT NULL,
	`artifact_key` text NOT NULL,
	`artifact_sha256` text NOT NULL,
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
CREATE INDEX `canon_decisions_work_created_idx` ON `canon_decisions` (`work_slug`,`created_at`);--> statement-breakpoint
CREATE INDEX `canon_decisions_pending_idx` ON `canon_decisions` (`status`,`work_slug`);--> statement-breakpoint
CREATE TABLE `canon_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`work_slug` text NOT NULL,
	`schema_version` text NOT NULL,
	`workflow_schema` text NOT NULL,
	`bundle_sha256` text NOT NULL,
	`revision_set_sha256` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`payload` text NOT NULL,
	`source_path` text NOT NULL,
	`source_updated_at` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `canon_snapshots_bundle_unique` ON `canon_snapshots` (`bundle_sha256`);--> statement-breakpoint
CREATE INDEX `canon_snapshots_work_imported_idx` ON `canon_snapshots` (`work_slug`,`imported_at`);