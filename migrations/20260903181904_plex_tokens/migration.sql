CREATE TABLE "plex_tokens" (
	"auth_token" text NOT NULL,
	"client_identifier" text NOT NULL,
	"id" serial PRIMARY KEY,
	"linked_at" timestamp NOT NULL
);
