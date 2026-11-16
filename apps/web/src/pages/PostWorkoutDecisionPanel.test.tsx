// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostWorkoutDecisionView } from '@corrida/types';
import { postWorkoutDecisionService } from '../services/post-workout-decision.service';
import { PostWorkoutDecisionPanel } from './PostWorkoutDecisionPanel';

vi.mock('../services/post-workout-decision.service', () => ({
  postWorkoutDecisionService: {
    list: vi.fn(), sources: vi.fn(), suggest: vi.fn(), transition: vi.fn(),
  },
}));

const props = {
  alunoId: 'student-406', contractId: 'contract-406', authorizationKey: 'granted',
  canView: true, canSuggest: true, canApprove: true, canApply: true,
};
const decision = (id: string): PostWorkoutDecisionView => ({
  id, alunoId: props.alunoId, contractId: props.contractId,
  workoutDayId: 'day-406', sourceFeedbackRevisionId: 'revision-406',
  trainingPlanId: 'plan-406', action: 'maintain', rationale: 'Justificativa ' + id,
  status: 'suggested', version: 1, suggestedAt: '2026-11-16T12:00:00Z',
  suggestedByProfessorId: 'professor-406', approvedAt: null, approvedByProfessorId: null,
  approvalReason: null, rejectedAt: null, rejectedByProfessorId: null,
  rejectionReason: null, appliedAt: null, appliedByProfessorId: null,
  studentMessage: null, exposeToStudent: false, adjustment: null,
  sourceSnapshot: {
    feedbackRevisionNumber: 1, scopeKey: 'session', ruleSetVersion: 'v1',
    recordedAt: '2026-11-16T12:00:00Z', originReleaseId: 'release-406',
    values: {
      pse: null, psr: null, painBefore: null, painDuring: null, painAfter: null,
      painLocation: null, difficulty: null, fatigueLevel: null, energyLevel: null,
      sleepQuality: null, dizziness: null, observations: null, professorTechnicalNotes: null,
    }, signals: [],
  },
});

beforeEach(() => {
  vi.mocked(postWorkoutDecisionService.list).mockReset();
  vi.mocked(postWorkoutDecisionService.sources).mockReset();
  vi.mocked(postWorkoutDecisionService.list).mockResolvedValue({
    decisions: [decision('first')], planningVersions: {}, nextCursor: null,
  });
  vi.mocked(postWorkoutDecisionService.sources).mockResolvedValue({
    sources: [], nextCursor: null,
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('professional post-workout decision panel', () => {
  it('loads older decisions by cursor without duplicating an existing decision', async () => {
    vi.mocked(postWorkoutDecisionService.list)
      .mockResolvedValueOnce({ decisions: [decision('first')], planningVersions: {}, nextCursor: 'cursor-first' })
      .mockResolvedValueOnce({
        decisions: [decision('first'), decision('older')], planningVersions: {}, nextCursor: null,
      });
    render(<PostWorkoutDecisionPanel {...props} />);
    expect(await screen.findByText('Justificativa first')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar decisões anteriores' }));
    expect(await screen.findByText('Justificativa older')).toBeInTheDocument();
    expect(screen.getAllByText('Justificativa first')).toHaveLength(1);
    expect(postWorkoutDecisionService.list).toHaveBeenCalledWith('student-406', 'cursor-first');
  });

  it('loads older feedback sources so a large revision history cannot hide sessions', async () => {
    vi.mocked(postWorkoutDecisionService.sources).mockReset();
    vi.mocked(postWorkoutDecisionService.sources)
      .mockResolvedValueOnce({ sources: [{
        workoutDayId: 'day-a', feedbackRevisionId: 'revision-a', scopeKey: 'session',
        revisionNumber: 1, recordedAt: '2026-11-16T10:00:00Z', signals: [],
      }], nextCursor: 'revision-a' })
      .mockResolvedValueOnce({ sources: [{
        workoutDayId: 'day-b', feedbackRevisionId: 'revision-b', scopeKey: 'capacity:resisted',
        revisionNumber: 2, recordedAt: '2026-11-15T10:00:00Z', signals: [],
      }], nextCursor: null });
    render(<PostWorkoutDecisionPanel {...props} />);
    expect(await screen.findByRole('option', { name: /revisão 1/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais sessões com feedback' }));
    expect(await screen.findByRole('option', { name: /revisão 2/ })).toBeInTheDocument();
    expect(postWorkoutDecisionService.sources).toHaveBeenCalledWith('student-406', 'revision-a');
  });

  it('hides cached clinical decisions immediately after permission revocation', async () => {
    const view = render(<PostWorkoutDecisionPanel {...props} />);
    expect(await screen.findByText('Justificativa first')).toBeInTheDocument();
    view.rerender(<PostWorkoutDecisionPanel {...props}
      canView={false} canSuggest={false} canApprove={false} canApply={false}
      authorizationKey="revoked" />);
    expect(screen.queryByText('Justificativa first')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Decisões pós-treino' })).toBeNull();
    await waitFor(() => expect(postWorkoutDecisionService.list).toHaveBeenCalledTimes(1));
  });
});
