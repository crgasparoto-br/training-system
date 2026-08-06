import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prontuarioService } from '../../services/prontuario.service';
import { ProntuarioScreenWithDiscomfortFollowUps } from './ProntuarioScreenWithDiscomfortFollowUps';

vi.mock('./ProntuarioScreen', () => ({
  ProntuarioScreen: () => <div>Fluxo principal do PRNT</div>,
}));

vi.mock('../../services/prontuario.service', () => ({
  prontuarioService: {
    overview: vi.fn(),
    savePainCases: vi.fn(),
  },
}));

const overviewMock = vi.mocked(prontuarioService.overview);

function renderScreen(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ProntuarioScreenWithDiscomfortFollowUps />
    </MemoryRouter>
  );
}

describe('ProntuarioScreenWithDiscomfortFollowUps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nao duplica o painel quando nenhum aluno esta selecionado', () => {
    renderScreen('/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento');

    expect(
      screen.getByRole('region', {
        name: 'Prontuário de entrevista e acompanhamento',
      })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Fluxo principal do PRNT')).toHaveLength(1);
    expect(screen.queryByText('Acompanhamento de dores')).not.toBeInTheDocument();
    expect(overviewMock).not.toHaveBeenCalled();
  });

  it('separa acompanhamento do cadastro do caso de dor', async () => {
    const user = userEvent.setup();
    overviewMock.mockResolvedValue({
      records: [],
      currentRecord: {
        id: 'record-1',
        alunoId: 'aluno-1',
        contractId: 'contract-1',
        code: 'PRNT-1',
        status: 'open',
        recordDate: '2026-08-06T12:00:00.000Z',
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
            onsetDate: '2026-08-01T12:00:00.000Z',
            followUps: [],
          },
        ],
      },
      latestParqSubmission: null,
      parqSubmissions: [],
      parqState: 'NOT_STARTED',
      parqLegacy: { preserved: false, needsRepeat: false },
    } as any);

    renderScreen(
      '/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento?alunoId=aluno-1'
    );

    expect(await screen.findByText('Acompanhamento de dores')).toBeInTheDocument();
    expect(overviewMock).toHaveBeenCalledWith('aluno-1');

    const summary = screen.getByText('Dor no joelho').closest('summary');
    expect(summary).not.toBeNull();
    await user.click(summary!);

    expect(screen.getByLabelText('Data do acompanhamento')).toBeInTheDocument();
    expect(screen.getByLabelText('Intensidade (0 a 10)')).toBeInTheDocument();
    expect(screen.getByLabelText('Status do caso')).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });
});
