ALTER TABLE "payroll_setting" ADD COLUMN "time_zone" text DEFAULT 'America/Mexico_City' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_position" DROP COLUMN "hourly_pay";