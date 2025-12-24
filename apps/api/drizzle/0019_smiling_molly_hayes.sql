CREATE TABLE "employee_audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"organization_id" text,
	"action" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_user_id" text,
	"before" jsonb,
	"after" jsonb,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_audit_event" ADD CONSTRAINT "employee_audit_event_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_audit_event" ADD CONSTRAINT "employee_audit_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_audit_event" ADD CONSTRAINT "employee_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_audit_employee_idx" ON "employee_audit_event" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_audit_org_idx" ON "employee_audit_event" USING btree ("organization_id");