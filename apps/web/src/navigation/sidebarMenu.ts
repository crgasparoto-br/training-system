import {
  Activity,
  BarChart3,
  Briefcase,
  FileText,
  Search,
  Settings,
} from 'lucide-react';
import { ACCESS_SCREEN_CATALOG } from '@corrida/types';
import type { SidebarNavItem } from '../components/sidebar';

export type PermissionTreeRow =
  | { kind: 'sub-header'; id: string; label: string; depth: number }
  | {
      kind: 'screen';
      id: string;
      screenKey: string;
      label: string;
      depth: number;
    };

export type PermissionTreeGroup = {
  id: string;
  label: string;
  screenKeys: string[];
  rows: PermissionTreeRow[];
};

type PermissionAttachedItem = {
  id: string;
  label: string;
  screenKey?: string;
  children?: PermissionAttachedItem[];
};

type PermissionNavItem = Omit<SidebarNavItem, 'children'> & {
  children?: PermissionNavItem[];
};

export const sidebarMenuItems: SidebarNavItem[] = [
  {
    id: 'atendimento',
    icon: Search,
    label: 'Alunos',
    description: 'Consulta, cadastro e acompanhamento',
    children: [
      {
        id: 'atendimento-consultas',
        label: 'Operação do aluno',
        children: [
          {
            id: 'consultas-alunos',
            label: 'Consultar alunos',
            path: '/consultas/alunos',
            screenKey: 'students.consultation',
          },
          {
            id: 'alunos',
            label: 'Novo aluno',
            path: '/alunos/new',
            screenKey: 'students.registration',
          },
        ],
      },
      {
        id: 'atendimento-cadastros',
        label: 'Acessos',
        children: [
          {
            id: 'settings-aluno-access',
            label: 'Acesso dos alunos',
            path: '/settings/aluno-access',
            screenKey: 'settings.alunoAccess',
          },
        ],
      },
    ],
  },
  {
    id: 'treinamento',
    icon: Activity,
    label: 'Treinamento',
    description: 'Planejamento e execução',
    children: [
      { id: 'plans', label: 'Planos de treino', path: '/plans', screenKey: 'plans' },
      {
        id: 'executions',
        label: 'Execuções dos alunos',
        path: '/executions',
        screenKey: 'executions',
      },
      {
        id: 'library',
        label: 'Biblioteca de exercícios',
        path: '/library',
        screenKey: 'library',
      },
    ],
  },
  {
    id: 'agenda-hub',
    icon: BarChart3,
    label: 'Agenda',
    description: 'Sessões e compromissos',
    children: [
      { id: 'agenda', label: 'Agenda geral', path: '/agenda', screenKey: 'agenda' },
    ],
  },
  {
    id: 'physical-assessment-protocol',
    icon: FileText,
    label: 'Avaliações',
    description: 'Protocolos e medidas',
    screenKey: 'physicalAssessment.protocol',
    children: [
      {
        id: 'physical-assessment-protocol-anthropometry',
        label: 'Antropometria',
        path: '/protocolo-avaliacao-fisica/antropometria',
        screenKey: 'physicalAssessment.protocol',
      },
      {
        id: 'physical-assessment-protocol-interview',
        label: 'Prontuário e acompanhamento',
        path: '/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento',
        screenKey: 'physicalAssessment.protocol',
      },
      {
        id: 'physical-assessment-protocol-adipometry',
        label: 'Adipometria',
        path: '/protocolo-avaliacao-fisica/adipometria',
        screenKey: 'physicalAssessment.protocol',
      },
      {
        id: 'physical-assessment-protocol-bioimpedance',
        label: 'Bioimpedanciometria',
        path: '/protocolo-avaliacao-fisica/bioimpedanciometria',
        screenKey: 'physicalAssessment.protocol',
      },
      {
        id: 'physical-assessment-protocol-ultrasound',
        label: 'Ultrassonografia',
        path: '/protocolo-avaliacao-fisica/ultrassonografia',
        screenKey: 'physicalAssessment.protocol',
      },
    ],
  },
  {
    id: 'gestao',
    icon: Briefcase,
    label: 'Gestão',
    description: 'Equipe, comercial e indicadores',
    children: [
      {
        id: 'gestao-colaboradores',
        label: 'Colaboradores',
        children: [
          {
            id: 'consultas-colaboradores',
            label: 'Consultar colaboradores',
            path: '/consultas/colaboradores',
            screenKey: 'collaborators.consultation',
          },
          {
            id: 'professores',
            label: 'Novo colaborador',
            path: '/professores',
            screenKey: 'collaborators.registration',
          },
        ],
      },
      {
        id: 'gestao-comercial',
        label: 'Comercial',
        children: [
          {
            id: 'settings-services',
            label: 'Serviços e planos',
            path: '/settings/services',
            screenKey: 'settings.services',
          },
          {
            id: 'hourly-rate-levels',
            label: 'Valores de hora/aula',
            path: '/cadastros/valores-hora-aula',
            screenKey: 'hourlyRateLevels.registration',
          },
          {
            id: 'settings-contract',
            label: 'Empresa / prestador',
            path: '/settings/contract',
            screenKey: 'settings.contract',
          },
        ],
      },
      {
        id: 'gestao-indicadores',
        label: 'Indicadores',
        children: [
          { id: 'reports', label: 'Relatórios', path: '/reports', screenKey: 'reports' },
        ],
      },
    ],
  },
  {
    id: 'settings',
    icon: Settings,
    label: 'Configurações',
    description: 'Parâmetros e cadastros de suporte',
    path: '/settings',
    screenKey: 'settings.home',
    children: [
      {
        id: 'settings-system',
        label: 'Sistema',
        children: [
          {
            id: 'settings-parameters',
            label: 'Parâmetros de treino',
            path: '/settings/parameters',
            screenKey: 'settings.parameters',
          },
          {
            id: 'settings-psr-pse',
            label: 'Escalas PSR e PSE',
            path: '/settings/psr-pse',
            screenKey: 'settings.subjectiveScales',
          },
          {
            id: 'settings-professor-manual',
            label: 'Manual do professor',
            path: '/settings/professor-manual',
            screenKey: 'settings.professorManual',
          },
          {
            id: 'settings-reference-table',
            label: 'Tabela de referência',
            path: '/settings/reference-table',
            screenKey: 'settings.referenceTable',
          },
        ],
      },
      {
        id: 'settings-assessments',
        label: 'Avaliações',
        children: [
          {
            id: 'settings-assessment-types',
            label: 'Tipos de avaliação',
            path: '/settings/assessment-types',
            screenKey: 'settings.assessmentTypes',
          },
        ],
      },
      {
        id: 'settings-contracts',
        label: 'Contratos e financeiro',
        children: [
          {
            id: 'settings-contract-templates',
            label: 'Modelos de contrato',
            path: '/settings/contract-templates',
            screenKey: 'settings.contract',
          },
          {
            id: 'settings-banks',
            label: 'Bancos',
            path: '/settings/banks',
            screenKey: 'settings.banks',
          },
        ],
      },
      {
        id: 'settings-access',
        label: 'Permissões',
        children: [
          {
            id: 'settings-collaborator-functions',
            label: 'Funções de colaboradores',
            path: '/settings/collaborator-functions',
            screenKey: 'settings.collaboratorFunctions',
          },
        ],
      },
    ],
  },
];

