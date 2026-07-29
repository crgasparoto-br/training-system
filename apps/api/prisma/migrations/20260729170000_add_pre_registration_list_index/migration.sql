-- Support the default tenant-scoped pre-registration list order without sorting
-- or scanning the complete tenant before applying LIMIT.
CREATE INDEX "Aluno_pre_registration_list_idx"
ON "Aluno" ("contractId", "lastActivityAt" DESC, "id" DESC);
