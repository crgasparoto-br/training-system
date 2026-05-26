import { Prisma, PrismaClient, ProfileAuditAction, ProfileAuditSource } from '@prisma/client';

const prisma = new PrismaClient();

// Fields that must never be stored in audit logs
const SECRET_FIELDS = new Set(['password', 'passwordHash', 'token', 'secret', 'refreshToken']);

const sanitize = (data: unknown): Prisma.InputJsonValue | null => {
  if (data === null || data === undefined) {
    return null;
  }

  const json = JSON.parse(JSON.stringify(data));
  const strip = (obj: unknown): unknown => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(strip);
    }
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([key]) => !SECRET_FIELDS.has(key))
        .map(([key, value]) => [key, strip(value)])
    );
  };

  return strip(json) as Prisma.InputJsonValue;
};

export interface ProfileAuditLogInput {
  alunoId: string;
  changedByUserId?: string | null;
  source: ProfileAuditSource;
  action: ProfileAuditAction;
  beforeData?: unknown;
  afterData?: unknown;
  changedFields?: unknown;
}

export const profileAuditService = {
  async log(
    input: ProfileAuditLogInput,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = tx ?? prisma;
    const payload = {
      ...(input.beforeData !== undefined ? { beforeData: input.beforeData } : {}),
      ...(input.afterData !== undefined ? { afterData: input.afterData } : {}),
      ...(input.changedFields !== undefined ? { changedFields: input.changedFields } : {}),
    };

    await client.studentProfileAuditLog.create({
      data: {
        alunoId: input.alunoId,
        userId: input.changedByUserId ?? null,
        source: input.source,
        action: input.action,
        changedFields: sanitize(payload) ?? Prisma.JsonNull,
      },
    });
  },

  async listByAluno(
    alunoId: string,
    options?: { page?: number; limit?: number }
  ) {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      prisma.studentProfileAuditLog.count({ where: { alunoId } }),
      prisma.studentProfileAuditLog.findMany({
        where: { alunoId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          alunoId: true,
          userId: true,
          source: true,
          action: true,
          changedFields: true,
          createdAt: true,
        },
      }),
    ]);

    const normalizedItems = items.map((item) => {
      const changedFields = item.changedFields as Record<string, unknown> | null;
      return {
        ...item,
        changedByUserId: item.userId,
        beforeData: changedFields?.beforeData ?? null,
        afterData: changedFields?.afterData ?? null,
      };
    });

    return {
      items: normalizedItems,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};
