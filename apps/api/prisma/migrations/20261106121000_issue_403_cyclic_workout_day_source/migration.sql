-- Issue #403 audit A-005: a cyclic distance-only placement may affect the WorkoutTemplate
-- without touching cyclic WorkoutDay fields. Preserve its exact per-day prescription source.
-- Keep the existing WorkoutDayCapacityOperationalBlock CHECK strictly flex/balance.
CREATE TABLE "WorkoutDayCyclicOperationalBlock" (
  "id" TEXT NOT NULL,
  "workoutDayId" TEXT NOT NULL,
  "capacityPrescriptionVersionId" TEXT NOT NULL,
  "capacity" TEXT NOT NULL DEFAULT 'cyclic',
  "contractVersion" INTEGER NOT NULL DEFAULT 1,
  "parameters" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkoutDayCyclicOperationalBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkoutDayCyclicOperationalBlock_capacity_check" CHECK ("capacity" = 'cyclic'),
  CONSTRAINT "WorkoutDayCyclicOperationalBlock_contractVersion_check" CHECK ("contractVersion" = 1),
  CONSTRAINT "WorkoutDayCyclicOperationalBlock_parameters_check" CHECK (jsonb_typeof("parameters") = 'object'),
  CONSTRAINT "WorkoutDayCyclicOperationalBlock_day_fkey"
    FOREIGN KEY ("workoutDayId") REFERENCES "WorkoutDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkoutDayCyclicOperationalBlock_capacityVersion_fkey"
    FOREIGN KEY ("capacityPrescriptionVersionId") REFERENCES "CapacityPrescriptionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkoutDayCyclicOperationalBlock_day_key"
  ON "WorkoutDayCyclicOperationalBlock"("workoutDayId");
CREATE INDEX "WorkoutDayCyclicOperationalBlock_capacity_version_idx"
  ON "WorkoutDayCyclicOperationalBlock"("capacityPrescriptionVersionId");

-- These existing #320 guards accept the identical column contract:
-- verify exact tenant, student and versioned JSON, forbid mutations and post-release inserts.
CREATE TRIGGER "WorkoutDayCyclicOperationalBlock_scope_guard"
BEFORE INSERT OR UPDATE ON "WorkoutDayCyclicOperationalBlock"
FOR EACH ROW EXECUTE FUNCTION "validate_workout_day_capacity_operational_block"();

CREATE TRIGGER "WorkoutDayCyclicOperationalBlock_immutable_guard"
BEFORE UPDATE OR DELETE ON "WorkoutDayCyclicOperationalBlock"
FOR EACH ROW EXECUTE FUNCTION "prevent_workout_day_capacity_operational_block_mutation"();

CREATE TRIGGER "WorkoutDayCyclicOperationalBlock_consolidated_release_insert_guard"
BEFORE INSERT ON "WorkoutDayCyclicOperationalBlock"
FOR EACH ROW EXECUTE FUNCTION "guard_consolidated_released_workout_capacity_block_insert"();
