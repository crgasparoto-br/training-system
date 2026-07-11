import { Prisma, type PrismaClient } from '@prisma/client';

type SelectedService = {
  id: string;
  name?: string | null;
  code?: string | null;
  description?: string | null;
  monthlyPrice?: number | null;
} | null;

type ServiceCatalogRow = {
  id: string;
  name: string;
  code: string;
  category: string;
  summary: string | null;
  whatIs: string | null;
  targetAudience: string | null;
  description: string | null;
  monthlyPrice: number | null;
};

type PresentationItemRow = {
  text: string;
};

type PlanComponentRow = {
  targetServiceName: string | null;
  targetOptionName: string | null;
  targetOptionServiceName: string | null;
  quantity: Prisma.Decimal | number | string | null;
  unit: string | null;
  notes: string | null;
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const categoryLabels: Record<string, string> = {
  assessment: 'Avaliação ou consulta',
  individual_service: 'Serviço individual',
  combined_plan: 'Plano combinado',
};

function cleanText(value?: string | null) {
  return value?.trim() || '';
}

function formatQuantity(value: PlanComponentRow['quantity']) {
  if (value === null || value === undefined) return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '';
  return Number.isInteger(parsed)
    ? String(parsed)
    : parsed.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function formatComponent(component: PlanComponentRow) {
  const targetName = component.targetOptionName
    ? [component.targetOptionServiceName, component.targetOptionName].filter(Boolean).join(' — ')
    : cleanText(component.targetServiceName);
  const quantityAndUnit = [formatQuantity(component.quantity), cleanText(component.unit)]
    .filter(Boolean)
    .join(' ');

  return [targetName, quantityAndUnit, cleanText(component.notes)]
    .filter(Boolean)
    .join(' · ');
}

export function buildContractServiceVariableContext(input: {
  service: ServiceCatalogRow | null;
  fallbackService: SelectedService;
  presentationItems: PresentationItemRow[];
  components: PlanComponentRow[];
  valorMensal?: number;
}) {
  const presentationItems = input.presentationItems
    .map((item) => cleanText(item.text))
    .filter(Boolean);
  const components = input.components.map(formatComponent).filter(Boolean);
  const fallbackPrice = input.fallbackService?.monthlyPrice
    ? Number(input.fallbackService.monthlyPrice)
    : undefined;
  const effectivePrice = input.valorMensal ?? fallbackPrice;

  return {
    nome: input.service?.name || input.fallbackService?.name || '',
    codigo: input.service?.code || input.fallbackService?.code || '',
    categoria: input.service ? categoryLabels[input.service.category] || input.service.category : '',
    resumo: cleanText(input.service?.summary),
    oQueE:
      cleanText(input.service?.whatIs) ||
      cleanText(input.service?.description) ||
      cleanText(input.fallbackService?.description),
    publicoAlvo: cleanText(input.service?.targetAudience),
    itensInclusos: presentationItems.join('; '),
    quantidadeItensInclusos: presentationItems.length,
    plano: {
      componentes: components.join('; '),
    },
    valor: effectivePrice !== undefined ? currency.format(effectivePrice) : '',
    duracaoSessao: '',
    quantidadeSemanal: '',
  };
}

export async function loadContractServiceVariableContext(
  prisma: PrismaClient,
  contractId: string,
  selectedService: SelectedService,
  valorMensal?: number
) {
  if (!selectedService?.id) {
    return buildContractServiceVariableContext({
      service: null,
      fallbackService: selectedService,
      presentationItems: [],
      components: [],
      valorMensal,
    });
  }

  try {
    const serviceRows = await prisma.$queryRaw<ServiceCatalogRow[]>(Prisma.sql`
      SELECT
        COALESCE(parent."id", service."id") AS "id",
        COALESCE(parent."name", service."name") AS "name",
        COALESCE(parent."code", service."code") AS "code",
        COALESCE(parent."category", service."category") AS "category",
        COALESCE(parent."summary", service."summary") AS "summary",
        COALESCE(parent."whatIs", service."whatIs") AS "whatIs",
        COALESCE(parent."targetAudience", service."targetAudience") AS "targetAudience",
        COALESCE(parent."description", service."description") AS "description",
        COALESCE(service."monthlyPrice", parent."monthlyPrice") AS "monthlyPrice"
      FROM "ServiceOption" service
      LEFT JOIN "ServiceOption" parent ON parent."id" = service."parentServiceId"
      WHERE service."contractId" = ${contractId} AND service."id" = ${selectedService.id}
      LIMIT 1
    `);

    const service = serviceRows[0] ?? null;
    if (!service) {
      return buildContractServiceVariableContext({
        service: null,
        fallbackService: selectedService,
        presentationItems: [],
        components: [],
        valorMensal,
      });
    }

    const [presentationItems, components] = await Promise.all([
      prisma.$queryRaw<PresentationItemRow[]>(Prisma.sql`
        SELECT "text"
        FROM "ServicePresentationItem"
        WHERE "contractId" = ${contractId}
          AND "serviceId" = ${service.id}
          AND "isActive" = true
        ORDER BY "displayOrder" ASC, "createdAt" ASC, "id" ASC
      `),
      prisma.$queryRaw<PlanComponentRow[]>(Prisma.sql`
        SELECT
          target_service."name" AS "targetServiceName",
          target_option."name" AS "targetOptionName",
          target_option_service."name" AS "targetOptionServiceName",
          component."quantity",
          component."unit",
          component."notes"
        FROM "ServicePlanComponent" component
        LEFT JOIN "ServiceOption" target_service ON target_service."id" = component."targetServiceId"
        LEFT JOIN "ServiceCommercialOption" target_option ON target_option."id" = component."targetOptionId"
        LEFT JOIN "ServiceOption" target_option_service ON target_option_service."id" = target_option."serviceId"
        WHERE component."contractId" = ${contractId}
          AND component."planServiceId" = ${service.id}
          AND component."isActive" = true
          AND (
            (component."targetServiceId" IS NOT NULL AND target_service."isActive" = true)
            OR
            (component."targetOptionId" IS NOT NULL AND target_option."isActive" = true)
          )
        ORDER BY component."displayOrder" ASC, component."createdAt" ASC, component."id" ASC
      `),
    ]);

    return buildContractServiceVariableContext({
      service,
      fallbackService: selectedService,
      presentationItems,
      components,
      valorMensal,
    });
  } catch (_error) {
    return buildContractServiceVariableContext({
      service: null,
      fallbackService: selectedService,
      presentationItems: [],
      components: [],
      valorMensal,
    });
  }
}
