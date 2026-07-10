import type { ServiceCatalogSummary, ServiceCategory } from '@corrida/types';

export const SERVICE_CATEGORY_LABELS: Record<ServiceCategory, string> = {
  assessment: 'Avaliações e consultas',
  individual_service: 'Serviços individuais',
  combined_plan: 'Planos combinados',
};

export function formatCatalogPrice(item: Pick<ServiceCatalogSummary, 'startingPrice' | 'priceLabel'>) {
  if (typeof item.startingPrice !== 'number') return item.priceLabel;

  const amount = item.startingPrice.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  return item.priceLabel === 'A partir de' ? `A partir de ${amount}` : amount;
}

export function filterCatalog(
  items: ServiceCatalogSummary[],
  search: string,
  category: ServiceCategory | 'all',
  status: 'all' | 'active' | 'inactive'
) {
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');

  return items
    .filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch) ||
        item.code.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
      const matchesCategory = category === 'all' || item.category === category;
      const matchesStatus =
        status === 'all' || (status === 'active' ? item.isActive : !item.isActive);
      return matchesSearch && matchesCategory && matchesStatus;
    })
    .sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id)
    );
}
