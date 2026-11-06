import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ConsolidatedCombinedReviewSnapshot } from '@corrida/types';
import { consolidatedPrescriptionService } from '../services/consolidated-prescription.service';
import { CombinedTrainingReviewPanel } from './CombinedTrainingReviewPanel';

vi.mock('../services/consolidated-prescription.service', () => ({
  consolidatedPrescriptionService: { getCombinedHistory: vi.fn() },
}));

const summary = (version: number): ConsolidatedCombinedReviewSnapshot => ({
  protocolVersion: 'combined-conflict-v1',
  assemblyVersionId: 'assembly-version-' + version,
  assemblyVersion: version,
  source: 'persisted_assembly',
  state: 'no_active_rules',
  coverage: 'partial', activeRuleCount: 0,
  capacitySources: [],
  mayConcludeNoConflict: false,
  changesWorkoutAutomatically: false,
});
const history = {
  protocolVersion: 'combined-conflict-v1' as const,
  state: 'no_active_rules' as const,
  coverage: 'partial' as const, coverageReason: 'Sem horários reais.',
  releasedSessionCount: 7, observationCount: 12, sessionSignalCount: 3,
  evaluations: [], changesWorkoutAutomatically: false as const,
};

describe('combined review history subject binding', () => {
  it('não mostra histórico do aluno anterior nem antes do efeito de limpeza', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getCombinedHistory).mockResolvedValue(history);
    const view = render(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    await user.click(screen.getByRole('button', { name: 'Consultar evidências históricas' }));
    expect(await screen.findByText(/7 sessões liberadas/)).toBeInTheDocument();

    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-b" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    expect(screen.queryByText(/7 sessões liberadas/)).not.toBeInTheDocument();
    expect(consolidatedPrescriptionService.getCombinedHistory).toHaveBeenCalledTimes(1);
  });

  it('revoga a visualização ao trocar contrato ou identidade da versão com mesmo número', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getCombinedHistory).mockResolvedValue(history);
    const view = render(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    await user.click(screen.getByRole('button', { name: 'Consultar evidências históricas' }));
    expect(await screen.findByText(/7 sessões liberadas/)).toBeInTheDocument();
    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-b" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    expect(screen.queryByText(/7 sessões liberadas/)).not.toBeInTheDocument();
    // The same civil version number does not identify the same persisted release.
    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1}
      summary={{ ...summary(1), assemblyVersionId: 'different-assembly-version' }}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    expect(screen.queryByText(/7 sessões liberadas/)).not.toBeInTheDocument();
  });

  it('exibe regra, severidade, orientação e proveniência apenas no histórico autorizado', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getCombinedHistory).mockResolvedValue({
      ...history,
      state: 'evaluated',
      evaluations: [{
        ruleCode: 'HYPOTHETICAL-ONLY', ruleVersion: 'fixture-1',
        ruleSource: 'hypothetical-test-source',
        status: 'triggered', severity: 'warning',
        professorGuidance: 'Revisar com o profissional.',
        missingOperands: [],
        evidence: [{
          sessionId: 'session-1', capacity: 'cyclic', scheduledAt: '2026-11-05T00:00:00.000Z',
          metric: 'psr', value: 5,
          source: { kind: 'feedback', recordId: 'feedback-1', version: '4' },
        }],
      }],
    });
    render(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    await user.click(screen.getByRole('button', { name: 'Consultar evidências históricas' }));
    expect(await screen.findByText(/HYPOTHETICAL-ONLY vfixture-1/)).toBeInTheDocument();
    expect(screen.getByText(/Severidade: Atenção/)).toBeInTheDocument();
    expect(screen.getByText('Revisar com o profissional.')).toBeInTheDocument();
    expect(screen.getByText(/feedback\/feedback-1 v4/)).toBeInTheDocument();
  });

  it('não reutiliza evidência ao mudar a versão ou perder concessão clínica', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getCombinedHistory).mockResolvedValue(history);
    const view = render(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    await user.click(screen.getByRole('button', { name: 'Consultar evidências históricas' }));
    expect(await screen.findByText(/7 sessões liberadas/)).toBeInTheDocument();
    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={2} summary={summary(2)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    expect(screen.queryByText(/7 sessões liberadas/)).not.toBeInTheDocument();
    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={2} summary={summary(2)}
      canReadSensitive={false} authorizationKey="professor-a:contract" dirty={false}
    />);
    expect(screen.queryByRole('button', { name: 'Consultar evidências históricas' })).not.toBeInTheDocument();
  });

  it('invalida evidencia na reducao de dataScope, mesmo com concessoes clinicas mantidas', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getCombinedHistory).mockResolvedValue(history);
    const view = render(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    await user.click(screen.getByRole('button', { name: /Consultar evid/ }));
    expect(await screen.findByText(/7 sess/)).toBeInTheDocument();

    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:self" dirty={false}
    />);
    expect(screen.queryByText(/7 sess/)).not.toBeInTheDocument();

    // Returning to the original scope never resurrects data from the old epoch.
    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    expect(screen.queryByText(/7 sess/)).not.toBeInTheDocument();
    expect(consolidatedPrescriptionService.getCombinedHistory).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: /Consultar evid/ }));
    expect(await screen.findByText(/7 sess/)).toBeInTheDocument();
    expect(consolidatedPrescriptionService.getCombinedHistory).toHaveBeenCalledTimes(2);
  });

  it('descarta resposta pendente do ator anterior, mesmo com o mesmo aluno, contrato e grants', async () => {
    const user = userEvent.setup();
    let resolvePrevious!: (value: typeof history) => void;
    vi.mocked(consolidatedPrescriptionService.getCombinedHistory).mockImplementationOnce(
      () => new Promise<typeof history>((resolve) => { resolvePrevious = resolve; })
    );
    const view = render(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    await user.click(screen.getByRole('button', { name: /Consultar evid/ }));
    expect(consolidatedPrescriptionService.getCombinedHistory).toHaveBeenCalledTimes(1);

    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-b:contract" dirty={false}
    />);
    await act(async () => { resolvePrevious(history); });
    expect(screen.queryByText(/7 sess/)).not.toBeInTheDocument();

    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive authorizationKey="professor-a:contract" dirty={false}
    />);
    expect(screen.queryByText(/7 sess/)).not.toBeInTheDocument();
    vi.mocked(consolidatedPrescriptionService.getCombinedHistory).mockResolvedValueOnce(history);
    await user.click(screen.getByRole('button', { name: /Consultar evid/ }));
    expect(await screen.findByText(/7 sess/)).toBeInTheDocument();
    expect(consolidatedPrescriptionService.getCombinedHistory).toHaveBeenCalledTimes(2);
  });
});
