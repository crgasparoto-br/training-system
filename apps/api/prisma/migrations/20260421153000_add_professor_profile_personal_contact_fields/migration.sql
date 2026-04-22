CREATE TYPE "MaritalStatus" AS ENUM (
    'single',
    'married',
    'stable_union',
    'divorced',
    'separated',
    'widowed',
    'other'
);

ALTER TABLE "Profile"
ADD COLUMN "cpf" TEXT,
ADD COLUMN "rg" TEXT,
ADD COLUMN "maritalStatus" "MaritalStatus",
ADD COLUMN "addressStreet" TEXT,
ADD COLUMN "addressNumber" TEXT,
ADD COLUMN "addressComplement" TEXT,
ADD COLUMN "addressZipCode" TEXT,
ADD COLUMN "instagramHandle" TEXT,
ADD COLUMN "cref" TEXT;

CREATE UNIQUE INDEX "Profile_cpf_key" ON "Profile"("cpf");
