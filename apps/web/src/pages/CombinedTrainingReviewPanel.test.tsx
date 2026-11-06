import { render, screen } from '@testing-library/react';
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
      canReadSensitive dirty={false}
    />);
    await user.click(screen.getByRole('button', { name: 'Consultar evidências históricas' }));
    expect(await screen.findByText(/7 sessões liberadas/)).toBeInTheDocument();

    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-b" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive dirty={false}
    />);
    expect(screen.queryByText(/7 sessões liberadas/)).not.toBeInTheDocument();
    expect(consolidatedPrescriptionService.getCombinedHistory).toHaveBeenCalledTimes(1);
  });

  it('revoga a visualização ao trocar contrato ou identidade da versão com mesmo número', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getCombinedHistory).mockResolvedValue(history);
    const view = render(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive dirty={false}
    />);
    await user.click(screen.getByRole('button', { name: 'Consultar evidências históricas' }));
    expect(await screen.findByText(/7 sessões liberadas/)).toBeInTheDocument();
    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-b" currentVersion={1} summary={summary(1)}
      canReadSensitive dirty={false}
    />);
    expect(screen.queryByText(/7 sessões liberadas/)).not.toBeInTheDocument();
    // The same civil version number does not identify the same persisted release.
    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1}
      summary={{ ...summary(1), assemblyVersionId: 'different-assembly-version' }}
      canReadSensitive dirty={false}
    />);
    expect(screen.queryByText(/7 sessões liberadas/)).not.toBeInTheDocument();
  });

  it('não reutiliza evidência ao mudar a versão ou perder concessão clínica', async () => {
    const user = userEvent.setup();
    vi.mocked(consolidatedPrescriptionService.getCombinedHistory).mockResolvedValue(history);
    const view = render(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={1} summary={summary(1)}
      canReadSensitive dirty={false}
    />);
    await user.click(screen.getByRole('button', { name: 'Consultar evidências históricas' }));
    expect(await screen.findByText(/7 sessões liberadas/)).toBeInTheDocument();
    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={2} summary={summary(2)}
      canReadSensitive dirty={false}
    />);
    expect(screen.queryByText(/7 sessões liberadas/)).not.toBeInTheDocument();
    view.rerender(<CombinedTrainingReviewPanel
      alunoId="aluno-a" contractId="tenant-a" currentVersion={2} summary={summary(2)}
      canReadSensitive={false} dirty={false}
    />);
    expect(screen.queryByRole('button', { name: 'Consultar evidências históricas' })).not.toBeInTheDocument();
  });
});
