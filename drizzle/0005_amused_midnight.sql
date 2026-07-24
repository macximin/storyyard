ALTER TABLE `comments` ADD `episode_id` text;--> statement-breakpoint
CREATE INDEX `comments_publication_episode_idx` ON `comments` (`publication_id`,`episode_id`);