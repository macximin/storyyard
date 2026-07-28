ALTER TABLE `sessions` ADD `human_action_token_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `human_action_project_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `human_action_kind` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `human_action_expires_at` text DEFAULT '' NOT NULL;