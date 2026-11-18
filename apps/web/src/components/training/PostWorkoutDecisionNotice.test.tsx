// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostWorkoutDecisionNotice } from './PostWorkoutDecisionNotice';
import { postWorkoutDecisionService } from '../../services/post-workout-decision.service';

vi.mock('../../services/post-workout-decision.service', () => ({
  postWorkoutDecisionService: { notices: vi.fn() },
}));

const notice = (id: string, message: string) => ({
  id, action: 'reassess' as const, message, appliedAt: '2026-11-16T12:00:00.000Z',
});

beforeEach(() => {
  vi.mocked(postWorkoutDecisionService.notices).mockReset();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('student post-workout decision notices', () => {
  it('shows only the simplified applied guidance returned by the student endpoint', async () => {
    vi.mocked(postWorkoutDecisionService.notices).mockResolvedValueOnce([
      notice('decision-1','Orientação aprovada do professor'),
    ]);
    render(<PostWorkoutDecisionNotice contractId="contract-a" />);
    expect(await screen.findByText('Orientação aprovada do professor')).toBeInTheDocument();
    expect(screen.getByText('Orientações do professor')).toBeInTheDocument();
    expect(screen.queryByText(/Justificativa profissional/)).toBeNull();
    expect(postWorkoutDecisionService.notices).toHaveBeenCalledWith('contract-a');
  });

  it('clears cached guidance and discards an old in-flight contract response', async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof postWorkoutDecisionService.notices>>) => void;
    const oldResult = new Promise<Awaited<ReturnType<typeof postWorkoutDecisionService.notices>>>(
      resolve => { resolveOld = resolve; },
    );
    vi.mocked(postWorkoutDecisionService.notices)
      .mockReturnValueOnce(oldResult)
      .mockResolvedValueOnce([notice('decision-b','Orientação do contrato B')]);
    const view = render(<PostWorkoutDecisionNotice contractId="contract-a" />);
    await waitFor(() => expect(postWorkoutDecisionService.notices).toHaveBeenCalledTimes(1));
    view.rerender(<PostWorkoutDecisionNotice contractId="contract-b" />);
    expect(await screen.findByText('Orientação do contrato B')).toBeInTheDocument();
    await act(async () => { resolveOld([notice('old','Mensagem privada do contrato A')]); });
    expect(screen.queryByText('Mensagem privada do contrato A')).toBeNull();
    expect(postWorkoutDecisionService.notices).toHaveBeenNthCalledWith(2,'contract-b');
  });

  it('does not expose decision details when the student endpoint is unavailable', async () => {
    vi.mocked(postWorkoutDecisionService.notices).mockRejectedValueOnce(new Error('database down'));
    render(<PostWorkoutDecisionNotice contractId="contract-a" />);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Não foi possível consultar orientações recentes.',
    );
    expect(screen.queryByText('Orientações do professor')).toBeNull();
  });
});
