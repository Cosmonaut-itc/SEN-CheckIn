CREATE TYPE "public"."incapacity_issued_by" AS ENUM('IMSS', 'recognized_by_IMSS');--> statement-breakpoint
CREATE TYPE "public"."incapacity_sequence" AS ENUM('inicial', 'subsecuente', 'recaida');--> statement-breakpoint
CREATE TYPE "public"."incapacity_status" AS ENUM('ACTIVE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."incapacity_type" AS ENUM('EG', 'RT', 'MAT', 'LIC140BIS');--> statement-breakpoint
CREATE TYPE "public"."sat_tipo_incapacidad" AS ENUM('01', '02', '03', '04');--> statement-breakpoint
ALTER TYPE "public"."vacation_day_type" ADD VALUE 'INCAPACITY';--> statement-breakpoint
CREATE TABLE "employee_incapacity" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"case_id" text NOT NULL,
	"type" "incapacity_type" NOT NULL,
	"sat_tipo_incapacidad" "sat_tipo_incapacidad" NOT NULL,
	"start_date_key" text NOT NULL,
	"end_date_key" text NOT NULL,
	"days_authorized" integer NOT NULL,
	"certificate_folio" text,
	"issued_by" "incapacity_issued_by" DEFAULT 'IMSS' NOT NULL,
	"sequence" "incapacity_sequence" DEFAULT 'inicial' NOT NULL,
	"percent_override" numeric(5, 4),
	"status" "incapacity_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_incapacity_document" (
	"id" text PRIMARY KEY NOT NULL,
	"incapacity_id" text NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "schedule_exception" ADD COLUMN "incapacity_id" text;--> statement-breakpoint
ALTER TABLE "employee_incapacity" ADD CONSTRAINT "employee_incapacity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_incapacity" ADD CONSTRAINT "employee_incapacity_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_incapacity_document" ADD CONSTRAINT "employee_incapacity_document_incapacity_id_employee_incapacity_id_fk" FOREIGN KEY ("incapacity_id") REFERENCES "public"."employee_incapacity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_incapacity_org_employee_idx" ON "employee_incapacity" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_incapacity_org_status_idx" ON "employee_incapacity" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "employee_incapacity_org_start_idx" ON "employee_incapacity" USING btree ("organization_id","start_date_key");--> statement-breakpoint
CREATE INDEX "employee_incapacity_org_end_idx" ON "employee_incapacity" USING btree ("organization_id","end_date_key");--> statement-breakpoint
CREATE INDEX "employee_incapacity_employee_start_idx" ON "employee_incapacity" USING btree ("employee_id","start_date_key");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_incapacity_document_object_key" ON "employee_incapacity_document" USING btree ("object_key");--> statement-breakpoint
ALTER TABLE "schedule_exception" ADD CONSTRAINT "schedule_exception_incapacity_id_employee_incapacity_id_fk" FOREIGN KEY ("incapacity_id") REFERENCES "public"."employee_incapacity"("id") ON DELETE set null ON UPDATE no action;
