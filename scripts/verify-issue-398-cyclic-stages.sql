-- Issue #398: adversarial checks against real PostgreSQL on a database
-- already containing #399 historical data after replaying every migration.
-- All test writes are rolled back; no seed/history is changed.
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM "WorkoutCyclicStage") <> 0 THEN
    RAISE EXCEPTION 'migration invented cyclic stages for historical sessions';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "WorkoutDay" WHERE "id" = 'issue399-legacy-day') THEN
    RAISE EXCEPTION 'legacy workout day was not preserved';
  END IF;
END $$;

INSERT INTO "WorkoutTemplate"
  ("id","planId","mesocycleNumber","weekNumber","weekStartDate","updatedAt")
VALUES ('issue398-fresh-template','issue399-legacy-plan',1,99,'2026-10-05T12:00:00Z',CURRENT_TIMESTAMP);
INSERT INTO "WorkoutDay"
  ("id","templateId","dayOfWeek","workoutDate","updatedAt")
VALUES ('issue398-fresh-day','issue398-fresh-template',1,'2026-10-05T12:00:00Z',CURRENT_TIMESTAMP);
INSERT INTO "WorkoutDay"
  ("id","templateId","dayOfWeek","workoutDate","updatedAt")
VALUES ('issue398-other-day','issue398-fresh-template',2,'2026-10-06T12:00:00Z',CURRENT_TIMESTAMP);
INSERT INTO "WorkoutCyclicStage"
  ("id","workoutDayId","position","kind","durationUnit","durationValue","updatedAt")
VALUES ('issue398-warmup','issue398-fresh-day',1,'warmup','seconds',600,CURRENT_TIMESTAMP);
INSERT INTO "WorkoutCyclicStage"
  ("id","workoutDayId","position","kind","repeatCount","updatedAt")
VALUES ('issue398-repeat','issue398-fresh-day',2,'repeat',4,CURRENT_TIMESTAMP);
INSERT INTO "WorkoutCyclicStage"
  ("id","workoutDayId","parentStageId","position","kind","durationUnit","durationValue","targetKind","targetMin","targetMax","updatedAt")
VALUES ('issue398-work','issue398-fresh-day','issue398-repeat',1,'work','seconds',90,'heart_rate_bpm',153,159,CURRENT_TIMESTAMP);
INSERT INTO "WorkoutCyclicStage"
  ("id","workoutDayId","parentStageId","position","kind","durationUnit","durationValue","updatedAt")
VALUES ('issue398-recovery','issue398-fresh-day','issue398-repeat',2,'recovery','seconds',90,CURRENT_TIMESTAMP);
SET CONSTRAINTS ALL IMMEDIATE;

DO $$
BEGIN
  BEGIN
    INSERT INTO "WorkoutCyclicStage"
      ("id","workoutDayId","position","kind","durationUnit","updatedAt")
    VALUES ('issue398-invalid-null','issue398-fresh-day',3,'work','seconds',CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'NULL duration was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "WorkoutCyclicStage"
      ("id","workoutDayId","position","kind","durationUnit","durationValue","targetKind","targetValue","updatedAt")
    VALUES ('issue398-invalid-zone','issue398-fresh-day',3,'work','seconds',90,'zone',6,CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'invalid heart-rate zone was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "WorkoutCyclicStage"
      ("id","workoutDayId","position","kind","durationUnit","durationValue","targetKind","targetValue","targetMin","updatedAt")
    VALUES ('issue398-invalid-mixed','issue398-fresh-day',3,'work','seconds',90,'pse',7,5,CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'mixed target value and range was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "WorkoutCyclicStage"
      ("id","workoutDayId","position","kind","durationUnit","durationValue","updatedAt")
    VALUES ('issue398-historical-stage','issue399-legacy-day',1,'work','seconds',90,CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'new stage was accepted in a historically executed day';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "WorkoutCyclicStage"
      ("id","workoutDayId","parentStageId","position","kind","durationUnit","durationValue","updatedAt")
    VALUES ('issue398-invalid-child','issue398-other-day','issue398-repeat',1,'work','seconds',60,CURRENT_TIMESTAMP);
    RAISE EXCEPTION 'cross-day child was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE "WorkoutCyclicStage" SET "workoutDayId"='issue398-other-day'
    WHERE "id"='issue398-repeat';
    RAISE EXCEPTION 'repeat parent reparented without children';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE "WorkoutCyclicStage" SET "kind"='warmup' WHERE "id"='issue398-work';
    RAISE EXCEPTION 'repeat group lost its only work stage';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

UPDATE "WorkoutTemplate" SET "released"=true, "releasedAt"=CURRENT_TIMESTAMP
WHERE "id"='issue398-fresh-template';
DO $$
BEGIN
  BEGIN
    UPDATE "WorkoutCyclicStage" SET "durationValue"=120 WHERE "id"='issue398-work';
    RAISE EXCEPTION 'released stage was mutable';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM "WorkoutCyclicStage" WHERE "id"='issue398-recovery';
    RAISE EXCEPTION 'released child could be removed';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
SELECT 'Issue #398 PostgreSQL adversarial migration proofs passed.' AS result;
