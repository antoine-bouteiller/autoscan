ALTER TABLE "subtitle_scans" DROP COLUMN "hash";--> statement-breakpoint
ALTER TABLE "transcode_scans" DROP COLUMN "hash";--> statement-breakpoint
ALTER TABLE "transcode_scans" DROP COLUMN "extension";--> statement-breakpoint
DELETE FROM "subtitle_scans"
WHERE ctid NOT IN (
  SELECT DISTINCT ON ("file_path") ctid
  FROM "subtitle_scans"
  ORDER BY "file_path", "scanned_at" DESC, ctid DESC
);--> statement-breakpoint
DELETE FROM "transcode_scans"
WHERE ctid NOT IN (
  SELECT DISTINCT ON ("file_path") ctid
  FROM "transcode_scans"
  ORDER BY "file_path", "scanned_at" DESC, ctid DESC
);--> statement-breakpoint
ALTER TABLE "subtitle_scans" ADD PRIMARY KEY ("file_path");--> statement-breakpoint
ALTER TABLE "transcode_scans" ADD PRIMARY KEY ("file_path");