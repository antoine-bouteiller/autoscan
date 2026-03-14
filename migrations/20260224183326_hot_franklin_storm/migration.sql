CREATE TABLE "trakt_sync_history" (
	"plex_rating_key" text PRIMARY KEY,
	"synced_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trakt_tokens" (
	"access_token" text NOT NULL,
	"expires_at" integer NOT NULL,
	"id" serial PRIMARY KEY,
	"refresh_token" text NOT NULL
);
