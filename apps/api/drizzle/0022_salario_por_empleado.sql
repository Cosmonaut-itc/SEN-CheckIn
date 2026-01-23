-- 1) add employee columns
ALTER TABLE "employee" ADD COLUMN "daily_pay" numeric(10,2) NOT NULL DEFAULT '0';
ALTER TABLE "employee" ADD COLUMN "payment_frequency" payment_frequency NOT NULL DEFAULT 'MONTHLY';

-- 2) backfill from job_position
UPDATE "employee" e
SET "daily_pay" = jp."daily_pay",
    "payment_frequency" = jp."payment_frequency"
FROM "job_position" jp
WHERE e."job_position_id" = jp."id";

-- 3) drop columns from job_position
ALTER TABLE "job_position" DROP COLUMN "daily_pay";
ALTER TABLE "job_position" DROP COLUMN "payment_frequency";
