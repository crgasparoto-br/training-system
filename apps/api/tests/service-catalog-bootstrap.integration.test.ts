import { ContractType, PrismaClient } from '@prisma/client';
import { serviceCatalogService } from '../src/modules/services/service.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractIds = {
  first: 'catalog-bootstrap-contract-a',
  second: 'catalog-bootstrap-contract-b',
  dryRun: 'catalog-bootstrap-contract-dry-run',
  rollback: 'catalog-bootstrap-contract-rollback',
};

async function createCompanyContract(id: string, document: string) {
  return prisma.companyContract.create({
    data: {
      id,
      type: ContractType.academy,
      document,
      name: `Contrato ${id}`,
    },
  });
}

async function countCatalogRows(contractId: string) {
  const [services, options, presentationItems, components] = await Promise.all([
    prisma.serviceOption.count({ where: { contractId, parentServiceId: null } }),
    prisma.serviceCommercialOption.count({ where: { contractId } }),
    prisma.servicePresentationItem.count({ where: { contractId } }),
    prisma.servicePlanComponent.count({ where: { contractId } }),
  ]);

  return { services, options, presentationItems, components };
}

describeDatabase('service catalog reference bootstrap with PostgreSQL', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({
      where: { id: { in: Object.values(contractIds) } },
    });

    await Promise.all([
      createCompanyContract(contractIds.first, '57365610000101'),
      createCompanyContract(contractIds.second, '57365610000102'),
      createCompanyContract(contractIds.dryRun, '57365610000103'),
      createCompanyContract(contractIds.rollback, '57365610000104'),
    ]);
  });

  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS "test_fail_catalog_component" ON "ServicePlanComponent"'
    );
    await prisma.$executeRawUnsafe(
      'DROP FUNCTION IF EXISTS "test_fail_catalog_component_insert"()'
    );
    await prisma.companyContract.deleteMany({
      where: { id: { in: Object.values(contractIds) } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates only the reference records on the first execution', async () => {
    const result = await serviceCatalogService.bootstrapReferenceCatalog(
      contractIds.first,
      false
    );
    const counts = await countCatalogRows(contractIds.first);

    expect(result.createdServices).toHaveLength(9);
    expect(counts.services).toBe(9);
    expect(counts.options).toBe(result.createdOptions.length);
    expect(counts.presentationItems).toBe(result.createdPresentationItems);
    expect(counts.components).toBe(result.createdComponents);
    expect(result.conflicts).toEqual([]);
  });

  it('does not persist any record during dry-run', async () => {
    const result = await serviceCatalogService.bootstrapReferenceCatalog(
      contractIds.dryRun,
      true
    );

    expect(result.dryRun).toBe(true);
    expect(result.createdServices).toHaveLength(9);
    await expect(countCatalogRows(contractIds.dryRun)).resolves.toEqual({
      services: 0,
      options: 0,
      presentationItems: 0,
      components: 0,
    });
  });

  it('is idempotent and preserves customized fields and positions', async () => {
    await serviceCatalogService.bootstrapReferenceCatalog(contractIds.first, false);
    const initialCounts = await countCatalogRows(contractIds.first);
    const customized = await prisma.serviceOption.findFirstOrThrow({
      where: { contractId: contractIds.first, parentServiceId: null },
      orderBy: { displayOrder: 'asc' },
    });

    await prisma.serviceOption.update({
      where: { id: customized.id },
      data: {
        summary: 'Resumo personalizado pelo contrato',
        displayOrder: 77,
      },
    });

    const secondRun = await serviceCatalogService.bootstrapReferenceCatalog(
      contractIds.first,
      false
    );
    const afterSecondRun = await prisma.serviceOption.findUniqueOrThrow({
      where: { id: customized.id },
    });

    expect(secondRun.createdServices).toEqual([]);
    expect(secondRun.createdOptions).toEqual([]);
    expect(secondRun.createdPresentationItems).toBe(0);
    expect(secondRun.createdComponents).toBe(0);
    expect(await countCatalogRows(contractIds.first)).toEqual(initialCounts);
    expect(afterSecondRun.summary).toBe('Resumo personalizado pelo contrato');
    expect(afterSecondRun.displayOrder).toBe(77);
  });

  it('preserves manual divergence and returns it as a visible conflict', async () => {
    await serviceCatalogService.bootstrapReferenceCatalog(contractIds.first, false);
    const customized = await prisma.serviceOption.findFirstOrThrow({
      where: { contractId: contractIds.first, parentServiceId: null },
      orderBy: { displayOrder: 'asc' },
    });

    await prisma.serviceOption.update({
      where: { id: customized.id },
      data: { name: 'Nome customizado pelo contrato' },
    });

    const secondRun = await serviceCatalogService.bootstrapReferenceCatalog(
      contractIds.first,
      false
    );

    expect(secondRun.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: customized.code,
          message: expect.stringContaining('Nome customizado pelo contrato'),
        }),
      ])
    );
    await expect(
      prisma.serviceOption.findUniqueOrThrow({ where: { id: customized.id } })
    ).resolves.toMatchObject({ name: 'Nome customizado pelo contrato' });
  });

  it('creates independent records for two contracts', async () => {
    await serviceCatalogService.bootstrapReferenceCatalog(contractIds.first, false);
    await serviceCatalogService.bootstrapReferenceCatalog(contractIds.second, false);

    const [firstCounts, secondCounts, crossTenantRows] = await Promise.all([
      countCatalogRows(contractIds.first),
      countCatalogRows(contractIds.second),
      prisma.serviceOption.count({
        where: {
          contractId: contractIds.first,
          commercialOptions: {
            some: { contractId: contractIds.second },
          },
        },
      }),
    ]);

    expect(firstCounts).toEqual(secondCounts);
    expect(firstCounts.services).toBe(9);
    expect(crossTenantRows).toBe(0);
  });

  it('rejects a missing contract without partial writes', async () => {
    await expect(
      serviceCatalogService.bootstrapReferenceCatalog(
        'catalog-bootstrap-contract-missing',
        false
      )
    ).rejects.toThrow('Contrato não encontrado');

    await expect(
      countCatalogRows('catalog-bootstrap-contract-missing')
    ).resolves.toEqual({
      services: 0,
      options: 0,
      presentationItems: 0,
      components: 0,
    });
  });

  it('rolls back the whole contract when component creation fails', async () => {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "test_fail_catalog_component_insert"()
      RETURNS trigger AS $$
      BEGIN
        IF NEW."contractId" = '${contractIds.rollback}' THEN
          RAISE EXCEPTION 'injected component failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "test_fail_catalog_component"
      BEFORE INSERT ON "ServicePlanComponent"
      FOR EACH ROW EXECUTE FUNCTION "test_fail_catalog_component_insert"()
    `);

    await expect(
      serviceCatalogService.bootstrapReferenceCatalog(contractIds.rollback, false)
    ).rejects.toThrow();

    await expect(countCatalogRows(contractIds.rollback)).resolves.toEqual({
      services: 0,
      options: 0,
      presentationItems: 0,
      components: 0,
    });
  });
});
