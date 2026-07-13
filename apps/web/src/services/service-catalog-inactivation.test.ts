import { describe, expect, it } from 'vitest';
import type {
  ServiceCatalogImpact,
  ServiceCommercialOptionImpact,
} from '@corrida/types';
import {
  buildCommercialOptionInactivationMessage,
  buildServiceInactivationMessage,
  toImpactConfirmation,
} from './service-catalog-inactivation';

const serviceImpact = (affectedPlans: number): ServiceCatalogImpact => ({
  contractId: 'contract-1',
  serviceId: 'service-1',
  serviceIsActive: true,
  resourceUpdatedAt: '2026-07-13T12:00:00.000Z',
  alunos: 0,
  studentContracts: 0,
  contractTemplates: 0,
  generatedContracts: 0,
  planComponentsOwned: 0,
  planComponentsTargetingService: affectedPlans,
  planComponentsTargetingOptions: 0,
  affectedPlans,
  totalReferences: affectedPlans,
  options: [],
});

const optionImpact = (affectedPlans: number): ServiceCommercialOptionImpact => ({
  contractId: 'contract-1',
  serviceId: 'service-1',
  optionId: 'option-1',
  optionIsActive: true,
  resourceUpdatedAt: '2026-07-13T12:00:00.000Z',
  affectedPlans,
});

describe('catalog inactivation confirmation', () => {
  it.each([
    [0, '0 planos ativos serão afetados'],
    [1, '1 plano ativo será afetado'],
    [3, '3 planos ativos serão afetados'],
  ])('shows the exact service impact for %i affected plans', (count, expected) => {
    expect(buildServiceInactivationMessage(serviceImpact(count))).toContain(expected);
  });

  it.each([
    [0, '0 planos ativos serão afetados'],
    [1, '1 plano ativo será afetado'],
    [4, '4 planos ativos serão afetados'],
  ])('shows the exact option impact for %i affected plans', (count, expected) => {
    expect(buildCommercialOptionInactivationMessage(optionImpact(count))).toContain(expected);
  });

  it('sends the version and exact count observed by the user', () => {
    expect(toImpactConfirmation(serviceImpact(2))).toEqual({
      resourceUpdatedAt: '2026-07-13T12:00:00.000Z',
      affectedPlans: 2,
    });
  });
});
