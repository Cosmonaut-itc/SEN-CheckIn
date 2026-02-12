CREATE TYPE "public"."holiday_kind" AS ENUM('MANDATORY', 'OPTIONAL');--> statement-breakpoint
CREATE TYPE "public"."holiday_source" AS ENUM('INTERNAL', 'PROVIDER', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."holiday_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'DEACTIVATED');--> statement-breakpoint
CREATE TYPE "public"."holiday_sync_run_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint

CREATE TABLE "holiday_sync_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"provider" text DEFAULT 'NAGER_DATE' NOT NULL,
	"requested_years" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "holiday_sync_run_status" DEFAULT 'RUNNING' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"pending_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"error_payload" jsonb,
	"stale" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "holiday_calendar_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"date_key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "holiday_kind" DEFAULT 'MANDATORY' NOT NULL,
	"source" "holiday_source" NOT NULL,
	"status" "holiday_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"series_id" text,
	"provider" text,
	"provider_external_id" text,
	"subdivision_code" text,
	"legal_reference" text,
	"conflict_reason" text,
	"active" boolean DEFAULT true NOT NULL,
	"entry_key" text DEFAULT '' NOT NULL,
	"sync_run_id" text,
	"approved_by" text,
	"approved_at" timestamp,
	"rejected_by" text,
	"rejected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE "holiday_audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"holiday_entry_id" text,
	"sync_run_id" text,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"reason" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "payroll_run" ADD COLUMN "holiday_notices" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint

ALTER TABLE "holiday_sync_run" ADD CONSTRAINT "holiday_sync_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_calendar_entry" ADD CONSTRAINT "holiday_calendar_entry_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_calendar_entry" ADD CONSTRAINT "holiday_calendar_entry_sync_run_id_holiday_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."holiday_sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_calendar_entry" ADD CONSTRAINT "holiday_calendar_entry_approved_by_user_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_calendar_entry" ADD CONSTRAINT "holiday_calendar_entry_rejected_by_user_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_audit_event" ADD CONSTRAINT "holiday_audit_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_audit_event" ADD CONSTRAINT "holiday_audit_event_holiday_entry_id_holiday_calendar_entry_id_fk" FOREIGN KEY ("holiday_entry_id") REFERENCES "public"."holiday_calendar_entry"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_audit_event" ADD CONSTRAINT "holiday_audit_event_sync_run_id_holiday_sync_run_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."holiday_sync_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holiday_audit_event" ADD CONSTRAINT "holiday_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "holiday_sync_run_org_idx" ON "holiday_sync_run" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "holiday_sync_run_status_idx" ON "holiday_sync_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "holiday_entry_org_date_idx" ON "holiday_calendar_entry" USING btree ("organization_id", "date_key");--> statement-breakpoint
CREATE INDEX "holiday_entry_org_status_idx" ON "holiday_calendar_entry" USING btree ("organization_id", "status");--> statement-breakpoint
CREATE INDEX "holiday_entry_org_source_idx" ON "holiday_calendar_entry" USING btree ("organization_id", "source");--> statement-breakpoint
CREATE INDEX "holiday_entry_sync_run_idx" ON "holiday_calendar_entry" USING btree ("sync_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "holiday_entry_org_date_source_key_uniq" ON "holiday_calendar_entry" USING btree ("organization_id", "date_key", "source", "entry_key");--> statement-breakpoint
CREATE INDEX "holiday_audit_org_idx" ON "holiday_audit_event" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "holiday_audit_entry_idx" ON "holiday_audit_event" USING btree ("holiday_entry_id");--> statement-breakpoint
CREATE INDEX "holiday_audit_sync_idx" ON "holiday_audit_event" USING btree ("sync_run_id");--> statement-breakpoint

INSERT INTO "holiday_calendar_entry" (
	"id",
	"organization_id",
	"date_key",
	"name",
	"kind",
	"source",
	"status",
	"is_recurring",
	"series_id",
	"provider",
	"provider_external_id",
	"subdivision_code",
	"legal_reference",
	"conflict_reason",
	"active",
	"entry_key",
	"sync_run_id",
	"approved_by",
	"approved_at",
	"rejected_by",
	"rejected_at",
	"created_at",
	"updated_at"
)
SELECT
	gen_random_uuid(),
	ps.organization_id,
	days.date_key,
	'Descanso obligatorio (migración compatibilidad)',
	'MANDATORY'::"holiday_kind",
	'CUSTOM'::"holiday_source",
	'APPROVED'::"holiday_status",
	false,
	null,
	null,
	null,
	null,
	'LFT Art. 74',
	null,
	true,
	concat('LEGACY:', days.date_key),
	null,
	null,
	now(),
	null,
	null,
	now(),
	now()
FROM "payroll_setting" ps
CROSS JOIN LATERAL jsonb_array_elements_text(ps.additional_mandatory_rest_days) AS days(date_key)
WHERE days.date_key ~ '^\\d{4}-\\d{2}-\\d{2}$'
ON CONFLICT ("organization_id", "date_key", "source", "entry_key") DO NOTHING;
