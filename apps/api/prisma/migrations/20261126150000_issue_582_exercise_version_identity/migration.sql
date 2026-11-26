-- #582: existing rows remain independent identities; historical references are unchanged.
BEGIN;
ALTER TABLE "ExerciseLibrary"
  ADD COLUMN "versionRootId" TEXT,
  ADD COLUMN "supersededAt" TIMESTAMP(3),
  ADD CONSTRAINT "ExerciseLibrary_versionRootId_fkey" FOREIGN KEY ("versionRootId")
    REFERENCES "ExerciseLibrary"("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  ADD CONSTRAINT "ExerciseLibrary_superseded_inactive" CHECK ("supersededAt" IS NULL OR "curationStatus" = 'inactive');
CREATE INDEX "ExerciseLibrary_contractId_versionRootId_idx" ON "ExerciseLibrary" ("contractId", "versionRootId");
CREATE INDEX "ExerciseLibrary_versionRootId_idx" ON "ExerciseLibrary" ("versionRootId");
CREATE UNIQUE INDEX issue582_one_candidate ON "ExerciseLibrary" ("contractId", (COALESCE("versionRootId","id")))
  WHERE "curationStatus" IN ('draft','in_review');
CREATE UNIQUE INDEX issue582_one_publication ON "ExerciseLibrary" ("contractId", (COALESCE("versionRootId","id")))
  WHERE "curationStatus" = 'approved' AND "legacyGrandfathered" = FALSE;

CREATE FUNCTION issue582_editorial_content(row_data JSONB)
RETURNS JSONB LANGUAGE SQL IMMUTABLE AS $$
  SELECT COALESCE(jsonb_object_agg(key,value), '{}'::jsonb)
  FROM jsonb_each(row_data - ARRAY['id','contractId','createdAt','updatedAt','version','contentVersion',
    'systemDefault','curationStatus','createdByUserId','reviewedByUserId','reviewedAt','lastModifiedByUserId',
    'lastCurationAction','legacyGrandfathered','versionRootId','supersededAt'])
  WHERE value <> 'null'::jsonb AND value <> '""'::jsonb;
$$;
CREATE OR REPLACE FUNCTION issue570_content_version_on_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF issue582_editorial_content(to_jsonb(NEW)) IS DISTINCT FROM issue582_editorial_content(to_jsonb(OLD)) THEN
    NEW."contentVersion" := OLD."contentVersion" + 1;
  ELSE
    NEW."contentVersion" := OLD."contentVersion";
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION issue394_reject_duplicate_exercise_name()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  canonical_name TEXT;
  root_row "ExerciseLibrary"%ROWTYPE;
  latest_row "ExerciseLibrary"%ROWTYPE;
  has_children BOOLEAN;
BEGIN
  canonical_name := issue394_exercise_canonical_name(NEW."name");
  IF canonical_name IS NULL OR canonical_name = '' THEN
    RAISE EXCEPTION 'Exercise canonical name cannot be empty' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."contractId" IS DISTINCT FROM OLD."contractId"
       OR NEW."versionRootId" IS DISTINCT FROM OLD."versionRootId" THEN
      RAISE EXCEPTION 'Exercise identity is immutable' USING ERRCODE = '23514';
    END IF;
    SELECT EXISTS(SELECT 1 FROM "ExerciseLibrary" c WHERE c."versionRootId" = OLD."id") INTO has_children;
    IF NEW."lastCurationAction" = 'system_defaults_repair' AND
      (has_children OR OLD."versionRootId" IS NOT NULL OR OLD."supersededAt" IS NOT NULL) THEN
      RETURN NULL;
    END IF;
    IF OLD."supersededAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Superseded exercise is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW."supersededAt" IS NOT NULL AND
      (OLD."curationStatus" <> 'approved' OR NEW."curationStatus" <> 'inactive' OR NEW."lastCurationAction" IS DISTINCT FROM 'supersede') THEN
      RAISE EXCEPTION 'Invalid publication retirement' USING ERRCODE = '23514';
    END IF;
    IF has_children OR OLD."versionRootId" IS NOT NULL THEN
      IF NEW."name" IS DISTINCT FROM OLD."name" OR
        (OLD."curationStatus" IN ('approved','inactive') AND
          (issue582_editorial_content(to_jsonb(NEW)) IS DISTINCT FROM issue582_editorial_content(to_jsonb(OLD))
           OR NEW."curationStatus" IN ('draft','in_review'))) THEN
        RAISE EXCEPTION 'Create a candidate instead of editing the publication' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF canonical_name = issue394_exercise_canonical_name(OLD."name") THEN RETURN NEW; END IF;
  ELSE
    IF NEW."supersededAt" IS NOT NULL THEN
      RAISE EXCEPTION 'New exercise cannot be superseded' USING ERRCODE = '23514';
    END IF;
    IF NEW."versionRootId" IS NOT NULL THEN
      SELECT * INTO root_row FROM "ExerciseLibrary"
        WHERE "id" = NEW."versionRootId" AND "contractId" = NEW."contractId" AND "versionRootId" IS NULL FOR UPDATE;
      IF NOT FOUND OR root_row."name" IS DISTINCT FROM NEW."name" OR NEW."curationStatus" <> 'draft'
        OR NEW."systemDefault" OR NEW."legacyGrandfathered" OR NEW."reviewedByUserId" IS NOT NULL
        OR NEW."reviewedAt" IS NOT NULL OR NEW."createdByUserId" IS NULL
        OR NEW."lastCurationAction" IS DISTINCT FROM 'create_version' THEN
        RAISE EXCEPTION 'Invalid exercise version family' USING ERRCODE = '23514';
      END IF;
      SELECT * INTO latest_row FROM "ExerciseLibrary" e
        WHERE e."contractId" = NEW."contractId" AND (e."id" = root_row."id" OR e."versionRootId" = root_row."id")
        ORDER BY e."contentVersion" DESC, e."createdAt" DESC, e."id" DESC LIMIT 1;
      NEW."contentVersion" := latest_row."contentVersion" +
        CASE WHEN issue582_editorial_content(to_jsonb(NEW)) IS DISTINCT FROM issue582_editorial_content(to_jsonb(latest_row)) THEN 1 ELSE 0 END;
      RETURN NEW;
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW."contractId"), hashtext(canonical_name));
  IF EXISTS (SELECT 1 FROM "ExerciseLibrary" e WHERE e."contractId" = NEW."contractId"
      AND e."id" <> NEW."id" AND issue394_exercise_canonical_name(e."name") = canonical_name) THEN
    RAISE EXCEPTION 'Exercise canonical name already exists in this contract'
      USING ERRCODE = '23505', CONSTRAINT = 'issue394_exercise_canonical_name_guard';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER issue394_exercise_canonical_name_guard ON "ExerciseLibrary";
CREATE TRIGGER issue394_exercise_canonical_name_guard
BEFORE INSERT OR UPDATE ON "ExerciseLibrary"
FOR EACH ROW EXECUTE FUNCTION issue394_reject_duplicate_exercise_name();
COMMIT;
