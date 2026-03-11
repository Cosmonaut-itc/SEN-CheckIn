DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'overtime_authorization_status'
			AND n.nspname = 'public'
	) THEN
		CREATE TYPE "overtime_authorization_status" AS ENUM ('PENDING', 'ACTIVE', 'CANCELLED');
	END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "overtime_authorization" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"date_key" text NOT NULL,
	"authorized_hours" numeric(5, 2) NOT NULL,
	"authorized_by_user_id" text,
	"status" "overtime_authorization_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "payroll_run_employee"
	ADD COLUMN IF NOT EXISTS "authorized_overtime_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	ADD COLUMN IF NOT EXISTS "unauthorized_overtime_hours" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "overtime_authorization"
		ADD CONSTRAINT "overtime_authorization_organization_id_organization_id_fk"
		FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "overtime_authorization"
		ADD CONSTRAINT "overtime_authorization_employee_id_employee_id_fk"
		FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "overtime_authorization"
		ADD CONSTRAINT "overtime_authorization_authorized_by_user_id_user_id_fk"
		FOREIGN KEY ("authorized_by_user_id") REFERENCES "public"."user"("id")
		ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "overtime_authorization_employee_date_uniq"
	ON "overtime_authorization" USING btree ("employee_id", "date_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "overtime_authorization_org_date_idx"
	ON "overtime_authorization" USING btree ("organization_id", "date_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "overtime_authorization_employee_status_idx"
	ON "overtime_authorization" USING btree ("employee_id", "status");
