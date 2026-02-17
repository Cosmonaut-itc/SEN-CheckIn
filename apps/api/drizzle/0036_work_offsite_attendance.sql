ALTER TYPE "attendance_type" ADD VALUE IF NOT EXISTS 'WORK_OFFSITE';--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'offsite_day_kind'
			AND n.nspname = 'public'
	) THEN
		CREATE TYPE "offsite_day_kind" AS ENUM ('LABORABLE', 'NO_LABORABLE');
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "attendance_record"
	ADD COLUMN IF NOT EXISTS "offsite_date_key" text,
	ADD COLUMN IF NOT EXISTS "offsite_day_kind" "offsite_day_kind",
	ADD COLUMN IF NOT EXISTS "offsite_reason" text,
	ADD COLUMN IF NOT EXISTS "offsite_created_by_user_id" text,
	ADD COLUMN IF NOT EXISTS "offsite_updated_by_user_id" text,
	ADD COLUMN IF NOT EXISTS "offsite_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "attendance_record"
	DROP CONSTRAINT IF EXISTS "attendance_record_offsite_required_chk";--> statement-breakpoint
ALTER TABLE "attendance_record"
	ADD CONSTRAINT "attendance_record_offsite_required_chk" CHECK (
		"type" <> 'WORK_OFFSITE'
		OR (
			"offsite_date_key" IS NOT NULL
			AND "offsite_day_kind" IS NOT NULL
			AND "offsite_reason" IS NOT NULL
			AND char_length("offsite_reason") BETWEEN 10 AND 500
			AND "offsite_created_by_user_id" IS NOT NULL
			AND "offsite_updated_by_user_id" IS NOT NULL
			AND "offsite_updated_at" IS NOT NULL
		)
	);--> statement-breakpoint
ALTER TABLE "attendance_record"
	DROP CONSTRAINT IF EXISTS "attendance_record_offsite_only_work_offsite_chk";--> statement-breakpoint
ALTER TABLE "attendance_record"
	ADD CONSTRAINT "attendance_record_offsite_only_work_offsite_chk" CHECK (
		"type" = 'WORK_OFFSITE'
		OR (
			"offsite_date_key" IS NULL
			AND "offsite_day_kind" IS NULL
			AND "offsite_reason" IS NULL
			AND "offsite_created_by_user_id" IS NULL
			AND "offsite_updated_by_user_id" IS NULL
			AND "offsite_updated_at" IS NULL
		)
	);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_record_offsite_employee_date_uniq"
	ON "attendance_record" ("employee_id", "offsite_date_key")
	WHERE "type" = 'WORK_OFFSITE';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_record_offsite_date_idx"
	ON "attendance_record" ("offsite_date_key")
	WHERE "type" = 'WORK_OFFSITE';
