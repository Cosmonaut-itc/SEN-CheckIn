CREATE TYPE "public"."check_out_reason" AS ENUM('REGULAR', 'LUNCH_BREAK', 'PERSONAL');--> statement-breakpoint
ALTER TABLE "attendance_record" ADD COLUMN "check_out_reason" "check_out_reason";--> statement-breakpoint
