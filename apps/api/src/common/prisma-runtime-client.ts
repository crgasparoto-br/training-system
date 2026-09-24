import { PrismaClient } from '@prisma/client';

/** Canonical Prisma client for API runtime services. */
export const prismaRuntimeClient = new PrismaClient();
