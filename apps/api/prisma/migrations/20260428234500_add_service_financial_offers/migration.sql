ALTER TABLE "ServiceOption"
ADD COLUMN "description" TEXT,
ADD COLUMN "parentServiceId" TEXT,
ADD COLUMN "monthlyPrice" DOUBLE PRECISION,
ADD COLUMN "validFrom" TIMESTAMP(3),
ADD COLUMN "validUntil" TIMESTAMP(3);

CREATE INDEX "ServiceOption_parentServiceId_idx" ON "ServiceOption"("parentServiceId");

ALTER TABLE "ServiceOption"
ADD CONSTRAINT "ServiceOption_parentServiceId_fkey"
FOREIGN KEY ("parentServiceId") REFERENCES "ServiceOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;