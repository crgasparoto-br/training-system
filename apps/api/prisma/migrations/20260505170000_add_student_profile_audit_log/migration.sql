-- CreateEnum
CREATE TYPE "ProfileAuditSource" AS ENUM ('student_app', 'web_admin', 'system_review', 'import');

-- CreateEnum
CREATE TYPE "ProfileAuditAction" AS ENUM ('update_profile', 'submit_review', 'approve_change', 'reject_change', 'request_review');

-- CreateTable
CREATE TABLE "StudentProfileAuditLog" (
    "id" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "changedByUserId" TEXT,
    "source" "ProfileAuditSource" NOT NULL,
    "action" "ProfileAuditAction" NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "changedFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentProfileAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentProfileAuditLog_alunoId_idx" ON "StudentProfileAuditLog"("alunoId");

-- CreateIndex
CREATE INDEX "StudentProfileAuditLog_createdAt_idx" ON "StudentProfileAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "StudentProfileAuditLog" ADD CONSTRAINT "StudentProfileAuditLog_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
