// Auto-generated file. Do not edit.
export const migrations = [
  {
    name: '20251121083546_lame_the_spike',
    statements: [
      `CREATE TABLE "media" (	"tmdb_id" integer NOT NULL,	"original_language" text NOT NULL,	"preferred_language" text NOT NULL,	"title" text NOT NULL,	"type" text NOT NULL,	CONSTRAINT "media_tmdb_id_type_pk" PRIMARY KEY("tmdb_id", "type"));`,
    ],
  },
  {
    name: '20260224183326_hot_franklin_storm',
    statements: [
      `CREATE TABLE "trakt_sync_history" (	"plex_rating_key" text PRIMARY KEY,	"synced_at" timestamp NOT NULL);`,
      `CREATE TABLE "trakt_tokens" (	"access_token" text NOT NULL,	"expires_at" integer NOT NULL,	"id" serial PRIMARY KEY,	"refresh_token" text NOT NULL);`,
    ],
  },
]
