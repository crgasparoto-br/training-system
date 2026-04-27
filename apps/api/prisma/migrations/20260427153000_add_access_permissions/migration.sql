CREATE TABLE "AccessPermission" (
  "id" TEXT NOT NULL,
  "collaboratorFunctionId" TEXT NOT NULL,
  "screenKey" TEXT NOT NULL,
  "blockKey" TEXT NOT NULL DEFAULT '',
  "canView" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccessPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessPermission_collaboratorFunctionId_screenKey_blockKey_key"
  ON "AccessPermission"("collaboratorFunctionId", "screenKey", "blockKey");

CREATE INDEX "AccessPermission_collaboratorFunctionId_idx"
  ON "AccessPermission"("collaboratorFunctionId");

CREATE INDEX "AccessPermission_screenKey_idx"
  ON "AccessPermission"("screenKey");

ALTER TABLE "AccessPermission"
ADD CONSTRAINT "AccessPermission_collaboratorFunctionId_fkey"
FOREIGN KEY ("collaboratorFunctionId")
REFERENCES "CollaboratorFunctionOption"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

WITH screens("screenKey") AS (
  VALUES
    ('students.registration'),
    ('collaborators.registration'),
    ('hourlyRateLevels.registration'),
    ('physicalAssessment.protocol'),
    ('students.consultation'),
    ('collaborators.consultation'),
    ('plans'),
    ('agenda'),
    ('library'),
    ('executions'),
    ('reports'),
    ('settings.home'),
    ('settings.contract'),
    ('settings.parameters'),
    ('settings.assessmentTypes'),
    ('settings.services'),
    ('settings.banks'),
    ('settings.collaboratorFunctions'),
    ('settings.subjectiveScales'),
    ('settings.professorManual'),
    ('settings.alunoAccess'),
    ('settings.referenceTable')
),
screen_matrix AS (
  SELECT
    cfo."id" AS "collaboratorFunctionId",
    screens."screenKey",
    '' AS "blockKey",
    CASE
      WHEN cfo."code" = 'manager' THEN screens."screenKey" IN (
        'students.registration',
        'collaborators.registration',
        'physicalAssessment.protocol',
        'students.consultation',
        'collaborators.consultation',
        'plans',
        'agenda',
        'library',
        'executions',
        'reports',
        'settings.home',
        'settings.contract',
        'settings.parameters',
        'settings.assessmentTypes',
        'settings.subjectiveScales',
        'settings.professorManual',
        'settings.referenceTable'
      )
      WHEN cfo."code" = 'professor' THEN screens."screenKey" IN (
        'students.registration',
        'collaborators.registration',
        'physicalAssessment.protocol',
        'students.consultation',
        'plans',
        'agenda',
        'library',
        'executions',
        'reports',
        'settings.home',
        'settings.contract',
        'settings.parameters',
        'settings.assessmentTypes',
        'settings.subjectiveScales',
        'settings.professorManual',
        'settings.referenceTable'
      )
      ELSE screens."screenKey" IN (
        'students.registration',
        'physicalAssessment.protocol',
        'students.consultation',
        'plans',
        'agenda',
        'library',
        'executions',
        'reports',
        'settings.home',
        'settings.contract',
        'settings.parameters',
        'settings.assessmentTypes',
        'settings.subjectiveScales',
        'settings.professorManual',
        'settings.referenceTable'
      )
    END AS "canView"
  FROM "CollaboratorFunctionOption" cfo
  CROSS JOIN screens
),
blocks("screenKey", "blockKey") AS (
  VALUES
    ('collaborators.registration', 'collaborators.registration.collaborator'),
    ('collaborators.registration', 'collaborators.registration.manager')
),
block_matrix AS (
  SELECT
    cfo."id" AS "collaboratorFunctionId",
    blocks."screenKey",
    blocks."blockKey",
    CASE
      WHEN cfo."code" = 'manager' THEN blocks."blockKey" IN (
        'collaborators.registration.collaborator',
        'collaborators.registration.manager'
      )
      WHEN cfo."code" = 'professor' THEN blocks."blockKey" = 'collaborators.registration.collaborator'
      ELSE false
    END AS "canView"
  FROM "CollaboratorFunctionOption" cfo
  CROSS JOIN blocks
),
permission_matrix AS (
  SELECT * FROM screen_matrix
  UNION ALL
  SELECT * FROM block_matrix
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
  CONCAT('ap_', MD5(CONCAT(matrix."collaboratorFunctionId", ':', matrix."screenKey", ':', matrix."blockKey"))),
  matrix."collaboratorFunctionId",
  matrix."screenKey",
  matrix."blockKey",
  matrix."canView",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM permission_matrix matrix
ON CONFLICT ("collaboratorFunctionId", "screenKey", "blockKey") DO NOTHING;