const attachedPermissionItemsByMenuId: Record<string, PermissionAttachedItem[]> = {
  'consultas-alunos': [
    {
      id: 'students-details',
      label: 'Detalhes do aluno',
      screenKey: 'students.details',
    },
  ],
};

function withAttachedPermissionItems(item: SidebarNavItem): PermissionNavItem {
  const children = [
    ...(item.children?.map(withAttachedPermissionItems) ?? []),
    ...(attachedPermissionItemsByMenuId[item.id] ?? []),
  ];

  return {
    ...item,
    children: children.length > 0 ? children : undefined,
  };
}

function buildPermissionRows(
  items: PermissionNavItem[],
  depth: number,
  seenScreenKeys: Set<string>,
): PermissionTreeRow[] {
  const rows: PermissionTreeRow[] = [];

  for (const item of items) {
    const screenKey = item.screenKey as string | undefined;

    if (screenKey && !seenScreenKeys.has(screenKey)) {
      seenScreenKeys.add(screenKey);
      rows.push({
        kind: 'screen',
        id: `screen-${item.id}`,
        screenKey,
        label: item.label,
        depth,
      });
    } else if (item.children?.length) {
      rows.push({
        kind: 'sub-header',
        id: `sub-header-${item.id}`,
        label: item.label,
        depth,
      });
    }

    if (item.children?.length) {
      rows.push(...buildPermissionRows(item.children, depth + 1, seenScreenKeys));
    }
  }

  return rows;
}

function collectScreenKeys(items: PermissionNavItem[], screenKeys = new Set<string>()): Set<string> {
  for (const item of items) {
    if (item.screenKey) {
      screenKeys.add(item.screenKey);
    }
    if (item.children?.length) {
      collectScreenKeys(item.children, screenKeys);
    }
  }
  return screenKeys;
}

const permissionMenuItems = sidebarMenuItems.map(withAttachedPermissionItems);
const menuPermissionScreenKeys = collectScreenKeys(permissionMenuItems);

export const permissionTreeGroups: PermissionTreeGroup[] = [
  ...permissionMenuItems
    .map((item) => {
      const screenKeys = Array.from(collectScreenKeys([item]));
      const rows = buildPermissionRows([item], 0, new Set<string>());
      return screenKeys.length > 0
        ? {
            id: item.id,
            label: item.label,
            screenKeys,
            rows,
          }
        : null;
    })
    .filter((group): group is PermissionTreeGroup => group !== null),
  ...(() => {
    const internalScreens = ACCESS_SCREEN_CATALOG.filter(
      (screen) => !menuPermissionScreenKeys.has(screen.key),
    );

    if (internalScreens.length === 0) {
      return [];
    }

    return [
      {
        id: 'internal',
        label: 'Permissões internas',
        screenKeys: internalScreens.map((screen) => screen.key),
        rows: internalScreens.map((screen) => ({
          kind: 'screen' as const,
          id: `screen-${screen.key}`,
          screenKey: screen.key,
          label: screen.label,
          depth: 0,
        })),
      },
    ];
  })(),
];
