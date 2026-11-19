import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { canAccessBlock } from '../access/access-control';

const navigateMock = vi.fn();
let routeAlunoId = 'aluno-1';
const getByIdMock = vi.fn();
const listByAlunoMock = vi.fn();
const getSummaryMock = vi.fn();
const assessmentTypeListMock = vi.fn();
const planListByAlunoMock = vi.fn();
const getAssessmentPlanMock = vi.fn();
const listStudentContractsMock = vi.fn();
const availableContractsMock = vi.fn();
const getSegmentedSummaryMock = vi.fn();
const getSegmentedProfileMock = vi.fn();
const getSegmentedIntakeMock = vi.fn();
const getSegmentedFinancialProfileMock = vi.fn();
const getSegmentedIntegrationsMock = vi.fn();
const listSegmentedActivitiesMock = vi.fn();
const getSegmentedTimelineMock = vi.fn();
const getProfileReviewSettingsMock = vi.fn();
const listProfileReviewsMock = vi.fn();
const listAdipometryAssessmentsMock = vi.fn();
const listResponsibleProfessorsMock = vi.fn();
const getTrainingRoutineMock = vi.fn();
const overviewMock = vi.fn();

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
    getProfileReviewSettings: (...args: unknown[]) => getProfileReviewSettingsMock(...args),
    listProfileReviews: (...args: unknown[]) => listProfileReviewsMock(...args),
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

vi.mock('../services/contract.service', () => ({
  contractService: {
    listAvailableForStudent: (...args: unknown[]) => availableContractsMock(...args),
  },
}));

vi.mock('../services/adipometry.service', () => ({
  adipometryService: {
    listAssessments: (...args: unknown[]) => listAdipometryAssessmentsMock(...args),
    listResponsibleProfessors: (...args: unknown[]) => listResponsibleProfessorsMock(...args),
  },
}));
vi.mock('../services/training-routine.service', () => ({
  trainingRoutineService: {
    getForAluno: (...args: unknown[]) => getTrainingRoutineMock(...args),
  },
}));
vi.mock('../services/prontuario.service', () => ({
  prontuarioService: {
    overview: (...args: unknown[]) => overviewMock(...args),
  },
}));

vi.mock('../components/ProfessorManualContextPanel', () => ({
  ProfessorManualContextPanel: () => null,
}));

vi.mock('../components/alunos/AlunoDetailsTabs', () => ({
  AlunoDetailsTabs: ({
    onChange,
    visibleTabs,
  }: {
    onChange: (tab: 'cadastro' | 'resumo' | 'financeiro' | 'plano-avaliacoes' | 'avaliacoes-fisicas' | 'revisoes-cadastrais' | 'treinos') => void;
    visibleTabs: string[];
  }) => (
    <div>
      {visibleTabs.includes('cadastro') && (
        <button type="button" onClick={() => onChange('cadastro')}>Mostrar aba Cadastro</button>
      )}
      {visibleTabs.includes('resumo') && (
        <button type="button" onClick={() => onChange('resumo')}>Mostrar aba Resumo</button>
      )}
      {visibleTabs.includes('financeiro') && (
        <button type="button" onClick={() => onChange('financeiro')}>Mostrar aba Financeiro</button>
      )}
      {visibleTabs.includes('plano-avaliacoes') && (
        <button type="button" onClick={() => onChange('plano-avaliacoes')}>Mostrar aba Plano</button>
      )}
      {visibleTabs.includes('avaliacoes-fisicas') && (
        <button type="button" onClick={() => onChange('avaliacoes-fisicas')}>Mostrar aba Avaliações</button>
      )}
      {visibleTabs.includes('revisoes-cadastrais') && (
        <button type="button" onClick={() => onChange('revisoes-cadastrais')}>Mostrar aba Revisões</button>
      )}
      {visibleTabs.includes('treinos') && (
        <button type="button" onClick={() => onChange('treinos')}>Mostrar aba Treinos</button>
      )}
    </div>
  ),
  getTabBlockKey: (tab: string) =>
    tab === 'cadastro'
      ? 'students.details.profile'
      : tab === 'financeiro'
        ? 'students.details.financialContract'
        : tab === 'plano-avaliacoes'
          ? 'students.details.assessmentPlan'
          : tab === 'avaliacoes-fisicas'
            ? 'students.details.assessments'
            : tab === 'revisoes-cadastrais'
              ? 'students.details.profileReviews'
              : tab === 'treinos'
                ? 'students.details.trainingPlans'
                : undefined,
}));

