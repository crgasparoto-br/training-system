import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AlunoResumoHubTab } from './AlunoResumoHubTab';
import type { Aluno } from '../../services/aluno.service';
import type { Assessment, AssessmentSummary } from '../../services/assessment.service';

const routineMocks = vi.hoisted(() => ({ getForAluno: vi.fn() }));

vi.mock('../../services/training-routine.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/training-routine.service')>()),
  trainingRoutineService: { getForAluno: routineMocks.getForAluno, getForStudent: vi.fn() },
}));

const baseAluno = {
  id: 'aluno-1',
  age: 35,
  updatedAt: '2026-01-10T12:00:00.000Z',
  user: {
    email: 'aluno@teste.com',
    profile: {
      name: 'Aluno Teste',
      phone: '(15) 99999-0000',
    },
  },
  service: null,
  intakeForm: {
    assessmentDate: null,
    mainGoal: null,
    parqResponses: {},
  },
} as unknown as Aluno;

function renderResumo(
  aluno: Aluno,
  options: {
    assessments?: Assessment[];
    assessmentSummary?: AssessmentSummary[];
    canViewTraining?: boolean;
  } = {}
) {
  return render(
    <MemoryRouter>
      <AlunoResumoHubTab
        aluno={aluno}
        assessments={options.assessments ?? []}
        assessmentSummary={options.assessmentSummary ?? []}
        plans={[]}
        activeStudentContract={null}
        segmentedSummary={null}
        canViewTraining={options.canViewTraining}
      />
    </MemoryRouter>
  );
}

describe('AlunoResumoHubTab PRNT card', () => {
  it('mostra PRNT pendente quando não há anamnese nem objetivo', () => {
    renderResumo(baseAluno);

    expect(screen.getAllByText('PRNT pendente').length).toBeGreaterThan(0);
    expect(screen.getByText(/Completar anamnese e objetivo principal/i)).toBeInTheDocument();
    expect(screen.getAllByText('Iniciar PRNT').length).toBeGreaterThan(0);
  });

  it('destaca alerta técnico quando PAR-Q possui respostas positivas', () => {
    renderResumo({
      ...baseAluno,
      intakeForm: {
        assessmentDate: '2026-02-01T12:00:00.000Z',
        mainGoal: 'Correr 10 km sem dor',
      },
      parq: {
        state: 'COMPLETED_REVIEW_REQUIRED',
        latestSubmission: {
          id: 'submission-1',
          positiveCount: 1,
        },
      },
    } as unknown as Aluno);

    expect(screen.getAllByText('PRNT parcial').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1 alerta\(s?\)/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Atualizar PRNT')).toBeInTheDocument();
  });
});

describe('AlunoResumoHubTab assessment card', () => {
  it('mostra estado pendente e ação de nova antropometria quando não há avaliação', () => {
    renderResumo(baseAluno);

    expect(screen.getAllByText('Avaliação pendente').length).toBeGreaterThan(0);
    expect(screen.getByText(/Aguardando primeira avaliação profissional/i)).toBeInTheDocument();
    expect(screen.getAllByText('Nova antropometria').length).toBeGreaterThan(0);
  });

  it('mostra última avaliação, responsável e comparação quando há múltiplos registros', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00.000Z'));

    try {
      const assessments = [
        {
          id: 'assessment-2',
          alunoId: 'aluno-1',
          typeId: 'type-1',
          assessmentDate: '2026-03-10T12:00:00.000Z',
          filePath: 'assessment-2.pdf',
          originalFileName: 'assessment-2.pdf',
          mimeType: 'application/pdf',
          fileSize: 1234,
          createdAt: '2026-03-10T12:00:00.000Z',
          updatedAt: '2026-03-10T12:00:00.000Z',
          type: {
            id: 'type-1',
            name: 'Antropometria',
            code: 'anthropometry',
          },
          professional: {
            user: {
              profile: {
                name: 'Profa. Maria',
              },
            },
          },
        },
        {
          id: 'assessment-1',
          alunoId: 'aluno-1',
          typeId: 'type-1',
          assessmentDate: '2026-01-10T12:00:00.000Z',
          filePath: 'assessment-1.pdf',
          originalFileName: 'assessment-1.pdf',
          mimeType: 'application/pdf',
          fileSize: 1234,
          createdAt: '2026-01-10T12:00:00.000Z',
          updatedAt: '2026-01-10T12:00:00.000Z',
          type: {
            id: 'type-1',
            name: 'Antropometria',
            code: 'anthropometry',
          },
        },
      ] as Assessment[];

      renderResumo(baseAluno, {
        assessments,
        assessmentSummary: [
          {
            typeId: 'type-1',
            typeName: 'Antropometria',
            scheduleType: 'fixed_interval',
            intervalMonths: 2,
            lastAssessmentDate: '2026-03-10T12:00:00.000Z',
            nextDueDate: '2026-09-10T12:00:00.000Z',
          },
        ],
      });

      expect(screen.getAllByText('Avaliação em dia').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Antropometria/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Profa\. Maria/i).length).toBeGreaterThan(0);
      expect(screen.getByText('Base pronta para comparar')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AlunoResumoHubTab Treino de hoje (#387)', () => {
  it('consulta a rotina canônica do aluno selecionado', async () => {
    routineMocks.getForAluno.mockReset().mockResolvedValue({
      alunoId: 'aluno-1',
      audience: 'professor',
      referenceDate: '2026-10-01',
      timeZone: 'America/Sao_Paulo',
      week: { startDate: '2026-09-28', endDate: '2026-10-04' },
      days: [],
      today: { date: '2026-10-01', state: 'none', sessions: [] },
      execution: { available: false, reason: 'execution_contract_pending' },
    });

    renderResumo(baseAluno);

    expect(await screen.findByText('Nenhuma sessão liberada para hoje')).toBeInTheDocument();
    expect(routineMocks.getForAluno).toHaveBeenCalledWith('aluno-1', { date: undefined });
  });

  it('não consulta a rotina sem o bloco de treinos e mantém o restante do resumo', async () => {
    routineMocks.getForAluno.mockReset();

    renderResumo(baseAluno, { canViewTraining: false });

    expect(await screen.findByText('Sem permissão para ver os treinos')).toBeInTheDocument();
    expect(routineMocks.getForAluno).not.toHaveBeenCalled();
    expect(screen.getAllByText('PRNT pendente').length).toBeGreaterThan(0);
  });

  it('mantém os demais blocos quando a rotina falha', async () => {
    routineMocks.getForAluno.mockReset().mockRejectedValue({ response: { status: 500 } });

    renderResumo(baseAluno);

    expect(await screen.findByText('Não foi possível carregar os treinos')).toBeInTheDocument();
    expect(screen.getAllByText('PRNT pendente').length).toBeGreaterThan(0);
  });
});
