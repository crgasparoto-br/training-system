import {
  Prisma,
  PrismaClient,
  StudentProfileReviewStatus,
  type StudentProfileReview,
} from '@prisma/client';

type ReviewRequestClient = Pick<PrismaClient, '$transaction' | 'studentProfileReview'>;

export interface CreateOrReusePendingReviewInput {
  alunoId: string;
  requestedByUserId: string | null;
  dueAt?: Date;
  sectionsRequested: Prisma.InputJsonValue;
  snapshotBefore: Prisma.InputJsonValue;
}

export interface CreateOrReusePendingReviewResult {
  review: StudentProfileReview;
  reviewCreated: boolean;
}

const findPending = (client: Prisma.TransactionClient | PrismaClient, alunoId: string) =>
  client.studentProfileReview.findFirst({
    where: {
      alunoId,
      status: StudentProfileReviewStatus.pending,
    },
    orderBy: {
      requestedAt: 'desc',
    },
  });

export const createOrReusePendingProfileReview = async (
  client: ReviewRequestClient,
  input: CreateOrReusePendingReviewInput
): Promise<CreateOrReusePendingReviewResult> => {
  try {
    return await client.$transaction(
      async (tx) => {
        const existing = await findPending(tx, input.alunoId);
        if (existing) {
          return { review: existing, reviewCreated: false };
        }

        const review = await tx.studentProfileReview.create({
          data: {
            alunoId: input.alunoId,
            requestedByUserId: input.requestedByUserId,
            dueAt: input.dueAt,
            sectionsRequested: input.sectionsRequested,
            snapshotBefore: input.snapshotBefore,
          },
        });

        return { review, reviewCreated: true };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error: any) {
    if (error?.code !== 'P2034') {
      throw error;
    }

    const existing = await findPending(client as PrismaClient, input.alunoId);
    if (!existing) {
      throw error;
    }

    return { review: existing, reviewCreated: false };
  }
};
