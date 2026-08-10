import { Prisma, PrismaClient } from '@prisma/client';
import type { PreRegistrationInviteSummaryDTO } from '@corrida/types';

export const preRegistrationInvitePrisma = new PrismaClient();
export type PreRegistrationInviteDbClient = PrismaClient | Prisma.TransactionClient;
export type PreRegistrationInviteAllowedActions =
  PreRegistrationInviteSummaryDTO['allowedActions'];
