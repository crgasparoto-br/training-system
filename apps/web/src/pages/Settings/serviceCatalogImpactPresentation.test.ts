import { describe, expect, it } from 'vitest';
import type { ServiceCatalogImpact } from '@corrida/types';
import {
  buildServiceCatalogImpactItems,
  getServiceCatalogImpactSummary,
} from './serviceCatalogImpactPresentation';

const impact: ServiceCatalogImpact = {
  contractId: 'contract-1',
  serviceId: 'service-1',
  serviceIsActive: true,
  resourceUpdatedAt: '2026-07-13T12:00:00.000Z',
  alunos: 2,
  studentContracts: 3,
  contractTemplates: 1,
  generatedContracts: 4,
  planComponentsOwned: 2,
  planComponentsTargetingService: 1,
  planComponentsTargetingOptions: 2,
  affectedPlans: 2,
  totalReferences: 15,
  options: [],
};

describe('service catalog impact presentation', () => {
  it('presents the exact affected-plan count and every audited reference category', () => {
    const items = buildServiceCatalogImpactItems(impact);

    expect(items.map((item) => item.key)).toEqual([
      'affectedPlans',
      'alunos',
      'studentContracts',
      'contractTemplates',
      'generatedContracts',
      'planComponentsOwned',
      'planComponentsTargetingService',
      'planComponentsTargetingOptions',
    ]);
    expect(items.find((item) => item.key === 'affectedPlans')?.value).toBe(2);
  });

  it('warns that inactivation preserves history but blocks new usage', () => {
    const summary = getServiceCatalogImpactSummary(impact);

    expect(summary).toContain('2 planos ativos');
    expect(summary).toContain('15 referência(s)');
    expect(summary).toContain('preserva o histórico');
    expect(summary).toContain('novos vínculos e composições');
  });

  it('reports an empty impact without warning language', () => {
    expect(
      getServiceCatalogImpactSummary({
        ...impact,
        affectedPlans: 0,
        totalReferences: 0,
      })
    ).toBe('Nenhuma referência encontrada para este serviço.');
  });
});
