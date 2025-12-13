WITH earliest_location AS (
	SELECT DISTINCT ON (l."organization_id")
		l."organization_id",
		l."id" AS "location_id"
	FROM "location" l
	WHERE l."organization_id" IS NOT NULL
	ORDER BY l."organization_id", l."created_at" ASC, l."id" ASC
)
UPDATE "employee" e
SET "location_id" = el."location_id"
FROM earliest_location el
WHERE e."location_id" IS NULL
	AND e."organization_id" = el."organization_id";
--> statement-breakpoint

ALTER TABLE "employee" ALTER COLUMN "location_id" DROP NOT NULL;
