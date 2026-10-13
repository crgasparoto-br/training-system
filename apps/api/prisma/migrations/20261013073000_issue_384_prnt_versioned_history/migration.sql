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

CREATE FUNCTION prnt_history_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'PRNT clinical history is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER prnt_history_immutable BEFORE UPDATE OR DELETE ON "ProntuarioHistoryEvent"
FOR EACH ROW EXECUTE FUNCTION prnt_history_append_only();
