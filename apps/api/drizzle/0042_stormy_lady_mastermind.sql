ALTER TABLE "employee"
	ADD COLUMN IF NOT EXISTS "fiscal_daily_pay" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "payroll_setting"
	ADD COLUMN IF NOT EXISTS "enable_dual_payroll" boolean DEFAULT false NOT NULL;
