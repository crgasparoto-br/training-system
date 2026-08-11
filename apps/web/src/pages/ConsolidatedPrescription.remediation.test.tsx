import { act, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ConsolidatedPrescriptionAssembly,
  ConsolidatedPrescriptionConflictReport,
  ConsolidatedPrescriptionWorkspaceContext,
  PhysicalCapacityType,
} from '@corrida/types';
import { ConsolidatedPrescription } from './ConsolidatedPrescription';

type InterceptorResponse = {
  config: { url?: string; method?: string };
  data: unknown;
};

type InterceptorError = {
  config?: { url?: string };
  response?: { status?: number };
};

type FulfilledHandler = (response: InterceptorResponse) => InterceptorResponse;
type RejectedHandler = (error: InterceptorError) => Promise<never>;

const interceptorHarness = vi.hoisted(() => ({
  fulfilled: null as FulfilledHandler | null,
  rejected: null as RejectedHandler | null,
  use: vi.fn(),
  eject: vi.fn(),
}));

vi.mock('../services/api', () => {
  interceptorHarness.use.mockImplementation(
    (fulfilled: FulfilledHandler, rejected: RejectedHandler) => {
      interceptorHarness.fulfilled = fulfilled;
      interceptorHarness.rejected = rejected;
      return 17;
    }
  );

  return {
    default: {
      interceptors: {
        response: {
          use: interceptorHarness.use,
          eject: interceptorHarness.eject,
        },
      },
    },
  };
});

vi.mock('./ConsolidatedPrescriptionWorkspace', () => ({
  ConsolidatedPrescription: () => (
    <div data-testid="original-consolidated-workspace">Workspace autoritativo original</div>
  ),
}));

const capacities: PhysicalCapacityType[] = ['resisted', 'flexibility', 'cyclic', 'balance'];

function workspaceFixture(): ConsolidatedPrescriptionWorkspaceContext {
  return {
    aluno: { id: 'aluno-1', name: 'Maria Atleta' },
    actorProfessor: { id: 'professor-manager', name: 'Gestora Paula' },
    assignedProfessor: { id: 'professor-assigned', name: 'Prof. Bruno' },
    responsibleProfessor: { id: 'professor-responsible', name: 'Prof. Renata' },
    capacityCandidates: capacities.map((capacity, index) => ({
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
      sourceRefs: [],
      ...(index === 0
        ? {
            capacityPrescriptionVersionId: null,
            version: null,
            versionStatus: null,
            eligible: false,
            reasonCode: 'missing_current_version' as const,
            reason: 'Versão corrente ausente segundo a API.',
          }
        : {}),
      ...(index === 1
        ? {
            prescriptionStatus: 'suspended',
            eligible: false,
            reasonCode: 'prescription_not_active' as const,
            reason: 'Prescrição suspensa segundo a API.',
          }
        : {}),
    })),
    capacityCandidatesError: null,
  };
}

function assemblyFixture(): ConsolidatedPrescriptionAssembly {
  return {
    id: 'assembly-1',
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    currentVersion: 4,
    currentStatus: 'draft',
    createdByProfessorId: 'professor-manager',
    updatedByProfessorId: 'professor-manager',
    createdAt: '2026-08-08T10:00:00.000Z',
    updatedAt: '2026-08-11T10:00:00.000Z',
    latestVersion: {
      id: 'assembly-version-4',
      assemblyId: 'assembly-1',
      contractId: 'contract-1',
      alunoId: 'aluno-1',
      version: 4,
      status: 'draft',
      responsibleProfessorId: 'professor-responsible',
      technicalObservation: null,
      professorJustification: 'Justificativa persistida',
      studentInstruction: null,
      createdByProfessorId: 'professor-manager',
      createdAt: '2026-08-11T10:00:00.000Z',
      capacityBlocks: capacities.map((capacity, index) => ({
        id: `block-${capacity}`,
        capacityPrescriptionVersionId: `selected-${capacity}`,
        capacity,
        capacityVersion: index + 2,
        capacityStatus: 'active',
        position: index,
      })),
      dataRefs: [],
      conflicts: [],
      traceability: {
        capacityCount: 4,
        sourceRefIds: [],
        capacityVersions: capacities.map((capacity, index) => ({
          capacityPrescriptionVersionId: `selected-${capacity}`,
          capacity,
          version: index + 2,
          status: 'active',
        })),
      },
      canReleaseOperationalWorkout: false,
      createsTodayWorkoutDirectly: false,
    },
  };
}

