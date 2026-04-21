ALTER TABLE "device" ADD COLUMN "battery_level" integer;
ALTER TABLE "device" ADD CONSTRAINT "device_battery_level_range" CHECK ("battery_level" >= 0 AND "battery_level" <= 100);
