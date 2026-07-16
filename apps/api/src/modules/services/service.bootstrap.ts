import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { ServiceCatalogBootstrapResult } from '@corrida/types';
import {
  SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE,
  ServiceCatalogBootstrapUnavailableError,
  isServiceCatalogTransactionUnavailable,
} from './service.bootstrap-errors.js';
import { ACESSO_2026_CATALOG } from './service.reference.js';
import { serviceCatalogPrismaClient } from './service.service-base.js';

export const SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_MAX_WAIT_MS = 10_000;
export const SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_TIMEOUT_MS = 30_000;
export const SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_OPTIONS = {
  maxWait: SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_MAX_WAIT_MS,
  timeout: SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_TIMEOUT_MS,
} as const;


type DbClient = PrismaClient | Prisma.TransactionClient;

type ExistingServiceRow = {
  id: string;
  code: string;
  name: string;
};

type ExistingOptionRow = {
  id: string;
  code: string;
};

type ExistingPresentationRow = {
  serviceCode: string;
  text: string;
};

type ExistingComponentRow = {
  planCode: string;
  optionCode: string;
};

type ServiceInsert = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  category: string;
  summary: string;
  whatIs: string | null;
  targetAudience: string | null;
  displayOrder: number;
};

type OptionInsert = {
  id: string;
  serviceId: string;
  code: string;
  name: string;
  frequency: string | null;
  quantity: number | null;
  unit: string | null;
  priceType: string;
  priceAmount: number | null;
  displayOrder: number;
};

type PresentationInsert = {
  id: string;
  serviceId: string;
  text: string;
  displayOrder: number;
};

type ComponentInsert = {
  id: string;
  planServiceId: string;
  targetOptionId: string;
  displayOrder: number;
};

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function presentationKey(serviceCode: string, text: string) {
  return `${serviceCode}\u0000${text}`;
}

function componentKey(planCode: string, optionCode: string) {
  return `${planCode}\u0000${optionCode}`;
}

async function assertContractExists(client: DbClient, contractId: string) {
  const contract = await client.companyContract.findUnique({
    where: { id: contractId },
    select: { id: true },
  });
  if (!contract) throw new Error('Contrato não encontrado');
}

async function preloadReferenceRows(client: DbClient, contractId: string) {
  const serviceCodes = ACESSO_2026_CATALOG.map((reference) => reference.code);
  const optionCodes = ACESSO_2026_CATALOG.flatMap((reference) =>
    reference.options.map((option) => option.code)
  );

  const services = await client.$queryRaw<ExistingServiceRow[]>(Prisma.sql`
    SELECT "id", "code", "name"
    FROM "ServiceOption"
    WHERE "contractId" = ${contractId}
      AND "parentServiceId" IS NULL
      AND "code" IN (${Prisma.join(serviceCodes)})
  `);

  const options = await client.$queryRaw<ExistingOptionRow[]>(Prisma.sql`
    SELECT "id", "code"
    FROM "ServiceCommercialOption"
    WHERE "contractId" = ${contractId}
      AND "code" IN (${Prisma.join(optionCodes)})
  `);

  const presentationItems = await client.$queryRaw<ExistingPresentationRow[]>(Prisma.sql`
    SELECT service."code" AS "serviceCode", item."text"
    FROM "ServicePresentationItem" item
    INNER JOIN "ServiceOption" service
      ON service."id" = item."serviceId"
      AND service."contractId" = item."contractId"
    WHERE item."contractId" = ${contractId}
      AND service."parentServiceId" IS NULL
      AND service."code" IN (${Prisma.join(serviceCodes)})
  `);

  const components = await client.$queryRaw<ExistingComponentRow[]>(Prisma.sql`
    SELECT plan."code" AS "planCode", target_option."code" AS "optionCode"
    FROM "ServicePlanComponent" component
    INNER JOIN "ServiceOption" plan
      ON plan."id" = component."planServiceId"
      AND plan."contractId" = component."contractId"
    INNER JOIN "ServiceCommercialOption" target_option
      ON target_option."id" = component."targetOptionId"
      AND target_option."contractId" = component."contractId"
    WHERE component."contractId" = ${contractId}
      AND plan."code" IN (${Prisma.join(serviceCodes)})
      AND target_option."code" IN (${Prisma.join(optionCodes)})
  `);

  return { services, options, presentationItems, components };
}

