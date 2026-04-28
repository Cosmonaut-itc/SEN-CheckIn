CREATE TABLE "payroll_cfdi_xml_artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"payroll_fiscal_voucher_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"artifact_kind" text NOT NULL,
	"fiscal_snapshot_hash" text NOT NULL,
	"xml_hash" text NOT NULL,
	"xml" text NOT NULL,
	"fiscal_artifact_manifest" jsonb NOT NULL,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_cfdi_xml_artifact" ADD CONSTRAINT "payroll_cfdi_xml_artifact_payroll_fiscal_voucher_id_payroll_fiscal_voucher_id_fk" FOREIGN KEY ("payroll_fiscal_voucher_id") REFERENCES "public"."payroll_fiscal_voucher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_cfdi_xml_artifact" ADD CONSTRAINT "payroll_cfdi_xml_artifact_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_cfdi_xml_artifact" ADD CONSTRAINT "payroll_cfdi_xml_artifact_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_cfdi_xml_artifact_voucher_kind_hash_uniq" ON "payroll_cfdi_xml_artifact" USING btree ("payroll_fiscal_voucher_id","artifact_kind","fiscal_snapshot_hash");--> statement-breakpoint
CREATE INDEX "payroll_cfdi_xml_artifact_organization_idx" ON "payroll_cfdi_xml_artifact" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payroll_cfdi_xml_artifact_employee_idx" ON "payroll_cfdi_xml_artifact" USING btree ("employee_id");