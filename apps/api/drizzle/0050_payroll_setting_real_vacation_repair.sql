ALTER TABLE "payroll_setting"
ADD COLUMN IF NOT EXISTS "real_vacation_premium_rate" numeric(6, 4);
--> statement-breakpoint

UPDATE "payroll_setting"
SET "real_vacation_premium_rate" = COALESCE(
	"real_vacation_premium_rate",
	"vacation_premium_rate",
	'0.25'
)
WHERE "real_vacation_premium_rate" IS NULL;
--> statement-breakpoint

ALTER TABLE "payroll_setting"
ALTER COLUMN "real_vacation_premium_rate" SET DEFAULT '0.25';
--> statement-breakpoint

ALTER TABLE "payroll_setting"
ALTER COLUMN "real_vacation_premium_rate" SET NOT NULL;
