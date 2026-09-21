CREATE TABLE "transcode_scans" (
	"hash" text,
	"extension" text,
	"original_language" text,
	"scan_version" integer,
	"file_path" text NOT NULL,
	"scanned_at" timestamp NOT NULL,
	CONSTRAINT "transcode_scans_pkey" PRIMARY KEY("hash","extension","original_language","scan_version")
);
