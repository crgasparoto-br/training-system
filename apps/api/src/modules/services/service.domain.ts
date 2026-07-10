import type {
  ServiceCategory,
  ServiceCommercialOption,
  ServiceCommercialState,
  ServicePriceType,
} from '@corrida/types';

export function normalizeCatalogCode(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function assertNonNegativeOrder(order: number) {
  if (!Number.isInteger(order) || order < 0) {
    throw new Error('A ordem deve ser um número inteiro maior ou igual a zero');
  }
}

export function assertPriceRule(priceType: ServicePriceType, priceAmount?: number | null) {
  if (priceType === 'fixed') {
    if (typeof priceAmount !== 'number' || !Number.isFinite(priceAmount) || priceAmount <= 0) {
      throw new Error('Informe um valor maior que zero para preço fixo');
    }
    return;
  }

  if (priceAmount !== null && priceAmount !== undefined) {
    throw new Error('Opções gratuitas ou sob consulta não devem possuir valor monetário');
  }
}

export function assertValidity(validFrom?: Date | null, validUntil?: Date | null) {
  if (validFrom && validUntil && validUntil.getTime() < validFrom.getTime()) {
    throw new Error('A data final não pode ser anterior à data inicial');
  }
}

export function isOptionCurrent(option: Pick<ServiceCommercialOption, 'isActive' | 'validFrom' | 'validUntil'>, now = new Date()) {
  if (!option.isActive) return false;

  const from = option.validFrom ? new Date(option.validFrom) : null;
  const until = option.validUntil ? new Date(option.validUntil) : null;

  return (!from || from.getTime() <= now.getTime()) && (!until || until.getTime() >= now.getTime());
}

export function isPlanComponentCommerciallyActive(component: {
  isActive: boolean;
  targetServiceId?: string | null;
  targetOptionId?: string | null;
  targetServiceActive?: boolean | null;
  targetOptionActive?: boolean | null;
}) {
  if (!component.isActive) return false;
  if (component.targetOptionId) return component.targetOptionActive === true;
  if (component.targetServiceId) return component.targetServiceActive === true;
  return false;
}

export function resolveCommercialState(
  category: ServiceCategory,
  options: ServiceCommercialOption[],
  activeComponentsCount: number,
  now = new Date()
): { state: ServiceCommercialState; startingPrice: number | null; priceLabel: string } {
  const activeOptions = options.filter((option) => option.isActive);
  const currentOptions = activeOptions.filter((option) => isOptionCurrent(option, now));
  const fixedPrices = currentOptions
    .filter((option) => option.priceType === 'fixed' && typeof option.priceAmount === 'number')
    .map((option) => option.priceAmount as number)
    .sort((a, b) => a - b);

  if (category === 'combined_plan' && activeComponentsCount === 0) {
    return {
      state: 'incomplete_plan',
      startingPrice: fixedPrices[0] ?? null,
      priceLabel: fixedPrices.length > 0 ? 'A partir de' : 'Composição pendente',
    };
  }

  if (fixedPrices.length > 0) {
    return { state: 'available', startingPrice: fixedPrices[0], priceLabel: 'A partir de' };
  }

  if (currentOptions.some((option) => option.priceType === 'free')) {
    return { state: 'free', startingPrice: null, priceLabel: 'Gratuito' };
  }

  if (currentOptions.some((option) => option.priceType === 'on_request')) {
    return { state: 'on_request', startingPrice: null, priceLabel: 'Sob consulta' };
  }

  if (activeOptions.length > 0) {
    return { state: 'expired', startingPrice: null, priceLabel: 'Preço vencido' };
  }

  return { state: 'without_active_option', startingPrice: null, priceLabel: 'Sem opção comercial' };
}

export function assertCompleteReorder(currentIds: string[], requestedIds: string[]) {
  const current = new Set(currentIds);
  const requested = new Set(requestedIds);

  if (requested.size !== requestedIds.length) {
    throw new Error('A sequência de ordenação possui itens duplicados');
  }

  if (current.size !== requested.size || currentIds.some((id) => !requested.has(id))) {
    throw new Error('Envie a sequência completa dos itens do escopo');
  }
}

export function wouldCreateServiceCycle(
  planServiceId: string,
  targetServiceId: string,
  edges: Array<{ planServiceId: string; targetServiceId: string }>
) {
  if (planServiceId === targetServiceId) return true;

  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    const current = graph.get(edge.planServiceId) ?? [];
    current.push(edge.targetServiceId);
    graph.set(edge.planServiceId, current);
  }
  graph.set(planServiceId, [...(graph.get(planServiceId) ?? []), targetServiceId]);

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;

    visiting.add(node);
    for (const next of graph.get(node) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };

  return [...graph.keys()].some((node) => visit(node));
}
