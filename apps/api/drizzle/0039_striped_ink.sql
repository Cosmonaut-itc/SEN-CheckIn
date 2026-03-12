ALTER TABLE "payroll_setting" ADD COLUMN "auto_deduct_lunch_break" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "lunch_break_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "lunch_break_threshold_hours" numeric(4, 2) DEFAULT '6' NOT NULL;