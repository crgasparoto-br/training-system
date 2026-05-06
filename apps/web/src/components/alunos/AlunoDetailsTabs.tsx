import type { AccessBlockKey } from '@corrida/types';

type AlunoDetailsTab =
  | 'resumo'
  | 'cadastro'
  | 'saude-anamnese'
  | 'financeiro'
  | 'plano-avaliacoes'
  | 'avaliacoes-fisicas'
  | 'revisoes-cadastrais'
  | 'treinos'
  | 'auditoria';

type AlunoDetailsTabsProps = {
  activeTab: AlunoDetailsTab;
  onChange: (tab: AlunoDetailsTab) => void;
  visibleTabs?: AlunoDetailsTab[];
};

const tabs: Array<{ id: AlunoDetailsTab; label: string; blockKey?: AccessBlockKey }> = [
  { id: 'resumo', label: 'Resumo', blockKey: 'students.details.summary' },
  { id: 'cadastro', label: 'Cadastro', blockKey: 'students.details.profile' },
  { id: 'saude-anamnese', label: 'Saúde / Anamnese', blockKey: 'students.details.health' },
  { id: 'financeiro', label: 'Financeiro / Contrato', blockKey: 'students.details.financialContract' },
  { id: 'plano-avaliacoes', label: 'Plano de Avaliações', blockKey: 'students.details.assessmentPlan' },
  { id: 'avaliacoes-fisicas', label: 'Avaliações Físicas', blockKey: 'students.details.assessments' },
  { id: 'revisoes-cadastrais', label: 'Revisões Cadastrais', blockKey: 'students.details.profileReviews' },
  { id: 'treinos', label: 'Treinos / Planos', blockKey: 'students.details.trainingPlans' },
  { id: 'auditoria', label: 'Histórico / Auditoria', blockKey: 'students.details.audit' },
];

export function getTabBlockKey(tab: AlunoDetailsTab): AccessBlockKey | undefined {
  return tabs.find((t) => t.id === tab)?.blockKey;
}

export function AlunoDetailsTabs({ activeTab, onChange, visibleTabs }: AlunoDetailsTabsProps) {
  const tabsToRender = visibleTabs
    ? tabs.filter((tab) => visibleTabs.includes(tab.id))
    : tabs;

  return (
    <div className="overflow-x-auto border-b">
      <div className="flex min-w-max gap-2 px-1">
        {tabsToRender.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export type { AlunoDetailsTab };
