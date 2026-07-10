-- Catálogo comercial estruturado de serviços (issues #210 e #211)
-- Mantém ServiceOption como agregado principal para preservar IDs já referenciados
-- por alunos, contratos e modelos de contrato durante o rollout.

ALTER TABLE "ServiceOption"
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'individual_service',
  ADD COLUMN IF NOT EXISTS "summary" TEXT,
  ADD COLUMN IF NOT EXISTS "whatIs" TEXT,
  ADD COLUMN IF NOT EXISTS "targetAudience" TEXT,
  ADD COLUMN IF NOT EXISTS "displayOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'legacy';

UPDATE "ServiceOption"
SET
  "whatIs" = COALESCE("whatIs", "description"),
  "summary" = COALESCE("summary", "description"),
  "origin" = COALESCE(NULLIF("origin", ''), 'legacy'),
  "category" = CASE
    WHEN "code" IN ('avaliacao_fisica_avulsa', 'consultas_avaliacao_fisica') THEN 'assessment'
    ELSE COALESCE(NULLIF("category", ''), 'individual_service')
  END
WHERE "parentServiceId" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOption_category_check'
  ) THEN
    ALTER TABLE "ServiceOption"
      ADD CONSTRAINT "ServiceOption_category_check"
      CHECK ("category" IN ('assessment', 'individual_service', 'combined_plan'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ServiceOption_displayOrder_check'
  ) THEN
    ALTER TABLE "ServiceOption"
      ADD CONSTRAINT "ServiceOption_displayOrder_check"
      CHECK ("displayOrder" >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ServiceOption_contractId_category_isActive_displayOrder_idx"
  ON "ServiceOption"("contractId", "category", "isActive", "displayOrder");

CREATE TABLE IF NOT EXISTS "ServiceCommercialOption" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "frequency" TEXT,
  "quantity" DECIMAL(10, 2),
  "unit" TEXT,
  "priceType" TEXT NOT NULL,
  "priceAmount" DECIMAL(12, 2),
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "origin" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServiceCommercialOption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceCommercialOption_contractId_code_key" UNIQUE ("contractId", "code"),
  CONSTRAINT "ServiceCommercialOption_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceCommercialOption_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "ServiceOption"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceCommercialOption_price_check" CHECK (
    ("priceType" = 'fixed' AND "priceAmount" IS NOT NULL AND "priceAmount" > 0)
    OR ("priceType" IN ('free', 'on_request') AND "priceAmount" IS NULL)
  ),
  CONSTRAINT "ServiceCommercialOption_priceType_check"
    CHECK ("priceType" IN ('fixed', 'free', 'on_request')),
  CONSTRAINT "ServiceCommercialOption_validity_check"
    CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" >= "validFrom"),
  CONSTRAINT "ServiceCommercialOption_displayOrder_check" CHECK ("displayOrder" >= 0),
  CONSTRAINT "ServiceCommercialOption_quantity_check" CHECK ("quantity" IS NULL OR "quantity" > 0)
);

CREATE INDEX IF NOT EXISTS "ServiceCommercialOption_contractId_serviceId_isActive_displayOrder_idx"
  ON "ServiceCommercialOption"("contractId", "serviceId", "isActive", "displayOrder");
CREATE INDEX IF NOT EXISTS "ServiceCommercialOption_contractId_validity_idx"
  ON "ServiceCommercialOption"("contractId", "validFrom", "validUntil");

CREATE TABLE IF NOT EXISTS "ServicePresentationItem" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "serviceId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "origin" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServicePresentationItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServicePresentationItem_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServicePresentationItem_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "ServiceOption"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServicePresentationItem_text_check" CHECK (length(trim("text")) > 0),
  CONSTRAINT "ServicePresentationItem_displayOrder_check" CHECK ("displayOrder" >= 0)
);

CREATE INDEX IF NOT EXISTS "ServicePresentationItem_contractId_serviceId_isActive_displayOrder_idx"
  ON "ServicePresentationItem"("contractId", "serviceId", "isActive", "displayOrder");

CREATE TABLE IF NOT EXISTS "ServicePlanComponent" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "planServiceId" TEXT NOT NULL,
  "targetServiceId" TEXT,
  "targetOptionId" TEXT,
  "quantity" DECIMAL(10, 2),
  "unit" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "origin" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServicePlanComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServicePlanComponent_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServicePlanComponent_planServiceId_fkey"
    FOREIGN KEY ("planServiceId") REFERENCES "ServiceOption"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServicePlanComponent_targetServiceId_fkey"
    FOREIGN KEY ("targetServiceId") REFERENCES "ServiceOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServicePlanComponent_targetOptionId_fkey"
    FOREIGN KEY ("targetOptionId") REFERENCES "ServiceCommercialOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ServicePlanComponent_target_check" CHECK (
    ("targetServiceId" IS NOT NULL AND "targetOptionId" IS NULL)
    OR ("targetServiceId" IS NULL AND "targetOptionId" IS NOT NULL)
  ),
  CONSTRAINT "ServicePlanComponent_self_check"
    CHECK ("targetServiceId" IS NULL OR "targetServiceId" <> "planServiceId"),
  CONSTRAINT "ServicePlanComponent_displayOrder_check" CHECK ("displayOrder" >= 0),
  CONSTRAINT "ServicePlanComponent_quantity_check" CHECK ("quantity" IS NULL OR "quantity" > 0)
);

CREATE INDEX IF NOT EXISTS "ServicePlanComponent_contractId_planServiceId_isActive_displayOrder_idx"
  ON "ServicePlanComponent"("contractId", "planServiceId", "isActive", "displayOrder");
CREATE INDEX IF NOT EXISTS "ServicePlanComponent_contractId_targetServiceId_idx"
  ON "ServicePlanComponent"("contractId", "targetServiceId");
CREATE INDEX IF NOT EXISTS "ServicePlanComponent_contractId_targetOptionId_idx"
  ON "ServicePlanComponent"("contractId", "targetOptionId");

-- Converte ofertas legadas em opções comerciais sem remover ou substituir os IDs
-- originais. A chave derivada torna a transformação repetível em bases de teste.
INSERT INTO "ServiceCommercialOption" (
  "id", "contractId", "serviceId", "code", "name", "priceType", "priceAmount",
  "validFrom", "validUntil", "isActive", "displayOrder", "origin", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || child."id",
  child."contractId",
  child."parentServiceId",
  child."code",
  child."name",
  CASE WHEN child."monthlyPrice" IS NOT NULL AND child."monthlyPrice" > 0 THEN 'fixed' ELSE 'on_request' END,
  CASE WHEN child."monthlyPrice" IS NOT NULL AND child."monthlyPrice" > 0 THEN child."monthlyPrice"::DECIMAL(12, 2) ELSE NULL END,
  child."validFrom",
  child."validUntil",
  child."isActive",
  ROW_NUMBER() OVER (PARTITION BY child."parentServiceId" ORDER BY child."createdAt", child."id") - 1,
  'legacy',
  child."createdAt",
  child."updatedAt"
FROM "ServiceOption" child
WHERE child."parentServiceId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
