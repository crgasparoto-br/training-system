import { ContractType, PrismaClient } from '@prisma/client';
import { serviceCatalogService } from '../src/modules/services/service.service.js';
import './service-catalog-bootstrap.integration.scenarios.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const slowContractId = 'catalog-bootstrap-contract-slow';

describeDatabase('service catalog bootstrap transaction timeout', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: slowContractId } });
    await prisma.companyContract.create({
      data: {
        id: slowContractId,
        type: ContractType.academy,
        document: '57365610000105',
        name: 'Contrato bootstrap lento',
      },
    });
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_delay_catalog_service_insert" ON "ServiceOption"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_delay_catalog_service_insert"()'
    );
    await prisma.companyContract.deleteMany({ where: { id: slowContractId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(
    'completes a controlled execution above five seconds and below the configured timeout',
    async () => {
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION "test_delay_catalog_service_insert"()
        RETURNS trigger AS $$
        BEGIN
          PERFORM pg_sleep(6);
          RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER "test_delay_catalog_service_insert"
        BEFORE INSERT ON "ServiceOption"
        FOR EACH STATEMENT EXECUTE FUNCTION "test_delay_catalog_service_insert"()
      `);

      const startedAt = Date.now();
      const result = await serviceCatalogService.bootstrapReferenceCatalog(
        slowContractId,
        false
      );
      const elapsedMs = Date.now() - startedAt;

      expect(result.createdServices).toHaveLength(9);
      expect(elapsedMs).toBeGreaterThanOrEqual(5_000);
      expect(elapsedMs).toBeLessThan(30_000);
      await expect(
        prisma.serviceOption.count({
          where: { contractId: slowContractId, parentServiceId: null },
        })
      ).resolves.toBe(9);
    },
    20_000
  );
});
