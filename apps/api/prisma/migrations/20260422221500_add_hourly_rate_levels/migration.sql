CREATE TABLE "HourlyRateLevel" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "minValue" DECIMAL(10,2),
  "maxValue" DECIMAL(10,2),
  "order" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HourlyRateLevel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HourlyRateLevel_contractId_code_key" ON "HourlyRateLevel"("contractId", "code");
CREATE INDEX "HourlyRateLevel_contractId_order_idx" ON "HourlyRateLevel"("contractId", "order");

ALTER TABLE "HourlyRateLevel"
ADD CONSTRAINT "HourlyRateLevel_contractId_fkey"
FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;