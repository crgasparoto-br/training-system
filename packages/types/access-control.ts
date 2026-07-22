export const ACCESS_SCREEN_CATALOG = [
  { key: 'students.registration', label: 'Cadastro de alunos' },
  { key: 'students.details', label: 'Detalhes do aluno' },
  { key: 'students.preRegistration', label: 'Gestão de leads e pré-matrículas' },
  { key: 'students.assessmentPlan', label: 'Plano de avaliacoes do aluno' },
  { key: 'students.profileReview', label: 'Revisao cadastral do aluno' },
  { key: 'students.financialData', label: 'Dados financeiros do aluno' },
  { key: 'students.contracts.view', label: 'Visualizar contratos do aluno' },
  { key: 'students.contracts.manage', label: 'Gerenciar contratos do aluno' },
  { key: 'students.contracts.cancel', label: 'Cancelar contratos do aluno' },
  { key: 'students.contracts.renew', label: 'Renovar contratos do aluno' },
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
  { key: 'studentApp.access', label: 'Acesso do aluno ao app' },
  { key: 'settings.referenceTable', label: 'Tabela de referencia' },
] as const;

export type AccessScreenKey = (typeof ACCESS_SCREEN_CATALOG)[number]['key'];

export const ACCESS_PERMISSION_GROUPS = [
  {
    key: 'registrations',
    label: 'Cadastros',
    screenKeys: [
      'students.registration',
      'students.preRegistration',
      'students.assessmentPlan',
      'students.profileReview',
      'students.financialData',
      'students.contracts.view',
      'students.contracts.manage',
      'students.contracts.cancel',
      'students.contracts.renew',
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
    screenKeys: [
      'students.consultation',
      'students.details',
      'collaborators.consultation',
    ],
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
      'studentApp.access',
      'settings.referenceTable',
    ],
  },
] as const satisfies readonly {
  key: string;
  label: string;
  screenKeys: readonly AccessScreenKey[];
}[];