// O Hub e o cartao PRNT permanecem reais; apenas o layout base, nao afetado,
// e isolado para nao acionar outras leituras nesta regressao.
vi.mock('../components/alunos/AlunoResumoHubTabBase', () => ({
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
vi.mock('../components/alunos/AlunoHistoricoTab', () => ({
  AlunoHistoricoTab: () => null,
}));
vi.mock('../components/alunos/AlunoIntegracoesTab', () => ({
  AlunoIntegracoesTab: () => null,
}));
import { AlunoDetails } from './AlunoDetails';

describe('AlunoDetails resiliencia de carregamento', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    routeAlunoId = 'aluno-1';
    vi.mocked(canAccessBlock).mockImplementation(() => true);
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
    availableContractsMock.mockResolvedValue([]);
    getSegmentedSummaryMock.mockResolvedValue(null);
    getSegmentedProfileMock.mockResolvedValue(null);
    getSegmentedIntakeMock.mockResolvedValue(null);
    getSegmentedFinancialProfileMock.mockResolvedValue(null);
    getSegmentedIntegrationsMock.mockResolvedValue(null);
    listSegmentedActivitiesMock.mockResolvedValue(null);
    getSegmentedTimelineMock.mockResolvedValue(null);
    getProfileReviewSettingsMock.mockResolvedValue({
      settings: null,
      effective: { isReviewRequired: true, reviewPeriodMonths: 12, nextReviewAt: null },
    });
    listProfileReviewsMock.mockResolvedValue([]);
    listAdipometryAssessmentsMock.mockResolvedValue([]);
    listResponsibleProfessorsMock.mockResolvedValue([]);
    getTrainingRoutineMock.mockImplementation(() => new Promise(() => {}));
    overviewMock.mockResolvedValue({
      records: [],
      currentRecord: null,
      latestParqSubmission: null,
      parqSubmissions: [],
      parqState: 'NOT_STARTED',
      parqLegacy: { preserved: false, needsRepeat: false },
    });
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

  it('nao consulta Cadastro quando o bloco esta negado', async () => {
    vi.mocked(canAccessBlock).mockImplementation(
      (_user, blockKey) => blockKey !== 'students.details.profile'
    );

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );
    await screen.findByText('Aluno Teste');

    expect(screen.queryByRole('button', { name: 'Mostrar aba Cadastro' })).not.toBeInTheDocument();
    expect(getSegmentedProfileMock).not.toHaveBeenCalled();
    expect(getSegmentedTimelineMock).not.toHaveBeenCalled();
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


  it('carrega Financeiro uma vez por abertura e preserva o estado ao alternar', async () => {
    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );
    await screen.findByText('Aluno Teste');
    await waitFor(() => expect(listStudentContractsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Financeiro' }));
    await waitFor(() => expect(getSegmentedFinancialProfileMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(listStudentContractsMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Contrato ativo')).toBeInTheDocument();
    expect(availableContractsMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Resumo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Financeiro' }));
    expect(listStudentContractsMock).toHaveBeenCalledTimes(2);
    expect(getSegmentedFinancialProfileMock).toHaveBeenCalledTimes(1);
    expect(availableContractsMock).toHaveBeenCalledTimes(1);
  });


  it('na falha do Financeiro não afirma ausência de contrato e permite retry local', async () => {
    listStudentContractsMock
      .mockResolvedValueOnce({ alunoId: 'aluno-1', activeContract: null, contracts: [] })
      .mockRejectedValueOnce(new Error('falha transitória'))
      .mockResolvedValueOnce({ alunoId: 'aluno-1', activeContract: null, contracts: [] });

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );
    await screen.findByText('Aluno Teste');
    await waitFor(() => expect(listStudentContractsMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Financeiro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Os dados contratuais ainda não foram confirmados.');
    expect(screen.queryByText('Sem contrato ativo')).not.toBeInTheDocument();
    expect(screen.queryByText('Contrato ativo')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(listStudentContractsMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByText('Contrato ativo')).toBeInTheDocument();
    expect(screen.getByText('Sem contrato ativo')).toBeInTheDocument();
    expect(getByIdMock).toHaveBeenCalledTimes(1);
  });

  it('recupera separadamente a consulta de contratos disponíveis', async () => {
    availableContractsMock
      .mockRejectedValueOnce(new Error('Serviço de contratos temporariamente indisponível'))
      .mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );
    await screen.findByText('Aluno Teste');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Financeiro' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível consultar os contratos disponíveis.'
    );
    expect(availableContractsMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar consultar contratos disponíveis' }));
    await waitFor(() => expect(availableContractsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(listStudentContractsMock).toHaveBeenCalledTimes(2);
    expect(getByIdMock).toHaveBeenCalledTimes(1);
  });

  it('preserva o rascunho do Plano de avaliações sem fazer novo GET ao retornar', async () => {
    getAssessmentPlanMock.mockResolvedValue({
      items: [{
        assessmentTypeId: 'type-1',
        assessmentType: { id: 'type-1', name: 'Avaliação de teste', code: 'TEST', isActive: true },
        isActive: true,
        isRequired: true,
        cadenceMonths: 2,
        startDate: null,
        nextDueDate: null,
        notes: 'Original',
        summary: { lastAssessmentDate: null },
      }],
    });

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );
    await screen.findByText('Aluno Teste');
    expect(getAssessmentPlanMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Plano' }));
    await screen.findByText('Avaliação de teste');
    expect(getAssessmentPlanMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Observações' }), {
      target: { value: 'Rascunho preservado' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Resumo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Plano' }));
    expect(screen.getByRole('textbox', { name: 'Observações' })).toHaveValue('Rascunho preservado');
    expect(getAssessmentPlanMock).toHaveBeenCalledTimes(1);
  });

  it('na falha do Plano não afirma ausência e oferece retry local', async () => {
    getAssessmentPlanMock
      .mockRejectedValueOnce(new Error('Serviço indisponível'))
      .mockResolvedValueOnce({ items: [] });

    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );
    await screen.findByText('Aluno Teste');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Plano' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o plano');
    expect(screen.queryByText(/Não há tipos de avaliação ativos/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(getAssessmentPlanMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/Não há tipos de avaliação ativos/)).toBeInTheDocument();
  });

  it('mantem o Resumo e o PRNT montados ao alternar sem refazer leitura', async () => {
    render(<MemoryRouter><AlunoDetails /></MemoryRouter>);
    expect(await screen.findByText('Sem desconforto ativo')).toBeInTheDocument();
    expect(overviewMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Cadastro' }));
    await screen.findByTestId('perfil-carregado');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Resumo' }));

    expect(screen.getByText('Sem desconforto ativo')).toBeInTheDocument();
    expect(overviewMock).toHaveBeenCalledTimes(1);
  });

  it('mantem filtro de Avaliacoes Fisicas e nao repete leituras ao retornar', async () => {
    render(<MemoryRouter><AlunoDetails /></MemoryRouter>);
    await screen.findByText('Aluno Teste');
    await waitFor(() => expect(listByAlunoMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Avaliações' }));
    const filter = await screen.findByLabelText('Filtrar por tipo');
    await waitFor(() => expect(listAdipometryAssessmentsMock).toHaveBeenCalledTimes(1));
    expect(getByIdMock).toHaveBeenCalledTimes(1);
    expect(listByAlunoMock).toHaveBeenCalledTimes(2);
    fireEvent.change(filter, { target: { value: 'other' } });

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Cadastro' }));
    await screen.findByTestId('perfil-carregado');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Avaliações' }));

    expect(screen.getByLabelText('Filtrar por tipo')).toHaveValue('other');
    expect(listAdipometryAssessmentsMock).toHaveBeenCalledTimes(1);
    expect(listByAlunoMock).toHaveBeenCalledTimes(2);
    expect(getByIdMock).toHaveBeenCalledTimes(1);
  });

  it('mantem ADPT disponivel quando o historico geral falha e recupera sem remontar', async () => {
    listByAlunoMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Falha no historico geral'))
      .mockResolvedValueOnce([]);

    render(<MemoryRouter><AlunoDetails /></MemoryRouter>);
    await screen.findByText('Aluno Teste');
    await waitFor(() => expect(listByAlunoMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Avaliações' }));
    expect(await screen.findByText('Adipometria e evolução ADPT')).toBeInTheDocument();
    await waitFor(() => expect(listAdipometryAssessmentsMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Nenhum item corresponde ao filtro selecionado.')).not.toBeInTheDocument();
    expect(await screen.findByText('Não foi possível carregar esta seção. Tente novamente.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(listByAlunoMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByRole('link', { name: 'Iniciar antropometria' })).toBeInTheDocument();
    expect(listAdipometryAssessmentsMock).toHaveBeenCalledTimes(1);
    expect(getByIdMock).toHaveBeenCalledTimes(1);
  });

  it('preserva o rascunho e as leituras de Revisoes Cadastrais ao alternar', async () => {
    render(<MemoryRouter><AlunoDetails /></MemoryRouter>);
    await screen.findByText('Aluno Teste');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Revisões' }));

    const monthsInput = await screen.findByLabelText('Período em meses');
    expect(getProfileReviewSettingsMock).toHaveBeenCalledTimes(1);
    expect(listProfileReviewsMock).toHaveBeenCalledTimes(1);
    fireEvent.change(monthsInput, { target: { value: '6' } });

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Cadastro' }));
    await screen.findByTestId('perfil-carregado');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Revisões' }));

    expect(screen.getByLabelText('Período em meses')).toHaveValue(6);
    expect(getProfileReviewSettingsMock).toHaveBeenCalledTimes(1);
    expect(listProfileReviewsMock).toHaveBeenCalledTimes(1);
  });

  it('nao consulta Treinos novamente ao retornar para aba ja montada', async () => {
    render(<MemoryRouter><AlunoDetails /></MemoryRouter>);
    await screen.findByText('Aluno Teste');
    expect(getTrainingRoutineMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Treinos' }));
    await waitFor(() => expect(getTrainingRoutineMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Cadastro' }));
    await screen.findByTestId('perfil-carregado');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aba Treinos' }));

    expect(getTrainingRoutineMock).toHaveBeenCalledTimes(1);
    expect(getByIdMock).toHaveBeenCalledTimes(1);
  });

  it('nega Avaliacoes, Treinos e Revisoes antes de montar seus componentes', async () => {
    vi.mocked(canAccessBlock).mockImplementation(
      (_user, blockKey) => ![
        'students.details.assessments',
        'students.details.trainingPlans',
        'students.details.profileReviews',
      ].includes(blockKey)
    );
    render(<MemoryRouter><AlunoDetails /></MemoryRouter>);
    await screen.findByText('Aluno Teste');

    expect(screen.queryByRole('button', { name: 'Mostrar aba Avaliações' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar aba Revisões' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar aba Treinos' })).not.toBeInTheDocument();
    expect(listAdipometryAssessmentsMock).not.toHaveBeenCalled();
    expect(getProfileReviewSettingsMock).not.toHaveBeenCalled();
    expect(getTrainingRoutineMock).not.toHaveBeenCalled();
  });

  it('não abre abas sensíveis nem faz suas leituras sem permissão', async () => {
    vi.mocked(canAccessBlock).mockImplementation(
      (_user, blockKey) =>
        blockKey !== 'students.details.financialContract' &&
        blockKey !== 'students.details.assessmentPlan'
    );
    render(
      <MemoryRouter>
        <AlunoDetails />
      </MemoryRouter>
    );
    await screen.findByText('Aluno Teste');
    expect(screen.queryByRole('button', { name: 'Mostrar aba Financeiro' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar aba Plano' })).not.toBeInTheDocument();
    expect(getSegmentedFinancialProfileMock).not.toHaveBeenCalled();
    expect(getAssessmentPlanMock).not.toHaveBeenCalled();
    expect(availableContractsMock).not.toHaveBeenCalled();
  });

});
