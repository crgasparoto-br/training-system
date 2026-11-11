-- Issue #394 A-394-019: release-time provenance belongs to the immutable snapshot.
-- Do not backfill or rewrite historical snapshots, whose original rights cannot be reconstructed.
-- The existing trigger executes this function on both legacy and consolidated releases.
CREATE OR REPLACE FUNCTION "issue400_capture_released_exercise_catalog"() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."released" = FALSE AND NEW."released" = TRUE THEN
    INSERT INTO "WorkoutReleasedExerciseSnapshot" ("workoutExerciseId", "catalog")
    SELECT e."id", jsonb_build_object(
        'name', library."name", 'videoUrl', library."videoUrl",
        'category', library."category", 'muscleGroup', library."muscleGroup",
        'loadType', library."loadType", 'movementType', library."movementType",
        'countingType', library."countingType", 'notes', library."notes",
        'mediaOrigin', library."mediaOrigin", 'mediaLicense', library."mediaLicense",
        'legacyGrandfathered', library."legacyGrandfathered"
      )
      FROM "WorkoutExercise" e
      JOIN "WorkoutDay" d ON d."id" = e."workoutDayId"
      JOIN "ExerciseLibrary" library ON library."id" = e."exerciseId"
    WHERE d."templateId" = OLD."id"
    ON CONFLICT ("workoutExerciseId") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
