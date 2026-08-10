UPDATE "CapacityPrescriptionVersion"
SET "parameterSetIds" = ARRAY[]::TEXT[]
WHERE "parameterSetIds" IS NULL;

ALTER TABLE "CapacityPrescriptionVersion"
  ALTER COLUMN "parameterSetIds" SET NOT NULL;
