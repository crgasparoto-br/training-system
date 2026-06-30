import { useState } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
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
  const [expandedGroupId, setExpandedGroupId] = useState<AlunoDetailsTabGroup | null>(null);
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
  const expandedGroup = groupedTabs.find((group) => group.id === expandedGroupId);

  if (!activeGroup) {
    return null;
  }

  return (
    <nav
      id="aluno-details-tabs"
      aria-label="Menu da consulta do aluno"
      className="rounded-lg border border-border bg-card p-3 shadow-[var(--shadow-soft)]"
    >
      <div className="overflow-x-auto">
        <div role="menubar" aria-label="Blocos da consulta do aluno" className="ts-tabs-bar">
          {groupedTabs.map((group) => {
            const selected = activeGroup.id === group.id;
            const expanded = expandedGroupId === group.id;

            return (
              <button
                key={group.id}
                type="button"
                role="menuitem"
                id={`aluno-details-menu-${group.id}`}
                aria-expanded={expanded}
                aria-controls={`aluno-details-submenu-${group.id}`}
                title={group.description}
                onClick={() =>
                  setExpandedGroupId((currentGroupId) =>
                    currentGroupId === group.id ? null : group.id
                  )
                }
                className={`ts-tab-button ${selected || expanded ? 'ts-tab-button-active' : 'ts-tab-button-inactive'}`}
              >
                <Folder className="h-4 w-4" aria-hidden="true" />
                {group.label}
              </button>
            );
          })}
        </div>
      </div>

      {expandedGroup && (
        <div
          id={`aluno-details-submenu-${expandedGroup.id}`}
          role="menu"
          aria-labelledby={`aluno-details-menu-${expandedGroup.id}`}
          className="mt-3 w-full rounded-lg border border-border bg-popover p-2 shadow-[var(--shadow-card)] md:max-w-md"
        >
          {expandedGroup.tabs.map((tab) => {
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
                  setExpandedGroupId(null);
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  selected
                    ? 'bg-primary text-primary-foreground'
                    : 'text-popover-foreground hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                <span className="min-w-0 truncate">{tab.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}

export type { AlunoDetailsTab };
