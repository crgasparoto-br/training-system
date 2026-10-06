import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { TrainingRoutineSessionDetail, TrainingRoutineView } from '@corrida/types';
import { TrainingRoutinePanel } from './TrainingRoutinePanel';

const session = (overrides: Partial<TrainingRoutineSessionDetail> = {}): TrainingRoutineSessionDetail => ({
  sessionId: 'day-1',
  workoutTemplateId: 'template-1',
  trainingPlanId: 'plan-1',
  planName: 'Plano 2026',
  date: '2026-10-01',
  dayOfWeek: 4,
  mesocycleNumber: 1,
  weekNumber: 2,
  modalities: ['resistance'],
  durationMin: 60,
  location: 'Academia',
  method: 'Seriado',
  status: 'not_started',
  origin: { kind: 'consolidated', releasedAt: '2026-09-28T12:00:00.000Z' },
  execution: {
    sessionId: 'day-1',
    status: 'not_started',
    version: 0,
    startedAt: null,
    finishedAt: null,
    currentPauseStartedAt: null,
    pausedDurationMs: 0,
    interruptionReason: null,
    origin: { releaseId: 'release-1', workoutTemplateId: 'template-1', trainingPlanId: 'plan-1' },
    sessionValues: {},
    items: [],
  },
  objective: 'Ganhar força',
  guidelines: ['Beba água durante o treino.'],
  cyclic: null,
  blocks: [
    {
      key: 'warmup',
      exercises: [
        { id: 'e1', order: 1, name: 'Mobilidade de quadril', system: null, sets: 2, reps: 10, loadKg: null, intervalSec: null, notes: null },
      ],
    },
    {
      key: 'main',
      exercises: [
        { id: 'e2', order: 1, name: 'Agachamento', system: 'Bi-set', sets: 3, reps: 8, loadKg: 47, intervalSec: 90, notes: 'Desça devagar' },
      ],
    },
  ],
  ...overrides,
  execution: overrides.execution ?? {
    sessionId: 'day-1',
    status: 'not_started',
    version: 0,
    startedAt: null,
    finishedAt: null,
    currentPauseStartedAt: null,
    pausedDurationMs: 0,
    interruptionReason: null,
    origin: { releaseId: 'release-1', workoutTemplateId: 'template-1', trainingPlanId: 'plan-1' },
    sessionValues: {},
    items: [],
  },
});

const routine = (overrides: Partial<TrainingRoutineView> = {}): TrainingRoutineView => ({
  alunoId: 'aluno-1',
  audience: 'student',
  referenceDate: '2026-10-01',
  timeZone: 'America/Sao_Paulo',
  week: { startDate: '2026-09-28', endDate: '2026-10-04' },
  days: [
    '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  ].map((date) => ({
    date,
    isToday: date === '2026-10-01',
    sessions: date === '2026-10-01' ? [session()] : [],
    pendingReleaseCount: date === '2026-10-03' ? 1 : 0,
  })),
  today: { date: '2026-10-01', state: 'released', sessions: [session()] },
  execution: { available: true, reason: null },
  ...overrides,
});

