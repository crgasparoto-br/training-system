import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CanonicalPostWorkoutFeedbackRevisionView } from '@corrida/types';
import { PostWorkoutFeedbackCard } from './PostWorkoutFeedbackCard';

const savedFeedback: CanonicalPostWorkoutFeedbackRevisionView = {
  id: 'feedback-1',
  sessionId: 'session-1',
  executionId: 'execution-1',
  executionStatus: 'completed',
  scopeKey: 'session',
  capacity: null,
  revisionNumber: 1,
  previousRevisionId: null,
  correctionReason: null,
  perceptionAuthor: 'student',
  revisedBy: 'student',
  createdAt: '2026-10-07T12:00:00.000Z',
  values: {
    pse: 8,
    psr: null,
    painBefore: null,
    painDuring: 3,
    painAfter: null,
    painLocation: 'Joelho',
    difficulty: null,
    fatigueLevel: null,
    energyLevel: null,
    sleepQuality: null,
    dizziness: null,
    observations: 'Treino concluído.',
    professorTechnicalNotes: null,
  },
  signals: [{
    code: 'pain_attention',
    severity: 'warning',
    painTriage: 'attention',
    studentMessage: 'O desconforto informado merece atenção.',
    technicalMessage: 'Dor 3–4: atenção.',
    requiresFollowUp: true,
    changesWorkoutAutomatically: false,
  }],
  current: true,
};

describe('PostWorkoutFeedbackCard (#390)', () => {
  it('preserva os valores e a mesma chave lógica após falha recuperável', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce(savedFeedback);

    render(<PostWorkoutFeedbackCard audience="student" initialFeedback={[]} save={save} />);

    const pse = screen.getByLabelText('Esforço percebido (PSE)') as HTMLInputElement;
    const pain = screen.getByLabelText('Dor durante') as HTMLInputElement;
    const location = screen.getByLabelText('Local da dor ou desconforto') as HTMLInputElement;
    fireEvent.change(pse, { target: { value: '8' } });
    fireEvent.change(pain, { target: { value: '3' } });
    fireEvent.change(location, { target: { value: 'Joelho' } });

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar feedback' }));
    await screen.findByRole('alert');

    expect(pse.value).toBe('8');
    expect(pain.value).toBe('3');
    expect(location.value).toBe('Joelho');

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar feedback' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));

    expect(save.mock.calls[1][0].operationKey).toBe(save.mock.calls[0][0].operationKey);
    expect(save.mock.calls[1][0].values).toMatchObject({ pse: 8, painDuring: 3, painLocation: 'Joelho' });
    expect(await screen.findByText('Feedback pós-treino')).toBeTruthy();
  });

  it('exibe síntese confirmada como somente leitura e usa mensagem prática para o aluno', () => {
    render(<PostWorkoutFeedbackCard audience="student" initialFeedback={[savedFeedback]} />);
    expect(screen.queryByRole('button', { name: 'Confirmar feedback' })).toBeNull();
    expect(screen.getByText('O desconforto informado merece atenção.')).toBeTruthy();
    expect(screen.getByText(/Feedback confirmado é somente leitura/)).toBeTruthy();
  });
});
