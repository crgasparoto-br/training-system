import { Prisma } from '@prisma/client';
import type {
  ServiceCatalogImpact,
  ServiceCatalogImpactConfirmation,
  ServiceCommercialOptionImpact,
} from '@corrida/types';
import { serviceCatalogPrismaClient as prisma } from './service.service-base.js';

type CountRow = { count: bigint };
type OptionImpactRow = {
  optionId: string;
  optionCode: string;
  optionName: string;
  isActive: boolean;
  affectedPlans: bigint;
};

const firstCount = (rows: CountRow[]) => Number(rows[0]?.count ?? 0);

export class ServiceCatalogImpactConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ServiceCatalogImpactConflictError';
  }
}

function assertImpactConfirmation(
  confirmation: ServiceCatalogImpactConfirmation | undefined,
  resourceUpdatedAt: string,
  affectedPlans: number
) {
  if (!confirmation) {
    throw new ServiceCatalogImpactConflictError(
      'Revise e confirme o impacto atualizado antes de inativar este item'
    );
  }

  if (
    confirmation.resourceUpdatedAt !== resourceUpdatedAt ||
    confirmation.affectedPlans !== affectedPlans
  ) {
    throw new ServiceCatalogImpactConflictError(
      'O catálogo foi alterado após a consulta de impacto. Atualize a análise e confirme novamente.'
    );
  }
}

export async function assertActiveCatalogComponentTarget(
  contractId: string,
  targetServiceId?: string | null,
  targetOptionId?: string | null
) {
  if (targetServiceId) {
    const target = await prisma.serviceOption.findFirst({
      where: {
        id: targetServiceId,
        contractId,
        parentServiceId: null,
        isActive: true,
      },
      select: { id: true },
    });

    if (!target) {
      throw new Error('O serviço selecionado está inativo ou não pertence a este contrato');
    }
  }

  if (targetOptionId) {
    const target = await prisma.serviceCommercialOption.findFirst({
      where: {
        id: targetOptionId,
        contractId,
        isActive: true,
        service: {
          contractId,
          isActive: true,
        },
      },
      select: { id: true },
    });

    if (!target) {
      throw new Error('A opção comercial selecionada está inativa ou não pertence a este contrato');
    }
  }
}

