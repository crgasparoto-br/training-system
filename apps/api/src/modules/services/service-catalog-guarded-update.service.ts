import type {
  ServiceCatalogImpactConfirmation,
  ServiceCatalogDetail,
  ServiceCommercialOption,
  UpdateCommercialOptionRequest,
  UpdateServiceRequest,
} from '@corrida/types';
import {
  assertNonNegativeOrder,
  assertPriceRule,
  assertValidity,
  normalizeCatalogCode,
} from './service.domain.js';
import {
  getCommercialOptionImpact,
  getServiceCatalogImpact,
  ServiceCatalogImpactConflictError,
} from './service-impact.service.js';
import { serviceCatalogPrismaClient as prisma } from './service.service-base.js';
import { serviceCatalogService } from './service.service.js';

type GuardedServiceUpdate = UpdateServiceRequest & {
  impactConfirmation?: ServiceCatalogImpactConfirmation;
};

type GuardedOptionUpdate = Omit<
  UpdateCommercialOptionRequest,
  'validFrom' | 'validUntil'
> & {
  validFrom?: string | Date | null;
  validUntil?: string | Date | null;
  impactConfirmation?: ServiceCatalogImpactConfirmation;
};

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ');

const normalizeOptionalText = (value?: string | null) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toDate = (
  value: string | Date | null | undefined,
  current: Date | null
) => {
  if (value === undefined) return current;
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
};

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

