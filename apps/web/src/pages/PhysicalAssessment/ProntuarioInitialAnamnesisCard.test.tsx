import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProntuarioInitialAnamnesisCard } from './ProntuarioInitialAnamnesisCard';
import { prontuarioInitialAnamnesisService } from '../../services/prontuario-initial-anamnesis.service';
import { prontuarioService } from '../../services/prontuario.service';

vi.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { user: unknown }) => unknown) =>
    selector({ user: { type: 'professor' } }),
}));

vi.mock('../../access/access-control', () => ({
  canAccessBlock: vi.fn(() => true),
}));

vi.mock('../../services/prontuario-initial-anamnesis.service', () => ({
  prontuarioInitialAnamnesisService: {
    identity: vi.fn(),
    initialAnamnesis: vi.fn(),
  },
}));

vi.mock('../../services/prontuario.service', () => ({
  prontuarioService: {
    listParqSubmissions: vi.fn(),
  },
}));

const identityMock = vi.mocked(prontuarioInitialAnamnesisService.identity);
const intakeMock = vi.mocked(prontuarioInitialAnamnesisService.initialAnamnesis);
const parqMock = vi.mocked(prontuarioService.listParqSubmissions);

const identity = {
  alunoId: 'lead-1',
  name: 'Lead Pré-Matrícula',
  email: 'lead@example.com',
};

const filledIntake = {
  alunoId: 'lead-1',
  source: { type: 'student' as const, reference: 'intake-1' },
  status: 'COMPLETED' as const,
  assessmentDate: '2026-08-07T12:00:00.000Z',
  questionnaires: { american: { chestPain: 'no' } },
  clinicalHistory: {
    medicalHistory: 'Asma na infância',
    trainingBackground: 'Corrida recreativa',
  },
  medications: { currentMedications: 'Nenhuma' },
  injuries: { injuriesHistory: 'Entorse antiga' },
  allergies: { notes: 'Sem alergias conhecidas' },
  rawFormResponses: { mainGoal: 'Condicionamento' },
  observations: 'Prefere treinar pela manhã',
};

const emptyIntake = {
  alunoId: 'lead-1',
  source: { type: 'student' as const, reference: 'lead-1' },
  status: 'NOT_STARTED' as const,
  questionnaires: {},
  clinicalHistory: null,
  medications: null,
  injuries: null,
  allergies: null,
  rawFormResponses: null,
  observations: null,
};

const parqSubmission = {
  id: 'parq-1',
  alunoId: 'lead-1',
  contractId: 'contract-1',
  catalogVersion: 'parq-2026-01',
  submittedAt: '2026-08-07T10:00:00.000Z',
  responses: { q1: false },
  positiveItems: [],
  positiveCount: 0,
  declarationAccepted: true,
  sourceType: 'student',
};

function renderCard() {
  return render(
    <MemoryRouter>
      <ProntuarioInitialAnamnesisCard alunoId="lead-1" />
    </MemoryRouter>
  );
}

describe('ProntuarioInitialAnamnesisCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    identityMock.mockResolvedValue(identity);
    intakeMock.mockResolvedValue(filledIntake);
    parqMock.mockResolvedValue([parqSubmission as any]);
  });

  it('identifica o lead e exibe Anamnese e disponibilidade do PAR-Q sem criar editores', async () => {
    renderCard();

    await waitFor(() => expect(screen.getByText('Lead Pré-Matrícula')).toBeInTheDocument());
    expect(screen.getByText('lead@example.com')).toBeInTheDocument();
    expect(screen.getByText('Anamnese Inicial')).toBeInTheDocument();
    expect(screen.getByText(/Asma na infância/)).toBeInTheDocument();
    expect(screen.getByText(/PAR-Q preenchido disponível para consulta/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('mantém a Anamnese visível quando o PAR-Q ainda não foi preenchido', async () => {
    parqMock.mockResolvedValue([]);

    renderCard();

    await waitFor(() => expect(screen.getByText(/Asma na infância/)).toBeInTheDocument());
    expect(screen.getByText('PAR-Q ainda não possui conteúdo preenchido.')).toBeInTheDocument();
  });

  it('mantém o PAR-Q disponível quando a Anamnese ainda não foi preenchida', async () => {
    intakeMock.mockResolvedValue(emptyIntake);

    renderCard();

    await waitFor(() =>
      expect(screen.getByText('Anamnese Inicial ainda não possui conteúdo preenchido.')).toBeInTheDocument()
    );
    expect(screen.getByText(/PAR-Q preenchido disponível para consulta/i)).toBeInTheDocument();
  });

  it('exibe o estado vazio combinado e retorno para a pré-matrícula', async () => {
    intakeMock.mockResolvedValue(emptyIntake);
    parqMock.mockResolvedValue([]);

    renderCard();

    await waitFor(() =>
      expect(
        screen.getByText('Ainda não existem Anamnese ou PAR-Q preenchidos para esta pré-matrícula.')
      ).toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: 'Voltar à pré-matrícula' })).toHaveAttribute(
      'href',
      '/pre-matriculas/lead-1'
    );
  });

  it('isola falha da Anamnese sem esconder o PAR-Q', async () => {
    intakeMock.mockRejectedValue(new Error('network'));

    renderCard();

    await waitFor(() =>
      expect(screen.getByText(/Não foi possível carregar a Anamnese Inicial/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/PAR-Q preenchido disponível para consulta/i)).toBeInTheDocument();
  });
});
