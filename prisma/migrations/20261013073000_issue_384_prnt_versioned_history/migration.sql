-- PRNT history is append-only. Rows existing before this migration receive a
-- current-state baseline, not a fabricated reconstruction of past edits.
ALTER TABLE "ProntuarioGoal" ADD COLUMN "closedAt" TIMESTAMP(3);

CREATE TABLE "ProntuarioHistoryEvent" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "action" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "actorUserId" TEXT,
  "source" TEXT NOT NULL DEFAULT 'prnt-api',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProntuarioHistoryEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProntuarioHistoryEvent" ADD CONSTRAINT "ProntuarioHistoryEvent_recordId_fkey"
  FOREIGN KEY ("recordId") REFERENCES "ProntuarioRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ProntuarioHistoryEvent_entityType_entityId_version_key"
  ON "ProntuarioHistoryEvent"("entityType","entityId","version");
CREATE INDEX "ProntuarioHistoryEvent_contractId_alunoId_recordId_createdAt_idx"
  ON "ProntuarioHistoryEvent"("contractId","alunoId","recordId","createdAt");
CREATE INDEX "ProntuarioHistoryEvent_recordId_entityType_entityId_version_idx"
  ON "ProntuarioHistoryEvent"("recordId","entityType","entityId","version");

-- Capture every legacy current state before installing the immutability trigger.
INSERT INTO "ProntuarioHistoryEvent" ("id","recordId","contractId","alunoId","entityType","entityId","version","action","snapshot","source")
SELECT gen_random_uuid()::text, r."id",r."contractId",r."alunoId", 'record',r."id",1,'baseline',
  jsonb_build_object('recordDate',r."recordDate",'summary',r."summary",'notes',r."notes",'status',r."status",'closedAt',r."closedAt"),'legacy-baseline'
FROM "ProntuarioRecord" r;

INSERT INTO "ProntuarioHistoryEvent" ("id","recordId","contractId","alunoId","entityType","entityId","version","action","snapshot","source")
SELECT gen_random_uuid()::text, r."id",r."contractId",r."alunoId", 'goal',g."id",1,'baseline',
  jsonb_build_object('title',g."title",'description',g."description",'status',g."status",'priority',g."priority",'targetDate',g."targetDate",'closedAt',g."closedAt"),'legacy-baseline'
FROM "ProntuarioGoal" g JOIN "ProntuarioRecord" r ON r."id"=g."recordId";

INSERT INTO "ProntuarioHistoryEvent" ("id","recordId","contractId","alunoId","entityType","entityId","version","action","snapshot","source")
SELECT gen_random_uuid()::text, r."id",r."contractId",r."alunoId", 'medicationProcedure',m."id",1,'baseline',
  jsonb_build_object('type',m."type",'name',m."name",'dosage',m."dosage",'frequency',m."frequency",
   'startDate',m."startDate",'endDate',m."endDate",'notes',m."notes"),'legacy-baseline'
FROM "ProntuarioMedicationProcedure" m JOIN "ProntuarioRecord" r ON r."id"=m."recordId";

INSERT INTO "ProntuarioHistoryEvent" ("id","recordId","contractId","alunoId","entityType","entityId","version","action","snapshot","source")
SELECT gen_random_uuid()::text, r."id",r."contractId",r."alunoId", 'anamnesisFollowUp',a."id",1,'baseline',
  jsonb_build_object('parqSubmissionId',a."parqSubmissionId",'itemKey',a."itemKey",'itemLabel',a."itemLabel",
   'status',a."status",'followUpNotes',a."followUpNotes",'actionPlan',a."actionPlan",'closedAt',a."closedAt"),'legacy-baseline'
FROM "ProntuarioAnamnesisFollowUp" a JOIN "ProntuarioRecord" r ON r."id"=a."recordId";

