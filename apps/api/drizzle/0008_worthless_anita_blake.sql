ALTER TABLE "device" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;