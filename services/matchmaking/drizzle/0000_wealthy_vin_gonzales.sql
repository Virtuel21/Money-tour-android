CREATE TABLE `request_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`requests` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`owner_hash` text NOT NULL,
	`token_hash` text NOT NULL,
	`seat_id` text NOT NULL,
	`status` text NOT NULL,
	`identity_id` text,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reservations_room` ON `reservations` (`room_id`,`owner_hash`,`expires_at`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`host_token_hash` text NOT NULL,
	`host_id` text NOT NULL,
	`protocol` integer NOT NULL,
	`rules_version` integer NOT NULL,
	`language` text NOT NULL,
	`region` text NOT NULL,
	`phase` text NOT NULL,
	`humans` integer NOT NULL,
	`capacity` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`elapsed_ms` integer NOT NULL,
	`claimable_seats` text NOT NULL,
	`member_ids` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rooms_match` ON `rooms` (`protocol`,`rules_version`,`expires_at`);