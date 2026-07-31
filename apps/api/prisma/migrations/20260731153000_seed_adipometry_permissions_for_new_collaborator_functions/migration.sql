BEGIN;

-- Keep sensitive adipometry capabilities deny-by-default for collaborator
-- functions created after the governance migration. Explicit grants remain a
-- separate administrative action; this trigger only materializes denied rows.
CREATE OR REPLACE FUNCTION "seedAdipometryClinicalPermissionsForCollaboratorFunction"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "AccessPermission" (
    id,
    "collaboratorFunctionId",
    "screenKey",
    "blockKey",
    "canView",
    "createdAt",
    "updatedAt"
  ) VALUES
    (
      'adpt_' || MD5(NEW.id || ':settings.contract.adipometryProtocolApproval'),
      NEW.id,
      'settings.contract',
      'settings.contract.adipometryProtocolApproval',
      FALSE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    ),
    (
      'adpt_' || MD5(NEW.id || ':settings.contract.actions.manageClinicalTechnicalResponsibility'),
      NEW.id,
      'settings.contract',
      'settings.contract.actions.manageClinicalTechnicalResponsibility',
      FALSE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey") DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "CollaboratorFunctionOption_seed_adipometry_clinical_permissions"
  ON "CollaboratorFunctionOption";
CREATE TRIGGER "CollaboratorFunctionOption_seed_adipometry_clinical_permissions"
AFTER INSERT ON "CollaboratorFunctionOption"
FOR EACH ROW
EXECUTE FUNCTION "seedAdipometryClinicalPermissionsForCollaboratorFunction"();

-- Idempotent backfill for databases where a function may have been created
-- between the previous migration and this one.
INSERT INTO "AccessPermission" (
  id,
  "collaboratorFunctionId",
  "screenKey",
  "blockKey",
  "canView",
  "createdAt",
  "updatedAt"
)
SELECT
  'adpt_' || MD5(function.id || ':' || permission."blockKey"),
  function.id,
  'settings.contract',
  permission."blockKey",
  FALSE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "CollaboratorFunctionOption" function
CROSS JOIN (
  VALUES
    ('settings.contract.adipometryProtocolApproval'),
    ('settings.contract.actions.manageClinicalTechnicalResponsibility')
) AS permission("blockKey")
ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey") DO NOTHING;

COMMIT;
