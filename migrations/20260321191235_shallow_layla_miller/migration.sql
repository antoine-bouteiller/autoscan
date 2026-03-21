CREATE TYPE "media_type" AS ENUM('movie', 'show');--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "type" SET DATA TYPE "media_type" USING "type"::"media_type";