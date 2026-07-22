-- Issue #269: convites seguros de pre-cadastro (subissue do epico #267).
--
-- Dominio proprio, independente do modulo de contratos: nao reutiliza
-- token/hash/endpoint/status/tabela de contrato. Somente o hash do token e
-- persistido; o token bruto nunca e gravado. Migration idempotente seguindo
-- o padrao do repositorio (guardas de existencia, reexecutavel com seguranca
-- - ver 20260721120000_student_lifecycle_domain/migration.sql).

-- CreateEnum (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PreRegistrationInvitePurpose') THEN
    CREATE TYPE "PreRegistrationInvitePurpose" AS ENUM (
      'PRE_REGISTRATION'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PreRegistrationInviteStatus') THEN
    CREATE TYPE "PreRegistrationInviteStatus" AS ENUM (
      'ACTIVE',
      'EXPIRED',
      'REVOKED',
      'SUPERSEDED',
      'COMPLETED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PreRegistrationInviteEventType') THEN
    CREATE TYPE "PreRegistrationInviteEventType" AS ENUM (
      'CREATED',
      'SUPERSEDED',
      'REVOKED',
      'FIRST_ACCESSED',
      'ACCESSED',
      'EXPIRED_ON_READ',
      'COMPLETED'
    );
  END IF;
END $$;

-- CreateTable: PreRegistrationInvite
CREATE TABLE IF NOT EXISTS "PreRegistrationInvite" (
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

-- CreateTable: PreRegistrationInviteEvent
CREATE TABLE IF NOT EXISTS "PreRegistrationInviteEvent" (
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

-- CreateIndex (unicidade do hash: garante que a comparacao de token nunca colida)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'PreRegistrationInvite_tokenHash_key'
  ) THEN
    CREATE UNIQUE INDEX "PreRegistrationInvite_tokenHash_key"
      ON "PreRegistrationInvite" ("tokenHash");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'PreRegistrationInvite_replacesInviteId_key'
  ) THEN
    CREATE UNIQUE INDEX "PreRegistrationInvite_replacesInviteId_key"
      ON "PreRegistrationInvite" ("replacesInviteId");
  END IF;
END $$;

-- CreateIndex: indice unico PARCIAL que garante, no banco, no maximo um
-- convite ACTIVE por pessoa e finalidade. E a defesa real contra
-- concorrencia (duas regeneracoes simultaneas nao podem produzir dois
-- convites ativos): a segunda transacao que tentar inserir um segundo
-- convite ACTIVE para a mesma pessoa/finalidade falha com violacao de
-- unicidade e deve tratar isso como conflito de concorrencia
-- (ver isUniqueConstraintViolation em pre-registration-invite.service.ts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'PreRegistrationInvite_active_person_purpose_key'
  ) THEN
    CREATE UNIQUE INDEX "PreRegistrationInvite_active_person_purpose_key"
      ON "PreRegistrationInvite" ("alunoId", "purpose")
      WHERE "status" = 'ACTIVE';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "PreRegistrationInvite_alunoId_purpose_status_idx"
  ON "PreRegistrationInvite" ("alunoId", "purpose", "status");

CREATE INDEX IF NOT EXISTS "PreRegistrationInvite_contractId_status_idx"
  ON "PreRegistrationInvite" ("contractId", "status");

CREATE INDEX IF NOT EXISTS "PreRegistrationInvite_expiresAt_idx"
  ON "PreRegistrationInvite" ("expiresAt");

CREATE INDEX IF NOT EXISTS "PreRegistrationInviteEvent_inviteId_createdAt_idx"
  ON "PreRegistrationInviteEvent" ("inviteId", "createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PreRegistrationInvite_alunoId_fkey'
  ) THEN
    ALTER TABLE "PreRegistrationInvite"
      ADD CONSTRAINT "PreRegistrationInvite_alunoId_fkey"
      FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PreRegistrationInvite_contractId_fkey'
  ) THEN
    ALTER TABLE "PreRegistrationInvite"
      ADD CONSTRAINT "PreRegistrationInvite_contractId_fkey"
      FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PreRegistrationInvite_replacesInviteId_fkey'
  ) THEN
    ALTER TABLE "PreRegistrationInvite"
      ADD CONSTRAINT "PreRegistrationInvite_replacesInviteId_fkey"
      FOREIGN KEY ("replacesInviteId") REFERENCES "PreRegistrationInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PreRegistrationInviteEvent_inviteId_fkey'
  ) THEN
    ALTER TABLE "PreRegistrationInviteEvent"
      ADD CONSTRAINT "PreRegistrationInviteEvent_inviteId_fkey"
      FOREIGN KEY ("inviteId") REFERENCES "PreRegistrationInvite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
