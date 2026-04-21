BEGIN;

ALTER TABLE "Professor"
ADD COLUMN "responsibleManagerId" TEXT;

CREATE INDEX "Professor_responsibleManagerId_idx" ON "Professor"("responsibleManagerId");

ALTER TABLE "Professor"
ADD CONSTRAINT "Professor_responsibleManagerId_fkey"
FOREIGN KEY ("responsibleManagerId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
