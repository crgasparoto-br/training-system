import type { ServiceCatalogSummary } from '@corrida/types';
import { filterCatalog, formatCatalogPrice } from './serviceCatalogPresentation';

const item = (overrides: Partial<ServiceCatalogSummary> = {}): ServiceCatalogSummary => ({
  id: 'service-1',
  contractId: 'contract-1',
  name: 'Plano Essencial',
  code: 'plano_essencial',
  category: 'individual_service',
  summary: 'Resumo',
  isActive: true,
  isSystem: false,
  displayOrder: 1,
  origin: 'manual',
  activeOptionsCount: 1,
  activeComponentsCount: 0,
  commercialState: 'available',
  startingPrice: 962,
  priceLabel: 'A partir de',
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
  ...overrides,
});

describe('serviceCatalogPresentation', () => {
  it('combina busca, categoria e status', () => {
    const result = filterCatalog(
      [
        item(),
        item({ id: '2', name: 'Plano Vida Saudável', code: 'vida', category: 'combined_plan' }),
        item({ id: '3', name: 'Acesso Run', code: 'run', isActive: false }),
      ],
      'vida',
      'combined_plan',
      'active'
    );

    expect(result.map((entry) => entry.id)).toEqual(['2']);
  });

  it('ordena pela ordem comercial com desempate estável', () => {
    const result = filterCatalog(
      [item({ id: 'b', displayOrder: 2 }), item({ id: 'a', displayOrder: 0 })],
      '',
      'all',
      'all'
    );
    expect(result.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('formata preço inicial e rótulos sem valor', () => {
    expect(formatCatalogPrice(item())).toContain('R$');
    expect(formatCatalogPrice(item({ startingPrice: null, priceLabel: 'Sob consulta' }))).toBe('Sob consulta');
  });
});
