import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
export type ContractDbClient = PrismaClient | Prisma.TransactionClient;

export type GeneratedContractRecord = {
  id: string;
  companyContractId: string;
  templateId: string;
  templateVersion: number;
  alunoId: string | null;
  collaboratorId: string | null;
  partyType: 'STUDENT' | 'COLLABORATOR';
  origin: 'ELECTRONIC' | 'LEGACY_PDF' | 'LEGACY_DECLARATION';
  responsavelName: string | null;
  responsavelCpf: string | null;
  responsavelEmail: string | null;
  serviceId: string | null;
  professorId: string | null;
  status: 'DRAFT' | 'GENERATED' | 'SENT' | 'VIEWED' | 'SIGNED' | 'CANCELLED' | 'EXPIRED';
  title: string;
  renderedHtml: string;
  dataSnapshot: unknown;
  pdfPath: string | null;
  publicTokenHash: string | null;
  publicTokenExpiresAt: Date | null;
  externalProvider: string | null;
  externalEnvelopeId: string | null;
  documentHash: string | null;
  signedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const selectGeneratedContract = Prisma.sql`
  SELECT
    "id",
    "companyContractId",
    "templateId",
    "templateVersion",
    "alunoId",
    "collaboratorId",
    "partyType"::text AS "partyType",
    "origin"::text AS "origin",
    "responsavelName",
    "responsavelCpf",
    "responsavelEmail",
    "serviceId",
    "professorId",
    "status"::text AS "status",
    "title",
    "renderedHtml",
    "dataSnapshot",
    "pdfPath",
    "publicTokenHash",
    "publicTokenExpiresAt",
    "externalProvider",
    "externalEnvelopeId",
    "documentHash",
    "signedAt",
    "cancelledAt",
    "createdAt",
    "updatedAt"
  FROM "GeneratedContract"
`;

export const contractRecordRepository = {
  async findById(
    id: string,
    client: ContractDbClient = prisma
  ): Promise<GeneratedContractRecord | null> {
    const rows = await client.$queryRaw<GeneratedContractRecord[]>(Prisma.sql`
      ${selectGeneratedContract}
      WHERE "id" = ${id}
      LIMIT 1
    `);
    return rows[0] ?? null;
  },

  async findByIdForCompany(
    id: string,
    companyContractId: string,
    client: ContractDbClient = prisma
  ): Promise<GeneratedContractRecord | null> {
    const rows = await client.$queryRaw<GeneratedContractRecord[]>(Prisma.sql`
      ${selectGeneratedContract}
      WHERE "id" = ${id}
        AND "companyContractId" = ${companyContractId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  },

  async findByPublicTokenHash(
    publicTokenHash: string,
    client: ContractDbClient = prisma
  ): Promise<GeneratedContractRecord | null> {
    const rows = await client.$queryRaw<GeneratedContractRecord[]>(Prisma.sql`
      ${selectGeneratedContract}
      WHERE "publicTokenHash" = ${publicTokenHash}
      LIMIT 1
    `);
    return rows[0] ?? null;
  },
};
