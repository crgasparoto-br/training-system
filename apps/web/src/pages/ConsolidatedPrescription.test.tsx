import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ConsolidatedPrescriptionAssembly,
  ConsolidatedPrescriptionCapacityCandidate,
  ConsolidatedPrescriptionConflictReport,
  ConsolidatedPrescriptionWorkspaceContext,
  PhysicalCapacityType,
} from '@corrida/types';
import { consolidatedPrescriptionService } from '../services/consolidated-prescription.service';
import { ConsolidatedPrescription } from './ConsolidatedPrescription';

const accessState = vi.hoisted(() => ({ allowed: new Set<string>() }));

vi.mock('../access/access-control', () => ({
  canAccessBlock: (_user: unknown, blockKey: string) => accessState.allowed.has(blockKey),
}));

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: (selector: (state: { user: object }) => unknown) => selector({ user: {} }),
}));

vi.mock('../services/consolidated-prescription.service', () => ({
  consolidatedPrescriptionService: {
    getWorkspaceContext: vi.fn(),
    getCurrent: vi.fn(),
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

const capacityTypes: PhysicalCapacityType[] = ['resisted', 'flexibility', 'cyclic', 'balance'];

function candidateFixture(capacity: PhysicalCapacityType, index: number): ConsolidatedPrescriptionCapacityCandidate {
  return {
    capacity,
    prescriptionId: `prescription-${capacity}`,
    prescriptionStatus: 'active',
    capacityPrescriptionVersionId: `capacity-version-${capacity}`,
    version: 2,
    versionStatus: 'active',
    eligible: true,
    reasonCode: 'eligible',
    reason: null,
    professorSummary: `Resumo ${capacity}`,
    sourceRefs: [{
      type: 'physical_assessment',
      id: `assessment-${index}`,
      label: `Avaliação ${index + 1}`,
      origin: 'Avaliação Física',
    }],
  };
}

const candidates = capacityTypes.map(candidateFixture);

const workspace: ConsolidatedPrescriptionWorkspaceContext = {
  aluno: { id: 'aluno-1', name: 'Maria Atleta' },
  actorProfessor: { id: 'professor-manager', name: 'Gestora Paula' },
  assignedProfessor: { id: 'professor-assigned', name: 'Prof. Bruno' },
  responsibleProfessor: { id: 'professor-responsible', name: 'Prof. Renata' },
  capacityCandidates: candidates,
  capacityCandidatesError: null,
};

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
    createdByProfessorId: 'professor-manager',
    updatedByProfessorId: 'professor-manager',
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
    latestVersion: {
      id: `assembly-version-${version}`,
      assemblyId: 'assembly-1',
      contractId: 'contract-1',
      alunoId: 'aluno-1',
      version,
      status,
      responsibleProfessorId: 'professor-responsible',
      technicalObservation: 'Observação persistida',
      professorJustification: 'Justificativa persistida',
      studentInstruction: 'Orientação ao aluno',
      createdByProfessorId: 'professor-manager',
      createdAt: '2026-08-09T10:00:00.000Z',
      capacityBlocks: candidates.map((candidate, index) => ({
        id: `block-${index}`,
        capacityPrescriptionVersionId: candidate.capacityPrescriptionVersionId!,
        capacity: candidate.capacity,
        capacityVersion: candidate.version!,
        capacityStatus: 'active',
        position: index,
      })),
      dataRefs: [],
      conflicts: [],
      traceability: {
        capacityCount: 4,
        sourceRefIds: [],
        capacityVersions: candidates.map((candidate) => ({
          capacityPrescriptionVersionId: candidate.capacityPrescriptionVersionId!,
          capacity: candidate.capacity,
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
  conflicts: [{
    code: 'review-warning',
    message: 'Revisar origem antes do envio.',
    severity: 'warning',
    affectedCapacities: ['resisted'],
    sourceRefIds: [],
  }],
  hasCritical: false,
  canUnblock: false,
  unavailableChecks: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[{
      pathname: '/central-do-aluno/aluno-1/montagem-consolidada',
      state: { from: 'student-central' },
    }]}>
      <Routes>
        <Route path="/central-do-aluno/:alunoId/montagem-consolidada" element={<ConsolidatedPrescription />} />
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
  vi.mocked(consolidatedPrescriptionService.getWorkspaceContext).mockResolvedValue(workspace);
  vi.mocked(consolidatedPrescriptionService.getConflicts).mockResolvedValue(conflictReport);
  vi.mocked(consolidatedPrescriptionService.getHistory).mockResolvedValue(null);
});

describe('ConsolidatedPrescription', () => {
  it('carrega contexto pelo contrato da montagem e mantém as oito seções', async () => {
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(assemblyFixture());
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Montagem Consolidada da Prescrição' })).toBeInTheDocument();
    expect(screen.getByText('Aluno').parentElement).toHaveTextContent('Maria Atleta');
    expect(screen.getByText('Professor responsável').parentElement).toHaveTextContent('Prof. Renata');
    expect(screen.getByText('Origem do acesso').parentElement).toHaveTextContent('Central do Aluno');
    expect(consolidatedPrescriptionService.getWorkspaceContext).toHaveBeenCalledWith('aluno-1');

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

  it('preserva o aluno selecionado no retorno quando o carregamento falha', async () => {
    vi.mocked(consolidatedPrescriptionService.getWorkspaceContext).mockRejectedValueOnce({
      response: { status: 404, data: { error: 'Recurso não encontrado' } },
    });
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(null);

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Montagem Consolidada indisponível' })).toBeInTheDocument();
    const backLink = screen.getByRole('link', { name: 'Voltar à Central do Aluno' });
    expect(backLink).toHaveAttribute('href', '/central-do-aluno/aluno-1');
    expect(backLink).not.toHaveAttribute('href', '/central-do-aluno');
  });

  it('exibe exatamente o motivo de inelegibilidade retornado pelo backend', async () => {
    const user = userEvent.setup();
    const reason = 'Motivo autoritativo da API: prescrição suspensa por revisão clínica.';
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(null);
    vi.mocked(consolidatedPrescriptionService.getWorkspaceContext).mockResolvedValue({
      ...workspace,
      capacityCandidates: candidates.map((candidate) => candidate.capacity === 'resisted'
        ? {
            ...candidate,
            prescriptionStatus: 'suspended',
            eligible: false,
            reasonCode: 'prescription_not_active',
            reason,
          }
        : candidate),
    });

    renderPage();
    await screen.findByText('Ainda não criada');
    await user.click(screen.getByRole('button', { name: '2. Capacidades recebidas' }));

    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('Código: prescription_not_active')).toBeInTheDocument();
    expect(screen.getAllByText('Elegível pela API')).toHaveLength(3);
  });

  it('preserva responsável e referências adicionais ao salvar uma edição não relacionada', async () => {
    const user = userEvent.setup();
    const current = assemblyFixture('draft', 3);
    current.latestVersion.dataRefs = [
      {
        id: 'capacity-source-1',
        role: 'capacity_source',
        sourceType: 'physical_assessment',
        sourceId: 'assessment-derived',
        label: 'Origem derivada',
      },
      {
        id: 'extra-ref-1',
        role: 'assessment',
        sourceType: 'physical_assessment',
        sourceId: 'assessment-extra',
        label: 'Avaliação adicional',
        assessedAt: '2026-08-07T09:00:00.000Z',
        origin: 'PRNT',
        sourceVersion: 7,
        responsibleProfessorId: 'professor-source',
        context: { purpose: 'audit-control' },
      },
    ];
    const saved = assemblyFixture('draft', 4);
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(current);
    vi.mocked(consolidatedPrescriptionService.updateComposition).mockResolvedValue(saved);

    renderPage();
    await screen.findByText('Rascunho');
    await user.click(screen.getByRole('button', { name: '5. Composição e ordem técnica' }));
    const observation = screen.getByLabelText('Observação técnica interna');
    await user.clear(observation);
    await user.type(observation, 'Ajuste sem trocar responsabilidade');
    await user.click(screen.getByRole('button', { name: '7. Revisão e validação final' }));
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => expect(consolidatedPrescriptionService.updateComposition).toHaveBeenCalled());
    expect(consolidatedPrescriptionService.updateComposition).toHaveBeenCalledWith(
      'aluno-1',
      expect.objectContaining({
        expectedCurrentVersion: 3,
        responsibleProfessorId: 'professor-responsible',
        dataRefs: [{
          role: 'assessment',
          sourceType: 'physical_assessment',
          sourceId: 'assessment-extra',
          label: 'Avaliação adicional',
          assessedAt: '2026-08-07T09:00:00.000Z',
          origin: 'PRNT',
          sourceVersion: 7,
          responsibleProfessorId: 'professor-source',
          context: { purpose: 'audit-control' },
        }],
      })
    );
  });

  it('não transforma falha de refresh auxiliar em falso erro após save confirmado', async () => {
    const user = userEvent.setup();
    const current = assemblyFixture('draft', 3);
    const saved = assemblyFixture('draft', 4);
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(current);
    vi.mocked(consolidatedPrescriptionService.getWorkspaceContext)
      .mockResolvedValueOnce(workspace)
      .mockRejectedValueOnce(new Error('workspace refresh unavailable'));
    vi.mocked(consolidatedPrescriptionService.updateComposition).mockResolvedValue(saved);

    renderPage();
    await screen.findByText('Rascunho');
    await user.click(screen.getByRole('button', { name: '5. Composição e ordem técnica' }));
    const observation = screen.getByLabelText('Observação técnica interna');
    await user.clear(observation);
    await user.type(observation, 'Save confirmado com refresh auxiliar indisponível');
    await user.click(screen.getByRole('button', { name: '7. Revisão e validação final' }));
    await user.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    expect(await screen.findByText('Rascunho atualizado e versionado pelo servidor.')).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível concluir a ação')).not.toBeInTheDocument();
  });

  it('só mostra aprovada depois da confirmação retornada pelo backend', async () => {
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
    vi.mocked(consolidatedPrescriptionService.approve).mockReturnValueOnce(
      new Promise((resolve) => { resolveApproval = resolve; })
    );

    renderPage();
    expect(await screen.findByText('Pronta para revisão')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '7. Revisão e validação final' }));
    await user.click(screen.getByRole('button', { name: 'Aprovar montagem' }));
    expect(screen.queryByText('Aprovada')).not.toBeInTheDocument();

    resolveApproval(approved);
    await waitFor(() => expect(screen.getByText('Aprovada')).toBeInTheDocument());
    expect(screen.getByText('Aprovação confirmada pelo servidor.')).toBeInTheDocument();
  });

  it('preserva edição local diante de 409 e exige reconciliação explícita', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(assemblyFixture('draft', 3));
    vi.mocked(consolidatedPrescriptionService.updateComposition).mockRejectedValue({
      response: { status: 409, data: { error: 'A montagem foi alterada por outro usuário' } },
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
    await user.click(screen.getByRole('button', { name: '5. Composição e ordem técnica' }));
    expect(screen.getByLabelText('Observação técnica interna')).toHaveValue('Alteração local que deve permanecer');
  });

  it('mantém gestão e aprovação separadas e diferencia warning de critical por texto', async () => {
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
        { code: 'warning-1', message: 'Atenção estruturada.', severity: 'warning', affectedCapacities: ['balance'], sourceRefIds: [] },
        { code: 'critical-1', message: 'Bloqueio estruturado.', severity: 'critical', affectedCapacities: ['resisted'], sourceRefIds: [] },
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

  it('mantém composição somente leitura sem manage', async () => {
    const user = userEvent.setup();
    accessState.allowed = new Set(['plans.consolidatedPrescriptions.view']);
    vi.mocked(consolidatedPrescriptionService.getCurrent).mockResolvedValue(assemblyFixture('draft', 3));

    renderPage();
    await screen.findByText('Rascunho');
    await user.click(screen.getByRole('button', { name: '5. Composição e ordem técnica' }));
    expect(screen.getByLabelText('Observação técnica interna')).toHaveAttribute('readonly');
    await user.click(screen.getByRole('button', { name: '7. Revisão e validação final' }));
    expect(screen.queryByRole('button', { name: 'Salvar rascunho' })).not.toBeInTheDocument();
  });
});
