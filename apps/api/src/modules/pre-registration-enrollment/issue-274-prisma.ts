import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __issue274PrismaClient: PrismaClient | undefined;
}

function connectionUrl(): string | undefined {
  const value = process.env.DATABASE_URL;
  if (!value) return undefined;
  const url = new URL(value);
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', '1');
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', '30');
  }
  return url.toString();
}

const databaseUrl = connectionUrl();

export const issue274Prisma =
  globalThis.__issue274PrismaClient ??
  new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__issue274PrismaClient = issue274Prisma;
}
