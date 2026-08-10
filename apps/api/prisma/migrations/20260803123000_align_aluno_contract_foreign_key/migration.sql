-- Issue #247 depends on Aluno.contractId being the tenant boundary used by
-- CompanyContract (physical table "Contract"). Some databases created before
-- the lifecycle consolidation may retain a same-named FK with a different
-- referenced table. Recreate the constraint deterministically.

DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*)
    INTO orphan_count
  FROM "Aluno" aluno
  LEFT JOIN "Contract" contract ON contract.id = aluno."contractId"
  WHERE contract.id IS NULL;

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'align_aluno_contract_foreign_key: % Aluno rows do not reference an organizational Contract',
      orphan_count;
  END IF;
END $$;

ALTER TABLE "Aluno"
  DROP CONSTRAINT IF EXISTS "Aluno_contractId_fkey";

ALTER TABLE "Aluno"
  ADD CONSTRAINT "Aluno_contractId_fkey"
  FOREIGN KEY ("contractId")
  REFERENCES "Contract"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
