import { serviceCatalogPrismaClient } from '../services/service.service-base.js';

// Reutiliza um cliente Prisma já existente no processo. A suíte completa do
// repositório carrega muitos módulos com clientes próprios; criar outro pool
// somente para a remediação da issue 274 pode exceder max_connections no CI.
export const issue274Prisma = serviceCatalogPrismaClient;

export async function releaseIssue274PrismaAfterIntegrationOperation(): Promise<void> {
  if (process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true') {
    await issue274Prisma.$disconnect();
  }
}
