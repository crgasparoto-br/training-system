import type { AccessBlockKey } from '@corrida/types';

type AlunoDetailsTab =
  | 'resumo'
  | 'cadastro'
  | 'saude-anamnese'
  | 'avaliacoes-fisicas'
  | 'financeiro'
  | 'plano-avaliacoes'
  | 'revisoes-cadastrais'
  | 'integracoes'
  | 'treinos'
  | 'auditoria';

type AlunoDetailsTabsProps = {
  activeTab: AlunoDetailsTab;
  onChange: (tab: AlunoDetailsTab) => void;
  visibleTabs?: AlunoDetailsTab[];
};

const tabs: Array<{ id: AlunoDetailsTab; label: string; blockKey?: AccessBlockKey }> = [
  { id: 'resumo', label: 'Visão geral', blockKey: 'students.details.summary' },
  { id: 'cadastro', label: 'Dados do aluno', blockKey: 'students.details.profile' },
  { id: 'saude-anamnese', label: 'Anamnese e questionários', blockKey: 'students.details.health' },
  { id: 'avaliacoes-fisicas', label: 'Avaliações profissionais', blockKey: 'students.details.assessments' },
  { id: 'financeiro', label: 'Financeiro', blockKey: 'students.details.financialContract' },
  { id: 'plano-avaliacoes', label: 'Plano de avaliações', blockKey: 'students.details.assessmentPlan' },
  { id: 'revisoes-cadastrais', label: 'Revisões cadastrais', blockKey: 'students.details.profileReviews' },
  { id: 'integracoes', label: 'Integrações', blockKey: 'students.details.integrations' },
  { id: 'treinos', label: 'Treinos e planos', blockKey: 'students.details.trainingPlans' },
  { id: 'auditoria', label: 'Histórico', blockKey: 'students.details.audit' },
];

export function getTabBlockKey(tab: AlunoDetailsTab): AccessBlockKey | undefined {
  return tabs.find((t) => t.id === tab)?.blockKey;
}

export function AlunoDetailsTabs({ activeTab, onChange, visibleTabs }: AlunoDetailsTabsProps) {
  const tabsToRender = visibleTabs
    ? tabs.filter((tab) => visibleTabs.includes(tab.id))
    : tabs;

  return (
    <div className="overflow-x-auto">
      <div role="tablist" aria-label="Guias dos detalhes do aluno" className="ts-tabs-bar">
        {tabsToRender.map((tab) => {
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
  );
}

export type { AlunoDetailsTab };
