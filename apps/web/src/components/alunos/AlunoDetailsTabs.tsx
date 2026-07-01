import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
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
    label: 'Treino de Hoje/Planos',
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
  label: string;
  description: string;
}> = [
  {
    id: 'selectedStudent',
    label: 'Aluno 360',
    description: 'Resumo do aluno, treino de hoje e planos.',
  },
  {
    id: 'technicalFlow',
    label: 'Fluxo tecnico',
    description: 'Prontuario, avaliacoes, plano tecnico e historico.',
  },
  {
    id: 'records',
    label: 'Cadastro e vinculos',
    description: 'Cadastro, contrato e revisoes cadastrais.',
  },
  {
    id: 'operations',
    label: 'Conexoes',
    description: 'Integracoes e dados externos do aluno.',
  },
];

export function getTabBlockKey(tab: AlunoDetailsTab): AccessBlockKey | undefined {
  return tabs.find((t) => t.id === tab)?.blockKey;
}

export function AlunoDetailsTabs({ activeTab, onChange, visibleTabs }: AlunoDetailsTabsProps) {
  const [openGroupId, setOpenGroupId] = useState<AlunoDetailsTabGroup | null>(null);
  const tabsToRender = visibleTabs
    ? tabs.filter((tab) => visibleTabs.includes(tab.id))
    : tabs;

  const groupedTabs = tabGroups
    .map((group) => ({
      ...group,
      tabs: tabsToRender.filter((tab) => tab.group === group.id),
    }))
    .filter((group) => group.tabs.length > 0);

  const activeGroup =
    groupedTabs.find((group) => group.tabs.some((tab) => tab.id === activeTab)) ??
    groupedTabs[0];

  if (!activeGroup) {
    return null;
  }

  return (
    <nav
      id="aluno-details-tabs"
      aria-label="Menu da consulta do aluno"
      className="relative z-20 rounded-lg border border-border bg-card shadow-[var(--shadow-soft)]"
    >
      <div role="menubar" aria-label="Blocos da consulta do aluno" className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1">
        {groupedTabs.map((group) => {
          const active = activeGroup.id === group.id;
          const open = openGroupId === group.id;

          return (
            <div key={group.id} className="relative">
              <button
                type="button"
                role="menuitem"
                id={`aluno-details-menu-${group.id}`}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={`aluno-details-submenu-${group.id}`}
                title={group.description}
                onClick={() =>
                  setOpenGroupId((currentGroupId) =>
                    currentGroupId === group.id ? null : group.id
                  )
                }
                className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  open
                    ? 'bg-accent text-accent-foreground'
                    : active
                      ? 'bg-primary/10 text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {group.label}
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              {open && (
                <div
                  id={`aluno-details-submenu-${group.id}`}
                  role="menu"
                  aria-labelledby={`aluno-details-menu-${group.id}`}
                  className="absolute left-0 top-full z-50 mt-1 w-[340px] rounded-lg border border-border bg-popover p-1 shadow-[var(--shadow-card)]"
                >
                  {group.tabs.map((tab) => {
                    const selected = activeTab === tab.id;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="menuitem"
                        id={`aluno-details-tab-${tab.id}`}
                        aria-current={selected ? 'page' : undefined}
                        title={tab.description}
                        onClick={() => {
                          onChange(tab.id);
                          setOpenGroupId(null);
                        }}
                        className={`flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${
                          selected
                            ? 'bg-primary/10 text-foreground'
                            : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border bg-card">
                          {selected && <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold leading-5">{tab.label}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                            {tab.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export type { AlunoDetailsTab };