async function assertServiceCodeAvailable(
  contractId: string,
  serviceId: string,
  code: string
) {
  const duplicate = await prisma.serviceOption.findFirst({
    where: {
      contractId,
      code,
      id: { not: serviceId },
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new Error('Já existe um registro com este código no contrato');
  }
}

async function assertOptionCodeAvailable(
  contractId: string,
  optionId: string,
  code: string
) {
  const duplicate = await prisma.serviceCommercialOption.findFirst({
    where: {
      contractId,
      code,
      id: { not: optionId },
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new Error('Já existe um registro com este código no contrato');
  }
}

async function loadUpdatedOption(
  contractId: string,
  serviceId: string,
  optionId: string
): Promise<ServiceCommercialOption> {
  const detail = await serviceCatalogService.getCatalogDetail(contractId, serviceId);
  const option = detail.options.find((item) => item.id === optionId);
  if (!option) throw new Error('Opção comercial não encontrada');
  return option;
}

export async function updateCatalogServiceWithImpact(
  contractId: string,
  serviceId: string,
  data: GuardedServiceUpdate
): Promise<ServiceCatalogDetail> {
  const { impactConfirmation, ...payload } = data;

  if (payload.isActive !== false) {
    return serviceCatalogService.updateCatalogService(contractId, serviceId, payload);
  }

  const current = await prisma.serviceOption.findFirst({
    where: {
      id: serviceId,
      contractId,
      parentServiceId: null,
    },
  });

  if (!current) throw new Error('Serviço não encontrado');
  if (!current.isActive) {
    return serviceCatalogService.updateCatalogService(contractId, serviceId, payload);
  }

  const impact = await getServiceCatalogImpact(contractId, serviceId);
  assertImpactConfirmation(
    impactConfirmation,
    impact.resourceUpdatedAt,
    impact.affectedPlans
  );

  const nextCode =
    payload.code === undefined ? current.code : normalizeCatalogCode(payload.code);
  if (!nextCode) throw new Error('Informe um código estável');
  if (nextCode !== current.code) {
    await assertServiceCodeAvailable(contractId, serviceId, nextCode);
  }

  const nextDisplayOrder = payload.displayOrder ?? current.displayOrder;
  assertNonNegativeOrder(nextDisplayOrder);

  const nextCategory = payload.category ?? current.category;
  if (nextCategory !== current.category && nextCategory !== 'combined_plan') {
    const activeComponents = await prisma.servicePlanComponent.count({
      where: {
        contractId,
        planServiceId: serviceId,
        isActive: true,
      },
    });
    if (activeComponents > 0) {
      throw new Error('Inative os componentes do plano antes de alterar a categoria');
    }
  }

  const observedAt = new Date(impact.resourceUpdatedAt);
  const updated = await prisma.serviceOption.updateMany({
    where: {
      id: serviceId,
      contractId,
      parentServiceId: null,
      isActive: true,
      updatedAt: observedAt,
    },
    data: {
      name:
        payload.name === undefined ? current.name : normalizeName(payload.name),
      code: nextCode,
      category: nextCategory,
      summary:
        payload.summary === undefined
          ? current.summary
          : normalizeOptionalText(payload.summary),
      whatIs:
        payload.whatIs === undefined
          ? current.whatIs
          : normalizeOptionalText(payload.whatIs),
      targetAudience:
        payload.targetAudience === undefined
          ? current.targetAudience
          : normalizeOptionalText(payload.targetAudience),
      description:
        payload.whatIs === undefined
          ? current.description
          : normalizeOptionalText(payload.whatIs),
      displayOrder: nextDisplayOrder,
      isActive: false,
      updatedAt: new Date(),
    },
  });

  if (updated.count !== 1) {
    throw new ServiceCatalogImpactConflictError(
      'O catálogo mudou durante a inativação. Atualize a análise e confirme novamente.'
    );
  }

  return serviceCatalogService.getCatalogDetail(contractId, serviceId);
}

export async function updateCommercialOptionWithImpact(
  contractId: string,
  optionId: string,
  data: GuardedOptionUpdate
): Promise<ServiceCommercialOption> {
  const { impactConfirmation, ...payload } = data;

  if (payload.isActive !== false) {
    return serviceCatalogService.updateCommercialOption(
      contractId,
      optionId,
      payload as UpdateCommercialOptionRequest
    );
  }

  const current = await prisma.serviceCommercialOption.findFirst({
    where: { id: optionId, contractId },
  });

  if (!current) throw new Error('Opção comercial não encontrada');
  if (!current.isActive) {
    return serviceCatalogService.updateCommercialOption(
      contractId,
      optionId,
      payload as UpdateCommercialOptionRequest
    );
  }

  const impact = await getCommercialOptionImpact(contractId, optionId);
  assertImpactConfirmation(
    impactConfirmation,
    impact.resourceUpdatedAt,
    impact.affectedPlans
  );

  const nextCode =
    payload.code === undefined ? current.code : normalizeCatalogCode(payload.code);
  if (!nextCode) throw new Error('Informe um código estável');
  if (nextCode !== current.code) {
    await assertOptionCodeAvailable(contractId, optionId, nextCode);
  }

  const nextPriceType = payload.priceType ?? current.priceType;
  const nextPriceAmount =
    payload.priceAmount === undefined
      ? toNumber(current.priceAmount)
      : payload.priceAmount;
  assertPriceRule(
    nextPriceType as 'fixed' | 'free' | 'on_request',
    nextPriceAmount
  );

  const nextValidFrom = toDate(payload.validFrom, current.validFrom);
  const nextValidUntil = toDate(payload.validUntil, current.validUntil);
  assertValidity(nextValidFrom, nextValidUntil);

  const nextDisplayOrder = payload.displayOrder ?? current.displayOrder;
  assertNonNegativeOrder(nextDisplayOrder);

  const observedAt = new Date(impact.resourceUpdatedAt);
  const updated = await prisma.serviceCommercialOption.updateMany({
    where: {
      id: optionId,
      contractId,
      isActive: true,
      updatedAt: observedAt,
    },
    data: {
      code: nextCode,
      name:
        payload.name === undefined ? current.name : normalizeName(payload.name),
      frequency:
        payload.frequency === undefined
          ? current.frequency
          : normalizeOptionalText(payload.frequency),
      quantity:
        payload.quantity === undefined
          ? toNumber(current.quantity)
          : payload.quantity,
      unit:
        payload.unit === undefined
          ? current.unit
          : normalizeOptionalText(payload.unit),
      priceType: nextPriceType,
      priceAmount: nextPriceType === 'fixed' ? nextPriceAmount : null,
      validFrom: nextValidFrom,
      validUntil: nextValidUntil,
      displayOrder: nextDisplayOrder,
      isActive: false,
      updatedAt: new Date(),
    },
  });

  if (updated.count !== 1) {
    throw new ServiceCatalogImpactConflictError(
      'O catálogo mudou durante a inativação. Atualize a análise e confirme novamente.'
    );
  }

  return loadUpdatedOption(contractId, current.serviceId, optionId);
}