const staleConflictReport: ConsolidatedPrescriptionConflictReport = {
  version: 4,
  status: 'draft',
  conflicts: [
    {
      code: 'capacity-version-ineligible:cyclic',
      message: 'A versão selecionada da capacidade cyclic não é mais a versão vigente e ativa.',
      severity: 'critical',
      affectedCapacities: ['cyclic'],
      sourceRefIds: [],
    },
  ],
  hasCritical: true,
  canUnblock: false,
  unavailableChecks: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/central-do-aluno/aluno-1/montagem-consolidada']}>
      <Routes>
        <Route
          path="/central-do-aluno/:alunoId/montagem-consolidada"
          element={<ConsolidatedPrescription />}
        />
      </Routes>
    </MemoryRouter>
  );
}

function emitSuccess(url: string, data: unknown, method = 'get') {
  const response: InterceptorResponse = {
    config: { url, method },
    data: { success: true, data },
  };
  act(() => {
    interceptorHarness.fulfilled?.(response);
  });
}

async function emitFailure(url: string, status: number) {
  await act(async () => {
    try {
      await interceptorHarness.rejected?.({ config: { url }, response: { status } });
    } catch {
      // O interceptor deve propagar o erro original para o consumidor da requisição.
    }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  interceptorHarness.fulfilled = null;
  interceptorHarness.rejected = null;
});

describe('ConsolidatedPrescription audit remediation', () => {
  it('expõe capacidades e versões no contexto superior e distingue ausência, desatualização e incompatibilidade', () => {
    renderPage();

    emitSuccess('/consolidated-prescriptions/alunos/aluno-1/workspace', workspaceFixture());
    emitSuccess('/consolidated-prescriptions/alunos/aluno-1', assemblyFixture());
    emitSuccess('/consolidated-prescriptions/alunos/aluno-1/conflicts', staleConflictReport);

    const header = screen.getByTestId('consolidated-prescription-context-header');
    expect(within(header).getByText('Capacidades selecionadas e versões')).toBeInTheDocument();
    expect(within(header).getByText('Resistido v2')).toBeInTheDocument();
    expect(within(header).getByText('Flexibilidade v3')).toBeInTheDocument();
    expect(within(header).getByText('Cíclico v4')).toBeInTheDocument();
    expect(within(header).getByText('Equilíbrio v5')).toBeInTheDocument();

    expect(within(header).getByText('Dado ausente')).toBeInTheDocument();
    expect(within(header).getByText('Dado desatualizado')).toBeInTheDocument();
    expect(within(header).getByText('Origem incompatível')).toBeInTheDocument();
    expect(within(header).getAllByText('Resistido').length).toBeGreaterThan(0);
    expect(within(header).getAllByText('Cíclico').length).toBeGreaterThan(0);
    expect(within(header).getAllByText('Flexibilidade').length).toBeGreaterThan(0);
  });

  it('oculta dados previamente carregados quando a API revoga o acesso ao recurso', async () => {
    renderPage();
    emitSuccess('/consolidated-prescriptions/alunos/aluno-1/workspace', workspaceFixture());
    emitSuccess('/consolidated-prescriptions/alunos/aluno-1', assemblyFixture());

    expect(screen.getByTestId('original-consolidated-workspace')).toBeInTheDocument();

    await emitFailure('/consolidated-prescriptions/alunos/aluno-1/conflicts/recalculate', 403);

    expect(
      screen.getByRole('heading', { name: 'Montagem Consolidada indisponível' })
    ).toBeInTheDocument();
    expect(screen.queryByTestId('original-consolidated-workspace')).not.toBeInTheDocument();
    expect(screen.queryByTestId('consolidated-prescription-context-header')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar à Central do Aluno' })).toHaveAttribute(
      'href',
      '/central-do-aluno/aluno-1'
    );
  });

  it('não invalida a montagem por 404 de uma API que não pertence ao fluxo consolidado', async () => {
    renderPage();
    emitSuccess('/consolidated-prescriptions/alunos/aluno-1/workspace', workspaceFixture());

    await emitFailure('/students/aluno-1', 404);

    expect(screen.getByTestId('original-consolidated-workspace')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Montagem Consolidada indisponível' })
    ).not.toBeInTheDocument();
  });
});
