-- Serializa alterações de displayOrder antes que cada UPDATE bloqueie linhas.
--
-- A reordenação aplica vários UPDATEs dentro da mesma transação. Sem um lock
-- estável, duas sequências opostas podem adquirir linhas em ordens diferentes e
-- uma delas ser abortada pelo PostgreSQL com deadlock. O advisory lock é
-- transacional, compartilhado entre instâncias da API e liberado no commit ou
-- rollback. Não altera nem remove registros do catálogo.

CREATE OR REPLACE FUNCTION "serialize_service_catalog_display_order_updates"()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('service-catalog-display-order:' || TG_TABLE_NAME, 0)
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "serialize_service_commercial_option_reorder"
  ON "ServiceCommercialOption";

CREATE TRIGGER "serialize_service_commercial_option_reorder"
BEFORE UPDATE OF "displayOrder"
ON "ServiceCommercialOption"
FOR EACH STATEMENT
EXECUTE FUNCTION "serialize_service_catalog_display_order_updates"();

DROP TRIGGER IF EXISTS "serialize_service_presentation_item_reorder"
  ON "ServicePresentationItem";

CREATE TRIGGER "serialize_service_presentation_item_reorder"
BEFORE UPDATE OF "displayOrder"
ON "ServicePresentationItem"
FOR EACH STATEMENT
EXECUTE FUNCTION "serialize_service_catalog_display_order_updates"();

DROP TRIGGER IF EXISTS "serialize_service_plan_component_reorder"
  ON "ServicePlanComponent";

CREATE TRIGGER "serialize_service_plan_component_reorder"
BEFORE UPDATE OF "displayOrder"
ON "ServicePlanComponent"
FOR EACH STATEMENT
EXECUTE FUNCTION "serialize_service_catalog_display_order_updates"();