import { Prisma, PrismaClient } from '@prisma/client';
import { studentContractService } from '../student-contracts/student-contract.service.js';
import { collaboratorContractService } from './collaborator-contract.service.js';
import type { ContractPartyType } from './contract-variable-definitions.js';

const prisma = new PrismaClient();
type DbClient = PrismaClient | Prisma.TransactionClient;

export type ContractLinkStatus =
  | 'draft'
  | 'pending_signature'
  | 'active'
  | 'expired'
  | 'canceled'
  | 'terminated';

export type ContractLinkPatch = {
  startDate?: Date | null;
  endDate?: Date | null;
  signedAt?: Date | null;
  canceledAt?: Date | null;
  cancellationReason?: string | null;
};

export type ContractPartyLink = {
  partyType: ContractPartyType;
  partyId: string;
  linkId: string;
  linkStatus: string;
};

export const contractPartyLinkService = {
  async resolveByGeneratedContractId(
    contractDocumentId: string,
    client: DbClient = prisma
  ): Promise<ContractPartyLink | null> {
    const rows = await client.$queryRaw<ContractPartyLink[]>(Prisma.sql`
      SELECT
        gc."partyType"::text AS "partyType",
        CASE
          WHEN gc."partyType" = 'STUDENT'::"ContractPartyType" THEN gc."alunoId"
          ELSE gc."collaboratorId"
        END AS "partyId",
        COALESCE(sc."id", cc."id") AS "linkId",
        COALESCE(sc."status"::text, cc."status"::text) AS "linkStatus"
      FROM "GeneratedContract" gc
      LEFT JOIN "StudentContract" sc ON sc."contractId" = gc."id"
      LEFT JOIN "CollaboratorContract" cc ON cc."contractId" = gc."id"
      WHERE gc."id" = ${contractDocumentId}
      LIMIT 1
    `);
    return rows[0] ?? null;
  },

  async setStatusByGeneratedContractId(
    contractDocumentId: string,
    status: ContractLinkStatus,
    patch: ContractLinkPatch = {},
    client: DbClient = prisma
  ) {
    const link = await this.resolveByGeneratedContractId(contractDocumentId, client);
    if (!link) throw new Error('Vínculo do documento contratual não encontrado');

    if (link.partyType === 'STUDENT') {
      await studentContractService.setStatusByGeneratedContractId(
        contractDocumentId,
        status,
        patch,
        client as Prisma.TransactionClient
      );
      return link;
    }

    await collaboratorContractService.setStatusByGeneratedContractId(
      contractDocumentId,
      status,
      patch,
      client
    );
    return link;
  },
};
