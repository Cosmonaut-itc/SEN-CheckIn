CREATE TYPE "public"."employment_type" AS ENUM('PERMANENT', 'EVENTUAL');--> statement-breakpoint
CREATE TYPE "public"."ptu_eligibility_override" AS ENUM('DEFAULT', 'INCLUDE', 'EXCLUDE');--> statement-breakpoint
CREATE TYPE "public"."ptu_mode" AS ENUM('DEFAULT_RULES', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."employer_type" AS ENUM('PERSONA_MORAL', 'PERSONA_FISICA');--> statement-breakpoint
CREATE TYPE "public"."ptu_run_status" AS ENUM('DRAFT', 'PROCESSED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."aguinaldo_run_status" AS ENUM('DRAFT', 'PROCESSED', 'CANCELLED');--> statement-breakpoint

ALTER TABLE "employee" ADD COLUMN "employment_type" "employment_type" DEFAULT 'PERMANENT' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "is_trust_employee" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "is_director_admin_general_manager" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "is_domestic_worker" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "is_platform_worker" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "platform_hours_year" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "ptu_eligibility_override" "ptu_eligibility_override" DEFAULT 'DEFAULT' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "aguinaldo_days_override" integer;--> statement-breakpoint

ALTER TABLE "payroll_setting" ADD COLUMN "ptu_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "ptu_mode" "ptu_mode" DEFAULT 'DEFAULT_RULES' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "ptu_is_exempt" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "ptu_exempt_reason" text;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "employer_type" "employer_type" DEFAULT 'PERSONA_MORAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD COLUMN "aguinaldo_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint

CREATE TABLE "ptu_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"fiscal_year" integer NOT NULL,
	"payment_date" timestamp NOT NULL,
	"taxable_income" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ptu_percentage" numeric(6, 4) DEFAULT '0.1' NOT NULL,
	"include_inactive" boolean DEFAULT false NOT NULL,
	"status" "ptu_run_status" DEFAULT 'DRAFT' NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"employee_count" integer DEFAULT 0 NOT NULL,
	"tax_summary" jsonb,
	"settings_snapshot" jsonb,
	"processed_at" timestamp,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ptu_run_employee" (
	"id" text PRIMARY KEY NOT NULL,
	"ptu_run_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"is_eligible" boolean DEFAULT true NOT NULL,
	"eligibility_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"days_counted" integer DEFAULT 0 NOT NULL,
	"daily_quota" numeric(10, 2) DEFAULT '0' NOT NULL,
	"annual_salary_base" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ptu_by_days" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ptu_by_salary" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ptu_pre_cap" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cap_three_months" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cap_avg_three_years" numeric(14, 2) DEFAULT '0' NOT NULL,
	"cap_final" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ptu_final" numeric(14, 2) DEFAULT '0' NOT NULL,
	"exempt_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"withheld_isr" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ptu_history" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"fiscal_year" integer NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aguinaldo_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"calendar_year" integer NOT NULL,
	"payment_date" timestamp NOT NULL,
	"include_inactive" boolean DEFAULT false NOT NULL,
	"status" "aguinaldo_run_status" DEFAULT 'DRAFT' NOT NULL,
	"total_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"employee_count" integer DEFAULT 0 NOT NULL,
	"tax_summary" jsonb,
	"settings_snapshot" jsonb,
	"processed_at" timestamp,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aguinaldo_run_employee" (
	"id" text PRIMARY KEY NOT NULL,
	"aguinaldo_run_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"is_eligible" boolean DEFAULT true NOT NULL,
	"eligibility_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"days_counted" integer DEFAULT 0 NOT NULL,
	"daily_salary_base" numeric(10, 2) DEFAULT '0' NOT NULL,
	"aguinaldo_days_policy" integer DEFAULT 15 NOT NULL,
	"year_days" integer DEFAULT 365 NOT NULL,
	"gross_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"exempt_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"taxable_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"withheld_isr" numeric(14, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ptu_run" ADD CONSTRAINT "ptu_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ptu_run_employee" ADD CONSTRAINT "ptu_run_employee_ptu_run_id_ptu_run_id_fk" FOREIGN KEY ("ptu_run_id") REFERENCES "public"."ptu_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ptu_run_employee" ADD CONSTRAINT "ptu_run_employee_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ptu_history" ADD CONSTRAINT "ptu_history_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ptu_history" ADD CONSTRAINT "ptu_history_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aguinaldo_run" ADD CONSTRAINT "aguinaldo_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aguinaldo_run_employee" ADD CONSTRAINT "aguinaldo_run_employee_aguinaldo_run_id_aguinaldo_run_id_fk" FOREIGN KEY ("aguinaldo_run_id") REFERENCES "public"."aguinaldo_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aguinaldo_run_employee" ADD CONSTRAINT "aguinaldo_run_employee_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ptu_run_org_idx" ON "ptu_run" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ptu_run_year_idx" ON "ptu_run" USING btree ("organization_id","fiscal_year");--> statement-breakpoint
CREATE INDEX "ptu_run_employee_run_idx" ON "ptu_run_employee" USING btree ("ptu_run_id");--> statement-breakpoint
CREATE INDEX "ptu_run_employee_employee_idx" ON "ptu_run_employee" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ptu_history_employee_idx" ON "ptu_history" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "ptu_history_org_idx" ON "ptu_history" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ptu_history_employee_year_uniq" ON "ptu_history" USING btree ("employee_id","fiscal_year");--> statement-breakpoint
CREATE INDEX "aguinaldo_run_org_idx" ON "aguinaldo_run" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "aguinaldo_run_year_idx" ON "aguinaldo_run" USING btree ("organization_id","calendar_year");--> statement-breakpoint
CREATE INDEX "aguinaldo_run_employee_run_idx" ON "aguinaldo_run_employee" USING btree ("aguinaldo_run_id");--> statement-breakpoint
CREATE INDEX "aguinaldo_run_employee_employee_idx" ON "aguinaldo_run_employee" USING btree ("employee_id");
