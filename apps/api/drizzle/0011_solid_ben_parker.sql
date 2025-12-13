CREATE TYPE "public"."payment_frequency" AS ENUM('WEEKLY', 'BIWEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_status" AS ENUM('DRAFT', 'PROCESSED');--> statement-breakpoint
CREATE TABLE "employee_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_working_day" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"payment_frequency" "payment_frequency" NOT NULL,
	"status" "payroll_run_status" DEFAULT 'DRAFT' NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"employee_count" integer DEFAULT 0 NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_run_employee" (
	"id" text PRIMARY KEY NOT NULL,
	"payroll_run_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"hours_worked" numeric(10, 2) DEFAULT '0' NOT NULL,
	"hourly_pay" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_pay" numeric(12, 2) DEFAULT '0' NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"week_start_day" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_setting_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "last_payroll_date" timestamp;--> statement-breakpoint
ALTER TABLE "job_position" ADD COLUMN "hourly_pay" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_position" ADD COLUMN "payment_frequency" "payment_frequency" DEFAULT 'MONTHLY' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_schedule" ADD CONSTRAINT "employee_schedule_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run" ADD CONSTRAINT "payroll_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD CONSTRAINT "payroll_run_employee_payroll_run_id_payroll_run_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD CONSTRAINT "payroll_run_employee_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_setting" ADD CONSTRAINT "payroll_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_schedule_employee_idx" ON "employee_schedule" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_schedule_employee_day_uniq" ON "employee_schedule" USING btree ("employee_id","day_of_week");