PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tournaments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`game` text DEFAULT 'TCG' NOT NULL,
	`format` text DEFAULT 'Suizo' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`max_tables` integer DEFAULT 8 NOT NULL,
	`total_rounds` integer DEFAULT 4 NOT NULL,
	`current_round` integer DEFAULT 1 NOT NULL,
	`round_duration` integer DEFAULT 3000 NOT NULL,
	`timer_remaining` integer DEFAULT 3000 NOT NULL,
	`timer_started_at` text,
	`timer_running` integer DEFAULT false NOT NULL,
	`notice` text DEFAULT '' NOT NULL,
	`notice_visible` integer DEFAULT false NOT NULL,
	`ambient_motion` integer DEFAULT false NOT NULL,
	`sound_effects` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_tournaments`("id", "name", "game", "format", "status", "max_tables", "total_rounds", "current_round", "round_duration", "timer_remaining", "timer_started_at", "timer_running", "notice", "notice_visible", "ambient_motion", "sound_effects", "created_at", "updated_at") SELECT "id", "name", "game", "format", "status", "max_tables", "total_rounds", "current_round", "round_duration", "timer_remaining", "timer_started_at", "timer_running", "notice", "notice_visible", "ambient_motion", 1, "created_at", "updated_at" FROM `tournaments`;--> statement-breakpoint
DROP TABLE `tournaments`;--> statement-breakpoint
ALTER TABLE `__new_tournaments` RENAME TO `tournaments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `tournaments_status_idx` ON `tournaments` (`status`);