describe('TrainingRoutinePanel (#387)', () => {
  it('apresenta objetivo, duração, ordem, blocos e parâmetros do Treino de hoje', async () => {
    render(<TrainingRoutinePanel audience="student" load={vi.fn().mockResolvedValue(routine())} />);

    expect(await screen.findByRole('heading', { name: 'Musculação' })).toBeInTheDocument();
    expect(screen.getByText(/Duração estimada: 1 h/)).toBeInTheDocument();
    expect(screen.getByText('Ganhar força')).toBeInTheDocument();
    const main = screen.getByRole('region', { name: 'Parte principal' });
    expect(within(main).getByText('Agachamento')).toBeInTheDocument();
    expect(within(main).getByText('3 × 8 repetições · 47 kg · 90 s de descanso')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Aquecimento e mobilidade' })).toBeInTheDocument();
    expect(screen.getByText('Beba água durante o treino.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Segurança' })).toBeInTheDocument();
    expect(screen.getByText(/Treino liberado pelo seu professor/)).toBeInTheDocument();
  });

  it('apresenta distância prescrita quando a projeção operacional consolidada a fornece', async () => {
    const cyclicSession = session({
      modalities: ['cyclic'],
      cyclic: {
        durationMin: 30,
        distanceKm: 5,
        heartRate: null,
        speed: null,
        pace: null,
      },
    });
    render(
      <TrainingRoutinePanel
        audience="student"
        load={vi.fn().mockResolvedValue(routine({ today: { date: '2026-10-01', state: 'released', sessions: [cyclicSession] } }))}
      />
    );

    expect(await screen.findByText('Distância prevista')).toBeInTheDocument();
    expect(screen.getByText('5 km')).toBeInTheDocument();
  });

  it('mostra a rotina semanal com hoje, recuperação e treino em preparação distintos', async () => {
    render(<TrainingRoutinePanel audience="student" load={vi.fn().mockResolvedValue(routine())} />);

    const week = await screen.findByRole('region', { name: 'Rotina da semana' });
    const items = within(week).getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(items[3]).toHaveAttribute('aria-current', 'date');
    expect(within(items[3]).getByText('Hoje')).toBeInTheDocument();
    expect(within(items[5]).getByText('Treino em preparação')).toBeInTheDocument();
    expect(within(items[0]).getByText(/Recuperação/)).toBeInTheDocument();
  });

  it('inicia a sessão pelo contrato canônico e recarrega o estado persistido', async () => {
    const load = vi.fn().mockResolvedValue(routine());
    const transitionExecution = vi.fn().mockResolvedValue({
      ...session().execution,
      status: 'in_progress',
      version: 1,
      startedAt: '2026-10-01T12:00:00.000Z',
    });
    render(<TrainingRoutinePanel audience="student" load={load} transitionExecution={transitionExecution} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar treino' }));

    expect(transitionExecution).toHaveBeenCalledTimes(1);
    expect(transitionExecution).toHaveBeenCalledWith(
      'day-1',
      expect.objectContaining({ expectedVersion: 0, targetStatus: 'in_progress' })
    );
    expect(transitionExecution.mock.calls[0][1].operationKey).toMatch(/^workout-day-1-in_progress-/);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  it('preserva o motivo após falha recuperável e orienta reconciliação em conflito 409', async () => {
    const load = vi.fn().mockResolvedValue(routine());
    const transitionExecution = vi.fn().mockRejectedValue({ response: { status: 409 } });
    render(<TrainingRoutinePanel audience="student" load={load} transitionExecution={transitionExecution} />);

    await userEvent.type(
      await screen.findByPlaceholderText(/indisposição, falta de tempo/i),
      'indisposição'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Não vou conseguir treinar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/outro dispositivo/i);
    expect(screen.getByDisplayValue('indisposição')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atualizar estado' })).toBeInTheDocument();
  });

  it('distingue sessão ainda não liberada de dia sem treino', async () => {
    const { unmount } = render(
      <TrainingRoutinePanel
        audience="student"
        load={vi.fn().mockResolvedValue(routine({ today: { date: '2026-10-01', state: 'not_released', sessions: [] } }))}
      />
    );
    expect(await screen.findByText('Seu treino de hoje ainda está sendo preparado')).toBeInTheDocument();
    unmount();

    render(
      <TrainingRoutinePanel
        audience="student"
        load={vi.fn().mockResolvedValue(routine({ today: { date: '2026-10-01', state: 'none', sessions: [] } }))}
      />
    );
    expect(await screen.findByText('Nenhum treino para hoje')).toBeInTheDocument();
  });

  it('isola a falha com tentativa novamente', async () => {
    const load = vi.fn().mockRejectedValueOnce({ response: { status: 500 } }).mockResolvedValue(routine());
    render(<TrainingRoutinePanel audience="professor" load={load} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os treinos');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Musculação' })).toBeInTheDocument();
  });

  it('mostra acesso negado sem consultar a API quando o perfil não tem o bloco', async () => {
    const load = vi.fn();
    render(<TrainingRoutinePanel audience="professor" load={load} canView={false} />);

    expect(await screen.findByText('Sem permissão para ver os treinos')).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });

  it('trata 403/404 da API como acesso negado, distinto de erro', async () => {
    render(<TrainingRoutinePanel audience="professor" load={vi.fn().mockRejectedValue({ response: { status: 403 } })} />);
    expect(await screen.findByText('Sem permissão para ver os treinos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument();
  });

  it('mostra ao professor a origem consolidada e o contexto técnico', async () => {
    const professorSession = session({
      origin: {
        kind: 'consolidated',
        releasedAt: '2026-09-28T12:00:00.000Z',
        consolidatedRelease: { releaseId: 'release-1', assemblyId: 'assembly-1', sourceAssemblyVersion: 3, releasedAssemblyVersion: 4 },
      },
      technical: { coachGoal: 'Progredir carga', trainingMethod: null, trainingDivision: 'AB', repReserve: 2, vo2maxPct: null },
    });
    render(
      <TrainingRoutinePanel
        audience="professor"
        load={vi.fn().mockResolvedValue(
          routine({ audience: 'professor', today: { date: '2026-10-01', state: 'released', sessions: [professorSession] } })
        )}
      />
    );

    expect(await screen.findByText(/Montagem Consolidada, versão 3 aprovada e liberada/)).toBeInTheDocument();
    expect(screen.getByText('Progredir carga')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar treino' })).not.toBeInTheDocument();
  });

  it('oculta o bloco de check-in do professor quando a API não autoriza a projeção sensível', async () => {
    const professorSession = session();
    render(
      <TrainingRoutinePanel
        audience="professor"
        load={vi.fn().mockResolvedValue(
          routine({ audience: 'professor', today: { date: '2026-10-01', state: 'released', sessions: [professorSession] } })
        )}
      />
    );

    expect(await screen.findByRole('heading', { name: 'Musculação' })).toBeInTheDocument();
    expect(screen.queryByText('Check-in pré-treino')).not.toBeInTheDocument();
  });

  it('mantém o bloco de check-in visível ao professor autorizado mesmo quando não há registro', async () => {
    const professorSession = session({ preWorkoutCheckIn: null });
    render(
      <TrainingRoutinePanel
        audience="professor"
        load={vi.fn().mockResolvedValue(
          routine({ audience: 'professor', today: { date: '2026-10-01', state: 'released', sessions: [professorSession] } })
        )}
      />
    );

    expect(await screen.findByText('Check-in pré-treino')).toBeInTheDocument();
    expect(screen.getByText('Nenhum check-in registrado para esta sessão.')).toBeInTheDocument();
  });

  it('navega entre semanas pela data de referência', async () => {
    const load = vi.fn().mockResolvedValue(routine());
    render(<TrainingRoutinePanel audience="student" load={load} />);

    await userEvent.click(await screen.findByRole('button', { name: 'Próxima semana' }));
    await waitFor(() => expect(load).toHaveBeenLastCalledWith('2026-10-05'));
  });

  it('mantém a autoridade no backend sem persistência paralela no navegador', () => {
    const panelSource = readFileSync(resolve(__dirname, './TrainingRoutinePanel.tsx'), 'utf8');
    const serviceSource = readFileSync(resolve(__dirname, '../../services/training-routine.service.ts'), 'utf8');

    expect(panelSource).not.toMatch(/localStorage|sessionStorage/);
    expect(serviceSource).toContain('/execution/transition');
    expect(serviceSource).toContain('/execution/values');
    expect(serviceSource).not.toMatch(/\/executions\/workout-day\/.*\/status/);
  });
});
