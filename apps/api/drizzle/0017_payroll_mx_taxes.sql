ALTER TABLE "payroll_setting" ADD COLUMN "risk_work_rate" numeric(6, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "state_payroll_tax_rate" numeric(6, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "absorb_imss_employee_share" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "absorb_isr" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "aguinaldo_days" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "vacation_premium_rate" numeric(6, 4) DEFAULT '0.25' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "enable_seventh_day_pay" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "sbc_daily_override" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "payroll_run" ADD COLUMN "tax_summary" jsonb;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "tax_breakdown" jsonb;
