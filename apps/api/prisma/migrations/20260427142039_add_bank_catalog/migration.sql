-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "bankCode" TEXT;

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ispb" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bank_code_key" ON "Bank"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Bank_ispb_key" ON "Bank"("ispb");

-- CreateIndex
CREATE INDEX "Bank_description_idx" ON "Bank"("description");

-- CreateIndex
CREATE INDEX "Profile_bankCode_idx" ON "Profile"("bankCode");
