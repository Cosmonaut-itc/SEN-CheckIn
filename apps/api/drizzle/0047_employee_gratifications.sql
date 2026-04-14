CREATE TYPE "public"."gratification_periodicity" AS ENUM('ONE_TIME', 'RECURRING');
CREATE TYPE "public"."gratification_application_mode" AS ENUM('MANUAL', 'AUTOMATIC');
CREATE TYPE "public"."gratification_status" AS ENUM('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

CREATE TABLE IF NOT EXISTS "employee_gratification" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL REFERENCES "public"."organization"("id") ON DELETE cascade,
	"employee_id" text NOT NULL REFERENCES "public"."employee"("id") ON DELETE cascade,
	"concept" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"periodicity" "gratification_periodicity" NOT NULL,
	"application_mode" "gratification_application_mode" NOT NULL,
	"status" "gratification_status" NOT NULL DEFAULT 'ACTIVE',
	"start_date_key" text NOT NULL,
	"end_date_key" text,
	"notes" text,
	"created_by_user_id" text NOT NULL REFERENCES "public"."user"("id"),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "employee_gratification_employee_status_idx" ON "employee_gratification" USING btree ("employee_id", "status");
CREATE INDEX IF NOT EXISTS "employee_gratification_org_status_idx" ON "employee_gratification" USING btree ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "employee_gratification_employee_periodicity_idx" ON "employee_gratification" USING btree ("employee_id", "periodicity");