async function insertServices(
  client: DbClient,
  contractId: string,
  rows: ServiceInsert[]
) {
  if (rows.length === 0) return;

  await client.$executeRaw(Prisma.sql`
    INSERT INTO "ServiceOption" (
      "id", "contractId", "name", "code", "description", "parentServiceId", "monthlyPrice",
      "validFrom", "validUntil", "isActive", "isSystem", "category", "summary", "whatIs",
      "targetAudience", "displayOrder", "origin", "createdAt", "updatedAt"
    ) VALUES ${Prisma.join(
      rows.map(
        (row) => Prisma.sql`(
          ${row.id}, ${contractId}, ${row.name}, ${row.code}, ${row.description}, NULL, NULL,
          NULL, NULL, true, true, ${row.category}, ${row.summary}, ${row.whatIs},
          ${row.targetAudience}, ${row.displayOrder}, 'acesso_2026', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`
      )
    )}
  `);
}

async function insertOptions(
  client: DbClient,
  contractId: string,
  rows: OptionInsert[]
) {
  if (rows.length === 0) return;

  await client.$executeRaw(Prisma.sql`
    INSERT INTO "ServiceCommercialOption" (
      "id", "contractId", "serviceId", "code", "name", "frequency", "quantity", "unit",
      "priceType", "priceAmount", "isActive", "displayOrder", "origin", "createdAt", "updatedAt"
    ) VALUES ${Prisma.join(
      rows.map(
        (row) => Prisma.sql`(
          ${row.id}, ${contractId}, ${row.serviceId}, ${row.code}, ${row.name},
          ${row.frequency}, ${row.quantity}, ${row.unit}, ${row.priceType}, ${row.priceAmount},
          true, ${row.displayOrder}, 'acesso_2026', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`
      )
    )}
  `);
}

async function insertPresentationItems(
  client: DbClient,
  contractId: string,
  rows: PresentationInsert[]
) {
  if (rows.length === 0) return;

  await client.$executeRaw(Prisma.sql`
    INSERT INTO "ServicePresentationItem" (
      "id", "contractId", "serviceId", "text", "isActive", "displayOrder", "origin", "createdAt", "updatedAt"
    ) VALUES ${Prisma.join(
      rows.map(
        (row) => Prisma.sql`(
          ${row.id}, ${contractId}, ${row.serviceId}, ${row.text}, true, ${row.displayOrder},
          'acesso_2026', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`
      )
    )}
  `);
}

async function insertComponents(
  client: DbClient,
  contractId: string,
  rows: ComponentInsert[]
) {
  if (rows.length === 0) return;

  await client.$executeRaw(Prisma.sql`
    INSERT INTO "ServicePlanComponent" (
      "id", "contractId", "planServiceId", "targetOptionId", "isActive", "displayOrder", "origin",
      "createdAt", "updatedAt"
    ) VALUES ${Prisma.join(
      rows.map(
        (row) => Prisma.sql`(
          ${row.id}, ${contractId}, ${row.planServiceId}, ${row.targetOptionId}, true,
          ${row.displayOrder}, 'acesso_2026', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )`
      )
    )}
  `);
}

async function executeBootstrap(
  client: DbClient,
  contractId: string,
  dryRun: boolean,
  result: ServiceCatalogBootstrapResult
) {
  await assertContractExists(client, contractId);
  const existing = await preloadReferenceRows(client, contractId);

  const existingServicesByCode = new Map(existing.services.map((row) => [row.code, row]));
  const existingOptionsByCode = new Map(existing.options.map((row) => [row.code, row]));
  const existingPresentationKeys = new Set(
    existing.presentationItems.map((row) => presentationKey(row.serviceCode, row.text))
  );
  const existingComponentKeys = new Set(
    existing.components.map((row) => componentKey(row.planCode, row.optionCode))
  );

  const serviceIds = new Map<string, string>();
  const optionIds = new Map(
    existing.options.map((row) => [row.code, row.id])
  );
  const conflictedCodes = new Set<string>();
  const servicesToCreate: ServiceInsert[] = [];
  const optionsToCreate: OptionInsert[] = [];
  const presentationItemsToCreate: PresentationInsert[] = [];
  const componentsToCreate: ComponentInsert[] = [];

  for (const reference of ACESSO_2026_CATALOG) {
    const existingService = existingServicesByCode.get(reference.code);
    if (existingService) {
      serviceIds.set(reference.code, existingService.id);
      result.preservedServices.push(reference.code);
      if (normalizeName(existingService.name) !== normalizeName(reference.name)) {
        result.conflicts.push({
          code: reference.code,
          message: `O código já existe com o nome “${existingService.name}”. Revise antes de alinhar ao material ACESSO 2026.`,
        });
        conflictedCodes.add(reference.code);
      }
      continue;
    }

    const id = randomUUID();
    serviceIds.set(reference.code, id);
    result.createdServices.push(reference.code);
    servicesToCreate.push({
      id,
      name: reference.name,
      code: reference.code,
      description: reference.whatIs ?? null,
      category: reference.category,
      summary: reference.summary,
      whatIs: reference.whatIs ?? null,
      targetAudience: reference.targetAudience ?? null,
      displayOrder: reference.order,
    });
  }

  for (const reference of ACESSO_2026_CATALOG) {
    if (conflictedCodes.has(reference.code)) continue;
    const serviceId = serviceIds.get(reference.code);
    if (!serviceId) continue;

    for (const option of reference.options) {
      const existingOption = existingOptionsByCode.get(option.code);
      if (existingOption) {
        optionIds.set(option.code, existingOption.id);
        continue;
      }

      const id = randomUUID();
      optionIds.set(option.code, id);
      result.createdOptions.push(option.code);
      optionsToCreate.push({
        id,
        serviceId,
        code: option.code,
        name: option.name,
        frequency: option.frequency ?? null,
        quantity: option.quantity ?? null,
        unit: option.unit ?? null,
        priceType: option.priceType,
        priceAmount: option.priceType === 'fixed' ? option.priceAmount ?? null : null,
        displayOrder: option.order,
      });
    }

    for (const [displayOrder, text] of reference.presentationItems.entries()) {
      if (existingPresentationKeys.has(presentationKey(reference.code, text))) continue;
      presentationItemsToCreate.push({
        id: randomUUID(),
        serviceId,
        text,
        displayOrder,
      });
    }
  }

  for (const reference of ACESSO_2026_CATALOG) {
    if (!reference.componentOptionCodes || conflictedCodes.has(reference.code)) continue;
    const planServiceId = serviceIds.get(reference.code);
    if (!planServiceId) continue;

    for (const [displayOrder, optionCode] of reference.componentOptionCodes.entries()) {
      if (existingComponentKeys.has(componentKey(reference.code, optionCode))) continue;
      const targetOptionId = optionIds.get(optionCode);
      if (!targetOptionId) continue;
      componentsToCreate.push({
        id: randomUUID(),
        planServiceId,
        targetOptionId,
        displayOrder,
      });
    }
  }

  result.createdPresentationItems = presentationItemsToCreate.length;
  result.createdComponents = componentsToCreate.length;

  if (dryRun) return;

  await insertServices(client, contractId, servicesToCreate);
  await insertOptions(client, contractId, optionsToCreate);
  await insertPresentationItems(client, contractId, presentationItemsToCreate);
  await insertComponents(client, contractId, componentsToCreate);
}

export function createServiceCatalogBootstrap(prismaClient: PrismaClient) {
  return async function bootstrapReferenceCatalog(
    contractId: string,
    dryRun = false
  ): Promise<ServiceCatalogBootstrapResult> {
    const result: ServiceCatalogBootstrapResult = {
      contractId,
      dryRun,
      createdServices: [],
      createdOptions: [],
      createdPresentationItems: 0,
      createdComponents: 0,
      preservedServices: [],
      conflicts: [],
    };

    if (dryRun) {
      await executeBootstrap(prismaClient, contractId, true, result);
      return result;
    }

    try {
      await prismaClient.$transaction(
        async (transaction) => executeBootstrap(transaction, contractId, false, result),
        SERVICE_CATALOG_BOOTSTRAP_TRANSACTION_OPTIONS
      );
      return result;
    } catch (error) {
      if (isServiceCatalogTransactionUnavailable(error)) {
        throw new ServiceCatalogBootstrapUnavailableError(error);
      }
      throw error;
    }
  };
}

export const bootstrapReferenceCatalog = createServiceCatalogBootstrap(serviceCatalogPrismaClient);
export { SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE };
