ALTER TABLE "device" ALTER COLUMN "location_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "time_zone" text DEFAULT 'America/Mexico_City' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "mandatory_rest_day_premium_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "additional_mandatory_rest_days" jsonb DEFAULT '[]'::jsonb NOT NULL;