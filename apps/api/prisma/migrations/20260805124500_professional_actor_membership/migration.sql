-- Actor authorization is independent from the professor selected as the
-- clinical responsible. This table supports authenticated professional users
-- that belong to a contract/function but do not own a Professor row.
CREATE UNIQUE INDEX IF NOT EXISTS "CollaboratorFunctionOption_id_contractId_key"
  ON "CollaboratorFunctionOption" ("id", "contractId");

CREATE TABLE IF NOT EXISTS "ProfessionalActorMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "collaboratorFunctionId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfessionalActorMembership_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfessionalActorMembership_userId_key" UNIQUE ("userId"),
  CONSTRAINT "ProfessionalActorMembership_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProfessionalActorMembership_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProfessionalActorMembership_function_contract_fkey"
    FOREIGN KEY ("collaboratorFunctionId", "contractId")
    REFERENCES "CollaboratorFunctionOption"("id", "contractId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ProfessionalActorMembership_contractId_isActive_idx"
  ON "ProfessionalActorMembership" ("contractId", "isActive");
CREATE INDEX IF NOT EXISTS "ProfessionalActorMembership_function_idx"
  ON "ProfessionalActorMembership" ("collaboratorFunctionId");