export const ACCESS_BLOCK_CATALOG = [
  { key: 'students.registration.identification', screenKey: 'students.registration', label: 'Aba Identificação' },
  { key: 'students.registration.parq', screenKey: 'students.registration', label: 'Aba Questionário PAR-Q' },
  { key: 'students.registration.aha', screenKey: 'students.registration', label: 'Aba Questionário American Heart Association' },
  { key: 'students.registration.financial', screenKey: 'students.registration', label: 'Aba Financeiro' },
  { key: 'students.registration.preferences', screenKey: 'students.registration', label: 'Aba Preferências' },
  { key: 'students.registration.initialAnamnesis', screenKey: 'students.registration', label: 'Aba Anamnese Inicial' },
  { key: 'students.details.summary', screenKey: 'students.details', label: 'Aba Resumo' },
  { key: 'students.details.profile', screenKey: 'students.details', label: 'Aba Cadastro' },
  { key: 'students.details.health', screenKey: 'students.details', label: 'Aba Saude / Anamnese' },
  { key: 'students.details.financialContract', screenKey: 'students.details', label: 'Aba Financeiro / Contrato' },
  { key: 'students.details.assessmentPlan', screenKey: 'students.details', label: 'Aba Plano de Avaliacoes' },
  { key: 'students.details.assessments', screenKey: 'students.details', label: 'Aba Avaliacoes Fisicas' },
  { key: 'students.details.profileReviews', screenKey: 'students.details', label: 'Aba Revisoes Cadastrais' },
  { key: 'students.details.trainingPlans', screenKey: 'students.details', label: 'Aba Treinos / Planos' },
  { key: 'students.details.integrations', screenKey: 'students.details', label: 'Aba Integracoes' },
  { key: 'students.details.audit', screenKey: 'students.details', label: 'Historico / Auditoria' },
  { key: 'students.actions.editProfile', screenKey: 'students.details', label: 'Acao: Editar cadastro do aluno' },
  { key: 'students.actions.deleteStudent', screenKey: 'students.details', label: 'Acao: Excluir aluno' },
  { key: 'students.actions.resetPassword', screenKey: 'students.details', label: 'Acao: Redefinir senha do aluno' },
  { key: 'students.actions.manageAssessments', screenKey: 'students.details', label: 'Acao: Gerenciar avaliacoes fisicas' },
  { key: 'students.actions.manageFinancialContract', screenKey: 'students.details', label: 'Acao: Gerenciar financeiro/contrato' },
  { key: 'students.actions.manageProfileReviews', screenKey: 'students.details', label: 'Acao: Gerenciar revisoes cadastrais' },
  { key: 'students.actions.manageAssessmentPlan', screenKey: 'students.details', label: 'Acao: Gerenciar plano de avaliacoes' },
  { key: 'students.actions.manageEnrollmentInvite', screenKey: 'students.details', label: 'Acao: Gerenciar convite de pre-cadastro' },
  { key: 'students.preRegistration.create', screenKey: 'students.preRegistration', label: 'Ação: Criar lead' },
  { key: 'students.preRegistration.editCommercial', screenKey: 'students.preRegistration', label: 'Ação: Editar dados comerciais do lead' },
  { key: 'students.preRegistration.generateInvite', screenKey: 'students.preRegistration', label: 'Ação: Gerar ou substituir convite' },
  { key: 'students.preRegistration.revokeInvite', screenKey: 'students.preRegistration', label: 'Ação: Revogar convite' },
  { key: 'students.preRegistration.review', screenKey: 'students.preRegistration', label: 'Ação: Revisar pré-matrícula' },
  { key: 'students.preRegistration.discardReopen', screenKey: 'students.preRegistration', label: 'Ação: Descartar ou reabrir lead' },
  { key: 'students.preRegistration.convert', screenKey: 'students.preRegistration', label: 'Ação: Converter em aluno ativo' },
  { key: 'collaborators.registration.collaborator', screenKey: 'collaborators.registration', label: 'Aba Colaborador' },
  { key: 'collaborators.registration.manager', screenKey: 'collaborators.registration', label: 'Aba Gestor' },
  { key: 'collaborators.actions.validateLegalFinancial', screenKey: 'collaborators.registration', label: 'Acao: Validar juridico/financeiro do colaborador' },
  { key: 'collaborators.actions.resetPassword', screenKey: 'collaborators.registration', label: 'Acao: Redefinir senha do colaborador' },
  { key: 'collaborators.actions.activate', screenKey: 'collaborators.registration', label: 'Acao: Reativar colaborador' },
  { key: 'collaborators.actions.deactivate', screenKey: 'collaborators.registration', label: 'Acao: Desativar colaborador' },
  { key: 'collaborators.actions.uploadSignedContract', screenKey: 'collaborators.registration', label: 'Acao: Gerenciar contrato do colaborador' },
  { key: 'physicalAssessment.prnt.summary', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Resumo' },
  { key: 'physicalAssessment.prnt.goals', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Objetivos' },
  { key: 'physicalAssessment.prnt.anamnesisFollowUp', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Acompanhamento da anamnese' },
  { key: 'physicalAssessment.prnt.activityHistory', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Historico de atividades' },
  { key: 'physicalAssessment.prnt.medicationsProcedures', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Medicacoes e procedimentos' },
  { key: 'physicalAssessment.prnt.painCases', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Casos de dor' },
  { key: 'physicalAssessment.prnt.discomforts', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Desconfortos' },
  { key: 'physicalAssessment.prnt.parqSubmissions', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Submissoes PAR-Q' },
  { key: 'physicalAssessment.prnt.actions.createParqSubmission', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Acao criar submissao PAR-Q' },
  { key: 'physicalAssessment.prnt.actions.createRecord', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Acao criar registro' },
  { key: 'physicalAssessment.prnt.actions.editRecord', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Acao editar registro' },
  { key: 'physicalAssessment.prnt.actions.closeFollowUp', screenKey: 'physicalAssessment.protocol', label: 'PRNT: Acao encerrar acompanhamento' },
] as const;

export type AccessBlockKey = (typeof ACCESS_BLOCK_CATALOG)[number]['key'];
export type AccessDataScope = 'self' | 'managed' | 'contract';

export const ACCESS_DATA_SCOPE_SCREEN_KEYS = [
  'students.preRegistration',
  'collaborators.registration',
  'collaborators.consultation',
] as const satisfies readonly AccessScreenKey[];

export const ACCESS_DATA_SCOPE_OPTIONS = [
  { value: 'self', label: 'Somente registros próprios' },
  { value: 'managed', label: 'Registros próprios e da equipe' },
  { value: 'contract', label: 'Todos os registros do contrato' },
] as const satisfies readonly { value: AccessDataScope; label: string }[];

export interface AccessPermission {
  id?: string;
  collaboratorFunctionId?: string;
  screenKey: AccessScreenKey | string;
  blockKey?: AccessBlockKey | string | null;
  canView: boolean;
  dataScope?: AccessDataScope | null;
}

export interface AccessPermissionSelection {
  screens: Array<AccessScreenKey | string>;
  blocks: Array<AccessBlockKey | string>;
  dataScopes?: Partial<Record<AccessScreenKey | string, AccessDataScope | null>>;
}

export interface AccessControlPayload {
  isMaster: boolean;
  permissions: AccessPermission[];
}

export const ALL_ACCESS_SCREEN_KEYS = ACCESS_SCREEN_CATALOG.map((item) => item.key);
export const ALL_ACCESS_BLOCK_KEYS = ACCESS_BLOCK_CATALOG.map((item) => item.key);

const commonProfessorScreens = [
  'students.registration',
  'students.consultation',
  'students.details',
  'students.preRegistration',
  'students.contracts.view',
  'students.assessmentPlan',
  'students.profileReview',
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

const commonReadOnlyStudentScreens = [
  'students.consultation',
  'students.details',
  'students.assessmentPlan',
  'students.profileReview',
] as const satisfies readonly AccessScreenKey[];

const operationalLeadBlocks = [
  'students.preRegistration.create',
  'students.preRegistration.editCommercial',
  'students.preRegistration.generateInvite',
  'students.preRegistration.revokeInvite',
  'students.preRegistration.discardReopen',
] as const satisfies readonly AccessBlockKey[];

const managementLeadBlocks = [
  ...operationalLeadBlocks,
  'students.preRegistration.review',
  'students.preRegistration.convert',
] as const satisfies readonly AccessBlockKey[];

export const DEFAULT_ACCESS_BY_PROFILE_CODE = {
  professor: {
    screens: [
      ...commonProfessorScreens,
      'physicalAssessment.protocol',
      'collaborators.registration',
      'settings.alunoAccess',
      'studentApp.access',
    ],
    blocks: [
      'students.registration.identification',
      'students.registration.parq',
      'students.registration.aha',
      'students.registration.financial',
      'students.registration.preferences',
      'students.registration.initialAnamnesis',
      'students.details.summary',
      'students.details.profile',
      'students.details.health',
      'students.details.assessmentPlan',
      'students.details.assessments',
      'students.details.trainingPlans',
      'students.details.integrations',
      'students.actions.editProfile',
      'students.actions.resetPassword',
      'students.actions.manageAssessments',
      'students.actions.manageAssessmentPlan',
      ...operationalLeadBlocks,
      'collaborators.registration.collaborator',
      'physicalAssessment.prnt.summary',
      'physicalAssessment.prnt.goals',
      'physicalAssessment.prnt.anamnesisFollowUp',
      'physicalAssessment.prnt.activityHistory',
      'physicalAssessment.prnt.medicationsProcedures',
      'physicalAssessment.prnt.painCases',
      'physicalAssessment.prnt.discomforts',
      'physicalAssessment.prnt.parqSubmissions',
      'physicalAssessment.prnt.actions.createParqSubmission',
      'physicalAssessment.prnt.actions.createRecord',
      'physicalAssessment.prnt.actions.editRecord',
      'physicalAssessment.prnt.actions.closeFollowUp',
    ],
    dataScopes: {
      'students.preRegistration': 'self',
      'collaborators.registration': 'self',
      'collaborators.consultation': 'self',
    },
  },
  manager: {
    screens: [
      ...commonProfessorScreens,
      'physicalAssessment.protocol',
      'students.financialData',
      'students.contracts.view',
      'students.contracts.manage',
      'students.contracts.cancel',
      'students.contracts.renew',
      'collaborators.registration',
      'collaborators.consultation',
      'settings.alunoAccess',
      'studentApp.access',
    ],
    blocks: [
      'students.registration.identification',
      'students.registration.parq',
      'students.registration.aha',
      'students.registration.financial',
      'students.registration.preferences',
      'students.registration.initialAnamnesis',
      'students.details.summary',
      'students.details.profile',
      'students.details.health',
      'students.details.financialContract',
      'students.details.assessmentPlan',
      'students.details.assessments',
      'students.details.profileReviews',
      'students.details.trainingPlans',
      'students.details.integrations',
      'students.details.audit',
      'students.actions.editProfile',
      'students.actions.deleteStudent',
      'students.actions.resetPassword',
      'students.actions.manageAssessments',
      'students.actions.manageFinancialContract',
      'students.actions.manageProfileReviews',
      'students.actions.manageAssessmentPlan',
      'students.actions.manageEnrollmentInvite',
      ...managementLeadBlocks,
      'collaborators.registration.collaborator',
      'collaborators.registration.manager',
      'collaborators.actions.validateLegalFinancial',
      'collaborators.actions.resetPassword',
      'collaborators.actions.activate',
      'collaborators.actions.deactivate',
      'collaborators.actions.uploadSignedContract',
      'physicalAssessment.prnt.summary',
      'physicalAssessment.prnt.goals',
      'physicalAssessment.prnt.anamnesisFollowUp',
      'physicalAssessment.prnt.activityHistory',
      'physicalAssessment.prnt.medicationsProcedures',
      'physicalAssessment.prnt.painCases',
      'physicalAssessment.prnt.discomforts',
      'physicalAssessment.prnt.parqSubmissions',
      'physicalAssessment.prnt.actions.createParqSubmission',
      'physicalAssessment.prnt.actions.createRecord',
      'physicalAssessment.prnt.actions.editRecord',
      'physicalAssessment.prnt.actions.closeFollowUp',
    ],
    dataScopes: {
      'students.preRegistration': 'contract',
      'collaborators.registration': 'contract',
      'collaborators.consultation': 'contract',
    },
  },
  intern: {
    screens: [...commonReadOnlyStudentScreens, 'students.preRegistration'],
    blocks: ['students.details.summary'],
    dataScopes: {
      'students.preRegistration': 'self',
      'collaborators.registration': 'self',
      'collaborators.consultation': 'self',
    },
  },
  administrative: {
    screens: [
      ...commonReadOnlyStudentScreens,
      'students.preRegistration',
      'students.financialData',
      'students.contracts.view',
      'students.contracts.manage',
      'students.contracts.cancel',
      'students.contracts.renew',
      'settings.alunoAccess',
      'studentApp.access',
    ],
    blocks: [
      'students.details.summary',
      'students.details.profile',
      'students.details.financialContract',
      'students.details.profileReviews',
      'students.actions.manageFinancialContract',
      'students.actions.manageProfileReviews',
      'students.actions.manageEnrollmentInvite',
      ...managementLeadBlocks,
    ],
    dataScopes: {
      'students.preRegistration': 'contract',
      'collaborators.registration': 'self',
      'collaborators.consultation': 'self',
    },
  },
  cleaning: {
    screens: commonReadOnlyStudentScreens,
    blocks: [],
    dataScopes: {
      'collaborators.registration': 'self',
      'collaborators.consultation': 'self',
    },
  },
  services: {
    screens: commonReadOnlyStudentScreens,
    blocks: [],
    dataScopes: {
      'collaborators.registration': 'self',
      'collaborators.consultation': 'self',
    },
  },
} as const satisfies Record<
  string,
  {
    screens: readonly AccessScreenKey[];
    blocks: readonly AccessBlockKey[];
    dataScopes?: Partial<Record<AccessScreenKey, AccessDataScope>>;
  }
>;

export const FALLBACK_ACCESS_PROFILE_CODE = 'professor';
