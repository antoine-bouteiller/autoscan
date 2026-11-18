ALTER TYPE "subtitle_verdict" ADD VALUE 'inconclusive';--> statement-breakpoint
CREATE TYPE "subtitle_evidence" AS ENUM ('audio', 'reference');--> statement-breakpoint
ALTER TABLE "subtitle_scans"
  ADD COLUMN "file_size" bigint,
  ADD COLUMN "file_mtime" timestamp,
  ADD COLUMN "evidence" "subtitle_evidence";
