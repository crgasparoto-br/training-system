import type { ServiceCatalogImpact } from '@corrida/types';

export type ServiceCatalogImpactItem = {
  key: keyof Pick<
    ServiceCatalogImpact,
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
      label: 'Componentes do próprio plano',
      value: impact.planComponentsOwned,
    },
    {
      key: 'planComponentsTargetingService',
      label: 'Planos que usam o serviço',
      value: impact.planComponentsTargetingService,
    },
    {
      key: 'planComponentsTargetingOptions',
      label: 'Planos que usam opções comerciais',
      value: impact.planComponentsTargetingOptions,
    },
  ];
}

export function getServiceCatalogImpactSummary(impact: ServiceCatalogImpact) {
  if (impact.totalReferences === 0) {
    return 'Nenhuma referência encontrada para este serviço.';
  }

  return `${impact.totalReferences} referência(s) encontrada(s). A inativação preserva o histórico, mas o serviço deixa de ficar disponível para novos vínculos e composições.`;
}
