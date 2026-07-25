CREATE INDEX `plot_blocks_project_act_sort_idx` ON `plot_blocks` (`project_id`,`act`,`sort_order`);--> statement-breakpoint
CREATE INDEX `project_items_project_kind_updated_idx` ON `project_items` (`project_id`,`kind`,`updated_at`);--> statement-breakpoint
CREATE INDEX `projects_owner_updated_idx` ON `projects` (`owner_email`,`updated_at`);