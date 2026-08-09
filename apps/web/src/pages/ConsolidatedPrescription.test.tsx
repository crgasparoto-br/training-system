import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CapacityPrescriptionView,
  ConsolidatedPrescriptionAssembly,
  ConsolidatedPrescriptionConflictReport,
  PhysicalCapacityType,
} from '@corrida/types';
import { alunoService } from '../services/aluno.service';
import { consolidatedPrescriptionService } from '../services/consolidated-prescription.service';
import { ConsolidatedPrescription } from './ConsolidatedPrescription';

vi.mock('../access/access-control', () => ({
  canAccessBlock: () => true,
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { user: object }) => unknown) => selector({ user: {} }),
}));

vi.mock('../services/aluno.service', () => ({
  alunoService: {
    getById: vi.fn(),
  },
}));

vi.mock('../services/consolidated-prescription.service', () => ({
  consolidatedPrescriptionService: {
    getCurrent: vi.fn(),
    listCapacities: vi.fn(),
    getConflicts: vi.fn(),
    getHistory: vi.fn(),
    createDraft: vi.fn(),
    updateComposition: vi.fn(),
    recalculateConflicts: vi.fn(),
    sendForReview: vi.fn(),
    approve: vi.fn(),
    createRevision: vi.fn(),
  },
}));

const aluno = {
  id: 'aluno-1',
  professorId: 'professor-1',
  age: 35,
  user: {
    email: 'aluno@teste.com',
    profile: { name: 'Maria Atleta' },
  },
  professor: {
    id: 'professor-1',
    user: { profile: { name: 'Prof. Bruno' } },
  },
} as Awaited<ReturnType<typeof alunoService.getById>>;

const capacityTypes: PhysicalCapacityType[] = ['resisted', 'flexibility', 'cyclic', 'balance'];

function capacityFixture(capacity: PhysicalCapacityType, index: number): CapacityPrescriptionView {
  return {
    id: `prescription-${capacity}`,
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    capacity,
    status: 'active',
    currentVersion: 2,
    createdByProfessorId: 'professor-1',
    updatedByProfessorId: 'professor-1',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
    publishesTodayWorkout: false,
    latestVersion: {
      id: `capacity-version-${capacity}`,
      prescriptionId: `prescription-${capacity}`,
      contractId: 'contract-1',
      alunoId: 'aluno-1',
      capacity,
      status: 'active',
      version: 2,
      responsibleProfessorId: 'professor-1',
      technicalJustification: `Justificativa ${capacity}`,
      professorSummary: `Resumo ${capacity}`,
      methodologyVersion: 'v1',
      parameterSetIds: [],
      sourceRefs: [
        {
          type: 'physical_assessment',
          id: `assessment-${index}`,
          label: `Avaliação ${index + 1}`,
        },
      ],
      linkedProntuarioGoalIds: [],
      alerts: [],
      createdAt: '2026-08-09T10:00:00.000Z',
      publishesTodayWorkout: false,
    },
  };
}

const capacities = capacityTypes.map(capacityFixture);

function assemblyFixture(
  status: ConsolidatedPrescriptionAssembly['currentStatus'] = 'draft',
  version = 3
): ConsolidatedPrescriptionAssembly {
  return {
    id: 'assembly-1',
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    currentVersion: version,
    currentStatus: status,
    createdByProfessorId: 'professor-1',
    updatedByProfessorId: 'professor-1',
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
    latestVersion: {
      id: `assembly-version-${version}`,
      assemblyId: 'assembly-1',
      contractId: 'contract-1',
      alunoId: 'aluno-1',
      version,
      status,
      responsibleProfessorId: 'professor-1',
      technicalObservation: 'Observação persistida',
      professorJustification: 'Justificativa persistida',
      studentInstruction: 'Orientação ao aluno',
      createdByProfessorId: 'professor-1',
      createdAt: '2026-08-09T10:00:00.000Z',
      capacityBlocks: capacities.map((prescription, index) => ({
        id: `block-${index}`,
        capacityPrescriptionVersionId: prescription.latestVersion!.id,
        capacity: prescription.capacity,
        capacityVersion: prescription.latestVersion!.version,
        capacityStatus: 'active',
        position: index,
      })),
      dataRefs: [],
      conflicts: [],
      traceability: {
        capacityCount: 4,
        sourceRefIds: [],
        capacityVersions: capacities.map((prescription) => ({
          capacityPrescriptionVersionId: prescription.latestVersion!.id,
          capacity: prescription.capacity,
          version: 2,
          status: 'active',
        })),
      },
      canReleaseOperationalWorkout: status === 'approved',
      createsTodayWorkoutDirectly: false,
    },
  };
}

