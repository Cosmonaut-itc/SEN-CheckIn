DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'deduction_type'
			AND n.nspname = 'public'
	) THEN
		CREATE TYPE "deduction_type" AS ENUM (
			'INFONAVIT',
			'ALIMONY',
			'FONACOT',
			'LOAN',
			'UNION_FEE',
			'ADVANCE',
			'OTHER'
		);
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'deduction_calculation_method'
			AND n.nspname = 'public'
	) THEN
		CREATE TYPE "deduction_calculation_method" AS ENUM (
			'PERCENTAGE_SBC',
			'PERCENTAGE_NET',
			'PERCENTAGE_GROSS',
			'FIXED_AMOUNT',
			'VSM_FACTOR'
		);
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'deduction_frequency'
			AND n.nspname = 'public'
	) THEN
		CREATE TYPE "deduction_frequency" AS ENUM (
			'RECURRING',
			'ONE_TIME',
			'INSTALLMENTS'
		);
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_type t
		JOIN pg_namespace n ON n.oid = t.typnamespace
		WHERE t.typname = 'deduction_status'
			AND n.nspname = 'public'
	) THEN
		CREATE TYPE "deduction_status" AS ENUM (
			'ACTIVE',
			'PAUSED',
			'COMPLETED',
			'CANCELLED'
		);
	END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employee_deduction" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"type" "deduction_type" NOT NULL,
	"label" text NOT NULL,
	"calculation_method" "deduction_calculation_method" NOT NULL,
	"value" numeric(10, 4) NOT NULL,
	"frequency" "deduction_frequency" NOT NULL,
	"total_installments" integer,
	"completed_installments" integer DEFAULT 0 NOT NULL,
	"total_amount" numeric(12, 2),
	"remaining_amount" numeric(12, 2),
	"status" "deduction_status" DEFAULT 'ACTIVE' NOT NULL,
	"start_date_key" text NOT NULL,
	"end_date_key" text,
	"reference_number" text,
	"sat_deduction_code" text,
	"notes" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "payroll_run_employee"
	ADD COLUMN IF NOT EXISTS "deductions_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL,
	ADD COLUMN IF NOT EXISTS "total_deductions" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "employee_deduction"
		ADD CONSTRAINT "employee_deduction_organization_id_organization_id_fk"
		FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "employee_deduction"
		ADD CONSTRAINT "employee_deduction_employee_id_employee_id_fk"
		FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$
BEGIN
	ALTER TABLE "employee_deduction"
		ADD CONSTRAINT "employee_deduction_created_by_user_id_user_id_fk"
		FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id")
		ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_deduction_employee_status_idx"
	ON "employee_deduction" USING btree ("employee_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_deduction_org_type_idx"
	ON "employee_deduction" USING btree ("organization_id", "type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_deduction_employee_type_status_idx"
	ON "employee_deduction" USING btree ("employee_id", "type", "status");
