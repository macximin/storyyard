CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'visible' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `manuscripts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`episode_no` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manuscripts_project_episode_unique` ON `manuscripts` (`project_id`,`episode_no`);--> statement-breakpoint
CREATE TABLE `publication_episodes` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`source_manuscript_id` text NOT NULL,
	`episode_no` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`published_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publication_episodes_publication_episode_unique` ON `publication_episodes` (`publication_id`,`episode_no`);--> statement-breakpoint
CREATE TABLE `publication_favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publication_favorites_user_work_unique` ON `publication_favorites` (`user_id`,`publication_id`);--> statement-breakpoint
CREATE TABLE `publications` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`logline` text DEFAULT '' NOT NULL,
	`genre` text DEFAULT '웹소설' NOT NULL,
	`cover_url` text DEFAULT '/default-cover.png' NOT NULL,
	`author_name` text NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`published_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publications_project_unique` ON `publications` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `publications_slug_unique` ON `publications` (`slug`);--> statement-breakpoint
CREATE TABLE `ratings` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`user_id` text NOT NULL,
	`value` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ratings_user_work_unique` ON `ratings` (`user_id`,`publication_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`owner_key` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_owner_key_unique` ON `users` (`owner_key`);