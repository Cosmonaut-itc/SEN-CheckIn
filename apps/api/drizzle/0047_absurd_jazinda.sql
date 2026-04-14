CREATE TYPE "public"."tour_progress_status" AS ENUM('completed', 'skipped');--> statement-breakpoint
CREATE TABLE "tour_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"tour_id" text NOT NULL,
	"status" "tour_progress_status" NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tour_progress" ADD CONSTRAINT "tour_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tour_progress" ADD CONSTRAINT "tour_progress_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tour_progress_user_org_tour_uniq" ON "tour_progress" USING btree ("user_id","organization_id","tour_id");--> statement-breakpoint
CREATE INDEX "tour_progress_user_org_idx" ON "tour_progress" USING btree ("user_id","organization_id");--> statement-breakpoint
