CREATE TYPE "public"."device_settings_pin_mode" AS ENUM('GLOBAL', 'PER_DEVICE');--> statement-breakpoint
CREATE TABLE "device_settings_pin_override" (
	"device_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"pin_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_device_settings_pin_config" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"mode" "device_settings_pin_mode" DEFAULT 'GLOBAL' NOT NULL,
	"global_pin_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_settings_pin_override" ADD CONSTRAINT "device_settings_pin_override_device_id_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_settings_pin_override" ADD CONSTRAINT "device_settings_pin_override_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_device_settings_pin_config" ADD CONSTRAINT "organization_device_settings_pin_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_settings_pin_override_org_idx" ON "device_settings_pin_override" USING btree ("organization_id");