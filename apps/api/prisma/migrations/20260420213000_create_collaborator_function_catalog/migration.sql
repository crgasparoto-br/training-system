CREATE TABLE "CollaboratorFunctionOption" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollaboratorFunctionOption_pkey" PRIMARY KEY ("id")
);

INSERT INTO "CollaboratorFunctionOption" ("id", "contractId", "name", "code", "isActive", "isSystem", "createdAt", "updatedAt")
SELECT 'cf_' || substr(md5("Contract"."id" || '-' || defaults.code), 1, 24),
       "Contract"."id",
       defaults.name,
       defaults.code,
       true,
       true,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Contract"
CROSS JOIN (
    VALUES
      ('professor', 'Professor'),
      ('intern', 'Estagiário'),
      ('manager', 'Gestor'),
      ('administrative', 'Administrativo'),
      ('cleaning_services', 'Limpeza e Serviços')
) AS defaults(code, name);

ALTER TABLE "Professor" ADD COLUMN "collaboratorFunctionId" TEXT;

UPDATE "Professor" AS p
SET "collaboratorFunctionId" = cfo."id"
FROM "CollaboratorFunctionOption" AS cfo
WHERE cfo."contractId" = p."contractId"
  AND cfo."code" = p."collaboratorFunction"::text;

ALTER TABLE "Professor" ALTER COLUMN "collaboratorFunctionId" SET NOT NULL;

CREATE UNIQUE INDEX "CollaboratorFunctionOption_contractId_code_key" ON "CollaboratorFunctionOption"("contractId", "code");
CREATE INDEX "CollaboratorFunctionOption_contractId_idx" ON "CollaboratorFunctionOption"("contractId");
CREATE INDEX "Professor_collaboratorFunctionId_idx" ON "Professor"("collaboratorFunctionId");

ALTER TABLE "CollaboratorFunctionOption"
ADD CONSTRAINT "CollaboratorFunctionOption_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Professor"
ADD CONSTRAINT "Professor_collaboratorFunctionId_fkey"
FOREIGN KEY ("collaboratorFunctionId") REFERENCES "CollaboratorFunctionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Professor" DROP COLUMN "collaboratorFunction";

DROP TYPE "CollaboratorFunction";