CREATE TYPE "bazarr_kind" AS ENUM('movie', 'episode');--> statement-breakpoint
CREATE TYPE "subtitle_verdict" AS ENUM('passed', 'forced_removed', 'sync_requested');--> statement-breakpoint
CREATE TABLE "french_profiles" (
	"assigned_at" timestamp NOT NULL,
	"bazarr_id" integer,
	"bazarr_kind" "bazarr_kind",
	"released_at" timestamp,
	CONSTRAINT "french_profiles_pkey" PRIMARY KEY("bazarr_kind","bazarr_id")
);
--> statement-breakpoint
CREATE TABLE "missing_subtitles" (
	"acted_at" timestamp,
	"bazarr_id" integer,
	"bazarr_kind" "bazarr_kind",
	"first_seen_at" timestamp NOT NULL,
	"language" text,
	CONSTRAINT "missing_subtitles_pkey" PRIMARY KEY("bazarr_kind","bazarr_id","language")
);
--> statement-breakpoint
CREATE TABLE "subtitle_scans" (
	"file_path" text NOT NULL,
	"hash" text,
	"scan_version" integer,
	"scanned_at" timestamp NOT NULL,
	"verdict" "subtitle_verdict" NOT NULL,
	CONSTRAINT "subtitle_scans_pkey" PRIMARY KEY("hash","scan_version")
);
