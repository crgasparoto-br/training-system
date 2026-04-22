ALTER TABLE "Professor"
ADD COLUMN "admissionDate" TIMESTAMP(3),
ADD COLUMN "currentStatus" TEXT,
ADD COLUMN "operationalRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "hourlyRates" JSONB,
ADD COLUMN "hasSignedContract" BOOLEAN NOT NULL DEFAULT false;
