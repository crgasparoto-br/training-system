import { Prisma, PrismaClient } from '@prisma/client';

export type AdipometryResponsibleLifecycleDbClient =
  | PrismaClient
  | Prisma.TransactionClient;

export async function assertAdipometryResponsibleProfessorAvailable(
  client: AdipometryResponsibleLifecycleDbClient,
  contractId: string,
  professorId: string
): Promise<void> {
  await client.$queryRaw<Array<{ available: boolean }>>(Prisma.sql`
    SELECT "assertAdipometryResponsibleProfessorAvailable"(
      ${contractId},
      ${professorId}
    ) AS "available"
  `);
}
