CREATE TABLE `media` (
	`tmdb_id` integer NOT NULL,
	`original_language` text NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	PRIMARY KEY(`tmdb_id`, `type`)
);
