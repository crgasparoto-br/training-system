CREATE TABLE "ServiceOption" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOption_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ServiceOption" ("id", "contractId", "name", "code", "isActive", "isSystem", "createdAt", "updatedAt")
SELECT 'sv_' || substr(md5("Contract"."id" || '-' || defaults.code), 1, 24),
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
      ('personal_trainer', 'Personal Trainer'),
      ('consultoria_esportiva', 'Consultoria Esportiva'),
      ('avaliacao_fisica_avulsa', 'Avaliação Física Avulsa')
) AS defaults(code, name);

ALTER TABLE "Aluno" ADD COLUMN "serviceId" TEXT;

CREATE UNIQUE INDEX "ServiceOption_contractId_code_key" ON "ServiceOption"("contractId", "code");
CREATE INDEX "ServiceOption_contractId_idx" ON "ServiceOption"("contractId");
CREATE INDEX "Aluno_serviceId_idx" ON "Aluno"("serviceId");

ALTER TABLE "ServiceOption"
ADD CONSTRAINT "ServiceOption_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Aluno"
ADD CONSTRAINT "Aluno_serviceId_fkey"
FOREIGN KEY ("serviceId") REFERENCES "ServiceOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;