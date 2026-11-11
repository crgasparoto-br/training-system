-- #394 / A-394-01: the original migration grandfathers pre-existing rows as
-- approved/legacy; change only the DEFAULT for all subsequent insertions.
ALTER TABLE "ExerciseLibrary"
  ALTER COLUMN "curationStatus" SET DEFAULT 'draft',
  ALTER COLUMN "legacyGrandfathered" SET DEFAULT FALSE;

-- #394 / A-394-03: a name has one canonical identity per tenant. Preserve
-- pre-existing legacy duplicates without deleting, merging or rewriting them.
CREATE FUNCTION issue394_exercise_canonical_name(name TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g')));
$$;

CREATE INDEX "ExerciseLibrary_contract_canonical_name_idx"
  ON "ExerciseLibrary" ("contractId", issue394_exercise_canonical_name("name"));

CREATE FUNCTION issue394_reject_duplicate_exercise_name()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  canonical_name TEXT;
BEGIN
  canonical_name := issue394_exercise_canonical_name(NEW."name");
  IF canonical_name IS NULL OR canonical_name = '' THEN
    RAISE EXCEPTION 'Exercise canonical name cannot be empty' USING ERRCODE = '23514';
  END IF;

  -- No renaming: do not block routine status/revision changes on historically
  -- duplicated catalog entries. Any newly introduced identity is checked.
  IF TG_OP = 'UPDATE' THEN
    IF NEW."contractId" = OLD."contractId"
       AND canonical_name = issue394_exercise_canonical_name(OLD."name") THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Concurrent inserts in two connections cannot both pass the existence
  -- check. The lock is transaction-scoped and partitioned by tenant/name.
  PERFORM pg_advisory_xact_lock(hashtext(NEW."contractId"), hashtext(canonical_name));
  IF EXISTS (
    SELECT 1 FROM "ExerciseLibrary" AS existing
    WHERE existing."contractId" = NEW."contractId"
      AND existing."id" <> NEW."id"
      AND issue394_exercise_canonical_name(existing."name") = canonical_name
  ) THEN
    RAISE EXCEPTION 'Exercise canonical name already exists in this contract'
      USING ERRCODE = '23505', CONSTRAINT = 'issue394_exercise_canonical_name_guard';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER issue394_exercise_canonical_name_guard
BEFORE INSERT OR UPDATE OF "name", "contractId" ON "ExerciseLibrary"
FOR EACH ROW EXECUTE FUNCTION issue394_reject_duplicate_exercise_name();
