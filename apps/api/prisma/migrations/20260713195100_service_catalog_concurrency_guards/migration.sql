-- Protege a confirmação de impacto contra alterações concorrentes no catálogo.
-- A migration não remove registros nem modifica vínculos históricos.

CREATE OR REPLACE FUNCTION "guard_active_service_plan_component_target"()
RETURNS trigger AS $$
DECLARE
  resolved_service_id TEXT;
BEGIN
  IF NEW."isActive" = false THEN
    RETURN NEW;
  END IF;

  IF NEW."targetServiceId" IS NOT NULL THEN
    SELECT service."id"
      INTO resolved_service_id
      FROM "ServiceOption" service
     WHERE service."id" = NEW."targetServiceId"
       AND service."contractId" = NEW."contractId"
       AND service."parentServiceId" IS NULL
       AND service."isActive" = true
     FOR UPDATE;
  ELSE
    SELECT option."serviceId"
      INTO resolved_service_id
      FROM "ServiceCommercialOption" option
      INNER JOIN "ServiceOption" service
        ON service."id" = option."serviceId"
       AND service."contractId" = option."contractId"
     WHERE option."id" = NEW."targetOptionId"
       AND option."contractId" = NEW."contractId"
       AND option."isActive" = true
       AND service."isActive" = true
     FOR UPDATE OF option, service;
  END IF;

  IF resolved_service_id IS NULL THEN
    RAISE EXCEPTION 'O alvo da composição está inativo ou não pertence a este contrato';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "touch_service_catalog_component_targets"()
RETURNS trigger AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    IF OLD."targetOptionId" IS NOT NULL THEN
      UPDATE "ServiceCommercialOption"
         SET "updatedAt" = clock_timestamp()
       WHERE "id" = OLD."targetOptionId"
         AND "contractId" = OLD."contractId";

      UPDATE "ServiceOption" service
         SET "updatedAt" = clock_timestamp()
        FROM "ServiceCommercialOption" option
       WHERE option."id" = OLD."targetOptionId"
         AND option."contractId" = OLD."contractId"
         AND service."id" = option."serviceId"
         AND service."contractId" = OLD."contractId";
    END IF;

    IF OLD."targetServiceId" IS NOT NULL THEN
      UPDATE "ServiceOption"
         SET "updatedAt" = clock_timestamp()
       WHERE "id" = OLD."targetServiceId"
         AND "contractId" = OLD."contractId";
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    IF NEW."targetOptionId" IS NOT NULL THEN
      UPDATE "ServiceCommercialOption"
         SET "updatedAt" = clock_timestamp()
       WHERE "id" = NEW."targetOptionId"
         AND "contractId" = NEW."contractId";

      UPDATE "ServiceOption" service
         SET "updatedAt" = clock_timestamp()
        FROM "ServiceCommercialOption" option
       WHERE option."id" = NEW."targetOptionId"
         AND option."contractId" = NEW."contractId"
         AND service."id" = option."serviceId"
         AND service."contractId" = NEW."contractId";
    END IF;

    IF NEW."targetServiceId" IS NOT NULL THEN
      UPDATE "ServiceOption"
         SET "updatedAt" = clock_timestamp()
       WHERE "id" = NEW."targetServiceId"
         AND "contractId" = NEW."contractId";
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "guard_active_service_plan_component_target_trigger"
  ON "ServicePlanComponent";

CREATE TRIGGER "guard_active_service_plan_component_target_trigger"
BEFORE INSERT OR UPDATE OF "targetServiceId", "targetOptionId", "isActive", "contractId"
ON "ServicePlanComponent"
FOR EACH ROW
EXECUTE FUNCTION "guard_active_service_plan_component_target"();

DROP TRIGGER IF EXISTS "touch_service_catalog_component_targets_trigger"
  ON "ServicePlanComponent";

CREATE TRIGGER "touch_service_catalog_component_targets_trigger"
AFTER INSERT OR UPDATE OR DELETE
ON "ServicePlanComponent"
FOR EACH ROW
EXECUTE FUNCTION "touch_service_catalog_component_targets"();
