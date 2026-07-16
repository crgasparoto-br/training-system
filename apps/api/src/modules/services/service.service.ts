import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  CreateCommercialOptionRequest,
  CreatePlanComponentRequest,
  CreatePresentationItemRequest,
  CreateServiceRequest,
  ServiceCatalogBootstrapResult,
  ServiceCatalogDetail,
  ServiceCatalogSummary,
  ServiceCategory,
  ServiceCommercialOption,
  ServiceOption,
  ServiceOrigin,
  ServicePlanComponent,
  ServicePresentationItem,
  UpdateCommercialOptionRequest,
  UpdatePlanComponentRequest,
  UpdatePresentationItemRequest,
  UpdateServiceRequest,
} from '@corrida/types';
import {
  assertCompleteReorder,
  assertNonNegativeOrder,
  assertPriceRule,
  assertValidity,
  isPlanComponentCommerciallyActive,
  normalizeCatalogCode,
  resolveCommercialState,
  wouldCreateServiceCycle,
} from './service.domain.js';
import { ACESSO_2026_CATALOG } from './service.reference.js';

const prisma = new PrismaClient();

type DbClient = PrismaClient | Prisma.TransactionClient;

type ServiceRow = {
  id: string;
  contractId: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  category: string;
  summary: string | null;
  whatIs: string | null;
  targetAudience: string | null;
  displayOrder: number;
  origin: string;
  createdAt: Date;
  updatedAt: Date;
};

type CommercialOptionRow = {
  id: string;
  contractId: string;
  serviceId: string;
  code: string;
  name: string;
  frequency: string | null;
  quantity: Prisma.Decimal | number | null;
  unit: string | null;
  priceType: string;
  priceAmount: Prisma.Decimal | number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  isActive: boolean;
  displayOrder: number;
  origin: string;
  createdAt: Date;
  updatedAt: Date;
};

type PresentationItemRow = {
  id: string;
  contractId: string;
  serviceId: string;
  text: string;
  isActive: boolean;
  displayOrder: number;
  origin: string;
  createdAt: Date;
  updatedAt: Date;
};

type ComponentRow = {
  id: string;
  contractId: string;
  planServiceId: string;
  targetServiceId: string | null;
  targetOptionId: string | null;
  quantity: Prisma.Decimal | number | null;
  unit: string | null;
  notes: string | null;
  isActive: boolean;
  displayOrder: number;
  origin: string;
  createdAt: Date;
  updatedAt: Date;
  targetServiceName: string | null;
  targetServiceCode: string | null;
  targetServiceActive: boolean | null;
  targetOptionName: string | null;
  targetOptionCode: string | null;
  targetOptionServiceId: string | null;
  targetOptionActive: boolean | null;
};

const DEFAULT_SERVICES = [
  { code: 'personal_trainer', name: 'Personal Trainer' },
  { code: 'consultoria_esportiva', name: 'Consultoria Esportiva' },
  { code: 'avaliacao_fisica_avulsa', name: 'Avaliação Física Avulsa' },
] as const;

function normalizeName(name: string) {
  return name.trim().replace(/\s+/g, ' ');
}

