DELETE FROM "subtitle_scans" WHERE "verdict" = 'forced_removed';--> statement-breakpoint
ALTER TYPE "subtitle_verdict" RENAME TO "subtitle_verdict_old";--> statement-breakpoint
CREATE TYPE "subtitle_verdict" AS ENUM('passed', 'sync_requested', 'invalid');--> statement-breakpoint
ALTER TABLE "subtitle_scans" ALTER COLUMN "verdict" TYPE "subtitle_verdict" USING "verdict"::text::"subtitle_verdict";--> statement-breakpoint
DROP TYPE "subtitle_verdict_old";
