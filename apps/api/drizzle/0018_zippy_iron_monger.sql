CREATE TYPE "public"."vacation_day_type" AS ENUM('SCHEDULED_WORKDAY', 'SCHEDULED_REST_DAY', 'EXCEPTION_WORKDAY', 'EXCEPTION_DAY_OFF', 'MANDATORY_REST_DAY');--> statement-breakpoint
CREATE TYPE "public"."vacation_request_status" AS ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "vacation_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"requested_by_user_id" text,
	"status" "vacation_request_status" DEFAULT 'SUBMITTED' NOT NULL,
	"start_date_key" text NOT NULL,
	"end_date_key" text NOT NULL,
	"requested_notes" text,
	"decision_notes" text,
	"approved_by_user_id" text,
	"approved_at" timestamp,
	"rejected_by_user_id" text,
	"rejected_at" timestamp,
	"cancelled_by_user_id" text,
	"cancelled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vacation_request_day" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"date_key" text NOT NULL,
	"counts_as_vacation_day" boolean DEFAULT false NOT NULL,
	"day_type" "vacation_day_type" NOT NULL,
	"service_year_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "vacation_days_paid" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "vacation_pay_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_employee" ADD COLUMN "vacation_premium_amount" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_exception" ADD COLUMN "vacation_request_id" text;--> statement-breakpoint
ALTER TABLE "vacation_request" ADD CONSTRAINT "vacation_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacation_request" ADD CONSTRAINT "vacation_request_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacation_request" ADD CONSTRAINT "vacation_request_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacation_request" ADD CONSTRAINT "vacation_request_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacation_request" ADD CONSTRAINT "vacation_request_rejected_by_user_id_user_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacation_request" ADD CONSTRAINT "vacation_request_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacation_request_day" ADD CONSTRAINT "vacation_request_day_request_id_vacation_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."vacation_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacation_request_day" ADD CONSTRAINT "vacation_request_day_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vacation_request_org_status_idx" ON "vacation_request" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "vacation_request_employee_idx" ON "vacation_request" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "vacation_request_org_start_idx" ON "vacation_request" USING btree ("organization_id","start_date_key");--> statement-breakpoint
CREATE INDEX "vacation_request_org_end_idx" ON "vacation_request" USING btree ("organization_id","end_date_key");--> statement-breakpoint
CREATE UNIQUE INDEX "vacation_request_day_request_date_uniq" ON "vacation_request_day" USING btree ("request_id","date_key");--> statement-breakpoint
CREATE INDEX "vacation_request_day_employee_date_idx" ON "vacation_request_day" USING btree ("employee_id","date_key");--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_exception" ADD CONSTRAINT "schedule_exception_vacation_request_id_vacation_request_id_fk" FOREIGN KEY ("vacation_request_id") REFERENCES "public"."vacation_request"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_org_user_uniq" ON "employee" USING btree ("organization_id","user_id");