INSERT INTO "ProntuarioHistoryEvent" ("id","recordId","contractId","alunoId","entityType","entityId","version","action","snapshot","source")
SELECT gen_random_uuid()::text, r."id",r."contractId",r."alunoId", 'activityHistory',a."id",1,'baseline',
  jsonb_build_object('activityType',a."activityType",'description',a."description",'frequency',a."frequency",
   'duration',a."duration",'intensity',a."intensity",'startedAt',a."startedAt",'endedAt',a."endedAt",'notes',a."notes"),'legacy-baseline'
FROM "ProntuarioActivityHistory" a JOIN "ProntuarioRecord" r ON r."id"=a."recordId";

INSERT INTO "ProntuarioHistoryEvent" ("id","recordId","contractId","alunoId","entityType","entityId","version","action","snapshot","source")
SELECT gen_random_uuid()::text, r."id",r."contractId",r."alunoId", 'painCase',p."id",1,'baseline',
  jsonb_build_object('title',p."title",'region',p."region",'status',p."status",
  'onsetDate',p."onsetDate",'description',p."description",'closedAt',p."closedAt"),'legacy-baseline'
FROM "ProntuarioPainCase" p JOIN "ProntuarioRecord" r ON r."id"=p."recordId";

INSERT INTO "ProntuarioHistoryEvent" ("id","recordId","contractId","alunoId","entityType","entityId","version","action","snapshot","source")
SELECT gen_random_uuid()::text, r."id",r."contractId",r."alunoId", 'painFollowUp',f."id",1,'baseline',
  jsonb_build_object('followUpAt',f."followUpAt",'intensity',f."intensity",'notes',f."notes",'conduct',f."conduct"),'legacy-baseline'
FROM "ProntuarioPainFollowUp" f JOIN "ProntuarioPainCase" p ON p."id"=f."painCaseId"
JOIN "ProntuarioRecord" r ON r."id"=p."recordId";

INSERT INTO "ProntuarioHistoryEvent" ("id","recordId","contractId","alunoId","entityType","entityId","version","action","snapshot","source")
SELECT gen_random_uuid()::text, d."recordId",d."contractId",d."alunoId",'discomfortSnapshot',d."id",1,'baseline',
  jsonb_build_object('snapshotAt',d."snapshotAt",'notes',d."notes",'entries',
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'regionId',e."regionId",'regionName',e."regionName",
        'discomfortTypes',to_jsonb(e."discomfortTypes"),
        'intensity',e."intensity",'notes',e."notes"
      )), '[]'::jsonb)
      FROM "ProntuarioDiscomfortEntry" e WHERE e."snapshotId"=d."id")
  ), 'legacy-baseline'
FROM "ProntuarioDiscomfortSnapshot" d;

CREATE FUNCTION prnt_history_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PRNT clinical history is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER prnt_history_immutable BEFORE UPDATE OR DELETE ON "ProntuarioHistoryEvent"
FOR EACH ROW EXECUTE FUNCTION prnt_history_append_only();


