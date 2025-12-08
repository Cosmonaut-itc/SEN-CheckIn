CREATE TYPE "public"."geographic_zone" AS ENUM('GENERAL', 'ZLFN');--> statement-breakpoint
CREATE TYPE "public"."overtime_enforcement" AS ENUM('WARN', 'BLOCK');--> statement-breakpoint
CREATE TYPE "public"."shift_type" AS ENUM('DIURNA', 'NOCTURNA', 'MIXTA');--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "shift_type" "shift_type" DEFAULT 'DIURNA' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_position" ADD COLUMN "daily_pay" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "geographic_zone" "geographic_zone" DEFAULT 'GENERAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "normal_hours" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "normal_pay" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "overtime_double_hours" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "overtime_double_pay" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "overtime_triple_hours" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "overtime_triple_pay" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "sunday_premium_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "overtime_enforcement" "overtime_enforcement" DEFAULT 'WARN' NOT NULL;