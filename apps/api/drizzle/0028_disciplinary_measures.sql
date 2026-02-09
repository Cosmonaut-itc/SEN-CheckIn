ALTER TYPE "public"."legal_document_kind" ADD VALUE IF NOT EXISTS 'ACTA_ADMINISTRATIVA';--> statement-breakpoint
ALTER TYPE "public"."legal_document_kind" ADD VALUE IF NOT EXISTS 'CONSTANCIA_NEGATIVA_FIRMA';--> statement-breakpoint

CREATE TYPE "public"."disciplinary_measure_status" AS ENUM('DRAFT', 'GENERATED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."disciplinary_outcome" AS ENUM('no_action', 'warning', 'suspension', 'termination_process');--> statement-breakpoint
CREATE TYPE "public"."disciplinary_signature_status" AS ENUM('signed_physical', 'refused_to_sign');--> statement-breakpoint
CREATE TYPE "public"."disciplinary_document_kind" AS ENUM('ACTA_ADMINISTRATIVA', 'CONSTANCIA_NEGATIVA_FIRMA');--> statement-breakpoint
CREATE TYPE "public"."termination_draft_status" AS ENUM('ACTIVE', 'CANCELLED', 'CONSUMED');--> statement-breakpoint

CREATE TABLE "organization_disciplinary_folio_counter" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"last_folio" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_disciplinary_folio_counter_organization_id_unique" UNIQUE("organization_id")
);--> statement-breakpoint

CREATE TABLE "employee_disciplinary_measure" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"folio" integer NOT NULL,
	"status" "disciplinary_measure_status" DEFAULT 'DRAFT' NOT NULL,
	"incident_date_key" text NOT NULL,
	"reason" text NOT NULL,
	"policy_reference" text,
	"notes" text,
	"outcome" "disciplinary_outcome" DEFAULT 'no_action' NOT NULL,
	"suspension_start_date_key" text,
	"suspension_end_date_key" text,
	"signature_status" "disciplinary_signature_status",
	"generated_acta_generation_id" text,
	"generated_refusal_generation_id" text,
	"closed_at" timestamp,
	"closed_by_user_id" text,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "employee_disciplinary_document_version" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"measure_id" text NOT NULL,
	"kind" "disciplinary_document_kind" NOT NULL,
	"version_number" integer NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"generation_id" text,
	"signed_at_date_key" text,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "employee_disciplinary_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"measure_id" text NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by_user_id" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "employee_termination_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"measure_id" text NOT NULL,
	"status" "termination_draft_status" DEFAULT 'ACTIVE' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consumed_at" timestamp,
	"cancelled_at" timestamp,
	"created_by_user_id" text,
	"updated_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "payroll_setting" ADD COLUMN IF NOT EXISTS "enable_disciplinary_measures" boolean DEFAULT true NOT NULL;--> statement-breakpoint

ALTER TABLE "organization_disciplinary_folio_counter" ADD CONSTRAINT "organization_disciplinary_folio_counter_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "employee_disciplinary_measure" ADD CONSTRAINT "employee_disciplinary_measure_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_measure" ADD CONSTRAINT "employee_disciplinary_measure_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_measure" ADD CONSTRAINT "employee_disciplinary_measure_generated_acta_generation_id_employee_legal_generation_id_fk" FOREIGN KEY ("generated_acta_generation_id") REFERENCES "public"."employee_legal_generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_measure" ADD CONSTRAINT "employee_disciplinary_measure_generated_refusal_generation_id_employee_legal_generation_id_fk" FOREIGN KEY ("generated_refusal_generation_id") REFERENCES "public"."employee_legal_generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_measure" ADD CONSTRAINT "employee_disciplinary_measure_closed_by_user_id_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_measure" ADD CONSTRAINT "employee_disciplinary_measure_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_measure" ADD CONSTRAINT "employee_disciplinary_measure_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "employee_disciplinary_document_version" ADD CONSTRAINT "employee_disciplinary_document_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_document_version" ADD CONSTRAINT "employee_disciplinary_document_version_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_document_version" ADD CONSTRAINT "employee_disciplinary_document_version_measure_id_employee_disciplinary_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."employee_disciplinary_measure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_document_version" ADD CONSTRAINT "employee_disciplinary_document_version_generation_id_employee_legal_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."employee_legal_generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_document_version" ADD CONSTRAINT "employee_disciplinary_document_version_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "employee_disciplinary_attachment" ADD CONSTRAINT "employee_disciplinary_attachment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_attachment" ADD CONSTRAINT "employee_disciplinary_attachment_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_attachment" ADD CONSTRAINT "employee_disciplinary_attachment_measure_id_employee_disciplinary_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."employee_disciplinary_measure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_disciplinary_attachment" ADD CONSTRAINT "employee_disciplinary_attachment_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "employee_termination_draft" ADD CONSTRAINT "employee_termination_draft_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_termination_draft" ADD CONSTRAINT "employee_termination_draft_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_termination_draft" ADD CONSTRAINT "employee_termination_draft_measure_id_employee_disciplinary_measure_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."employee_disciplinary_measure"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_termination_draft" ADD CONSTRAINT "employee_termination_draft_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_termination_draft" ADD CONSTRAINT "employee_termination_draft_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "organization_disciplinary_folio_counter_org_idx" ON "organization_disciplinary_folio_counter" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_disciplinary_measure_org_folio_uniq" ON "employee_disciplinary_measure" USING btree ("organization_id","folio");--> statement-breakpoint
CREATE INDEX "employee_disciplinary_measure_org_incident_date_idx" ON "employee_disciplinary_measure" USING btree ("organization_id","incident_date_key" DESC);--> statement-breakpoint
CREATE INDEX "employee_disciplinary_measure_org_employee_idx" ON "employee_disciplinary_measure" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_disciplinary_measure_org_status_idx" ON "employee_disciplinary_measure" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "employee_disciplinary_measure_org_outcome_idx" ON "employee_disciplinary_measure" USING btree ("organization_id","outcome");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_disciplinary_document_measure_kind_version_uniq" ON "employee_disciplinary_document_version" USING btree ("measure_id","kind","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_disciplinary_document_object_key_uniq" ON "employee_disciplinary_document_version" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "employee_disciplinary_document_measure_idx" ON "employee_disciplinary_document_version" USING btree ("measure_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_disciplinary_attachment_object_key_uniq" ON "employee_disciplinary_attachment" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "employee_disciplinary_attachment_measure_idx" ON "employee_disciplinary_attachment" USING btree ("measure_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_termination_draft_measure_uniq" ON "employee_termination_draft" USING btree ("measure_id");--> statement-breakpoint
CREATE INDEX "employee_termination_draft_org_employee_status_idx" ON "employee_termination_draft" USING btree ("organization_id","employee_id","status");