-- The canonical health-intake form uses mutable drafts; immutable revisions
-- preserve successive clinical questionnaire states without copying PAR-Q.
CREATE TABLE "StudentHealthIntakeRevision" (
  "id" TEXT NOT NULL,
  "intakeId" TEXT NOT NULL,
  "alunoId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "sourceVersion" INTEGER NOT NULL,
  "formVersion" TEXT,
  "sourceType" "StudentRecordSourceType" NOT NULL,
  "sourceReference" TEXT,
  "actorUserId" TEXT,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentHealthIntakeRevision_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "StudentHealthIntakeRevision" ADD CONSTRAINT "StudentHealthIntakeRevision_intakeId_fkey"
  FOREIGN KEY ("intakeId") REFERENCES "StudentHealthIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "StudentHealthIntakeRevision_intakeId_revision_key"
  ON "StudentHealthIntakeRevision"("intakeId","revision");
CREATE INDEX "StudentHealthIntakeRevision_contractId_alunoId_createdAt_idx"
  ON "StudentHealthIntakeRevision"("contractId","alunoId","createdAt");
CREATE INDEX "StudentHealthIntakeRevision_intakeId_createdAt_idx"
  ON "StudentHealthIntakeRevision"("intakeId","createdAt");

INSERT INTO "StudentHealthIntakeRevision"
  ("id","intakeId","alunoId","contractId","revision","sourceVersion",
   "formVersion","sourceType","sourceReference","actorUserId","snapshot")
SELECT gen_random_uuid()::text, i."id",i."alunoId",i."contractId",1,i."version",
  i."formVersion",i."sourceType",i."sourceReference",NULL,
  jsonb_build_object('formVersion', i."formVersion", 'status', i."status",
    'assessmentDate', i."assessmentDate", 'questionnaireAha', i."questionnaireAha",
    'clinicalHistoryData', i."clinicalHistoryData",
    'medicationData', i."medicationData", 'injuryData', i."injuryData",
    'allergyData', i."allergyData", 'observations', i."observations",
    'completedAt', i."completedAt")
FROM "StudentHealthIntake" i;

CREATE FUNCTION capture_health_intake_revision() RETURNS trigger AS $$
DECLARE
  previous_payload JSONB;
  next_payload JSONB;
  next_revision INTEGER;
  revision_actor TEXT;
BEGIN
  revision_actor := NEW."recordedByUserId";
  next_payload := jsonb_build_object(
    'formVersion', NEW."formVersion", 'status', NEW."status",
    'assessmentDate', NEW."assessmentDate", 'questionnaireAha', NEW."questionnaireAha",
    'clinicalHistoryData', NEW."clinicalHistoryData", 'medicationData', NEW."medicationData",
    'injuryData', NEW."injuryData", 'allergyData', NEW."allergyData",
    'observations', NEW."observations", 'completedAt', NEW."completedAt"
  );
  IF TG_OP = 'UPDATE' THEN
    previous_payload := jsonb_build_object(
      'formVersion', OLD."formVersion", 'status', OLD."status",
      'assessmentDate', OLD."assessmentDate", 'questionnaireAha', OLD."questionnaireAha",
      'clinicalHistoryData', OLD."clinicalHistoryData", 'medicationData', OLD."medicationData",
      'injuryData', OLD."injuryData", 'allergyData', OLD."allergyData",
      'observations', OLD."observations", 'completedAt', OLD."completedAt"
    );
    IF previous_payload = next_payload THEN RETURN NEW; END IF;
    -- Completion can be performed by a different user than the respondent.
    -- Preserve the response author and attribute the completion to its actor.
    IF NEW."completedAt" IS DISTINCT FROM OLD."completedAt"
       AND NEW."completedAt" IS NOT NULL THEN
      revision_actor := COALESCE(NEW."completedByUserId", NEW."recordedByUserId");
    END IF;
  END IF;
  SELECT COALESCE(MAX("revision"),0)+1 INTO next_revision
    FROM "StudentHealthIntakeRevision" WHERE "intakeId"=NEW."id";
  INSERT INTO "StudentHealthIntakeRevision"
    ("id","intakeId","alunoId","contractId","revision","sourceVersion",
     "formVersion","sourceType","sourceReference","actorUserId","snapshot")
  VALUES (
    gen_random_uuid()::text,NEW."id",NEW."alunoId",NEW."contractId",
    next_revision,NEW."version",NEW."formVersion",NEW."sourceType",
    NEW."sourceReference",revision_actor,next_payload
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER health_intake_capture_revision
AFTER INSERT OR UPDATE ON "StudentHealthIntake"
FOR EACH ROW EXECUTE FUNCTION capture_health_intake_revision();

CREATE TRIGGER health_intake_history_immutable
BEFORE UPDATE OR DELETE ON "StudentHealthIntakeRevision"
FOR EACH ROW EXECUTE FUNCTION prnt_history_append_only();