export async function getCommercialOptionImpact(
  contractId: string,
  optionId: string
): Promise<ServiceCommercialOptionImpact> {
  const option = await prisma.serviceCommercialOption.findFirst({
    where: { id: optionId, contractId },
    select: {
      id: true,
      serviceId: true,
      isActive: true,
      updatedAt: true,
    },
  });

  if (!option) {
    throw new Error('Opção comercial não encontrada');
  }

  const rows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(DISTINCT component."planServiceId")::bigint AS "count"
    FROM "ServicePlanComponent" component
    WHERE component."contractId" = ${contractId}
      AND component."targetOptionId" = ${optionId}
      AND component."isActive" = true
  `);

  return {
    contractId,
    serviceId: option.serviceId,
    optionId,
    optionIsActive: option.isActive,
    resourceUpdatedAt: option.updatedAt.toISOString(),
    affectedPlans: firstCount(rows),
  };
}

export async function assertServiceInactivationConfirmation(
  contractId: string,
  serviceId: string,
  confirmation?: ServiceCatalogImpactConfirmation
) {
  const impact = await getServiceCatalogImpact(contractId, serviceId);
  assertImpactConfirmation(
    confirmation,
    impact.resourceUpdatedAt,
    impact.affectedPlans
  );
  return impact;
}

export async function assertCommercialOptionInactivationConfirmation(
  contractId: string,
  optionId: string,
  confirmation?: ServiceCatalogImpactConfirmation
) {
  const impact = await getCommercialOptionImpact(contractId, optionId);
  assertImpactConfirmation(
    confirmation,
    impact.resourceUpdatedAt,
    impact.affectedPlans
  );
  return impact;
}

export async function getServiceCatalogImpact(
  contractId: string,
  serviceId: string
): Promise<ServiceCatalogImpact> {
  const service = await prisma.serviceOption.findFirst({
    where: {
      id: serviceId,
      contractId,
      parentServiceId: null,
    },
    select: {
      id: true,
      isActive: true,
      updatedAt: true,
    },
  });

  if (!service) {
    throw new Error('Serviço não encontrado');
  }

  // Essas consultas são deliberadamente sequenciais. A tela de Serviços já pode
  // abrir catálogo e auditoria ao mesmo tempo; disparar nove operações em
  // Promise.all criava um pico desnecessário no pool do Prisma em produção.
  const alunos = await prisma.aluno.count({
    where: {
      serviceId,
      service: { contractId },
    },
  });
  const studentContracts = await prisma.studentContract.count({
    where: {
      serviceId,
      contract: { companyContractId: contractId },
    },
  });
  const contractTemplates = await prisma.contractTemplate.count({
    where: { contractId, serviceId },
  });
  const generatedContracts = await prisma.contract.count({
    where: { companyContractId: contractId, serviceId },
  });
  const planComponentsOwnedRows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(*)::bigint AS "count"
    FROM "ServicePlanComponent"
    WHERE "contractId" = ${contractId}
      AND "planServiceId" = ${serviceId}
      AND "isActive" = true
  `);
  const planComponentsTargetingServiceRows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(DISTINCT "planServiceId")::bigint AS "count"
    FROM "ServicePlanComponent"
    WHERE "contractId" = ${contractId}
      AND "targetServiceId" = ${serviceId}
      AND "isActive" = true
  `);
  const planComponentsTargetingOptionsRows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(DISTINCT component."planServiceId")::bigint AS "count"
    FROM "ServicePlanComponent" component
    INNER JOIN "ServiceCommercialOption" option
      ON option."id" = component."targetOptionId"
    WHERE component."contractId" = ${contractId}
      AND component."isActive" = true
      AND option."contractId" = ${contractId}
      AND option."serviceId" = ${serviceId}
  `);
  const affectedPlansRows = await prisma.$queryRaw<CountRow[]>(Prisma.sql`
    SELECT COUNT(DISTINCT component."planServiceId")::bigint AS "count"
    FROM "ServicePlanComponent" component
    LEFT JOIN "ServiceCommercialOption" option
      ON option."id" = component."targetOptionId"
    WHERE component."contractId" = ${contractId}
      AND component."isActive" = true
      AND (
        component."targetServiceId" = ${serviceId}
        OR (
          option."contractId" = ${contractId}
          AND option."serviceId" = ${serviceId}
        )
      )
  `);
  const optionRows = await prisma.$queryRaw<OptionImpactRow[]>(Prisma.sql`
    SELECT
      option."id" AS "optionId",
      option."code" AS "optionCode",
      option."name" AS "optionName",
      option."isActive" AS "isActive",
      COUNT(DISTINCT component."planServiceId")::bigint AS "affectedPlans"
    FROM "ServiceCommercialOption" option
    LEFT JOIN "ServicePlanComponent" component
      ON component."contractId" = ${contractId}
      AND component."targetOptionId" = option."id"
      AND component."isActive" = true
    WHERE option."contractId" = ${contractId}
      AND option."serviceId" = ${serviceId}
    GROUP BY option."id", option."code", option."name", option."isActive"
    ORDER BY option."displayOrder" ASC, option."id" ASC
  `);

  const planComponentsOwned = firstCount(planComponentsOwnedRows);
  const planComponentsTargetingService = firstCount(planComponentsTargetingServiceRows);
  const planComponentsTargetingOptions = firstCount(planComponentsTargetingOptionsRows);
  const affectedPlans = firstCount(affectedPlansRows);
  const totalReferences =
    alunos +
    studentContracts +
    contractTemplates +
    generatedContracts +
    planComponentsOwned +
    planComponentsTargetingService +
    planComponentsTargetingOptions;

  return {
    contractId,
    serviceId,
    serviceIsActive: service.isActive,
    resourceUpdatedAt: service.updatedAt.toISOString(),
    alunos,
    studentContracts,
    contractTemplates,
    generatedContracts,
    planComponentsOwned,
    planComponentsTargetingService,
    planComponentsTargetingOptions,
    affectedPlans,
    totalReferences,
    options: optionRows.map((row) => ({
      optionId: row.optionId,
      optionCode: row.optionCode,
      optionName: row.optionName,
      isActive: row.isActive,
      affectedPlans: Number(row.affectedPlans),
    })),
  };
}
