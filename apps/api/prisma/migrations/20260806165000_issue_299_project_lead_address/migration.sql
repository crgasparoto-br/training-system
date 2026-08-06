-- Issue #299
--
-- StudentProfile.identificationData permanece como fonte canônica. Esta
-- migration repara somente a projeção legada usada por telas que ainda leem
-- Profile, limitada a contas vinculadas a exatamente um Aluno para evitar
-- transportar identidade tenant-scoped para um perfil global ambíguo.
UPDATE "Profile" AS legacy_profile
SET
  "addressStreet" = NULLIF(BTRIM(canonical_profile."identificationData"->>'addressStreet'), ''),
  "addressNumber" = NULLIF(BTRIM(canonical_profile."identificationData"->>'addressNumber'), ''),
  "addressComplement" = NULLIF(BTRIM(canonical_profile."identificationData"->>'addressComplement'), ''),
  "addressNeighborhood" = NULLIF(BTRIM(canonical_profile."identificationData"->>'addressNeighborhood'), ''),
  "addressCity" = NULLIF(BTRIM(canonical_profile."identificationData"->>'addressCity'), ''),
  "addressState" = NULLIF(BTRIM(canonical_profile."identificationData"->>'addressState'), ''),
  "addressZipCode" = NULLIF(BTRIM(canonical_profile."identificationData"->>'addressZipCode'), ''),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "Aluno" AS student
JOIN "StudentProfile" AS canonical_profile
  ON canonical_profile."alunoId" = student."id"
 AND canonical_profile."contractId" = student."contractId"
WHERE legacy_profile."userId" = student."userId"
  AND student."status" = 'ACTIVE_STUDENT'
  AND student."userId" IS NOT NULL
  AND jsonb_typeof(canonical_profile."identificationData") = 'object'
  AND EXISTS (
    SELECT 1
    FROM jsonb_each_text(canonical_profile."identificationData") AS identity_field(key, value)
    WHERE identity_field.key IN (
      'addressStreet',
      'addressNumber',
      'addressComplement',
      'addressNeighborhood',
      'addressCity',
      'addressState',
      'addressZipCode'
    )
      AND BTRIM(identity_field.value) <> ''
  )
  AND (
    SELECT COUNT(*)
    FROM "Aluno" AS linked_student
    WHERE linked_student."userId" = student."userId"
  ) = 1;
