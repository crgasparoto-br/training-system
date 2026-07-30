import { PrismaClient } from '@prisma/client';
import {
  EXTENDED_CAPACITY_PARAMETER_SETS,
  createCapacityPrescriptionExtensionService,
} from '../modules/capacity-prescriptions/capacity-prescription-extension.service.js';
import { createCapacityPrescriptionService } from '../modules/capacity-prescriptions/capacity-prescription.service.js';
import { WORKBOOK_CAPACITY_CATALOG_ITEMS } from '../modules/capacity-prescriptions/capacity-prescription-workbook-catalog.js';

const prisma = new PrismaClient();
const service = createCapacityPrescriptionService(prisma);
const extensionService = createCapacityPrescriptionExtensionService(prisma);

async function main() {
  const contracts = await prisma.companyContract.findMany({
    select: {
      id: true,
      professores: {
        select: { id: true },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        take: 1,
      },
    },
  });

  let parameterSetsCreated = 0;
  let parameterSetsSkipped = 0;
  let catalogItemsCreated = 0;
  let catalogItemsSkipped = 0;
  let contractsWithoutProfessor = 0;

  for (const contract of contracts) {
    const actorProfessorId = contract.professores[0]?.id;
    if (!actorProfessorId) {
      contractsWithoutProfessor += 1;
      continue;
    }

    const baseResults = await service.seedDefaultParameterSets(contract.id, actorProfessorId);
    parameterSetsCreated += baseResults.filter((result) => result.status === 'created').length;
    parameterSetsSkipped += baseResults.filter((result) => result.status === 'skipped').length;

    for (const payload of EXTENDED_CAPACITY_PARAMETER_SETS) {
      const current = await service.listParameterSets(contract.id, payload.capacity, false);
      if (current.some((item) => item.code === payload.code)) {
        parameterSetsSkipped += 1;
        continue;
      }
      await service.saveParameterSet({ contractId: contract.id, actorProfessorId }, payload);
      parameterSetsCreated += 1;
    }

    const catalogResult = await extensionService.seedCatalog(contract.id, actorProfessorId);
    catalogItemsCreated += catalogResult.created;
    catalogItemsSkipped += catalogResult.skipped;

    const currentCatalog = await extensionService.listCatalog(contract.id);
    const currentCatalogKeys = new Set(
      currentCatalog.map((item) => `${item.category}:${item.code}`)
    );
    for (const payload of WORKBOOK_CAPACITY_CATALOG_ITEMS) {
      const key = `${payload.category}:${payload.code}`;
      if (currentCatalogKeys.has(key)) {
        catalogItemsSkipped += 1;
        continue;
      }
      await extensionService.saveCatalogItem(
        { contractId: contract.id, actorProfessorId },
        payload
      );
      currentCatalogKeys.add(key);
      catalogItemsCreated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        contracts: contracts.length,
        parameterSetsCreated,
        parameterSetsSkipped,
        catalogItemsCreated,
        catalogItemsSkipped,
        contractsWithoutProfessor,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error('Falha ao criar parâmetros e catálogo da prescrição por capacidade', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
