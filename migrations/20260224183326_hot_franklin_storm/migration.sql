CREATE TABLE `trakt_sync_history` (
	`plex_rating_key` text PRIMARY KEY,
	`synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trakt_tokens` (
	`access_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`refresh_token` text NOT NULL
);
