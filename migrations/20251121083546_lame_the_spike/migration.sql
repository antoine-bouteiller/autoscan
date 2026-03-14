CREATE TABLE "media" (
	"tmdb_id" integer NOT NULL,
	"original_language" text NOT NULL,
	"preferred_language" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "media_tmdb_id_type_pk" PRIMARY KEY("tmdb_id", "type")
);
