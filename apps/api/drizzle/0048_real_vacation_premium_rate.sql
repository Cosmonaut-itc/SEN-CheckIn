ALTER TABLE "payroll_setting"
ADD COLUMN IF NOT EXISTS "real_vacation_premium_rate" numeric(6, 4) DEFAULT '0.25';

UPDATE "payroll_setting"
SET "real_vacation_premium_rate" = COALESCE(
	"real_vacation_premium_rate",
	"vacation_premium_rate",
	'0.25'
);

ALTER TABLE "payroll_setting"
ALTER COLUMN "real_vacation_premium_rate" SET NOT NULL;
