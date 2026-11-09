-- #394: revision snapshots cannot be rewritten or individually deleted.
CREATE FUNCTION issue394_forbid_revision_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Exercise catalog revisions are append-only' USING ERRCODE = '23514';
  END IF;
  -- Cascading deletion of an entire contract may remove the parent first.
  IF EXISTS (SELECT 1 FROM "ExerciseLibrary" WHERE "id" = OLD."exerciseId") THEN
    RAISE EXCEPTION 'Exercise catalog revisions are append-only' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER issue394_revision_append_only
BEFORE UPDATE OR DELETE ON "ExerciseLibraryRevision"
FOR EACH ROW EXECUTE FUNCTION issue394_forbid_revision_rewrite();
