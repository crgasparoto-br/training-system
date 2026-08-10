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

const accessState = vi.hoisted(() => ({
  allowed: new Set<string>(),
}));

vi.mock('../access/access-control', () => ({
  canAccessBlock: (_user: unknown, blockKey: string) => accessState.allowed.has(blockKey),
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
    unblock: vi.fn(),
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
      code: 'review-warning',
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
  accessState.allowed = new Set([
    'plans.consolidatedPrescriptions.view',
    'plans.consolidatedPrescriptions.manage',
    'plans.consolidatedPrescriptions.approve',
  ]);
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
    expect(screen.getByText('Versão').parentElement).toHaveTextContent('v3');
    expect(screen.getByText('Estado').parentElement).toHaveTextContent('Rascunho');
    expect(screen.getByText('Origem do acesso').parentElement).toHaveTextContent('Central do Aluno');

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

  it('desbloqueia explicitamente uma montagem somente depois que a API confirma canUnblock', async () => {
    const user = userEvent.setup();
    const blocked = assemblyFixture('blocked', 3);
    const ready = assemblyFixture('ready_for_review', 4);
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(blocked);
    vi.mocked(consolidatedPrescriptionService.getConflicts)
      .mockResolvedValueOnce({
        ...conflictReport,
        version: 3,
        status: 'blocked',
        conflicts: [],
        hasCritical: false,
        canUnblock: true,
      })
      .mockResolvedValue({
        ...conflictReport,
        version: 4,
        status: 'ready_for_review',
        conflicts: [],
        hasCritical: false,
        canUnblock: false,
      });
    vi.mocked(consolidatedPrescriptionService.unblock).mockResolvedValue(ready);

    renderPage();
    expect(await screen.findByText('Bloqueada')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '7. Revisão e validação final' }));
    await user.click(screen.getByRole('button', { name: 'Desbloquear para revisão' }));

    expect(consolidatedPrescriptionService.unblock).toHaveBeenCalledWith('aluno-1', {
      expectedCurrentVersion: 3,
      targetStatus: 'ready_for_review',
      reason: 'Conflitos críticos resolvidos e reavaliados na interface da Montagem Consolidada.',
    });
    expect(await screen.findByText('Pronta para revisão')).toBeInTheDocument();
    expect(screen.getByText('Montagem desbloqueada e enviada para revisão pelo servidor.')).toBeInTheDocument();
  });

  it('nao oferece desbloqueio enquanto a API mantem conflito critical', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(assemblyFixture('blocked', 3));
    vi.mocked(consolidatedPrescriptionService.getConflicts).mockResolvedValue({
      version: 3,
      status: 'blocked',
      conflicts: [
        {
          code: 'critical-1',
          message: 'Restrição estruturada ainda ativa.',
          severity: 'critical',
          affectedCapacities: ['resisted'],
          sourceRefIds: [],
        },
      ],
      hasCritical: true,
      canUnblock: false,
      unavailableChecks: [],
    });

    renderPage();
    await screen.findByText('Bloqueada');
    await user.click(screen.getByRole('button', { name: '7. Revisão e validação final' }));

    expect(screen.queryByRole('button', { name: 'Desbloquear para revisão' })).not.toBeInTheDocument();
    expect(screen.getByText(/O desbloqueio só aparece após reavaliação favorável do servidor/i)).toBeInTheDocument();
  });

  it('mostra o status real da prescricao quando a raiz esta inativa mas a ultima versao esta ativa', async () => {
    const user = userEvent.setup();
    const suspendedCapacities = capacities.map((prescription) =>
      prescription.capacity === 'resisted' ? { ...prescription, status: 'suspended' as const } : prescription
    );
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(null);
    vi.mocked(consolidatedPrescriptionService.listCapacities).mockResolvedValue(suspendedCapacities);

    renderPage();
    await screen.findByText('Ainda não criada');
    await user.click(screen.getByRole('button', { name: '2. Capacidades recebidas' }));

    expect(
      screen.getByText(/Status da prescrição retornado pela API: suspended/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Status retornado pela API: active/i)).not.toBeInTheDocument();
  });

  it('oculta controles de gestao para perfil somente leitura', async () => {
    const user = userEvent.setup();
    accessState.allowed = new Set(['plans.consolidatedPrescriptions.view']);
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(assemblyFixture('draft', 3));

    renderPage();
    await screen.findByText('Rascunho');

    await user.click(screen.getByRole('button', { name: '4. Alertas e conflitos' }));
    expect(screen.queryByRole('button', { name: 'Reavaliar conflitos' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '5. Composição e ordem técnica' }));
    expect(screen.getByLabelText('Observação técnica interna')).toHaveAttribute('readonly');

    await user.click(screen.getByRole('button', { name: '7. Revisão e validação final' }));
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar para revisão' })).not.toBeInTheDocument();
  });

  it('mantem aprovacao separada de manage e diferencia warning de blocker sem depender apenas de cor', async () => {
    const user = userEvent.setup();
    accessState.allowed = new Set([
      'plans.consolidatedPrescriptions.view',
      'plans.consolidatedPrescriptions.manage',
    ]);
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(assemblyFixture('ready_for_review', 4));
    vi.mocked(consolidatedPrescriptionService.getConflicts).mockResolvedValue({
      version: 4,
      status: 'ready_for_review',
      conflicts: [
        {
          code: 'warning-1',
          message: 'Atenção estruturada.',
          severity: 'warning',
          affectedCapacities: ['balance'],
          sourceRefIds: [],
        },
        {
          code: 'critical-1',
          message: 'Bloqueio estruturado.',
          severity: 'critical',
          affectedCapacities: ['resisted'],
          sourceRefIds: [],
        },
      ],
      hasCritical: true,
      canUnblock: false,
      unavailableChecks: [],
    });

    renderPage();
    await screen.findByText('Pronta para revisão');

    await user.click(screen.getByRole('button', { name: '4. Alertas e conflitos' }));
    expect(screen.getByText('Atenção')).toBeInTheDocument();
    expect(screen.getByText('Bloqueador crítico')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '7. Revisão e validação final' }));
    expect(screen.queryByRole('button', { name: 'Aprovar montagem' })).not.toBeInTheDocument();
    expect(screen.getByText(/não possui o bloco de aprovação/i)).toBeInTheDocument();
  });
});
