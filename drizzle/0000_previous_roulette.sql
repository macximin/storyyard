CREATE TABLE `plot_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`act` integer NOT NULL,
	`kind` text DEFAULT 'scene' NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`sort_order` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`title` text NOT NULL,
	`logline` text DEFAULT '' NOT NULL,
	`genre` text DEFAULT '웹소설' NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
