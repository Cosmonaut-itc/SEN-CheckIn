ALTER TABLE "employee" ADD COLUMN "import_batch_id" text;
CREATE INDEX "employee_import_batch_id_idx" ON "employee" USING btree ("import_batch_id");
