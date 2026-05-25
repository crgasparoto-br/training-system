import type { AccessBlockKey } from '@corrida/types';

type AlunoDetailsTab =
  | 'resumo'
  | 'cadastro'
  | 'saude-anamnese'
  | 'financeiro'
  | 'plano-avaliacoes'
  | 'avaliacoes-fisicas'
  | 'revisoes-cadastrais'
  | 'integracoes'
  | 'treinos'
  | 'auditoria';

type AlunoDetailsTabsProps = {
  activeTab: AlunoDetailsTab;
  onChange: (tab: AlunoDetailsTab) => void;
  visibleTabs?: AlunoDetailsTab[];
};

type AlunoDetailsTabGroup = 'registrations' | 'consultations';

const tabs: Array<{
  id: AlunoDetailsTab;
  label: string;
  group: AlunoDetailsTabGroup;
  blockKey?: AccessBlockKey;
}> = [
  { id: 'cadastro', label: 'Cadastro', group: 'registrations', blockKey: 'students.details.profile' },
  {
    id: 'saude-anamnese',
    label: 'Saúde / Anamnese',
    group: 'registrations',
    blockKey: 'students.details.health',
  },
  {
    id: 'financeiro',
    label: 'Financeiro / Contrato',
    group: 'registrations',
    blockKey: 'students.details.financialContract',
  },
  {
    id: 'plano-avaliacoes',
    label: 'Plano de Avaliações',
    group: 'registrations',
    blockKey: 'students.details.assessmentPlan',
  },
  {
    id: 'revisoes-cadastrais',
    label: 'Revisões Cadastrais',
    group: 'registrations',
    blockKey: 'students.details.profileReviews',
  },
  { id: 'resumo', label: 'Resumo', group: 'consultations', blockKey: 'students.details.summary' },
  {
    id: 'avaliacoes-fisicas',
    label: 'Avaliações Físicas',
    group: 'consultations',
    blockKey: 'students.details.assessments',
  },
  {
    id: 'integracoes',
    label: 'Integrações',
    group: 'consultations',
    blockKey: 'students.details.integrations',
  },
  { id: 'treinos', label: 'Treinos / Planos', group: 'consultations', blockKey: 'students.details.trainingPlans' },
  { id: 'auditoria', label: 'Histórico / Auditoria', group: 'consultations', blockKey: 'students.details.audit' },
];

const tabGroups: Array<{
  id: AlunoDetailsTabGroup;
  badge: string;
  title: string;
  description: string;
}> = [
  {
    id: 'registrations',
    badge: 'Cadastros',
    title: 'Informações de cadastro do aluno',
    description: 'Mantenha a base cadastral, clínica e administrativa organizada em um bloco próprio.',
  },
  {
    id: 'consultations',
    badge: 'Consultas',
    title: 'Informações de consulta e acompanhamento',
    description: 'Acompanhe leitura operacional, avaliações, treinos e histórico sem misturar com manutenção cadastral.',
  },
];

export function getTabBlockKey(tab: AlunoDetailsTab): AccessBlockKey | undefined {
  return tabs.find((t) => t.id === tab)?.blockKey;
}

export function AlunoDetailsTabs({ activeTab, onChange, visibleTabs }: AlunoDetailsTabsProps) {
  const tabsToRender = visibleTabs
    ? tabs.filter((tab) => visibleTabs.includes(tab.id))
    : tabs;

  const groupedTabs = tabGroups
    .map((group) => ({
      ...group,
      tabs: tabsToRender.filter((tab) => tab.group === group.id),
    }))
    .filter((group) => group.tabs.length > 0);

  return (
    <div className="space-y-4">
      {groupedTabs.map((group) => (
        <div key={group.id} className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="mb-3 space-y-1">
            <span className="inline-flex rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.badge}
            </span>
            <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </div>

          <div className="overflow-x-auto">
            <div role="tablist" aria-label={group.title} className="ts-tabs-bar">
              {group.tabs.map((tab) => {
                const selected = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    id={`aluno-details-tab-${tab.id}`}
                    aria-selected={selected}
                    onClick={() => onChange(tab.id)}
                    className={`ts-tab-button ${selected ? 'ts-tab-button-active' : 'ts-tab-button-inactive'}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export type { AlunoDetailsTab };
