CREATE TYPE "public"."employment_contract_type" AS ENUM('indefinite', 'fixed_term', 'specific_work');--> statement-breakpoint
CREATE TYPE "public"."termination_reason" AS ENUM('voluntary_resignation', 'justified_rescission', 'unjustified_dismissal', 'end_of_contract', 'mutual_agreement', 'death');--> statement-breakpoint
CREATE TABLE "employee_termination_settlement" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"organization_id" text,
	"calculation" jsonb NOT NULL,
	"totals_gross" numeric(12, 2) DEFAULT '0' NOT NULL,
	"finiquito_total_gross" numeric(12, 2) DEFAULT '0' NOT NULL,
	"liquidacion_total_gross" numeric(12, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "termination_date_key" text;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "last_day_worked_date_key" text;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "termination_reason" "termination_reason";--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "contract_type" "employment_contract_type";--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "termination_notes" text;--> statement-breakpoint
ALTER TABLE "employee_termination_settlement" ADD CONSTRAINT "employee_termination_settlement_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_termination_settlement" ADD CONSTRAINT "employee_termination_settlement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_termination_settlement_employee_idx" ON "employee_termination_settlement" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_termination_settlement_org_idx" ON "employee_termination_settlement" USING btree ("organization_id");