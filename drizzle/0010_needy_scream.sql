ALTER TABLE `projects` ADD `cover_key` text DEFAULT 'overall-revision' NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `content_revision` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `publications` ADD `cover_key` text DEFAULT 'overall-revision' NOT NULL;--> statement-breakpoint
ALTER TABLE `publications` ADD `published_revision` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `projects` SET `content_revision` = `updated_at`;--> statement-breakpoint
UPDATE `publications` SET `published_revision` = `updated_at`;--> statement-breakpoint
UPDATE `projects`
   SET `cover_key` = 'unlimited-contest-expected-pass'
 WHERE `title` = '저승식당';--> statement-breakpoint
UPDATE `publications`
   SET `cover_key` = CASE
         WHEN `title` = '저승식당' THEN 'unlimited-contest-expected-pass'
         ELSE 'overall-revision'
       END,
       `cover_url` = CASE
         WHEN `title` = '저승식당' THEN '/covers/unlimited-contest-expected-pass.png'
         ELSE '/covers/overall-revision.png'
       END;
