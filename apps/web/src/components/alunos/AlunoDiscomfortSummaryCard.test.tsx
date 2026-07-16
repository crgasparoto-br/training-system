import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlunoDiscomfortSummaryCard } from './AlunoDiscomfortSummaryCard';
import { prontuarioService } from '../../services/prontuario.service';

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: () => ({
    user: {
      type: 'professor',
      accessControl: {
        isMaster: true,
        permissions: [],
      },
    },
  }),
}));

vi.mock('../../services/prontuario.service', () => ({
  prontuarioService: {
    overview: vi.fn(),
  },
}));

const overviewMock = vi.mocked(prontuarioService.overview);

function renderCard() {
  return render(
    <MemoryRouter>
      <AlunoDiscomfortSummaryCard alunoId="aluno-1" />
    </MemoryRouter>
  );
}

describe('AlunoDiscomfortSummaryCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra estado vazio quando nao existem desconfortos ativos', async () => {
    overviewMock.mockResolvedValue({
      records: [],
      currentRecord: null,
      latestParqSubmission: null,
      parqSubmissions: [],
    });

    renderCard();

    await waitFor(() => expect(screen.getByText('Sem desconforto ativo')).toBeInTheDocument());
    expect(screen.getByText('Registrar novo desconforto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir acompanhamentos' })).toHaveAttribute(
      'href',
      '/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento?alunoId=aluno-1'
    );
  });

  it('resume casos ativos e o ultimo acompanhamento', async () => {
    overviewMock.mockResolvedValue({
      records: [],
      currentRecord: {
        id: 'record-1',
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        code: 'PRNT-1',
        status: 'open',
        recordDate: '2026-07-01T12:00:00.000Z',
        goals: [],
        anamnesisFollowUps: [],
        activityHistory: [],
        medicationsProcedures: [],
        discomfortSnapshots: [],
        painCases: [
          {
            id: 'pain-1',
            recordId: 'record-1',
            title: 'Dor no joelho',
            region: 'Joelho direito',
            status: 'monitoring',
            onsetDate: '2026-07-02T12:00:00.000Z',
            followUps: [
              {
                id: 'follow-1',
                painCaseId: 'pain-1',
                followUpAt: '2026-07-09T12:00:00.000Z',
                intensity: 6,
                notes: 'Melhora parcial',
              },
            ],
          },
        ],
      },
      latestParqSubmission: null,
      parqSubmissions: [],
    });

    renderCard();

    await waitFor(() => expect(screen.getByText('Revisar antes da próxima conduta')).toBeInTheDocument());
    expect(screen.getAllByText('1').length).toBeGreaterThan(0);
    expect(screen.getByText(/Intensidade informada: 6\/10/i)).toBeInTheDocument();
    expect(screen.getByText(/Dor no joelho.*Joelho direito/i)).toBeInTheDocument();
    expect(screen.getByText('Acompanhar ou encerrar desconforto')).toBeInTheDocument();
  });

  it('isola erro do prontuario sem quebrar a Central', async () => {
    overviewMock.mockRejectedValue(new Error('network'));

    renderCard();

    await waitFor(() =>
      expect(screen.getByText(/Não foi possível carregar os desconfortos do PRNT/i)).toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: 'Abrir acompanhamentos' })).toBeInTheDocument();
  });
});
