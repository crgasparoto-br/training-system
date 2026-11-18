import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const navigateMock = vi.fn();
let routeAlunoId = 'aluno-1';
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
    useParams: () => ({ id: routeAlunoId }),
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
  AlunoDetailsTabs: ({ onChange }: { onChange: (tab: 'cadastro' | 'resumo') => void }) => (
    <div>
      <button type="button" onClick={() => onChange('cadastro')}>Mostrar aba Cadastro</button>
      <button type="button" onClick={() => onChange('resumo')}>Mostrar aba Resumo</button>
    </div>
  ),
  getTabBlockKey: () => undefined,
}));

vi.mock('../components/alunos/AlunoResumoHubTab', () => ({
  AlunoResumoHubTab: () => null,
}));
vi.mock('../components/alunos/AlunoCadastroTab', () => ({
  AlunoCadastroTab: ({
    segmentedProfile,
  }: {
    segmentedProfile: { alunoId?: string } | null;
  }) => <div data-testid="perfil-carregado">{segmentedProfile?.alunoId ?? 'sem perfil'}</div>,
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    routeAlunoId = 'aluno-1';
    vi.spyOn(console, 'error').mockImplementation(() => {});

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
    planListByAlunoMock.mockResolvedValue({ plans: [] });
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

  it('oferece retry com mensagem de indisponibilidade transitória sem usar alerta', async () => {
    getByIdMock
      .mockRejectedValueOnce(new AxiosError('timeout', 'ECONNABORTED'))
      .mockResolvedValueOnce({
        id: 'aluno-1',
        userId: 'user-1',
        professorId: 'prof-1',
        schedulePlan: 'free',
        age: 29,
        user: { email: 'aluno@test.com', profile: { name: 'Aluno Teste' } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    const alertSpy = vi.spyOn(window, 'alert');

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A API está iniciando ou temporariamente indisponível.'
    );
    expect(alertSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await screen.findByText('Aluno Teste');
    expect(getByIdMock).toHaveBeenCalledTimes(2);
    alertSpy.mockRestore();
  });

  it('preserva a mensagem de erro HTTP real sem classificá-la como cold start', async () => {
    const error = new AxiosError('server error', 'ERR_BAD_RESPONSE');
    Object.defineProperty(error, 'response', {
      value: { status: 500, data: { error: 'ALUNO_READ_INTERNAL_ERROR' } },
    });
    getByIdMock.mockRejectedValueOnce(error);

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('ALUNO_READ_INTERNAL_ERROR');
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });
  it('renderiza a identidade sem aguardar o Resumo e nao consulta abas fechadas', async () => {
    let resolveSummary: ((value: null) => void) | undefined;
    getSegmentedSummaryMock.mockImplementationOnce(
      () => new Promise<null>((resolve) => { resolveSummary = resolve; })
    );

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );

    expect(await screen.findByText('Aluno Teste')).toBeInTheDocument();
    await waitFor(() => expect(getSegmentedSummaryMock).toHaveBeenCalledWith('aluno-1'));
    expect(screen.getByRole('status')).toHaveTextContent('Carregando dados desta seção');
    expect(getSegmentedProfileMock).not.toHaveBeenCalled();
    expect(getSegmentedIntakeMock).not.toHaveBeenCalled();
    expect(getSegmentedFinancialProfileMock).not.toHaveBeenCalled();
    expect(getSegmentedIntegrationsMock).not.toHaveBeenCalled();
    expect(listSegmentedActivitiesMock).not.toHaveBeenCalled();
    expect(getSegmentedTimelineMock).not.toHaveBeenCalled();
    expect(assessmentTypeListMock).not.toHaveBeenCalled();

    resolveSummary?.(null);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('busca Cadastro so ao entrar na aba e reutiliza os dados ao retornar', async () => {
    getSegmentedProfileMock.mockResolvedValue({ alunoId: 'aluno-1' });

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );
    await screen.findByText('Aluno Teste');

    expect(getSegmentedProfileMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Cadastro' }));
    await waitFor(() => expect(getSegmentedProfileMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('perfil-carregado')).toHaveTextContent('aluno-1');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Resumo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Cadastro' }));
    expect(getSegmentedProfileMock).toHaveBeenCalledTimes(1);
    expect(getSegmentedTimelineMock).not.toHaveBeenCalled();
  });

  it('mantem a ficha acessivel e permite retry da aba sem refazer o aluno', async () => {
    getSegmentedProfileMock
      .mockRejectedValueOnce(new Error('Erro de rede na aba'))
      .mockResolvedValueOnce({ alunoId: 'aluno-1' });

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );
    await screen.findByText('Aluno Teste');

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Cadastro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar esta seção.'
    );
    expect(screen.getByText('Aluno Teste')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(getSegmentedProfileMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('perfil-carregado')).toHaveTextContent('aluno-1');
    expect(getByIdMock).toHaveBeenCalledTimes(1);
  });

  it('descarta a resposta tardia da aba do aluno anterior', async () => {
    let resolveOldProfile: ((value: { alunoId: string }) => void) | undefined;
    getSegmentedProfileMock
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveOldProfile = resolve; })
      )
      .mockResolvedValueOnce({ alunoId: 'aluno-2' });

    const { rerender } = render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );
    await screen.findByText('Aluno Teste');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Cadastro' }));
    await waitFor(() => expect(getSegmentedProfileMock).toHaveBeenCalledTimes(1));

    routeAlunoId = 'aluno-2';
    getByIdMock.mockResolvedValueOnce({
      id: 'aluno-2',
      userId: 'user-2',
      professorId: 'prof-1',
      age: 26,
      schedulePlan: 'free',
      user: { email: 'novo@test.com', profile: { name: 'Outro Aluno' } },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    rerender(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );

    expect(await screen.findByText('Outro Aluno')).toBeInTheDocument();
    resolveOldProfile?.({ alunoId: 'aluno-1' });
    await waitFor(() => expect(getSegmentedProfileMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('perfil-carregado')).toHaveTextContent('aluno-2');
    expect(screen.queryByText('Aluno Teste')).not.toBeInTheDocument();
  });

});
