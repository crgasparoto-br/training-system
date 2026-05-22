import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
const getByIdMock = vi.fn();
const listByAlunoMock = vi.fn();
const getSummaryMock = vi.fn();
const assessmentTypeListMock = vi.fn();
const planListByAlunoMock = vi.fn();
const getAssessmentPlanMock = vi.fn();
const listStudentContractsMock = vi.fn();
const getSegmentedSummaryMock = vi.fn();
const getSegmentedProfileMock = vi.fn();
const getSegmentedIntakeMock = vi.fn();
const getSegmentedFinancialProfileMock = vi.fn();
const getSegmentedIntegrationsMock = vi.fn();
const listSegmentedActivitiesMock = vi.fn();
const getSegmentedTimelineMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'aluno-1' }),
    useNavigate: () => navigateMock,
    useLocation: () => ({ state: null }),
  };
});

const authState = {
  isAuthenticated: true,
  user: {
    id: 'user-master',
    email: 'master@test.com',
    name: 'Master',
    type: 'professor',
    professor: {
      id: 'prof-master',
      role: 'master',
      contract: {
        id: 'contract-1',
        type: 'academy',
        document: '00',
      },
    },
  },
};

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: (selector?: (state: typeof authState) => unknown) =>
    selector ? selector(authState) : authState,
}));

vi.mock('../access/access-control', () => ({
  canAccessScreen: vi.fn(() => true),
  canAccessBlock: vi.fn(() => true),
}));

vi.mock('../services/aluno.service', () => ({
  alunoService: {
    getById: (...args: unknown[]) => getByIdMock(...args),
    getAssessmentPlan: (...args: unknown[]) => getAssessmentPlanMock(...args),
    listStudentContracts: (...args: unknown[]) => listStudentContractsMock(...args),
    getSegmentedSummary: (...args: unknown[]) => getSegmentedSummaryMock(...args),
    getSegmentedProfile: (...args: unknown[]) => getSegmentedProfileMock(...args),
    getSegmentedIntake: (...args: unknown[]) => getSegmentedIntakeMock(...args),
    getSegmentedFinancialProfile: (...args: unknown[]) => getSegmentedFinancialProfileMock(...args),
    getSegmentedIntegrations: (...args: unknown[]) => getSegmentedIntegrationsMock(...args),
    listSegmentedActivities: (...args: unknown[]) => listSegmentedActivitiesMock(...args),
    getSegmentedTimeline: (...args: unknown[]) => getSegmentedTimelineMock(...args),
  },
}));

vi.mock('../services/assessment.service', () => ({
  assessmentService: {
    listByAluno: (...args: unknown[]) => listByAlunoMock(...args),
    getSummary: (...args: unknown[]) => getSummaryMock(...args),
  },
}));

vi.mock('../services/assessment-type.service', () => ({
  assessmentTypeService: {
    list: (...args: unknown[]) => assessmentTypeListMock(...args),
  },
}));

vi.mock('../services/plan.service', () => ({
  planService: {
    listByAluno: (...args: unknown[]) => planListByAlunoMock(...args),
  },
}));

vi.mock('../components/ProfessorManualContextPanel', () => ({
  ProfessorManualContextPanel: () => null,
}));

vi.mock('../components/alunos/AlunoDetailsTabs', () => ({
  AlunoDetailsTabs: () => null,
  getTabBlockKey: () => undefined,
}));

vi.mock('../components/alunos/AlunoResumoHubTab', () => ({
  AlunoResumoHubTab: () => null,
}));
vi.mock('../components/alunos/AlunoCadastroTab', () => ({
  AlunoCadastroTab: () => null,
}));
vi.mock('../components/alunos/AlunoSaudeAnamneseTab', () => ({
  AlunoSaudeAnamneseTab: () => null,
}));
vi.mock('../components/alunos/AlunoFinanceiroTab', () => ({
  AlunoFinanceiroTab: () => null,
}));
vi.mock('../components/alunos/AlunoHistoricoTab', () => ({
  AlunoHistoricoTab: () => null,
}));
vi.mock('../components/alunos/AlunoIntegracoesTab', () => ({
  AlunoIntegracoesTab: () => null,
}));
vi.mock('../components/alunos/AlunoPlanoAvaliacoesTab', () => ({
  AlunoPlanoAvaliacoesTab: () => null,
}));
vi.mock('../components/alunos/AlunoRevisoesCadastraisTab', () => ({
  AlunoRevisoesCadastraisTab: () => null,
}));

import { AlunoDetails } from './AlunoDetails';

describe('AlunoDetails resiliencia de carregamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getByIdMock.mockResolvedValue({
      id: 'aluno-1',
      userId: 'user-1',
      professorId: 'prof-1',
      schedulePlan: 'free',
      age: 29,
      user: {
        email: 'aluno@test.com',
        profile: {
          name: 'Aluno Teste',
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    listByAlunoMock.mockResolvedValue([]);
    getSummaryMock.mockResolvedValue([]);
    assessmentTypeListMock.mockResolvedValue([]);
    getAssessmentPlanMock.mockResolvedValue({ items: [] });
    listStudentContractsMock.mockResolvedValue({
      alunoId: 'aluno-1',
      activeContract: null,
      contracts: [],
    });
    getSegmentedSummaryMock.mockResolvedValue(null);
    getSegmentedProfileMock.mockResolvedValue(null);
    getSegmentedIntakeMock.mockResolvedValue(null);
    getSegmentedFinancialProfileMock.mockResolvedValue(null);
    getSegmentedIntegrationsMock.mockResolvedValue(null);
    listSegmentedActivitiesMock.mockResolvedValue(null);
    getSegmentedTimelineMock.mockResolvedValue(null);
  });

  it('nao redireciona quando endpoint secundario falha para usuario master', async () => {
    planListByAlunoMock.mockRejectedValueOnce(new Error('Falha em planos'));

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );

    await screen.findByText('Aluno Teste');

    await waitFor(() => {
      expect(navigateMock).not.toHaveBeenCalled();
    });

    expect(planListByAlunoMock).toHaveBeenCalledWith('aluno-1');
  });
});
