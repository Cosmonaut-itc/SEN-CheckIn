CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TABLE "staffing_requirement" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"location_id" text NOT NULL,
	"job_position_id" text NOT NULL,
	"minimum_required" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staffing_requirement_minimum_required_nonnegative" CHECK ("staffing_requirement"."minimum_required" >= 0)
);
--> statement-breakpoint
ALTER TABLE "staffing_requirement" ADD CONSTRAINT "staffing_requirement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffing_requirement" ADD CONSTRAINT "staffing_requirement_location_id_location_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."location"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffing_requirement" ADD CONSTRAINT "staffing_requirement_job_position_id_job_position_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_position"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staffing_requirement_org_location_position_uniq" ON "staffing_requirement" USING btree ("organization_id","location_id","job_position_id");--> statement-breakpoint
CREATE INDEX "staffing_requirement_organization_idx" ON "staffing_requirement" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "staffing_requirement_location_idx" ON "staffing_requirement" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "staffing_requirement_job_position_idx" ON "staffing_requirement" USING btree ("job_position_id");
