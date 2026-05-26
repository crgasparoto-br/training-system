ALTER TABLE "ProntuarioDiscomfortSnapshot" ADD COLUMN "professorId" TEXT;

CREATE INDEX "ProntuarioDiscomfortSnapshot_professorId_idx" ON "ProntuarioDiscomfortSnapshot"("professorId");

ALTER TABLE "ProntuarioDiscomfortSnapshot" ADD CONSTRAINT "ProntuarioDiscomfortSnapshot_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
