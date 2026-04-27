UPDATE "CollaboratorFunctionOption"
SET "isActive" = false,
    "updatedAt" = NOW()
WHERE "code" = 'cleaning_services'
  AND "isSystem" = true
  AND "isActive" = true;

INSERT INTO "CollaboratorFunctionOption" (
  "id",
  "contractId",
  "name",
  "code",
  "isActive",
  "isSystem",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('cf_', MD5(CONCAT(contracts."contractId", ':', contracts."code", ':', CLOCK_TIMESTAMP()::text, ':', RANDOM()::text))),
  contracts."contractId",
  contracts."name",
  contracts."code",
  true,
  true,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT "contractId", 'Limpeza' AS "name", 'cleaning' AS "code"
  FROM "CollaboratorFunctionOption"
  UNION ALL
  SELECT DISTINCT "contractId", 'Serviços' AS "name", 'services' AS "code"
  FROM "CollaboratorFunctionOption"
) AS contracts
WHERE NOT EXISTS (
  SELECT 1
  FROM "CollaboratorFunctionOption" existing
  WHERE existing."contractId" = contracts."contractId"
    AND existing."code" = contracts."code"
);