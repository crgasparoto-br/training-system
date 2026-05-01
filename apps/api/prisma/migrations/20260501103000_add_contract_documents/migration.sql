CREATE TYPE "ContractTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'GENERATED', 'SENT', 'VIEWED', 'SIGNED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "ContractAuditAction" AS ENUM ('CREATED', 'UPDATED', 'GENERATED', 'PDF_GENERATED', 'SENT', 'VIEWED', 'SIGNED', 'CANCELLED', 'EXPIRED', 'ADDENDUM_CREATED');

CREATE TABLE "ContractTemplate" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "serviceId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "ContractTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "headerHtml" TEXT NOT NULL DEFAULT '',
  "footerHtml" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractTemplateClause" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "bodyHtml" TEXT NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "editable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractTemplateClause_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedContract" (
  "id" TEXT NOT NULL,
  "companyContractId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "templateVersion" INTEGER NOT NULL,
  "alunoId" TEXT NOT NULL,
  "responsavelName" TEXT,
  "responsavelCpf" TEXT,
  "responsavelEmail" TEXT,
  "serviceId" TEXT,
  "professorId" TEXT,
  "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "renderedHtml" TEXT NOT NULL,
  "dataSnapshot" JSONB NOT NULL,
  "pdfPath" TEXT,
  "publicTokenHash" TEXT,
  "publicTokenExpiresAt" TIMESTAMP(3),
  "externalProvider" TEXT,
  "externalEnvelopeId" TEXT,
  "documentHash" TEXT,
  "signedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GeneratedContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractSignature" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "signerName" TEXT NOT NULL,
  "signerCpf" TEXT NOT NULL,
  "signerEmail" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "documentHash" TEXT NOT NULL,
  "method" TEXT NOT NULL DEFAULT 'INTERNAL_ELECTRONIC_ACCEPTANCE',
  CONSTRAINT "ContractSignature_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractAuditLog" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "action" "ContractAuditAction" NOT NULL,
  "details" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContractAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContractTemplate_contractId_status_idx" ON "ContractTemplate"("contractId", "status");
CREATE INDEX "ContractTemplate_serviceId_idx" ON "ContractTemplate"("serviceId");
CREATE UNIQUE INDEX "ContractTemplateClause_templateId_order_key" ON "ContractTemplateClause"("templateId", "order");
CREATE INDEX "ContractTemplateClause_templateId_idx" ON "ContractTemplateClause"("templateId");
CREATE UNIQUE INDEX "GeneratedContract_publicTokenHash_key" ON "GeneratedContract"("publicTokenHash");
CREATE INDEX "GeneratedContract_companyContractId_status_idx" ON "GeneratedContract"("companyContractId", "status");
CREATE INDEX "GeneratedContract_alunoId_idx" ON "GeneratedContract"("alunoId");
CREATE INDEX "GeneratedContract_templateId_idx" ON "GeneratedContract"("templateId");
CREATE INDEX "GeneratedContract_serviceId_idx" ON "GeneratedContract"("serviceId");
CREATE INDEX "GeneratedContract_professorId_idx" ON "GeneratedContract"("professorId");
CREATE INDEX "ContractSignature_contractId_idx" ON "ContractSignature"("contractId");
CREATE INDEX "ContractSignature_signerCpf_idx" ON "ContractSignature"("signerCpf");
CREATE INDEX "ContractAuditLog_contractId_createdAt_idx" ON "ContractAuditLog"("contractId", "createdAt");
CREATE INDEX "ContractAuditLog_actorUserId_idx" ON "ContractAuditLog"("actorUserId");

ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContractTemplateClause" ADD CONSTRAINT "ContractTemplateClause_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_companyContractId_fkey" FOREIGN KEY ("companyContractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "ServiceOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ContractSignature" ADD CONSTRAINT "ContractSignature_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "GeneratedContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractAuditLog" ADD CONSTRAINT "ContractAuditLog_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "GeneratedContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
