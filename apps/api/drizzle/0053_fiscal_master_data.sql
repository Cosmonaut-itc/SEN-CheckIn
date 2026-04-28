CREATE TYPE "public"."employee_unionized_value" AS ENUM('Sí', 'No');--> statement-breakpoint
CREATE TYPE "public"."fiscal_catalog_name" AS ENUM('c_RegimenFiscal', 'c_UsoCFDI', 'c_CodigoPostal', 'nomina_c_TipoContrato', 'nomina_c_TipoJornada', 'nomina_c_TipoRegimen', 'nomina_c_RiesgoPuesto', 'nomina_c_PeriodicidadPago', 'nomina_c_TipoPercepcion', 'nomina_c_TipoDeduccion', 'nomina_c_TipoOtroPago', 'nomina_c_ClaveEntFed', 'nomina_c_Banco');--> statement-breakpoint
CREATE TYPE "public"."payroll_cfdi_node" AS ENUM('PERCEPTION', 'DEDUCTION', 'OTHER_PAYMENT');--> statement-breakpoint
CREATE TYPE "public"."payroll_stamping_mode" AS ENUM('PER_RUN', 'MONTHLY_CONSOLIDATED_DISABLED');--> statement-breakpoint
CREATE TYPE "public"."payroll_taxable_strategy" AS ENUM('FULLY_TAXED', 'FULLY_EXEMPT', 'SPLIT_BY_CALCULATION', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TABLE "employee_fiscal_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"sat_name" text NOT NULL,
	"rfc" text NOT NULL,
	"curp" text NOT NULL,
	"fiscal_postal_code" text NOT NULL,
	"fiscal_regime_code" text DEFAULT '605' NOT NULL,
	"cfdi_use_code" text DEFAULT 'CN01' NOT NULL,
	"social_security_number" text,
	"employment_start_date_key" text NOT NULL,
	"contract_type_code" text NOT NULL,
	"unionized" "employee_unionized_value",
	"workday_type_code" text NOT NULL,
	"payroll_regime_type_code" text NOT NULL,
	"employee_number" text NOT NULL,
	"department" text,
	"position" text,
	"risk_position_code" text,
	"payment_frequency_code" text NOT NULL,
	"bank_account" text,
	"salary_base_contribution" text,
	"integrated_daily_salary" text,
	"federal_entity_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_fiscal_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"legal_name" text NOT NULL,
	"rfc" text NOT NULL,
	"fiscal_regime_code" text NOT NULL,
	"expedition_postal_code" text NOT NULL,
	"employer_registration_number" text,
	"default_federal_entity_code" text,
	"payroll_cfdi_series" text,
	"payroll_stamping_mode" "payroll_stamping_mode" DEFAULT 'PER_RUN' NOT NULL,
	"csd_certificate_serial" text,
	"csd_certificate_valid_from" text,
	"csd_certificate_valid_to" text,
	"csd_secret_ref" text,
	"pac_provider" text,
	"pac_credentials_secret_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_concept_sat_mapping" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"internal_concept_type" text NOT NULL,
	"cfdi_node" "payroll_cfdi_node" NOT NULL,
	"sat_type_code" text NOT NULL,
	"employer_code" text NOT NULL,
	"concept_label" text NOT NULL,
	"taxable_strategy" "payroll_taxable_strategy" NOT NULL,
	"is_supported_for_stamping" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sat_fiscal_catalog_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"catalog_name" "fiscal_catalog_name" NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"valid_from" text,
	"valid_to" text,
	"source_version" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_fiscal_profile" ADD CONSTRAINT "employee_fiscal_profile_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_fiscal_profile" ADD CONSTRAINT "employee_fiscal_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_fiscal_profile" ADD CONSTRAINT "organization_fiscal_profile_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_concept_sat_mapping" ADD CONSTRAINT "payroll_concept_sat_mapping_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employee_fiscal_profile_employee_uniq" ON "employee_fiscal_profile" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_fiscal_profile_org_employee_number_uniq" ON "employee_fiscal_profile" USING btree ("organization_id","employee_number");--> statement-breakpoint
CREATE INDEX "employee_fiscal_profile_org_idx" ON "employee_fiscal_profile" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_fiscal_profile_organization_uniq" ON "organization_fiscal_profile" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_concept_sat_mapping_global_type_node_uniq" ON "payroll_concept_sat_mapping" USING btree ("internal_concept_type","cfdi_node") WHERE "organization_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_concept_sat_mapping_org_type_node_uniq" ON "payroll_concept_sat_mapping" USING btree ("organization_id","internal_concept_type","cfdi_node") WHERE "organization_id" is not null;--> statement-breakpoint
CREATE INDEX "payroll_concept_sat_mapping_internal_type_idx" ON "payroll_concept_sat_mapping" USING btree ("internal_concept_type");--> statement-breakpoint
CREATE UNIQUE INDEX "sat_fiscal_catalog_entry_catalog_code_version_uniq" ON "sat_fiscal_catalog_entry" USING btree ("catalog_name","code","source_version");--> statement-breakpoint
CREATE INDEX "sat_fiscal_catalog_entry_catalog_code_idx" ON "sat_fiscal_catalog_entry" USING btree ("catalog_name","code");
