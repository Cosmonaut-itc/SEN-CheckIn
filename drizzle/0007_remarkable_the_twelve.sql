ALTER TABLE "job_position" DROP CONSTRAINT "job_position_client_id_client_id_fk";
--> statement-breakpoint
ALTER TABLE "location" DROP CONSTRAINT "location_client_id_client_id_fk";
--> statement-breakpoint
ALTER TABLE "job_position" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "location" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_position" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "location" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "job_position" ADD CONSTRAINT "job_position_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_position" ADD CONSTRAINT "job_position_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location" ADD CONSTRAINT "location_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE set null ON UPDATE no action;