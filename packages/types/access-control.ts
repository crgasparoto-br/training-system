export const ACCESS_SCREEN_CATALOG = [
  { key: 'students.registration', label: 'Cadastro de alunos' },
  { key: 'collaborators.registration', label: 'Cadastro de colaboradores' },
  { key: 'hourlyRateLevels.registration', label: 'Valores de hora/aula' },
  { key: 'physicalAssessment.protocol', label: 'Protocolo de avaliacao fisica' },
  { key: 'students.consultation', label: 'Consulta de alunos' },
  { key: 'collaborators.consultation', label: 'Consulta de colaboradores' },
  { key: 'plans', label: 'Planos' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'library', label: 'Biblioteca' },
  { key: 'executions', label: 'Execucoes' },
  { key: 'reports', label: 'Relatorios' },
  { key: 'settings.home', label: 'Configuracoes' },
  { key: 'settings.contract', label: 'Contrato' },
  { key: 'settings.parameters', label: 'Parametros' },
  { key: 'settings.assessmentTypes', label: 'Tipos de avaliacao' },
  { key: 'settings.services', label: 'Servicos' },
  { key: 'settings.banks', label: 'Bancos' },
  { key: 'settings.collaboratorFunctions', label: 'Funcoes de colaboradores' },
  { key: 'settings.subjectiveScales', label: 'PSR e PSE' },
  { key: 'settings.professorManual', label: 'Manual do professor' },
  { key: 'settings.alunoAccess', label: 'Cadastro de alunos' },
  { key: 'settings.referenceTable', label: 'Tabela de referencia' },
] as const;

export type AccessScreenKey = (typeof ACCESS_SCREEN_CATALOG)[number]['key'];

export const ACCESS_PERMISSION_GROUPS = [
  {
    key: 'registrations',
    label: 'Cadastros',
    screenKeys: [
      'students.registration',
      'collaborators.registration',
      'hourlyRateLevels.registration',
    ],
  },
  {
    key: 'physicalAssessment',
    label: 'Avaliacao fisica',
    screenKeys: ['physicalAssessment.protocol'],
  },
  {
    key: 'consultations',
    label: 'Consultas',
    screenKeys: ['students.consultation', 'collaborators.consultation'],
  },
  {
    key: 'operation',
    label: 'Operacao',
    screenKeys: ['plans', 'agenda', 'library', 'executions', 'reports'],
  },
  {
    key: 'settings',
    label: 'Configuracoes',
    screenKeys: [
      'settings.home',
      'settings.contract',
      'settings.parameters',
      'settings.assessmentTypes',
      'settings.services',
      'settings.banks',
      'settings.collaboratorFunctions',
      'settings.subjectiveScales',
      'settings.professorManual',
      'settings.alunoAccess',
      'settings.referenceTable',
    ],
  },
] as const satisfies readonly {
  key: string;
  label: string;
  screenKeys: readonly AccessScreenKey[];
}[];

export const ACCESS_BLOCK_CATALOG = [
  {
    key: 'collaborators.registration.collaborator',
    screenKey: 'collaborators.registration',
    label: 'Aba Colaborador',
  },
  {
    key: 'collaborators.registration.manager',
    screenKey: 'collaborators.registration',
    label: 'Aba Gestor',
  },
] as const;

export type AccessBlockKey = (typeof ACCESS_BLOCK_CATALOG)[number]['key'];

export interface AccessPermission {
  id?: string;
  collaboratorFunctionId?: string;
  screenKey: AccessScreenKey | string;
  blockKey?: AccessBlockKey | string | null;
  canView: boolean;
}

export interface AccessPermissionSelection {
  screens: Array<AccessScreenKey | string>;
  blocks: Array<AccessBlockKey | string>;
}

export interface AccessControlPayload {
  isMaster: boolean;
  permissions: AccessPermission[];
}

export const ALL_ACCESS_SCREEN_KEYS = ACCESS_SCREEN_CATALOG.map((item) => item.key);
export const ALL_ACCESS_BLOCK_KEYS = ACCESS_BLOCK_CATALOG.map((item) => item.key);

const commonProfessorScreens = [
  'students.registration',
  'physicalAssessment.protocol',
  'students.consultation',
  'plans',
  'agenda',
  'library',
  'executions',
  'reports',
  'settings.home',
  'settings.contract',
  'settings.parameters',
  'settings.assessmentTypes',
  'settings.subjectiveScales',
  'settings.professorManual',
  'settings.referenceTable',
] as const satisfies readonly AccessScreenKey[];

export const DEFAULT_ACCESS_BY_PROFILE_CODE = {
  professor: {
    screens: [...commonProfessorScreens, 'collaborators.registration'],
    blocks: ['collaborators.registration.collaborator'],
  },
  manager: {
    screens: [
      ...commonProfessorScreens,
      'collaborators.registration',
      'collaborators.consultation',
    ],
    blocks: [
      'collaborators.registration.collaborator',
      'collaborators.registration.manager',
    ],
  },
  intern: {
    screens: commonProfessorScreens,
    blocks: [],
  },
  administrative: {
    screens: commonProfessorScreens,
    blocks: [],
  },
  cleaning: {
    screens: commonProfessorScreens,
    blocks: [],
  },
  services: {
    screens: commonProfessorScreens,
    blocks: [],
  },
} as const satisfies Record<
  string,
  {
    screens: readonly AccessScreenKey[];
    blocks: readonly AccessBlockKey[];
  }
>;

export const FALLBACK_ACCESS_PROFILE_CODE = 'professor';
