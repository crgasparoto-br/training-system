-- Issue #269: convites de pre-cadastro (dominio proprio, sem reaproveitar
-- token/hash/tabela/status/endpoint de contrato).

-- CreateEnum
CREATE TYPE "PreRegistrationInvitePurpose" AS ENUM ('PRE_REGISTRATION');

-- CreateEnum
CREATE TYPE "PreRegistrationInviteStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'SUPERSEDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PreRegistrationInviteEventType" AS ENUM ('CREATED', 'SUPERSEDED', 'REVOKED', 'FIRST_ACCESSED', 'ACCESSED', 'EXPIRED_ON_READ', 'COMPLETED');

-- CreateTable
CREATE TABLE "PreRegistrationInvite" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "purpose" "PreRegistrationInvitePurpose" NOT NULL DEFAULT 'PRE_REGISTRATION',
    "tokenHash" TEXT NOT NULL,
    "status" "PreRegistrationInviteStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdByProfessorId" TEXT,
    "createdByUserId" TEXT,
    "firstAccessedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedByProfessorId" TEXT,
    "revocationReason" TEXT,
    "supersededAt" TIMESTAMP(3),
    "replacesInviteId" TEXT,

    CONSTRAINT "PreRegistrationInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreRegistrationInviteEvent" (
    "id" TEXT NOT NULL,
    "inviteId" TEXT NOT NULL,
    "eventType" "PreRegistrationInviteEventType" NOT NULL,
    "actorUserId" TEXT,
    "actorProfessorId" TEXT,
    "actorIsPublic" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreRegistrationInviteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreRegistrationInvite_tokenHash_key" ON "PreRegistrationInvite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PreRegistrationInvite_replacesInviteId_key" ON "PreRegistrationInvite"("replacesInviteId");

-- CreateIndex
CREATE INDEX "PreRegistrationInvite_alunoId_purpose_status_idx" ON "PreRegistrationInvite"("alunoId", "purpose", "status");

-- CreateIndex
CREATE INDEX "PreRegistrationInvite_contractId_status_idx" ON "PreRegistrationInvite"("contractId", "status");

-- CreateIndex
CREATE INDEX "PreRegistrationInvite_expiresAt_idx" ON "PreRegistrationInvite"("expiresAt");

-- CreateIndex: no maximo um convite ACTIVE por pessoa/finalidade (garantia de
-- concorrencia no banco; Prisma DSL nao suporta indice unico parcial).
CREATE UNIQUE INDEX "PreRegistrationInvite_active_person_purpose_key"
    ON "PreRegistrationInvite"("alunoId", "purpose")
    WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "PreRegistrationInviteEvent_inviteId_createdAt_idx" ON "PreRegistrationInviteEvent"("inviteId", "createdAt");

-- AddForeignKey
ALTER TABLE "PreRegistrationInvite" ADD CONSTRAINT "PreRegistrationInvite_replacesInviteId_fkey" FOREIGN KEY ("replacesInviteId") REFERENCES "PreRegistrationInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreRegistrationInvite" ADD CONSTRAINT "PreRegistrationInvite_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreRegistrationInvite" ADD CONSTRAINT "PreRegistrationInvite_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreRegistrationInviteEvent" ADD CONSTRAINT "PreRegistrationInviteEvent_inviteId_fkey" FOREIGN KEY ("inviteId") REFERENCES "PreRegistrationInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
