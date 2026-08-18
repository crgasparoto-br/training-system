-- Professor users assigned to the built-in administrative function may manage
-- the designation of the adipometry technical responsible without being master.
-- This does not grant clinical protocol approval/revocation.
--
-- Keep the grant lifecycle-safe: the historical trigger seeds sensitive ADPT
-- permissions for collaborator functions created after migrations have run. For
-- the built-in administrative function, management and screen access are
-- explicit persisted grants; protocol approval remains denied by default.
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
      NEW.code = 'administrative',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
  ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey") DO NOTHING;

  IF NEW.code = 'administrative' THEN
    INSERT INTO "AccessPermission" (
      id,
      "collaboratorFunctionId",
      "screenKey",
      "blockKey",
      "canView",
      "createdAt",
      "updatedAt"
    ) VALUES (
      CONCAT('ap_', MD5(CONCAT(NEW.id, ':settings.contract:'))),
      NEW.id,
      'settings.contract',
      '',
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey")
    DO UPDATE SET
      "canView" = TRUE,
      "updatedAt" = CURRENT_TIMESTAMP;
  END IF;

  RETURN NEW;
END;
$$;

WITH administrative_functions AS (
  SELECT "id"
  FROM "CollaboratorFunctionOption"
  WHERE "code" = 'administrative'
),
required_permissions("screenKey", "blockKey") AS (
  VALUES
    ('settings.contract', ''),
    ('settings.contract', 'settings.contract.actions.manageClinicalTechnicalResponsibility')
)
INSERT INTO "AccessPermission" (
  "id",
  "collaboratorFunctionId",
  "screenKey",
  "blockKey",
  "canView",
  "createdAt",
  "updatedAt"
)
SELECT
  CONCAT('ap_', MD5(CONCAT(functions."id", ':', permissions."screenKey", ':', permissions."blockKey"))),
  functions."id",
  permissions."screenKey",
  permissions."blockKey",
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM administrative_functions functions
CROSS JOIN required_permissions permissions
ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey")
DO UPDATE SET
  "canView" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;
