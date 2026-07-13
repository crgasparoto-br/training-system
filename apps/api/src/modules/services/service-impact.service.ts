import { Prisma, PrismaClient } from '@prisma/client';
import type { ServiceCatalogImpact } from '@corrida/types';

const prisma = new PrismaClient();

type CountRow = { count: bigint };
type OptionImpactRow = {
  optionId: string;
  optionCode: string;
  optionName: string;
  isActive: boolean;
  planComponents: bigint;
};

const firstCount = (rows: CountRow[]) => Number(rows[0]?.count ?? 0);

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
    select: { id: true },
  });

  if (!service) {
    throw new Error('Serviço não encontrado');
  }

  const [
    alunos,
    studentContracts,
    contractTemplates,
    generatedContracts,
    planComponentsOwnedRows,
    planComponentsTargetingServiceRows,
    planComponentsTargetingOptionsRows,
    optionRows,
  ] = await Promise.all([
    prisma.aluno.count({
      where: {
        serviceId,
        service: { contractId },
      },
    }),
    prisma.studentContract.count({
      where: {
        serviceId,
        contract: { companyContractId: contractId },
      },
    }),
    prisma.contractTemplate.count({ where: { contractId, serviceId } }),
    prisma.contract.count({ where: { companyContractId: contractId, serviceId } }),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "ServicePlanComponent"
      WHERE "contractId" = ${contractId} AND "planServiceId" = ${serviceId}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "ServicePlanComponent"
      WHERE "contractId" = ${contractId} AND "targetServiceId" = ${serviceId}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count"
      FROM "ServicePlanComponent" component
      INNER JOIN "ServiceCommercialOption" option
        ON option."id" = component."targetOptionId"
      WHERE component."contractId" = ${contractId}
        AND option."contractId" = ${contractId}
        AND option."serviceId" = ${serviceId}
    `),
    prisma.$queryRaw<OptionImpactRow[]>(Prisma.sql`
      SELECT
        option."id" AS "optionId",
        option."code" AS "optionCode",
        option."name" AS "optionName",
        option."isActive" AS "isActive",
        COUNT(component."id")::bigint AS "planComponents"
      FROM "ServiceCommercialOption" option
      LEFT JOIN "ServicePlanComponent" component
        ON component."contractId" = ${contractId}
        AND component."targetOptionId" = option."id"
      WHERE option."contractId" = ${contractId}
        AND option."serviceId" = ${serviceId}
      GROUP BY option."id", option."code", option."name", option."isActive"
      ORDER BY option."displayOrder" ASC, option."id" ASC
    `),
  ]);

  const planComponentsOwned = firstCount(planComponentsOwnedRows);
  const planComponentsTargetingService = firstCount(planComponentsTargetingServiceRows);
  const planComponentsTargetingOptions = firstCount(planComponentsTargetingOptionsRows);
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
    alunos,
    studentContracts,
    contractTemplates,
    generatedContracts,
    planComponentsOwned,
    planComponentsTargetingService,
    planComponentsTargetingOptions,
    totalReferences,
    options: optionRows.map((row) => ({
      optionId: row.optionId,
      optionCode: row.optionCode,
      optionName: row.optionName,
      isActive: row.isActive,
      planComponents: Number(row.planComponents),
    })),
  };
}
