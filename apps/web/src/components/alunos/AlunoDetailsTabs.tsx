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

type AlunoDetailsTabGroup = 'selectedStudent' | 'technicalFlow' | 'operations' | 'records';

const tabs: Array<{
  id: AlunoDetailsTab;
  label: string;
  description: string;
  group: AlunoDetailsTabGroup;
  blockKey?: AccessBlockKey;
}> = [
  {
    id: 'resumo',
    label: 'Aluno 360',
    description: 'Resumo, status, proximas acoes e treino de hoje no contexto do aluno.',
    group: 'selectedStudent',
    blockKey: 'students.details.summary',
  },
  {
    id: 'treinos',
    label: 'Treino de hoje / Planos',
    description: 'Treino operacional, planos e agenda de treinamento preservados.',
    group: 'selectedStudent',
    blockKey: 'students.details.trainingPlans',
  },
  {
    id: 'saude-anamnese',
    label: 'Prontuario',
    description: 'Saude, anamnese, PAR-Q/AHA e pontos de atencao.',
    group: 'technicalFlow',
    blockKey: 'students.details.health',
  },
  {
    id: 'avaliacoes-fisicas',
    label: 'Avaliacao Fisica',
    description: 'Historico de avaliacoes e dados-base do acompanhamento.',
    group: 'technicalFlow',
    blockKey: 'students.details.assessments',
  },
  {
    id: 'plano-avaliacoes',
    label: 'Plano de Avaliacoes',
    description: 'Cadencia e proximos checkpoints avaliativos.',
    group: 'technicalFlow',
    blockKey: 'students.details.assessmentPlan',
  },
  {
    id: 'auditoria',
    label: 'Historico / Evolucao',
    description: 'Linha do tempo, auditoria e evolucao do aluno.',
    group: 'technicalFlow',
    blockKey: 'students.details.audit',
  },
  {
    id: 'cadastro',
    label: 'Cadastro',
    description: 'Dados informados pelo aluno e pela equipe.',
    group: 'records',
    blockKey: 'students.details.profile',
  },
  {
    id: 'financeiro',
    label: 'Financeiro / Contrato',
    description: 'Servico vigente, contrato e regras comerciais.',
    group: 'records',
    blockKey: 'students.details.financialContract',
  },
  {
    id: 'revisoes-cadastrais',
    label: 'Revisoes Cadastrais',
    description: 'Confirmacoes periodicas e historico de atualizacao.',
    group: 'records',
    blockKey: 'students.details.profileReviews',
  },
  {
    id: 'integracoes',
    label: 'Integracoes',
    description: 'Contas conectadas e dados externos quando existirem.',
    group: 'operations',
    blockKey: 'students.details.integrations',
  },
];

const tabGroups: Array<{
  id: AlunoDetailsTabGroup;
  badge: string;
  title: string;
  description: string;
}> = [
  {
    id: 'selectedStudent',
    badge: 'Aluno 360',
    title: 'Resumo operacional do aluno',
    description: 'Comece pelo contexto geral, treino de hoje e planos sem sair da tela do aluno.',
  },
  {
    id: 'technicalFlow',
    badge: 'Fluxo tecnico',
    title: 'Prontuario, avaliacao, prescricao futura e evolucao',
    description: 'Use estas entradas para preparar a prescricao por capacidades e a montagem consolidada nas proximas fases.',
  },
  {
    id: 'records',
    badge: 'Cadastro e vinculos',
    title: 'Dados cadastrais, contrato e revisoes',
    description: 'Separe informacoes administrativas, contrato vigente e confirmacoes periodicas dos dados tecnicos.',
  },
  {
    id: 'operations',
    badge: 'Conexoes',
    title: 'Integracoes e evidencias externas',
    description: 'Mantenha dados externos como evidencia complementar, sem substituir validacao do professor.',
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
    <div className="space-y-4" id="aluno-details-tabs">
      {groupedTabs.map((group) => (
        <section key={group.id} className="rounded-lg border border-border bg-muted/20 p-4">
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
                    title={tab.description}
                    onClick={() => onChange(tab.id)}
                    className={`ts-tab-button ${selected ? 'ts-tab-button-active' : 'ts-tab-button-inactive'}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

export type { AlunoDetailsTab };
