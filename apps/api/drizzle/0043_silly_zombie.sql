ALTER TABLE "payroll_run_employee"
	ADD COLUMN IF NOT EXISTS "fiscal_daily_pay" numeric(10, 4);--> statement-breakpoint
ALTER TABLE "payroll_run_employee"
	ADD COLUMN IF NOT EXISTS "fiscal_gross_pay" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "payroll_run_employee"
	ADD COLUMN IF NOT EXISTS "complement_pay" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "payroll_run_employee"
	ADD COLUMN IF NOT EXISTS "total_real_pay" numeric(12, 4);
