CREATE TABLE "badge_audit_event" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"badge_id" text NOT NULL,
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
ALTER TABLE "badge_audit_event" ADD CONSTRAINT "badge_audit_event_badge_id_badge_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_audit_event" ADD CONSTRAINT "badge_audit_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_audit_event" ADD CONSTRAINT "badge_audit_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "badge_audit_badge_idx" ON "badge_audit_event" USING btree ("badge_id");--> statement-breakpoint
CREATE INDEX "badge_audit_org_idx" ON "badge_audit_event" USING btree ("organization_id");--> statement-breakpoint
CREATE OR REPLACE FUNCTION badge_audit_event_trigger() RETURNS trigger AS $$
DECLARE
	skip_audit text;
	changed_fields text[];
BEGIN
	skip_audit := current_setting('sen_checkin.skip_badge_audit', true);
	IF skip_audit = '1' OR lower(skip_audit) = 'true' THEN
		IF TG_OP = 'DELETE' THEN
			RETURN OLD;
		END IF;
		RETURN NEW;
	END IF;

	IF TG_OP = 'INSERT' THEN
		INSERT INTO badge_audit_event (
			badge_id,
			organization_id,
			action,
			actor_type,
			actor_user_id,
			before,
			after,
			changed_fields
		) VALUES (
			NEW.id,
			NEW.organization_id,
			'created',
			'trigger',
			NULL,
			NULL,
			to_jsonb(NEW),
			'[]'::jsonb
		);
		RETURN NEW;
	ELSIF TG_OP = 'UPDATE' THEN
		changed_fields := ARRAY(
			SELECT key
			FROM jsonb_each(to_jsonb(NEW))
			WHERE key <> 'updated_at'
				AND (to_jsonb(OLD)->key) IS DISTINCT FROM value
		);

		IF array_length(changed_fields, 1) IS NULL THEN
			RETURN NEW;
		END IF;

		INSERT INTO badge_audit_event (
			badge_id,
			organization_id,
			action,
			actor_type,
			actor_user_id,
			before,
			after,
			changed_fields
		) VALUES (
			NEW.id,
			NEW.organization_id,
			'updated',
			'trigger',
			NULL,
			to_jsonb(OLD),
			to_jsonb(NEW),
			coalesce(to_jsonb(changed_fields), '[]'::jsonb)
		);
		RETURN NEW;
	ELSIF TG_OP = 'DELETE' THEN
		INSERT INTO badge_audit_event (
			badge_id,
			organization_id,
			action,
			actor_type,
			actor_user_id,
			before,
			after,
			changed_fields
		) VALUES (
			OLD.id,
			OLD.organization_id,
			'deleted',
			'trigger',
			NULL,
			to_jsonb(OLD),
			NULL,
			'[]'::jsonb
		);
		RETURN OLD;
	END IF;

	RETURN NULL;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
DROP TRIGGER IF EXISTS "badge_audit_event_insert" ON "badge";--> statement-breakpoint
CREATE TRIGGER "badge_audit_event_insert" AFTER INSERT ON "badge"
FOR EACH ROW EXECUTE FUNCTION badge_audit_event_trigger();--> statement-breakpoint
DROP TRIGGER IF EXISTS "badge_audit_event_update" ON "badge";--> statement-breakpoint
CREATE TRIGGER "badge_audit_event_update" AFTER UPDATE ON "badge"
FOR EACH ROW EXECUTE FUNCTION badge_audit_event_trigger();--> statement-breakpoint
DROP TRIGGER IF EXISTS "badge_audit_event_delete" ON "badge";--> statement-breakpoint
CREATE TRIGGER "badge_audit_event_delete" AFTER DELETE ON "badge"
FOR EACH ROW EXECUTE FUNCTION badge_audit_event_trigger();

