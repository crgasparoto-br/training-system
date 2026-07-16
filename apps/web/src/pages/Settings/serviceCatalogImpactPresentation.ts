import type { ServiceCatalogImpact } from '@corrida/types';

export type ServiceCatalogImpactItem = {
  key: keyof Pick<
    ServiceCatalogImpact,
    | 'affectedPlans'
    | 'alunos'
    | 'studentContracts'
    | 'contractTemplates'
    | 'generatedContracts'
    | 'planComponentsOwned'
    | 'planComponentsTargetingService'
    | 'planComponentsTargetingOptions'
  >;
  label: string;
  value: number;
};

export function buildServiceCatalogImpactItems(
  impact: ServiceCatalogImpact
): ServiceCatalogImpactItem[] {
  return [
    {
      key: 'affectedPlans',
      label: 'Planos ativos afetados',
      value: impact.affectedPlans,
    },
    { key: 'alunos', label: 'Alunos vinculados', value: impact.alunos },
    {
      key: 'studentContracts',
      label: 'Vínculos contratuais do aluno',
      value: impact.studentContracts,
    },
    {
      key: 'contractTemplates',
      label: 'Modelos de contrato',
      value: impact.contractTemplates,
    },
    {
      key: 'generatedContracts',
      label: 'Documentos contratuais gerados',
      value: impact.generatedContracts,
    },
    {
      key: 'planComponentsOwned',
      label: 'Componentes ativos do próprio plano',
      value: impact.planComponentsOwned,
    },
    {
      key: 'planComponentsTargetingService',
      label: 'Planos ativos que usam o serviço',
      value: impact.planComponentsTargetingService,
    },
    {
      key: 'planComponentsTargetingOptions',
      label: 'Planos ativos que usam opções comerciais',
      value: impact.planComponentsTargetingOptions,
    },
  ];
}

export function getServiceCatalogImpactSummary(impact: ServiceCatalogImpact) {
  if (impact.totalReferences === 0) {
    return 'Nenhuma referência encontrada para este serviço.';
  }

  const planText =
    impact.affectedPlans === 1
      ? '1 plano ativo será afetado por uma inativação.'
      : `${impact.affectedPlans} planos ativos serão afetados por uma inativação.`;

  return `${planText} Há ${impact.totalReferences} referência(s) administrativas ou históricas. A inativação preserva o histórico, mas o serviço deixa de ficar disponível para novos vínculos e composições.`;
}
