CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text,
	`action` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`actor` text DEFAULT 'local' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_tournament_idx` ON `audit_log` (`tournament_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`table_number` integer NOT NULL,
	`player_a_id` text,
	`player_b_id` text,
	`player_a_name` text NOT NULL,
	`player_b_name` text NOT NULL,
	`result` text DEFAULT '—' NOT NULL,
	`status` text DEFAULT 'playing' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `matches_round_idx` ON `matches` (`round_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_round_table_unique` ON `matches` (`round_id`,`table_number`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `players_tournament_idx` ON `players` (`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `players_tournament_name_unique` ON `players` (`tournament_id`,`name`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`tournament_id` text NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`tournament_id`) REFERENCES `tournaments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rounds_tournament_idx` ON `rounds` (`tournament_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_tournament_number_unique` ON `rounds` (`tournament_id`,`number`);--> statement-breakpoint
CREATE TABLE `tournaments` (
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
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tournaments_status_idx` ON `tournaments` (`status`);