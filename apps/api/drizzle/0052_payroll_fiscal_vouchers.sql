CREATE TABLE "payroll_fiscal_voucher" (
	"id" text PRIMARY KEY NOT NULL,
	"payroll_run_id" text NOT NULL,
	"payroll_run_employee_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"status" text DEFAULT 'BLOCKED' NOT NULL,
	"voucher" jsonb NOT NULL,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"validation_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uuid" text,
	"stamped_xml" text,
	"pac_provider" text,
	"stamped_at" timestamp,
	"cancellation_reason" text,
	"replacement_uuid" text,
	"prepared_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_fiscal_voucher" ADD CONSTRAINT "payroll_fiscal_voucher_payroll_run_id_payroll_run_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_run"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payroll_fiscal_voucher" ADD CONSTRAINT "payroll_fiscal_voucher_payroll_run_employee_id_payroll_run_employee_id_fk" FOREIGN KEY ("payroll_run_employee_id") REFERENCES "public"."payroll_run_employee"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payroll_fiscal_voucher" ADD CONSTRAINT "payroll_fiscal_voucher_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payroll_fiscal_voucher" ADD CONSTRAINT "payroll_fiscal_voucher_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "payroll_fiscal_voucher_run_idx" ON "payroll_fiscal_voucher" USING btree ("payroll_run_id");
--> statement-breakpoint
CREATE INDEX "payroll_fiscal_voucher_employee_idx" ON "payroll_fiscal_voucher" USING btree ("employee_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_fiscal_voucher_run_employee_uniq" ON "payroll_fiscal_voucher" USING btree ("payroll_run_employee_id");
