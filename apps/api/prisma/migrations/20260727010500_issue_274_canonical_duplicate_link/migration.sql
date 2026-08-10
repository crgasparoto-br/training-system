-- Issue #274: vínculo estruturado entre registro duplicado e cadastro canônico.
-- O vínculo é administrativo, tenant-scoped e não remove o histórico do registro de origem.
ALTER TABLE "Aluno"
  ADD COLUMN IF NOT EXISTS "canonicalAlunoId" TEXT;

-- Converte consolidações anteriores que já registravam o destino no motivo de descarte.
UPDATE "Aluno" AS source
SET "canonicalAlunoId" = target."id"
FROM "Aluno" AS target
WHERE source."canonicalAlunoId" IS NULL
  AND source."discardReason" LIKE 'DUPLICATE_OF:%'
  AND target."id" = substring(source."discardReason" FROM length('DUPLICATE_OF:') + 1)
  AND target."contractId" = source."contractId"
  AND target."id" <> source."id";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Aluno_canonicalAlunoId_fkey'
  ) THEN
    ALTER TABLE "Aluno"
      ADD CONSTRAINT "Aluno_canonicalAlunoId_fkey"
      FOREIGN KEY ("canonicalAlunoId") REFERENCES "Aluno"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Aluno_canonicalAlunoId_not_self_check'
  ) THEN
    ALTER TABLE "Aluno"
      ADD CONSTRAINT "Aluno_canonicalAlunoId_not_self_check"
      CHECK ("canonicalAlunoId" IS NULL OR "canonicalAlunoId" <> "id");
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS "Aluno_contractId_canonicalAlunoId_idx"
  ON "Aluno"("contractId", "canonicalAlunoId");

CREATE OR REPLACE FUNCTION "validate_aluno_canonical_link"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_contract_id TEXT;
  target_canonical_id TEXT;
BEGIN
  IF NEW."canonicalAlunoId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "contractId", "canonicalAlunoId"
  INTO target_contract_id, target_canonical_id
  FROM "Aluno"
  WHERE "id" = NEW."canonicalAlunoId";

  IF NOT FOUND OR target_contract_id <> NEW."contractId" THEN
    RAISE EXCEPTION 'canonical aluno must belong to the same contract'
      USING ERRCODE = '23503';
  END IF;

  IF target_canonical_id IS NOT NULL THEN
    RAISE EXCEPTION 'canonical aluno cannot itself be a resolved duplicate'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Aluno_validate_canonical_link" ON "Aluno";
CREATE TRIGGER "Aluno_validate_canonical_link"
BEFORE INSERT OR UPDATE OF "canonicalAlunoId", "contractId"
ON "Aluno"
FOR EACH ROW
EXECUTE FUNCTION "validate_aluno_canonical_link"();
