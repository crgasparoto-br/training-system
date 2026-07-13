import type {
  ServiceCatalogImpact,
  ServiceCatalogImpactConfirmation,
  ServiceCommercialOptionImpact,
} from '@corrida/types';

export function buildServiceInactivationMessage(impact: ServiceCatalogImpact) {
  const planText =
    impact.affectedPlans === 1
      ? '1 plano ativo será afetado'
      : `${impact.affectedPlans} planos ativos serão afetados`;

  return [
    `Confirma a inativação deste serviço?`,
    '',
    `${planText}.`,
    'Os vínculos e componentes existentes serão preservados no histórico, mas o serviço e suas opções deixarão de ficar disponíveis para novos vínculos e composições.',
  ].join('\n');
}

export function buildCommercialOptionInactivationMessage(
  impact: ServiceCommercialOptionImpact
) {
  const planText =
    impact.affectedPlans === 1
      ? '1 plano ativo será afetado'
      : `${impact.affectedPlans} planos ativos serão afetados`;

  return [
    'Confirma a inativação desta opção comercial?',
    '',
    `${planText}.`,
    'As composições existentes serão preservadas no histórico, mas a opção deixará de ficar disponível para novos usos.',
  ].join('\n');
}

export function toImpactConfirmation(
  impact: Pick<ServiceCatalogImpact, 'resourceUpdatedAt' | 'affectedPlans'>
): ServiceCatalogImpactConfirmation {
  return {
    resourceUpdatedAt: impact.resourceUpdatedAt,
    affectedPlans: impact.affectedPlans,
  };
}
