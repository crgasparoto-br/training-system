-- Alter target HR and speed fields to text to store range values
ALTER TABLE "WorkoutDay"
  ALTER COLUMN "targetHrMin" TYPE TEXT USING "targetHrMin"::text,
  ALTER COLUMN "targetHrMax" TYPE TEXT USING "targetHrMax"::text,
  ALTER COLUMN "targetSpeedMin" TYPE TEXT USING "targetSpeedMin"::text,
  ALTER COLUMN "targetSpeedMax" TYPE TEXT USING "targetSpeedMax"::text;
