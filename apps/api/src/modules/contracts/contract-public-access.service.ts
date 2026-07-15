import crypto from 'crypto';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type DbClient = PrismaClient | Prisma.TransactionClient;

type ContractActor = {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
};

const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

async function runInTransaction<T>(
  client: DbClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const prismaClient = client as PrismaClient;
  if (typeof prismaClient.$transaction === 'function') {
    return prismaClient.$transaction(work);
  }
  return work(client as Prisma.TransactionClient);
}

export const contractPublicAccessService = {
  async open(
    token: string,
    actor: ContractActor = {},
    client: DbClient = prisma,
    now = new Date()
  ) {
    const tokenDigest = hashToken(token);

    return runInTransaction(client, async (tx) => {
      const contract = await tx.contract.findUnique({
        where: { publicTokenHash: tokenDigest },
        include: { signatures: true },
      });

      if (!contract) {
        throw new Error('Contrato não encontrado');
      }

      if (contract.publicTokenExpiresAt && contract.publicTokenExpiresAt < now) {
        const expired = await tx.contract.updateMany({
          where: {
            id: contract.id,
            publicTokenHash: tokenDigest,
            publicTokenExpiresAt: { lt: now },
            status: { in: ['SENT', 'VIEWED'] },
          },
          data: {
            status: 'EXPIRED',
            publicTokenHash: null,
            publicTokenExpiresAt: null,
          },
        });

        if (expired.count === 1) {
          await tx.studentContract.updateMany({
            where: {
              contractId: contract.id,
              status: { not: 'active' },
            },
            data: {
              status: 'expired',
              endDate: now,
            },
          });
          throw new Error('Link expirado');
        }

        const current = await tx.contract.findUnique({
          where: { id: contract.id },
          include: { signatures: true },
        });

        if (!current || current.status === 'EXPIRED') {
          throw new Error('Link expirado');
        }

        return current;
      }

      if (contract.status === 'SENT') {
        const viewed = await tx.contract.updateMany({
          where: {
            id: contract.id,
            publicTokenHash: tokenDigest,
            status: 'SENT',
          },
          data: { status: 'VIEWED' },
        });

        if (viewed.count === 1) {
          await tx.contractAuditLog.create({
            data: {
              contractId: contract.id,
              actorUserId: actor.userId,
              action: 'VIEWED' as never,
              ipAddress: actor.ipAddress,
              userAgent: actor.userAgent,
            },
          });
        }
      }

      const current = await tx.contract.findUnique({
        where: { id: contract.id },
        include: { signatures: true },
      });

      if (!current) {
        throw new Error('Contrato não encontrado');
      }

      if (current.status === 'EXPIRED') {
        throw new Error('Link expirado');
      }

      return current;
    });
  },
};
