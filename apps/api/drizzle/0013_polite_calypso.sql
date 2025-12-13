CREATE TYPE "public"."schedule_exception_type" AS ENUM('DAY_OFF', 'MODIFIED', 'EXTRA_DAY');--> statement-breakpoint
CREATE TABLE "schedule_exception" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"exception_date" timestamp NOT NULL,
	"exception_type" "schedule_exception_type" NOT NULL,
	"start_time" time,
	"end_time" time,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_template" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"shift_type" "shift_type" DEFAULT 'DIURNA' NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_template_day" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"day_of_week" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"is_working_day" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee" ADD COLUMN "schedule_template_id" text;--> statement-breakpoint
ALTER TABLE "schedule_exception" ADD CONSTRAINT "schedule_exception_employee_id_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employee"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_template" ADD CONSTRAINT "schedule_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_template_day" ADD CONSTRAINT "schedule_template_day_template_id_schedule_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."schedule_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "schedule_exception_employee_idx" ON "schedule_exception" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "schedule_exception_date_idx" ON "schedule_exception" USING btree ("exception_date");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_exception_employee_date_uniq" ON "schedule_exception" USING btree ("employee_id","exception_date");--> statement-breakpoint
CREATE INDEX "schedule_template_day_template_idx" ON "schedule_template_day" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_template_day_uniq" ON "schedule_template_day" USING btree ("template_id","day_of_week");--> statement-breakpoint
ALTER TABLE "employee" ADD CONSTRAINT "employee_schedule_template_id_schedule_template_id_fk" FOREIGN KEY ("schedule_template_id") REFERENCES "public"."schedule_template"("id") ON DELETE set null ON UPDATE no action;