-- Serializa a alocação de versões por chave lógica para impedir colisões em
-- gravações concorrentes de planejamento e catálogo técnico.
CREATE OR REPLACE FUNCTION assign_capacity_planning_cycle_version()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'CapacityPlanningCycle:' || NEW."contractId" || ':' || NEW."alunoId" || ':' || NEW."level" || ':' || NEW."code",
      0
    )
  );

  SELECT COALESCE(MAX("version"), 0) + 1
    INTO NEW."version"
    FROM "CapacityPlanningCycle"
   WHERE "contractId" = NEW."contractId"
     AND "alunoId" = NEW."alunoId"
     AND "level" = NEW."level"
     AND "code" = NEW."code";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS capacity_planning_cycle_assign_version ON "CapacityPlanningCycle";
CREATE TRIGGER capacity_planning_cycle_assign_version
BEFORE INSERT ON "CapacityPlanningCycle"
FOR EACH ROW
EXECUTE FUNCTION assign_capacity_planning_cycle_version();

CREATE OR REPLACE FUNCTION assign_capacity_catalog_item_version()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'CapacityTechnicalCatalogItem:' || NEW."contractId" || ':' || NEW."category" || ':' || NEW."code",
      0
    )
  );

  IF NEW."isCurrent" THEN
    UPDATE "CapacityTechnicalCatalogItem"
       SET "isCurrent" = false,
           "updatedAt" = CURRENT_TIMESTAMP
     WHERE "contractId" = NEW."contractId"
       AND "category" = NEW."category"
       AND "code" = NEW."code"
       AND "isCurrent" = true;
  END IF;

  SELECT COALESCE(MAX("version"), 0) + 1
    INTO NEW."version"
    FROM "CapacityTechnicalCatalogItem"
   WHERE "contractId" = NEW."contractId"
     AND "category" = NEW."category"
     AND "code" = NEW."code";

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS capacity_catalog_item_assign_version ON "CapacityTechnicalCatalogItem";
CREATE TRIGGER capacity_catalog_item_assign_version
BEFORE INSERT ON "CapacityTechnicalCatalogItem"
FOR EACH ROW
EXECUTE FUNCTION assign_capacity_catalog_item_version();

-- Completa o catálogo mínimo de flexibilidade dos contratos já existentes.
WITH first_professor AS (
  SELECT DISTINCT ON ("contractId")
         "contractId",
         "id"
    FROM "Professor"
   ORDER BY "contractId", "createdAt", "id"
)
INSERT INTO "CapacityTechnicalCatalogItem" (
  "id",
  "contractId",
  "category",
  "code",
  "name",
  "metadata",
  "version",
  "isCurrent",
  "createdByProfessorId",
  "createdAt",
  "updatedAt"
)
SELECT
  'capacity-articulation-dedos-' || md5(contract_row."id"),
  contract_row."id",
  'articulation',
  'DEDOS',
  'Dedos',
  '{"sourceWorkbook":"Ideias e estruturação - Professor","sourceSection":"Flexibilidade por articulação"}'::jsonb,
  1,
  true,
  first_professor."id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Contract" AS contract_row
JOIN first_professor ON first_professor."contractId" = contract_row."id"
WHERE NOT EXISTS (
  SELECT 1
    FROM "CapacityTechnicalCatalogItem" AS existing
   WHERE existing."contractId" = contract_row."id"
     AND existing."category" = 'articulation'
     AND existing."code" = 'DEDOS'
     AND existing."isCurrent" = true
);
