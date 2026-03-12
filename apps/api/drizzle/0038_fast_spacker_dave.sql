ALTER TABLE "payroll_setting"
	ADD COLUMN IF NOT EXISTS "count_saturday_as_worked_for_seventh_day" boolean DEFAULT false NOT NULL;
