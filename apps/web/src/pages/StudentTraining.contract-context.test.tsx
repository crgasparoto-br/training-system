import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { TrainingRoutineView } from '@corrida/types';

const { getForStudent } = vi.hoisted(() => ({ getForStudent: vi.fn() }));
vi.mock('../services/training-routine.service', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/training-routine.service')>();
  return { ...original, trainingRoutineService: { ...original.trainingRoutineService, getForStudent } };
});
import { StudentTraining } from './StudentTraining';

const routine = (): TrainingRoutineView => ({
  alunoId: 'aluno-1',
  audience: 'student',
  referenceDate: '2026-10-01',
  timeZone: 'America/Sao_Paulo',
  week: { startDate: '2026-09-28', endDate: '2026-10-04' },
  days: [{ date: '2026-10-01', isToday: true, sessions: [], pendingReleaseCount: 0 }],
  today: { date: '2026-10-01', state: 'none', sessions: [] },
  execution: { available: true, reason: null },
  nextSession: { sessionId: 'session-a', date: '2026-11-03', status: 'not_started' },
  lastExecution: null,
  feedbackContinuity: { state: 'available', pendingCount: 0, registeredCount: 0 },
});
function Page() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate('/student/training?contractId=contract-b')}>Trocar contrato</button>
      <StudentTraining />
    </>
  );
}

describe('StudentTraining: isolamento contratual (#391)', () => {
  it('remove dados do contrato anterior antes de receber o segundo snapshot', async () => {
    getForStudent.mockReset()
      .mockResolvedValueOnce(routine())
      .mockImplementationOnce(() => new Promise<TrainingRoutineView>(() => {}));
    render(<MemoryRouter initialEntries={['/student/training?contractId=contract-a']}><Page /></MemoryRouter>);
    expect(await screen.findByText('03/11 · Não iniciado')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Trocar contrato' }));
    expect(screen.queryByText('03/11 · Não iniciado')).not.toBeInTheDocument();
    expect(screen.getByText('Carregando treinos...')).toBeInTheDocument();
    expect(getForStudent).toHaveBeenLastCalledWith({ date: undefined, contractId: 'contract-b' });
  });

  it('não reapresenta cards antigos após resposta 403 para o contrato novo', async () => {
    getForStudent.mockReset()
      .mockResolvedValueOnce(routine())
      .mockRejectedValueOnce({ response: { status: 403 } });
    render(<MemoryRouter initialEntries={['/student/training?contractId=contract-a']}><Page /></MemoryRouter>);
    expect(await screen.findByText('03/11 · Não iniciado')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Trocar contrato' }));
    expect(await screen.findByText('Sem permissão para ver os treinos')).toBeInTheDocument();
    expect(screen.queryByText('03/11 · Não iniciado')).not.toBeInTheDocument();
  });
});
