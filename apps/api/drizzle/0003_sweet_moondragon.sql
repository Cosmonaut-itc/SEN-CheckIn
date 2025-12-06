CREATE TYPE "public"."device_status" AS ENUM('ONLINE', 'OFFLINE', 'MAINTENANCE');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('ACTIVE', 'INACTIVE', 'ON_LEAVE');--> statement-breakpoint
CREATE TABLE "job_position" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"client_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "device_type" text;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "status" "device_status" DEFAULT 'OFFLINE' NOT NULL;--> statement-breakpoint
ALTER TABLE "device" ADD COLUMN "last_heartbeat" timestamp;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "job_position_id" text;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "status" "employee_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "hire_date" timestamp;--> statement-breakpoint
ALTER TABLE "job_position" ADD CONSTRAINT "job_position_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_job_position_id_job_position_id_fk" FOREIGN KEY ("job_position_id") REFERENCES "public"."job_position"("id") ON DELETE set null ON UPDATE no action;