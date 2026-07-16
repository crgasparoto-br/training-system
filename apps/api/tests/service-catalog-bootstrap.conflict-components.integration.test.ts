import { ContractType, PrismaClient } from '@prisma/client';
import { serviceCatalogService } from '../src/modules/services/service.service.js';

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();
const contractId = 'catalog-bootstrap-contract-conflict-components';

describeDatabase('service catalog bootstrap components after a target conflict', () => {
  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: '57365610000106',
        name: 'Contrato conflito de componentes',
      },
    });
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('recreates plan components from preserved options when the target service has a name conflict', async () => {
    await serviceCatalogService.bootstrapReferenceCatalog(contractId, false);
    const essential = await prisma.serviceOption.findUniqueOrThrow({
      where: {
        contractId_code: {
          contractId,
          code: 'plano_essencial',
        },
      },
    });
    const expectedComponents = await prisma.servicePlanComponent.count({
      where: { contractId },
    });

    await prisma.serviceOption.update({
      where: { id: essential.id },
      data: { name: 'Plano Essencial customizado' },
    });
    await prisma.servicePlanComponent.deleteMany({ where: { contractId } });

    const result = await serviceCatalogService.bootstrapReferenceCatalog(
      contractId,
      false
    );

    expect(result.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'plano_essencial',
          message: expect.stringContaining('Plano Essencial customizado'),
        }),
      ])
    );
    expect(result.createdComponents).toBe(expectedComponents);
    await expect(
      prisma.servicePlanComponent.count({ where: { contractId } })
    ).resolves.toBe(expectedComponents);
  });
});
