CREATE TYPE "public"."document_requirement_activation_stage" AS ENUM('BASE', 'LEGAL_AFTER_GATE');--> statement-breakpoint
CREATE TYPE "public"."employee_document_requirement_key" AS ENUM('IDENTIFICATION', 'TAX_CONSTANCY', 'PROOF_OF_ADDRESS', 'SOCIAL_SECURITY_EVIDENCE', 'EMPLOYMENT_PROFILE', 'SIGNED_CONTRACT', 'SIGNED_NDA');--> statement-breakpoint
CREATE TYPE "public"."employee_document_review_status" AS ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."employee_document_source" AS ENUM('UPLOAD', 'PHYSICAL_SIGNED_UPLOAD', 'DIGITAL_SIGNATURE');--> statement-breakpoint
CREATE TYPE "public"."employment_profile_subtype" AS ENUM('CURRICULUM', 'JOB_APPLICATION');--> statement-breakpoint
CREATE TYPE "public"."identification_subtype" AS ENUM('INE', 'PASSPORT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."legal_document_kind" AS ENUM('CONTRACT', 'NDA');--> statement-breakpoint
CREATE TYPE "public"."legal_template_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint

CREATE TABLE "organization_document_workflow_config" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"base_approved_threshold_for_legal" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_document_workflow_config_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint

CREATE TABLE "organization_document_requirement" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"requirement_key" "employee_document_requirement_key" NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"display_order" integer NOT NULL,
	"activation_stage" "document_requirement_activation_stage" DEFAULT 'BASE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "organization_legal_branding" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"display_name" text,
	"header_text" text,
	"logo_bucket" text,
	"logo_object_key" text,
	"logo_file_name" text,
	"logo_content_type" text,
	"logo_size_bytes" integer,
	"logo_sha256" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_legal_branding_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint

CREATE TABLE "organization_legal_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" "legal_document_kind" NOT NULL,
	"version_number" integer NOT NULL,
	"status" "legal_template_status" DEFAULT 'DRAFT' NOT NULL,
	"html_content" text NOT NULL,
	"variables_schema_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"branding_snapshot" jsonb,
	"created_by_user_id" text,
	"published_by_user_id" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "employee_legal_generation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"kind" "legal_document_kind" NOT NULL,
	"template_id" text NOT NULL,
	"template_version_number" integer NOT NULL,
	"generated_html_hash" text NOT NULL,
	"generated_pdf_hash" text,
	"variables_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generated_by_user_id" text,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "employee_document_version" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"requirement_key" "employee_document_requirement_key" NOT NULL,
	"version_number" integer NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"review_status" "employee_document_review_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"review_comment" text,
	"reviewed_by_user_id" text,
	"reviewed_at" timestamp,
	"source" "employee_document_source" DEFAULT 'UPLOAD' NOT NULL,
	"generation_id" text,
	"identification_subtype" "identification_subtype",
	"employment_profile_subtype" "employment_profile_subtype",
	"signed_at_date_key" text,
	"verified_by_user_id" text,
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
);
--> statement-breakpoint

ALTER TABLE "organization_document_workflow_config" ADD CONSTRAINT "organization_document_workflow_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_document_requirement" ADD CONSTRAINT "organization_document_requirement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_legal_branding" ADD CONSTRAINT "organization_legal_branding_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_legal_template" ADD CONSTRAINT "organization_legal_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_legal_template" ADD CONSTRAINT "organization_legal_template_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_legal_template" ADD CONSTRAINT "organization_legal_template_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_legal_generation" ADD CONSTRAINT "employee_legal_generation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_legal_generation" ADD CONSTRAINT "employee_legal_generation_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_legal_generation" ADD CONSTRAINT "employee_legal_generation_template_id_organization_legal_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."organization_legal_template"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_legal_generation" ADD CONSTRAINT "employee_legal_generation_generated_by_user_id_user_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_version" ADD CONSTRAINT "employee_document_version_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_version" ADD CONSTRAINT "employee_document_version_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_version" ADD CONSTRAINT "employee_document_version_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_version" ADD CONSTRAINT "employee_document_version_generation_id_employee_legal_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."employee_legal_generation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_version" ADD CONSTRAINT "employee_document_version_verified_by_user_id_user_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_document_version" ADD CONSTRAINT "employee_document_version_uploaded_by_user_id_user_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "organization_document_workflow_config_org_idx" ON "organization_document_workflow_config" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_document_requirement_org_key_uniq" ON "organization_document_requirement" USING btree ("organization_id","requirement_key");--> statement-breakpoint
CREATE INDEX "organization_document_requirement_org_order_idx" ON "organization_document_requirement" USING btree ("organization_id","display_order");--> statement-breakpoint
CREATE INDEX "organization_legal_branding_org_idx" ON "organization_legal_branding" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_legal_branding_logo_object_key_uniq" ON "organization_legal_branding" USING btree ("logo_object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_legal_template_org_kind_version_uniq" ON "organization_legal_template" USING btree ("organization_id","kind","version_number");--> statement-breakpoint
CREATE INDEX "organization_legal_template_org_kind_status_idx" ON "organization_legal_template" USING btree ("organization_id","kind","status");--> statement-breakpoint
CREATE INDEX "employee_legal_generation_org_employee_idx" ON "employee_legal_generation" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_legal_generation_employee_kind_idx" ON "employee_legal_generation" USING btree ("employee_id","kind");--> statement-breakpoint
CREATE INDEX "employee_legal_generation_template_idx" ON "employee_legal_generation" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_document_version_employee_requirement_version_uniq" ON "employee_document_version" USING btree ("employee_id","requirement_key","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_document_version_object_key_uniq" ON "employee_document_version" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_document_version_generation_uniq" ON "employee_document_version" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "employee_document_version_org_employee_idx" ON "employee_document_version" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_document_version_org_employee_current_idx" ON "employee_document_version" USING btree ("organization_id","employee_id","is_current");--> statement-breakpoint
CREATE INDEX "employee_document_version_org_current_review_idx" ON "employee_document_version" USING btree ("organization_id","is_current","review_status");--> statement-breakpoint
CREATE INDEX "employee_document_version_employee_requirement_idx" ON "employee_document_version" USING btree ("employee_id","requirement_key");
