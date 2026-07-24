CREATE TABLE `project_items` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`updated_at` text NOT NULL
);