const conflictReport: ConsolidatedPrescriptionConflictReport = {
  version: 3,
  status: 'draft',
  conflicts: [
    {
      code: 'review-info',
      message: 'Revisar origem antes do envio.',
      severity: 'warning',
      affectedCapacities: ['resisted'],
      sourceRefIds: [],
    },
  ],
  hasCritical: false,
  canUnblock: false,
  unavailableChecks: [],
};

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[
        {
          pathname: '/central-do-aluno/aluno-1/montagem-consolidada',
          state: { from: 'student-central' },
        },
      ]}
    >
      <Routes>
        <Route
          path="/central-do-aluno/:alunoId/montagem-consolidada"
          element={<ConsolidatedPrescription />}
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(alunoService.getById).mockResolvedValue(aluno);
  vi.mocked(consolidatedPrescriptionService.listCapacities).mockResolvedValue(capacities);
  vi.mocked(consolidatedPrescriptionService.getConflicts).mockResolvedValue(conflictReport);
  vi.mocked(consolidatedPrescriptionService.getHistory).mockResolvedValue(null);
});

describe('ConsolidatedPrescription', () => {
  it('mantem o contexto do aluno e organiza o fluxo em secoes colapsaveis', async () => {
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(assemblyFixture());

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Montagem Consolidada da Prescrição' })).toBeInTheDocument();
    expect(screen.getByText('Aluno').parentElement).toHaveTextContent('Maria Atleta');
    expect(screen.getByText('Professor responsável').parentElement).toHaveTextContent('Prof. Bruno');
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('Rascunho')).toBeInTheDocument();
    expect(screen.getByText('Central do Aluno')).toBeInTheDocument();

    for (const section of [
      '1. Dados gerais',
      '2. Capacidades recebidas',
      '3. Dados-base e origem',
      '4. Alertas e conflitos',
      '5. Composição e ordem técnica',
      '6. Mensagem prática ao aluno',
      '7. Revisão e validação final',
      '8. Histórico de versões',
    ]) {
      expect(screen.getByRole('button', { name: section })).toBeInTheDocument();
    }
  });

  it('so mostra aprovada depois da confirmacao retornada pelo backend', async () => {
    const user = userEvent.setup();
    const ready = assemblyFixture('ready_for_review', 4);
    const approved = assemblyFixture('approved', 5);
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(ready);
    vi.mocked(consolidatedPrescriptionService.getConflicts).mockResolvedValue({
      ...conflictReport,
      version: 4,
      status: 'ready_for_review',
      conflicts: [],
    });

    let resolveApproval!: (value: ConsolidatedPrescriptionAssembly) => void;
    const pendingApproval = new Promise<ConsolidatedPrescriptionAssembly>((resolve) => {
      resolveApproval = resolve;
    });
    vi.mocked(consolidatedPrescriptionService.approve).mockReturnValueOnce(pendingApproval);

    renderPage();
    expect(await screen.findByText('Pronta para revisão')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '7. Revisão e validação final' }));
    await user.click(screen.getByRole('button', { name: 'Aprovar montagem' }));

    expect(consolidatedPrescriptionService.approve).toHaveBeenCalledWith('aluno-1', {
      expectedCurrentVersion: 4,
    });
    expect(screen.getByText('Pronta para revisão')).toBeInTheDocument();
    expect(screen.queryByText('Aprovada')).not.toBeInTheDocument();

    resolveApproval(approved);

    await waitFor(() => expect(screen.getByText('Aprovada')).toBeInTheDocument());
    expect(screen.getByText('Aprovação confirmada pelo servidor.')).toBeInTheDocument();
  });

  it('preserva edicao local quando o servidor responde conflito 409', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(assemblyFixture('draft', 3));
    vi.mocked(consolidatedPrescriptionService.updateComposition).mockRejectedValue({
      response: {
        status: 409,
        data: { error: 'A montagem foi alterada por outro usuário' },
      },
    });

    renderPage();
    await screen.findByText('Rascunho');

    await user.click(screen.getByRole('button', { name: '5. Composição e ordem técnica' }));
    const observation = screen.getByLabelText('Observação técnica interna');
    await user.clear(observation);
    await user.type(observation, 'Alteração local que deve permanecer');

    await user.click(screen.getByRole('button', { name: '7. Revisão e validação final' }));
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText('Conflito de versão detectado')).toBeInTheDocument();
    expect(screen.getByText(/Suas alterações locais foram preservadas/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '5. Composição e ordem técnica' }));
    expect(screen.getByLabelText('Observação técnica interna')).toHaveValue(
      'Alteração local que deve permanecer'
    );
  });
});