function normalizeOptionalText(value?: string | null) {
  if (typeof value !== 'string') return value ?? null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asCategory(value: string): ServiceCategory {
  if (value === 'assessment' || value === 'combined_plan') return value;
  return 'individual_service';
}

function asOrigin(value: string): ServiceOrigin {
  if (value === 'legacy' || value === 'acesso_2026') return value;
  return 'manual';
}

function mapCommercialOption(row: CommercialOptionRow): ServiceCommercialOption {
  return {
    id: row.id,
    contractId: row.contractId,
    serviceId: row.serviceId,
    code: row.code,
    name: row.name,
    frequency: row.frequency,
    quantity: asNumber(row.quantity),
    unit: row.unit,
    priceType:
      row.priceType === 'free' || row.priceType === 'on_request' ? row.priceType : 'fixed',
    priceAmount: asNumber(row.priceAmount),
    validFrom: toIso(row.validFrom),
    validUntil: toIso(row.validUntil),
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    origin: asOrigin(row.origin),
    usedByPlansCount: 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapPresentationItem(row: PresentationItemRow): ServicePresentationItem {
  return {
    ...row,
    origin: asOrigin(row.origin),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapComponent(row: ComponentRow): ServicePlanComponent {
  return {
    id: row.id,
    contractId: row.contractId,
    planServiceId: row.planServiceId,
    targetServiceId: row.targetServiceId,
    targetOptionId: row.targetOptionId,
    targetService: row.targetServiceId
      ? {
          id: row.targetServiceId,
          name: row.targetServiceName ?? 'Serviço indisponível',
          code: row.targetServiceCode ?? '',
          isActive: row.targetServiceActive ?? false,
        }
      : null,
    targetOption: row.targetOptionId
      ? {
          id: row.targetOptionId,
          name: row.targetOptionName ?? 'Opção indisponível',
          code: row.targetOptionCode ?? '',
          serviceId: row.targetOptionServiceId ?? '',
          isActive: row.targetOptionActive ?? false,
        }
      : null,
    quantity: asNumber(row.quantity),
    unit: row.unit,
    notes: row.notes,
    isActive: row.isActive,
        isCommerciallyActive: isPlanComponentCommerciallyActive({
          isActive: row.isActive,
          targetServiceId: row.targetServiceId,
          targetOptionId: row.targetOptionId,
          targetServiceActive: row.targetServiceActive,
          targetOptionActive: row.targetOptionActive,
        }),
        displayOrder: row.displayOrder,
    origin: asOrigin(row.origin),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function listServiceRows(contractId: string, client: DbClient = prisma) {
  return client.$queryRaw<ServiceRow[]>(Prisma.sql`
    SELECT
      "id", "contractId", "name", "code", "description", "isActive", "isSystem",
      "category", "summary", "whatIs", "targetAudience", "displayOrder", "origin",
      "createdAt", "updatedAt"
    FROM "ServiceOption"
    WHERE "contractId" = ${contractId} AND "parentServiceId" IS NULL
    ORDER BY "displayOrder" ASC, "createdAt" ASC, "id" ASC
  `);
}

async function getServiceRow(contractId: string, serviceId: string, client: DbClient = prisma) {
  const rows = await client.$queryRaw<ServiceRow[]>(Prisma.sql`
    SELECT
      "id", "contractId", "name", "code", "description", "isActive", "isSystem",
      "category", "summary", "whatIs", "targetAudience", "displayOrder", "origin",
      "createdAt", "updatedAt"
    FROM "ServiceOption"
    WHERE "contractId" = ${contractId} AND "id" = ${serviceId} AND "parentServiceId" IS NULL
    LIMIT 1
  `);

  const item = rows[0];
  if (!item) throw new Error('Serviço não encontrado');
  return item;
}

async function getServiceRowByCode(contractId: string, code: string, client: DbClient = prisma) {
  const rows = await client.$queryRaw<ServiceRow[]>(Prisma.sql`
    SELECT
      "id", "contractId", "name", "code", "description", "isActive", "isSystem",
      "category", "summary", "whatIs", "targetAudience", "displayOrder", "origin",
      "createdAt", "updatedAt"
    FROM "ServiceOption"
    WHERE "contractId" = ${contractId} AND "code" = ${code} AND "parentServiceId" IS NULL
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function listOptionRows(contractId: string, serviceId?: string, client: DbClient = prisma) {
  if (serviceId) {
    return client.$queryRaw<CommercialOptionRow[]>(Prisma.sql`
      SELECT * FROM "ServiceCommercialOption"
      WHERE "contractId" = ${contractId} AND "serviceId" = ${serviceId}
      ORDER BY "displayOrder" ASC, "createdAt" ASC, "id" ASC
    `);
  }

  return client.$queryRaw<CommercialOptionRow[]>(Prisma.sql`
    SELECT * FROM "ServiceCommercialOption"
    WHERE "contractId" = ${contractId}
    ORDER BY "serviceId" ASC, "displayOrder" ASC, "createdAt" ASC, "id" ASC
  `);
}

async function getOptionRow(contractId: string, optionId: string, client: DbClient = prisma) {
  const rows = await client.$queryRaw<CommercialOptionRow[]>(Prisma.sql`
    SELECT * FROM "ServiceCommercialOption"
    WHERE "contractId" = ${contractId} AND "id" = ${optionId}
    LIMIT 1
  `);
  const item = rows[0];
  if (!item) throw new Error('Opção comercial não encontrada');
  return item;
}

async function listPresentationRows(contractId: string, serviceId: string, client: DbClient = prisma) {
  return client.$queryRaw<PresentationItemRow[]>(Prisma.sql`
    SELECT * FROM "ServicePresentationItem"
    WHERE "contractId" = ${contractId} AND "serviceId" = ${serviceId}
    ORDER BY "displayOrder" ASC, "createdAt" ASC, "id" ASC
  `);
}

async function getPresentationRow(contractId: string, itemId: string, client: DbClient = prisma) {
  const rows = await client.$queryRaw<PresentationItemRow[]>(Prisma.sql`
    SELECT * FROM "ServicePresentationItem"
    WHERE "contractId" = ${contractId} AND "id" = ${itemId}
    LIMIT 1
  `);
  const item = rows[0];
  if (!item) throw new Error('Item de apresentação não encontrado');
  return item;
}

async function listComponentRows(contractId: string, planServiceId?: string, client: DbClient = prisma) {
  if (planServiceId) {
    return client.$queryRaw<ComponentRow[]>(Prisma.sql`
      SELECT
        component.*,
        target_service."name" AS "targetServiceName",
        target_service."code" AS "targetServiceCode",
        target_service."isActive" AS "targetServiceActive",
        target_option."name" AS "targetOptionName",
        target_option."code" AS "targetOptionCode",
        target_option."serviceId" AS "targetOptionServiceId",
        target_option."isActive" AS "targetOptionActive"
      FROM "ServicePlanComponent" component
      LEFT JOIN "ServiceOption" target_service ON target_service."id" = component."targetServiceId"
      LEFT JOIN "ServiceCommercialOption" target_option ON target_option."id" = component."targetOptionId"
      WHERE component."contractId" = ${contractId} AND component."planServiceId" = ${planServiceId}
      ORDER BY component."displayOrder" ASC, component."createdAt" ASC, component."id" ASC
    `);
  }

  return client.$queryRaw<ComponentRow[]>(Prisma.sql`
    SELECT
      component.*,
      target_service."name" AS "targetServiceName",
      target_service."code" AS "targetServiceCode",
      target_service."isActive" AS "targetServiceActive",
      target_option."name" AS "targetOptionName",
      target_option."code" AS "targetOptionCode",
      target_option."serviceId" AS "targetOptionServiceId",
      target_option."isActive" AS "targetOptionActive"
    FROM "ServicePlanComponent" component
    LEFT JOIN "ServiceOption" target_service ON target_service."id" = component."targetServiceId"
    LEFT JOIN "ServiceCommercialOption" target_option ON target_option."id" = component."targetOptionId"
    WHERE component."contractId" = ${contractId}
    ORDER BY component."planServiceId" ASC, component."displayOrder" ASC, component."createdAt" ASC
  `);
}

async function getComponentRow(contractId: string, componentId: string, client: DbClient = prisma) {
  const rows = await listComponentRows(contractId, undefined, client);
  const item = rows.find((row) => row.id === componentId);
  if (!item) throw new Error('Componente de plano não encontrado');
  return item;
}

async function assertCodeAvailable(
  table: 'ServiceOption' | 'ServiceCommercialOption',
  contractId: string,
  code: string,
  client: DbClient,
  ignoreId?: string
) {
  const rows = table === 'ServiceOption'
    ? await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ServiceOption"
        WHERE "contractId" = ${contractId} AND "code" = ${code}
          AND (${ignoreId ?? null}::text IS NULL OR "id" <> ${ignoreId ?? null})
        LIMIT 1
      `)
    : await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "ServiceCommercialOption"
        WHERE "contractId" = ${contractId} AND "code" = ${code}
          AND (${ignoreId ?? null}::text IS NULL OR "id" <> ${ignoreId ?? null})
        LIMIT 1
      `);

  if (rows.length > 0) throw new Error('Já existe um registro com este código no contrato');
}

async function nextOrder(table: 'ServiceOption' | 'ServiceCommercialOption' | 'ServicePresentationItem' | 'ServicePlanComponent', contractId: string, ownerId: string | null, client: DbClient) {
  if (table === 'ServiceOption') {
    const rows = await client.$queryRaw<Array<{ next: number }>>(Prisma.sql`
      SELECT COALESCE(MAX("displayOrder"), -1) + 1 AS "next"
      FROM "ServiceOption" WHERE "contractId" = ${contractId} AND "parentServiceId" IS NULL
    `);
    return Number(rows[0]?.next ?? 0);
  }
  if (table === 'ServiceCommercialOption') {
    const rows = await client.$queryRaw<Array<{ next: number }>>(Prisma.sql`
      SELECT COALESCE(MAX("displayOrder"), -1) + 1 AS "next"
      FROM "ServiceCommercialOption" WHERE "contractId" = ${contractId} AND "serviceId" = ${ownerId}
    `);
    return Number(rows[0]?.next ?? 0);
  }
  if (table === 'ServicePresentationItem') {
    const rows = await client.$queryRaw<Array<{ next: number }>>(Prisma.sql`
      SELECT COALESCE(MAX("displayOrder"), -1) + 1 AS "next"
      FROM "ServicePresentationItem" WHERE "contractId" = ${contractId} AND "serviceId" = ${ownerId}
    `);
    return Number(rows[0]?.next ?? 0);
  }
  const rows = await client.$queryRaw<Array<{ next: number }>>(Prisma.sql`
    SELECT COALESCE(MAX("displayOrder"), -1) + 1 AS "next"
    FROM "ServicePlanComponent" WHERE "contractId" = ${contractId} AND "planServiceId" = ${ownerId}
  `);
  return Number(rows[0]?.next ?? 0);
}

async function buildCatalogSummary(
  row: ServiceRow,
  options: ServiceCommercialOption[],
  components: ServicePlanComponent[]
): Promise<ServiceCatalogSummary> {
  const activeOptionsCount = options.filter((option) => option.isActive).length;
  const activeComponentsCount = components.filter((component) => component.isCommerciallyActive).length;
  const pricing = resolveCommercialState(asCategory(row.category), options, activeComponentsCount);

  return {
    id: row.id,
    contractId: row.contractId,
    name: row.name,
    code: row.code,
    category: asCategory(row.category),
    summary: row.summary,
    isActive: row.isActive,
    isSystem: row.isSystem,
    displayOrder: row.displayOrder,
    origin: asOrigin(row.origin),
    activeOptionsCount,
    activeComponentsCount,
    commercialState: pricing.state,
    startingPrice: pricing.startingPrice,
    priceLabel: pricing.priceLabel,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureDefaultServicesForContract(contractId: string, client: DbClient = prisma) {
  const existing = await client.serviceOption.findMany({ where: { contractId }, select: { code: true } });
  const existingCodes = new Set(existing.map((item) => item.code));
  const missing = DEFAULT_SERVICES.filter((item) => !existingCodes.has(item.code));

  if (missing.length > 0) {
    await client.serviceOption.createMany({
      data: missing.map((item) => ({
        contractId,
        code: item.code,
        name: item.name,
        isActive: true,
        isSystem: true,
      })),
    });
  }
}

export async function getServiceForContract(contractId: string, serviceId: string) {
  const legacy = await serviceCatalogService.listByContract(contractId, true);
  const item = legacy.find((service) => service.id === serviceId);
  if (!item) throw new Error('Serviço não encontrado');
  return item;
}

async function listLegacyByContract(contractId: string, includeInactive: boolean): Promise<ServiceOption[]> {
  await ensureDefaultServicesForContract(contractId);
  const serviceRows = await listServiceRows(contractId);
  const optionRows = await listOptionRows(contractId);
  const servicesById = new Map(serviceRows.map((row) => [row.id, row]));

  const baseItems: ServiceOption[] = serviceRows
    .filter((row) => includeInactive || row.isActive)
    .map((row) => ({
      id: row.id,
      contractId: row.contractId,
      name: row.name,
      code: row.code,
      description: row.description,
      parentServiceId: null,
      parentService: null,
      monthlyPrice: null,
      validFrom: null,
      validUntil: null,
      isActive: row.isActive,
      isSystem: row.isSystem,
      category: asCategory(row.category),
      summary: row.summary,
      whatIs: row.whatIs,
      targetAudience: row.targetAudience,
      displayOrder: row.displayOrder,
      origin: asOrigin(row.origin),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

  const projectedOptions: ServiceOption[] = optionRows
    .filter((row) => includeInactive || row.isActive)
    .filter((row) => servicesById.has(row.serviceId))
    .map((row) => {
      const parent = servicesById.get(row.serviceId)!;
      return {
        id: row.id,
        contractId: row.contractId,
        name: row.name,
        code: row.code,
        description: row.frequency,
        parentServiceId: row.serviceId,
        parentService: { id: parent.id, name: parent.name },
        monthlyPrice: row.priceType === 'fixed' ? asNumber(row.priceAmount) : null,
        validFrom: toIso(row.validFrom),
        validUntil: toIso(row.validUntil),
        isActive: row.isActive,
        isSystem: row.origin !== 'manual',
        category: asCategory(parent.category),
        displayOrder: row.displayOrder,
        origin: asOrigin(row.origin),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });

  return [...baseItems, ...projectedOptions];
}

async function assertComponentTarget(
  contractId: string,
  planServiceId: string,
  targetServiceId: string | null | undefined,
  targetOptionId: string | null | undefined,
  client: DbClient,
  ignoreComponentId?: string
) {
  if ((!targetServiceId && !targetOptionId) || (targetServiceId && targetOptionId)) {
    throw new Error('Selecione exatamente um serviço ou uma opção comercial para o componente');
  }

  const plan = await getServiceRow(contractId, planServiceId, client);
  if (asCategory(plan.category) !== 'combined_plan') {
    throw new Error('A composição relacional está disponível somente para planos combinados');
  }

  let resolvedTargetServiceId = targetServiceId ?? null;
  if (targetOptionId) {
    const option = await getOptionRow(contractId, targetOptionId, client);
    resolvedTargetServiceId = option.serviceId;
  } else if (targetServiceId) {
    await getServiceRow(contractId, targetServiceId, client);
  }

  if (!resolvedTargetServiceId) throw new Error('Destino do componente não encontrado');

  const edgeRows = await client.$queryRaw<Array<{ planServiceId: string; targetServiceId: string }>>(Prisma.sql`
    SELECT component."planServiceId", COALESCE(component."targetServiceId", target_option."serviceId") AS "targetServiceId"
    FROM "ServicePlanComponent" component
    LEFT JOIN "ServiceCommercialOption" target_option ON target_option."id" = component."targetOptionId"
    WHERE component."contractId" = ${contractId}
      AND component."isActive" = true
      AND (${ignoreComponentId ?? null}::text IS NULL OR component."id" <> ${ignoreComponentId ?? null})
  `);

  if (wouldCreateServiceCycle(planServiceId, resolvedTargetServiceId, edgeRows)) {
    throw new Error('A composição criaria um ciclo entre planos');
  }

  return resolvedTargetServiceId;
}

async function reorderRows(
  table: 'ServiceCommercialOption' | 'ServicePresentationItem' | 'ServicePlanComponent',
  contractId: string,
  ownerColumn: 'serviceId' | 'planServiceId',
  ownerId: string,
  ids: string[]
) {
  await prisma.$transaction(async (tx) => {
    const currentRows = table === 'ServiceCommercialOption'
      ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "ServiceCommercialOption"
          WHERE "contractId" = ${contractId} AND "serviceId" = ${ownerId}
        `)
      : table === 'ServicePresentationItem'
        ? await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "ServicePresentationItem"
            WHERE "contractId" = ${contractId} AND "serviceId" = ${ownerId}
          `)
        : await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "ServicePlanComponent"
            WHERE "contractId" = ${contractId} AND "planServiceId" = ${ownerId}
          `);

    assertCompleteReorder(currentRows.map((item) => item.id), ids);

    for (const [index, id] of ids.entries()) {
      if (table === 'ServiceCommercialOption') {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "ServiceCommercialOption" SET "displayOrder" = ${index}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "contractId" = ${contractId} AND "serviceId" = ${ownerId} AND "id" = ${id}
        `);
      } else if (table === 'ServicePresentationItem') {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "ServicePresentationItem" SET "displayOrder" = ${index}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "contractId" = ${contractId} AND "serviceId" = ${ownerId} AND "id" = ${id}
        `);
      } else {
        await tx.$executeRaw(Prisma.sql`
          UPDATE "ServicePlanComponent" SET "displayOrder" = ${index}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "contractId" = ${contractId} AND "planServiceId" = ${ownerId} AND "id" = ${id}
        `);
      }
    }
  });

  void ownerColumn;
}

export const serviceCatalogService = {
  listByContract(contractId: string, includeInactive = true) {
    return listLegacyByContract(contractId, includeInactive);
  },

  async listCatalog(contractId: string, includeInactive = true): Promise<ServiceCatalogSummary[]> {
    const [serviceRows, optionRows, componentRows] = await Promise.all([
      listServiceRows(contractId),
      listOptionRows(contractId),
      listComponentRows(contractId),
    ]);

    const options = optionRows.map(mapCommercialOption);
    const components = componentRows.map(mapComponent);
    const summaries = await Promise.all(
      serviceRows.map((row) =>
        buildCatalogSummary(
          row,
          options.filter((option) => option.serviceId === row.id),
          components.filter((component) => component.planServiceId === row.id)
        )
      )
    );

    return summaries.filter((item) => includeInactive || item.isActive);
  },

  async getCatalogDetail(contractId: string, serviceId: string): Promise<ServiceCatalogDetail> {
    const row = await getServiceRow(contractId, serviceId);
    const [optionRows, presentationRows, componentRows, usedByRows, optionImpactRows] = await Promise.all([
          listOptionRows(contractId, serviceId),
          listPresentationRows(contractId, serviceId),
          listComponentRows(contractId, serviceId),
          prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
            SELECT COUNT(*)::bigint AS "count"
            FROM "ServicePlanComponent" component
            LEFT JOIN "ServiceCommercialOption" target_option ON target_option."id" = component."targetOptionId"
            WHERE component."contractId" = ${contractId}
              AND component."isActive" = true
              AND (component."targetServiceId" = ${serviceId} OR target_option."serviceId" = ${serviceId})
          `),
          prisma.$queryRaw<Array<{ optionId: string; count: bigint }>>(Prisma.sql`
            SELECT component."targetOptionId" AS "optionId", COUNT(*)::bigint AS "count"
            FROM "ServicePlanComponent" component
            INNER JOIN "ServiceCommercialOption" target_option ON target_option."id" = component."targetOptionId"
            WHERE component."contractId" = ${contractId}
              AND component."isActive" = true
              AND target_option."serviceId" = ${serviceId}
            GROUP BY component."targetOptionId"
          `),
        ]);
        const optionImpactById = new Map(
          optionImpactRows.map((item) => [item.optionId, Number(item.count)])
        );
        const options = optionRows.map((item) => ({
          ...mapCommercialOption(item),
          usedByPlansCount: optionImpactById.get(item.id) ?? 0,
        }));
            const components = componentRows.map(mapComponent);
    const summary = await buildCatalogSummary(row, options, components);

    return {
      ...summary,
      whatIs: row.whatIs,
      targetAudience: row.targetAudience,
      legacyDescription: row.description,
      options,
      presentationItems: presentationRows.map(mapPresentationItem),
      components,
      usedByPlansCount: Number(usedByRows[0]?.count ?? 0),
    };
  },

  async createCatalogService(contractId: string, data: CreateServiceRequest) {
    const name = normalizeName(data.name);
    const code = normalizeCatalogCode(data.code || data.name);
    if (!code) throw new Error('Informe um código estável');
    const displayOrder = data.displayOrder ?? (await nextOrder('ServiceOption', contractId, null, prisma));
    assertNonNegativeOrder(displayOrder);
    await assertCodeAvailable('ServiceOption', contractId, code, prisma);
    const id = randomUUID();

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ServiceOption" (
        "id", "contractId", "name", "code", "description", "parentServiceId",
        "monthlyPrice", "validFrom", "validUntil", "isActive", "isSystem",
        "category", "summary", "whatIs", "targetAudience", "displayOrder", "origin",
        "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${contractId}, ${name}, ${code}, ${normalizeOptionalText(data.whatIs)}, NULL,
        NULL, NULL, NULL, ${data.isActive ?? true}, false,
        ${data.category ?? 'individual_service'}, ${normalizeOptionalText(data.summary)},
        ${normalizeOptionalText(data.whatIs)}, ${normalizeOptionalText(data.targetAudience)},
        ${displayOrder}, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);

    return this.getCatalogDetail(contractId, id);
  },

  async updateCatalogService(contractId: string, serviceId: string, data: UpdateServiceRequest) {
    const current = await getServiceRow(contractId, serviceId);
    const nextCode = data.code === undefined ? current.code : normalizeCatalogCode(data.code);
    if (!nextCode) throw new Error('Informe um código estável');
    if (nextCode !== current.code) {
      await assertCodeAvailable('ServiceOption', contractId, nextCode, prisma, serviceId);
    }
    const nextOrderValue = data.displayOrder ?? current.displayOrder;
    assertNonNegativeOrder(nextOrderValue);

    const nextCategory = data.category ?? asCategory(current.category);
    if (nextCategory !== asCategory(current.category)) {
      const activeRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count" FROM "ServicePlanComponent"
        WHERE "contractId" = ${contractId} AND "planServiceId" = ${serviceId} AND "isActive" = true
      `);
      if (nextCategory !== 'combined_plan' && Number(activeRows[0]?.count ?? 0) > 0) {
        throw new Error('Inative os componentes do plano antes de alterar a categoria');
      }
    }

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "ServiceOption" SET
        "name" = ${data.name === undefined ? current.name : normalizeName(data.name)},
        "code" = ${nextCode},
        "category" = ${nextCategory},
        "summary" = ${data.summary === undefined ? current.summary : normalizeOptionalText(data.summary)},
        "whatIs" = ${data.whatIs === undefined ? current.whatIs : normalizeOptionalText(data.whatIs)},
        "targetAudience" = ${data.targetAudience === undefined ? current.targetAudience : normalizeOptionalText(data.targetAudience)},
        "description" = ${data.whatIs === undefined ? current.description : normalizeOptionalText(data.whatIs)},
        "displayOrder" = ${nextOrderValue},
        "isActive" = ${data.isActive ?? current.isActive},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "contractId" = ${contractId} AND "id" = ${serviceId} AND "parentServiceId" IS NULL
    `);

    return this.getCatalogDetail(contractId, serviceId);
  },

  async createCommercialOption(contractId: string, serviceId: string, data: CreateCommercialOptionRequest) {
    await getServiceRow(contractId, serviceId);
    const code = normalizeCatalogCode(data.code);
    await assertCodeAvailable('ServiceCommercialOption', contractId, code, prisma);
    assertPriceRule(data.priceType, data.priceAmount);
    const validFrom = data.validFrom ? new Date(data.validFrom) : null;
    const validUntil = data.validUntil ? new Date(data.validUntil) : null;
    assertValidity(validFrom, validUntil);
    const displayOrder = data.displayOrder ?? (await nextOrder('ServiceCommercialOption', contractId, serviceId, prisma));
    assertNonNegativeOrder(displayOrder);
    const id = randomUUID();

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ServiceCommercialOption" (
        "id", "contractId", "serviceId", "code", "name", "frequency", "quantity", "unit",
        "priceType", "priceAmount", "validFrom", "validUntil", "isActive", "displayOrder", "origin",
        "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${contractId}, ${serviceId}, ${code}, ${normalizeName(data.name)},
        ${normalizeOptionalText(data.frequency)}, ${data.quantity ?? null}, ${normalizeOptionalText(data.unit)},
        ${data.priceType}, ${data.priceType === 'fixed' ? data.priceAmount ?? null : null},
        ${validFrom}, ${validUntil}, ${data.isActive ?? true}, ${displayOrder}, 'manual',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);
    return mapCommercialOption(await getOptionRow(contractId, id));
  },

  async updateCommercialOption(contractId: string, optionId: string, data: UpdateCommercialOptionRequest) {
    const current = await getOptionRow(contractId, optionId);
    const nextCode = data.code === undefined ? current.code : normalizeCatalogCode(data.code);
    if (nextCode !== current.code) {
      await assertCodeAvailable('ServiceCommercialOption', contractId, nextCode, prisma, optionId);
    }
    const nextPriceType = data.priceType ?? (current.priceType as 'fixed' | 'free' | 'on_request');
    const nextPriceAmount = data.priceAmount === undefined ? asNumber(current.priceAmount) : data.priceAmount;
    assertPriceRule(nextPriceType, nextPriceAmount);
    const nextValidFrom = data.validFrom === undefined ? current.validFrom : data.validFrom ? new Date(data.validFrom) : null;
    const nextValidUntil = data.validUntil === undefined ? current.validUntil : data.validUntil ? new Date(data.validUntil) : null;
    assertValidity(nextValidFrom, nextValidUntil);
    const nextOrderValue = data.displayOrder ?? current.displayOrder;
    assertNonNegativeOrder(nextOrderValue);

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "ServiceCommercialOption" SET
        "code" = ${nextCode},
        "name" = ${data.name === undefined ? current.name : normalizeName(data.name)},
        "frequency" = ${data.frequency === undefined ? current.frequency : normalizeOptionalText(data.frequency)},
        "quantity" = ${data.quantity === undefined ? asNumber(current.quantity) : data.quantity},
        "unit" = ${data.unit === undefined ? current.unit : normalizeOptionalText(data.unit)},
        "priceType" = ${nextPriceType},
        "priceAmount" = ${nextPriceType === 'fixed' ? nextPriceAmount : null},
        "validFrom" = ${nextValidFrom},
        "validUntil" = ${nextValidUntil},
        "isActive" = ${data.isActive ?? current.isActive},
        "displayOrder" = ${nextOrderValue},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "contractId" = ${contractId} AND "id" = ${optionId}
    `);
    return mapCommercialOption(await getOptionRow(contractId, optionId));
  },

  async reorderCommercialOptions(contractId: string, serviceId: string, ids: string[]) {
    await getServiceRow(contractId, serviceId);
    await reorderRows('ServiceCommercialOption', contractId, 'serviceId', serviceId, ids);
    return (await listOptionRows(contractId, serviceId)).map(mapCommercialOption);
  },

  async createPresentationItem(contractId: string, serviceId: string, data: CreatePresentationItemRequest) {
    await getServiceRow(contractId, serviceId);
    const displayOrder = data.displayOrder ?? (await nextOrder('ServicePresentationItem', contractId, serviceId, prisma));
    assertNonNegativeOrder(displayOrder);
    const id = randomUUID();
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ServicePresentationItem" (
        "id", "contractId", "serviceId", "text", "isActive", "displayOrder", "origin", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${contractId}, ${serviceId}, ${normalizeName(data.text)}, ${data.isActive ?? true},
        ${displayOrder}, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);
    return mapPresentationItem(await getPresentationRow(contractId, id));
  },

  async updatePresentationItem(contractId: string, itemId: string, data: UpdatePresentationItemRequest) {
    const current = await getPresentationRow(contractId, itemId);
    const displayOrder = data.displayOrder ?? current.displayOrder;
    assertNonNegativeOrder(displayOrder);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "ServicePresentationItem" SET
        "text" = ${data.text === undefined ? current.text : normalizeName(data.text)},
        "isActive" = ${data.isActive ?? current.isActive},
        "displayOrder" = ${displayOrder},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "contractId" = ${contractId} AND "id" = ${itemId}
    `);
    return mapPresentationItem(await getPresentationRow(contractId, itemId));
  },

  async reorderPresentationItems(contractId: string, serviceId: string, ids: string[]) {
    await getServiceRow(contractId, serviceId);
    await reorderRows('ServicePresentationItem', contractId, 'serviceId', serviceId, ids);
    return (await listPresentationRows(contractId, serviceId)).map(mapPresentationItem);
  },

  async createPlanComponent(contractId: string, planServiceId: string, data: CreatePlanComponentRequest) {
    await assertComponentTarget(contractId, planServiceId, data.targetServiceId, data.targetOptionId, prisma);
    const displayOrder = data.displayOrder ?? (await nextOrder('ServicePlanComponent', contractId, planServiceId, prisma));
    assertNonNegativeOrder(displayOrder);
    const id = randomUUID();
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "ServicePlanComponent" (
        "id", "contractId", "planServiceId", "targetServiceId", "targetOptionId", "quantity", "unit",
        "notes", "isActive", "displayOrder", "origin", "createdAt", "updatedAt"
      ) VALUES (
        ${id}, ${contractId}, ${planServiceId}, ${data.targetServiceId ?? null}, ${data.targetOptionId ?? null},
        ${data.quantity ?? null}, ${normalizeOptionalText(data.unit)}, ${normalizeOptionalText(data.notes)},
        ${data.isActive ?? true}, ${displayOrder}, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `);
    return mapComponent(await getComponentRow(contractId, id));
  },

  async updatePlanComponent(contractId: string, componentId: string, data: UpdatePlanComponentRequest) {
    const current = await getComponentRow(contractId, componentId);
    const targetServiceId = data.targetServiceId === undefined ? current.targetServiceId : data.targetServiceId;
    const targetOptionId = data.targetOptionId === undefined ? current.targetOptionId : data.targetOptionId;
    await assertComponentTarget(
      contractId,
      current.planServiceId,
      targetServiceId,
      targetOptionId,
      prisma,
      componentId
    );
    const displayOrder = data.displayOrder ?? current.displayOrder;
    assertNonNegativeOrder(displayOrder);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "ServicePlanComponent" SET
        "targetServiceId" = ${targetServiceId},
        "targetOptionId" = ${targetOptionId},
        "quantity" = ${data.quantity === undefined ? asNumber(current.quantity) : data.quantity},
        "unit" = ${data.unit === undefined ? current.unit : normalizeOptionalText(data.unit)},
        "notes" = ${data.notes === undefined ? current.notes : normalizeOptionalText(data.notes)},
        "isActive" = ${data.isActive ?? current.isActive},
        "displayOrder" = ${displayOrder},
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "contractId" = ${contractId} AND "id" = ${componentId}
    `);
    return mapComponent(await getComponentRow(contractId, componentId));
  },

  async reorderPlanComponents(contractId: string, planServiceId: string, ids: string[]) {
    await getServiceRow(contractId, planServiceId);
    await reorderRows('ServicePlanComponent', contractId, 'planServiceId', planServiceId, ids);
    return (await listComponentRows(contractId, planServiceId)).map(mapComponent);
  },

  async create(contractId: string, data: CreateServiceRequest) {
    if (data.parentServiceId) {
      return this.createCommercialOption(contractId, data.parentServiceId, {
        code: data.code || data.name,
        name: data.name,
        priceType: data.monthlyPrice && data.monthlyPrice > 0 ? 'fixed' : 'on_request',
        priceAmount: data.monthlyPrice,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isActive: data.isActive,
      });
    }
    return this.createCatalogService(contractId, {
      ...data,
      code: data.code || data.name,
      category: data.category ?? 'individual_service',
      whatIs: data.whatIs ?? data.description,
    });
  },

  async update(contractId: string, id: string, data: UpdateServiceRequest) {
    const optionRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ServiceCommercialOption" WHERE "contractId" = ${contractId} AND "id" = ${id} LIMIT 1
    `);
    if (optionRows.length > 0) {
      return this.updateCommercialOption(contractId, id, {
        name: data.name,
        priceAmount: data.monthlyPrice,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        isActive: data.isActive,
      });
    }
    return this.updateCatalogService(contractId, id, {
      ...data,
      whatIs: data.whatIs === undefined ? data.description : data.whatIs,
    });
  },

  async bootstrapReferenceCatalog(contractId: string, dryRun = false): Promise<ServiceCatalogBootstrapResult> {
    const contract = await prisma.companyContract.findUnique({ where: { id: contractId }, select: { id: true } });
    if (!contract) throw new Error('Contrato não encontrado');

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

    const execute = async (client: DbClient) => {
      const serviceIds = new Map<string, string>();
      const conflictedCodes = new Set<string>();

      for (const reference of ACESSO_2026_CATALOG) {
        let service = await getServiceRowByCode(contractId, reference.code, client);
        if (service) {
          result.preservedServices.push(reference.code);
          if (normalizeName(service.name) !== normalizeName(reference.name)) {
            result.conflicts.push({
              code: reference.code,
              message: `O código já existe com o nome “${service.name}”. Revise antes de alinhar ao material ACESSO 2026.`,
            });
            conflictedCodes.add(reference.code);
          }
        } else {
          result.createdServices.push(reference.code);
          if (!dryRun) {
            const id = randomUUID();
            await client.$executeRaw(Prisma.sql`
              INSERT INTO "ServiceOption" (
                "id", "contractId", "name", "code", "description", "parentServiceId", "monthlyPrice",
                "validFrom", "validUntil", "isActive", "isSystem", "category", "summary", "whatIs",
                "targetAudience", "displayOrder", "origin", "createdAt", "updatedAt"
              ) VALUES (
                ${id}, ${contractId}, ${reference.name}, ${reference.code}, ${reference.whatIs ?? null}, NULL, NULL,
                NULL, NULL, true, true, ${reference.category}, ${reference.summary}, ${reference.whatIs ?? null},
                ${reference.targetAudience ?? null}, ${reference.order}, 'acesso_2026', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
              )
            `);
            service = await getServiceRow(contractId, id, client);
          }
        }

        if (service) serviceIds.set(reference.code, service.id);
      }

      for (const reference of ACESSO_2026_CATALOG) {
        if (conflictedCodes.has(reference.code)) continue;
        const serviceId = serviceIds.get(reference.code);
        if (!serviceId && dryRun) {
          result.createdOptions.push(...reference.options.map((option) => option.code));
          result.createdPresentationItems += reference.presentationItems.length;
          result.createdComponents += reference.componentOptionCodes?.length ?? 0;
          continue;
        }
        if (!serviceId) continue;

        for (const option of reference.options) {
          const existingRows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "ServiceCommercialOption"
            WHERE "contractId" = ${contractId} AND "code" = ${option.code}
            LIMIT 1
          `);
          if (existingRows.length === 0) {
            result.createdOptions.push(option.code);
            if (!dryRun) {
              await client.$executeRaw(Prisma.sql`
                INSERT INTO "ServiceCommercialOption" (
                  "id", "contractId", "serviceId", "code", "name", "frequency", "quantity", "unit",
                  "priceType", "priceAmount", "isActive", "displayOrder", "origin", "createdAt", "updatedAt"
                ) VALUES (
                  ${randomUUID()}, ${contractId}, ${serviceId}, ${option.code}, ${option.name},
                  ${option.frequency ?? null}, ${option.quantity ?? null}, ${option.unit ?? null},
                  ${option.priceType}, ${option.priceType === 'fixed' ? option.priceAmount ?? null : null},
                  true, ${option.order}, 'acesso_2026', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
              `);
            }
          }
        }

        for (const [index, text] of reference.presentationItems.entries()) {
          const existingRows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "ServicePresentationItem"
            WHERE "contractId" = ${contractId} AND "serviceId" = ${serviceId} AND "text" = ${text}
            LIMIT 1
          `);
          if (existingRows.length === 0) {
            result.createdPresentationItems += 1;
            if (!dryRun) {
              await client.$executeRaw(Prisma.sql`
                INSERT INTO "ServicePresentationItem" (
                  "id", "contractId", "serviceId", "text", "isActive", "displayOrder", "origin", "createdAt", "updatedAt"
                ) VALUES (
                  ${randomUUID()}, ${contractId}, ${serviceId}, ${text}, true, ${index}, 'acesso_2026',
                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
              `);
            }
          }
        }
      }

      for (const reference of ACESSO_2026_CATALOG) {
        if (!reference.componentOptionCodes || conflictedCodes.has(reference.code)) continue;
        const planServiceId = serviceIds.get(reference.code);
        if (!planServiceId) continue;

        for (const [index, optionCode] of reference.componentOptionCodes.entries()) {
          const optionRows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "ServiceCommercialOption"
            WHERE "contractId" = ${contractId} AND "code" = ${optionCode}
            LIMIT 1
          `);
          const optionId = optionRows[0]?.id;
          if (!optionId) continue;
          const existingRows = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT "id" FROM "ServicePlanComponent"
            WHERE "contractId" = ${contractId} AND "planServiceId" = ${planServiceId}
              AND "targetOptionId" = ${optionId}
            LIMIT 1
          `);
          if (existingRows.length === 0) {
            result.createdComponents += 1;
            if (!dryRun) {
              await client.$executeRaw(Prisma.sql`
                INSERT INTO "ServicePlanComponent" (
                  "id", "contractId", "planServiceId", "targetOptionId", "isActive", "displayOrder", "origin",
                  "createdAt", "updatedAt"
                ) VALUES (
                  ${randomUUID()}, ${contractId}, ${planServiceId}, ${optionId}, true, ${index}, 'acesso_2026',
                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
              `);
            }
          }
        }
      }
    };

    if (dryRun) {
      await execute(prisma);
    } else {
      await prisma.$transaction(async (tx) => execute(tx));
    }

    return result;
  },
};
