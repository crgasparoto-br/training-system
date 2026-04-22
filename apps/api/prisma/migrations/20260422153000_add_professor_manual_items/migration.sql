CREATE TYPE "ProfessorManualFormat" AS ENUM (
  'dica_rapida',
  'alerta',
  'exemplo',
  'lembrete_metodo',
  'saiba_mais'
);

CREATE TYPE "ProfessorManualContext" AS ENUM (
  'avaliacao_fisica',
  'montagem_treino',
  'uso_sistema'
);

CREATE TABLE "ProfessorManualItem" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "format" "ProfessorManualFormat" NOT NULL,
  "context" "ProfessorManualContext" NOT NULL,
  "audience" TEXT,
  "sourceSection" TEXT,
  "sourceItem" TEXT,
  "sourceExcerpt" TEXT,
  "productArea" TEXT NOT NULL,
  "productMoment" TEXT,
  "linkLabel" TEXT,
  "linkHref" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProfessorManualItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProfessorManualItem_contractId_code_key"
ON "ProfessorManualItem"("contractId", "code");

CREATE INDEX "ProfessorManualItem_contractId_context_isActive_idx"
ON "ProfessorManualItem"("contractId", "context", "isActive");

CREATE INDEX "ProfessorManualItem_contractId_productArea_isActive_idx"
ON "ProfessorManualItem"("contractId", "productArea", "isActive");

ALTER TABLE "ProfessorManualItem"
ADD CONSTRAINT "ProfessorManualItem_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
