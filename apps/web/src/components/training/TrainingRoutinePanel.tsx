import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Info, MapPin, ShieldAlert } from 'lucide-react';
import type {
  TrainingRoutineAudience,
  TrainingRoutineBlockKey,
  TrainingRoutineDay,
  TrainingRoutineExercise,
  TrainingRoutineModality,
  TrainingRoutineExecutionProjectionStatus,
  TrainingRoutineSessionDetail,
  TrainingRoutineView,
  TrainingSessionExecutionStatus,
  TrainingSessionExecutionTransitionPayload,
  TrainingSessionExecutionView,
} from '@corrida/types';
import { Button } from '../ui/Button';
import { PreWorkoutCheckInCard } from './PreWorkoutCheckInCard';
import { PostWorkoutFeedbackCard } from './PostWorkoutFeedbackCard';
import type { UpsertPreWorkoutCheckInPayload, PreWorkoutCheckInView, CreateCanonicalPostWorkoutFeedbackPayload, CanonicalPostWorkoutFeedbackRevisionView } from '@corrida/types';
import {
  getTrainingRoutineErrorKind,
  shiftDateOnly,
  type TrainingRoutineLoadErrorKind,
} from '../../services/training-routine.service';

/**
 * Rotina semanal, Treino de hoje e controles do lifecycle canônico (#387/#389).
 *
 * O frontend não simula transições: envia versão esperada e chave idempotente,
 * e reconcilia a tela com o estado persistido retornado pela API.
 */

export const modalityLabels: Record<TrainingRoutineModality, string> = {
  resistance: 'Musculação',
  cyclic: 'Aeróbio',
  flexibility: 'Flexibilidade',
  balance: 'Equilíbrio',
};

export const sessionStatusLabels: Record<TrainingRoutineExecutionProjectionStatus, string> = {
  not_started: 'Não iniciado',
  in_progress: 'Em andamento',
  paused: 'Pausado',
  completed: 'Concluído',
  partial: 'Parcial',
  not_performed: 'Não realizado',
};

const sessionStatusClass: Record<TrainingRoutineExecutionProjectionStatus, string> = {
  not_started: 'border-border bg-background text-muted-foreground',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-800',
  paused: 'border-amber-200 bg-amber-50 text-amber-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  partial: 'border-orange-200 bg-orange-50 text-orange-800',
  not_performed: 'border-border bg-muted/40 text-muted-foreground',
};

const blockLabels: Record<TrainingRoutineBlockKey, string> = {
  warmup: 'Aquecimento e mobilidade',
  main: 'Parte principal',
  cooldown: 'Finalização',
  other: 'Outros exercícios',
};

const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' });
const shortDateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const longDateFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  timeZone: 'UTC',
});

const toUtcDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
export const formatWeekday = (value: string) => capitalize(weekdayFormatter.format(toUtcDate(value)));
export const formatShortDate = (value: string) => shortDateFormatter.format(toUtcDate(value));
export const formatLongDate = (value: string) => capitalize(longDateFormatter.format(toUtcDate(value)));

const formatDuration = (minutes: number | null) => {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

const formatRange = (range: { min: string | null; max: string | null } | null, unit: string) => {
  if (!range) return null;
  if (range.min && range.max) return range.min === range.max ? `${range.min} ${unit}` : `${range.min} a ${range.max} ${unit}`;
  return `${range.min ?? range.max} ${unit}`;
};

export const sessionTitle = (modalities: TrainingRoutineModality[]) =>
  modalities.length ? modalities.map((modality) => modalityLabels[modality]).join(' + ') : 'Sessão de treino';

function exercisePrescription(item: TrainingRoutineExercise) {
  const parts: string[] = [];
  if (item.sets !== null && item.reps !== null) parts.push(`${item.sets} × ${item.reps} repetições`);
  else if (item.sets !== null) parts.push(`${item.sets} séries`);
  else if (item.reps !== null) parts.push(`${item.reps} repetições`);
  if (item.loadKg !== null) parts.push(`${item.loadKg.toLocaleString('pt-BR')} kg`);
  if (item.intervalSec !== null) parts.push(`${item.intervalSec} s de descanso`);
  return parts.join(' · ');
}

function StatusBadge({ status }: { status: TrainingRoutineExecutionProjectionStatus }) {
  return (
    <span className={`inline-flex w-fit shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${sessionStatusClass[status]}`}>
      {sessionStatusLabels[status]}
    </span>
  );
}

function OriginNote({ session, audience }: { session: TrainingRoutineSessionDetail; audience: TrainingRoutineAudience }) {
  const releasedAt = session.origin.releasedAt ? ` em ${formatShortDate(session.origin.releasedAt)}` : '';
  if (audience === 'student') {
    return <p className="text-xs text-muted-foreground">Treino liberado pelo seu professor{releasedAt}.</p>;
  }
  const release = session.origin.consolidatedRelease;
  return (
    <p className="text-xs text-muted-foreground">
      {release
        ? `Origem: Montagem Consolidada, versão ${release.sourceAssemblyVersion} aprovada e liberada${releasedAt} (registro ${release.releaseId}).`
        : `Origem: Montagem Consolidada${releasedAt}.`}
      {` Plano: ${session.planName} · mesociclo ${session.mesocycleNumber}, semana ${session.weekNumber}.`}
    </p>
  );
}

function TodaySession({
  session,
  audience,
  executionAvailable,
  saveCheckIn,
  saveFeedback,
  transitionExecution,
  onExecutionChanged,
}: {
  session: TrainingRoutineSessionDetail;
  audience: TrainingRoutineAudience;
  executionAvailable: boolean;
  saveCheckIn?: (sessionId: string, payload: UpsertPreWorkoutCheckInPayload) => Promise<PreWorkoutCheckInView>;
  saveFeedback?: (sessionId: string, payload: CreateCanonicalPostWorkoutFeedbackPayload) => Promise<CanonicalPostWorkoutFeedbackRevisionView>;
  transitionExecution?: (sessionId: string, payload: TrainingSessionExecutionTransitionPayload) => Promise<TrainingSessionExecutionView>;
  onExecutionChanged?: () => Promise<void>;
}) {
  const headingId = useId();
  const executionNoteId = useId();
  const [executionReason, setExecutionReason] = useState('');
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionBusy, setExecutionBusy] = useState(false);
  const operationRef = useRef<{ signature: string; key: string } | null>(null);
  const duration = formatDuration(session.durationMin);

  const transition = async (targetStatus: TrainingSessionExecutionStatus) => {
    if (!transitionExecution || executionBusy) return;
    const requiresReason = targetStatus === 'partial' || targetStatus === 'not_performed';
    const reason = executionReason.trim();
    if (requiresReason && !reason) {
      setExecutionError('Informe o motivo antes de encerrar o treino dessa forma.');
      return;
    }

    const signature = `${session.execution.version}:${targetStatus}:${reason}`;
    if (!operationRef.current || operationRef.current.signature !== signature) {
      operationRef.current = {
        signature,
        key: `workout-${session.sessionId}-${targetStatus}-${Date.now()}`,
      };
    }

    setExecutionBusy(true);
    setExecutionError(null);
    try {
      await transitionExecution(session.sessionId, {
        operationKey: operationRef.current.key,
        expectedVersion: session.execution.version,
        targetStatus,
        ...(requiresReason ? { reason } : {}),
      });
      operationRef.current = null;
      if (onExecutionChanged) await onExecutionChanged();
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      setExecutionError(
        status === 409
          ? 'O estado deste treino mudou em outro dispositivo. Atualize o estado antes de tentar novamente.'
          : 'Não foi possível salvar a alteração. Seus dados nesta tela foram preservados; tente novamente.'
      );
    } finally {
      setExecutionBusy(false);
    }
  };
  const cyclicItems = session.cyclic
    ? [
        { label: 'Tempo do aeróbio', value: formatDuration(session.cyclic.durationMin) },
        { label: 'Distância prevista', value: session.cyclic.distanceKm !== null ? `${session.cyclic.distanceKm.toLocaleString('pt-BR')} km` : null },
        { label: 'Frequência cardíaca alvo', value: formatRange(session.cyclic.heartRate, 'bpm') },
        { label: 'Velocidade alvo', value: formatRange(session.cyclic.speed, 'km/h') },
        { label: 'Ritmo (pace) alvo', value: formatRange(session.cyclic.pace, 'min/km') },
      ].filter((item): item is { label: string; value: string } => Boolean(item.value))
    : [];

  return (
    <article aria-labelledby={headingId} className="space-y-4 rounded-lg border border-border bg-background p-4">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <h3 id={headingId} className="text-lg font-semibold text-foreground">
            {sessionTitle(session.modalities)}
          </h3>
          <StatusBadge status={session.status} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {duration && (
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden="true" />
              Duração estimada: {duration}
            </span>
          )}
          {session.location && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {session.location}
            </span>
          )}
          {session.method && <span>Método: {session.method}</span>}
        </div>
        {session.objective && (
          <p className="text-sm text-foreground">
            <span className="font-medium">Objetivo da sessão:</span> {session.objective}
          </p>
        )}
      </header>

      {cyclicItems.length > 0 && (
        <section aria-label="Parâmetros do aeróbio">
          <h4 className="text-sm font-semibold text-foreground">Aeróbio</h4>
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            {cyclicItems.map((item) => (
              <div key={item.label}>
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="font-medium text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {session.blocks.map((block) => (
        <section key={block.key} aria-label={blockLabels[block.key]}>
          <h4 className="text-sm font-semibold text-foreground">{blockLabels[block.key]}</h4>
          <ol className="mt-2 divide-y divide-border rounded-lg border border-border">
            {block.exercises.map((item, index) => {
              const prescription = exercisePrescription(item);
              return (
                <li key={item.id} className="flex gap-3 p-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium text-foreground">{item.name}</p>
                    {prescription && <p className="text-sm text-muted-foreground">{prescription}</p>}
                    {item.system && <p className="text-xs text-muted-foreground">Sistema: {item.system}</p>}
                    {item.notes && <p className="text-sm text-foreground">{item.notes}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {session.guidelines.length > 0 && (
        <section aria-label="Orientações da sessão" className="rounded-lg bg-muted/40 p-3">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Info className="h-4 w-4" aria-hidden="true" />
            Orientações
          </h4>
          <div className="mt-1.5 space-y-1.5 text-sm text-foreground">
            {session.guidelines.map((guideline, index) => (
              <p key={index} className="whitespace-pre-line">{guideline}</p>
            ))}
          </div>
        </section>
      )}

      {(audience === 'student' || Object.prototype.hasOwnProperty.call(session, 'preWorkoutCheckIn')) && (
        <PreWorkoutCheckInCard
          audience={audience}
          sessionStatus={session.status}
          initialCheckIn={session.preWorkoutCheckIn ?? null}
          save={saveCheckIn ? (payload) => saveCheckIn(session.sessionId, payload) : undefined}
        />
      )}

      {(session.status === 'completed' || session.status === 'partial') && (audience === 'student' || Object.prototype.hasOwnProperty.call(session, 'postWorkoutFeedback')) && (
        <PostWorkoutFeedbackCard audience={audience} initialFeedback={session.postWorkoutFeedback ?? []} save={saveFeedback ? (payload) => saveFeedback(session.sessionId, payload) : undefined} />
      )}

      <section aria-label="Segurança" className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
        <h4 className="flex items-center gap-1.5 font-semibold">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          Segurança
        </h4>
        <p className="mt-1">
          {audience === 'student'
            ? 'Interrompa o treino se sentir dor forte, tontura, falta de ar fora do normal ou mal-estar, e avise seu professor.'
            : 'Oriente o aluno a interromper o treino em caso de dor forte, tontura, falta de ar fora do normal ou mal-estar.'}
        </p>
      </section>

      {audience === 'professor' && session.technical && (
        <section aria-label="Contexto técnico" className="rounded-lg border border-border p-3 text-sm">
          <h4 className="font-semibold text-foreground">Contexto técnico (visível só para a equipe)</h4>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {[
              { label: 'Objetivo do professor', value: session.technical.coachGoal },
              { label: 'Método do treino', value: session.technical.trainingMethod },
              { label: 'Divisão', value: session.technical.trainingDivision },
              { label: 'Repetições em reserva', value: session.technical.repReserve?.toString() ?? null },
              { label: 'VO2máx (%)', value: session.technical.vo2maxPct?.toLocaleString('pt-BR') ?? null },
            ]
              .filter((item) => item.value)
              .map((item) => (
                <div key={item.label}>
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="font-medium text-foreground">{item.value}</dd>
                </div>
              ))}
          </dl>
        </section>
      )}

      <footer className="space-y-3 border-t border-border pt-3">
        <OriginNote session={session} audience={audience} />
        {audience === 'student' && !['completed', 'partial', 'not_performed'].includes(session.status) && (
          <div className="space-y-3">
            <label className="block text-sm text-foreground">
              <span className="font-medium">Motivo (necessário para treino parcial ou não realizado)</span>
              <textarea
                value={executionReason}
                onChange={(event) => setExecutionReason(event.target.value)}
                rows={2}
                maxLength={500}
                disabled={executionBusy}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Ex.: indisposição, falta de tempo ou interrupção da sessão"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {session.status === 'not_started' && (
                <>
                  <Button type="button" disabled={!executionAvailable || executionBusy} onClick={() => void transition('in_progress')} className="w-full sm:w-auto">
                    Iniciar treino
                  </Button>
                  <Button type="button" variant="outline" disabled={!executionAvailable || executionBusy} onClick={() => void transition('not_performed')} className="w-full sm:w-auto">
                    Não vou conseguir treinar
                  </Button>
                </>
              )}
              {session.status === 'in_progress' && (
                <>
                  <Button type="button" variant="outline" disabled={!executionAvailable || executionBusy} onClick={() => void transition('paused')} className="w-full sm:w-auto">
                    Pausar treino
                  </Button>
                  <Button type="button" disabled={!executionAvailable || executionBusy} onClick={() => void transition('completed')} className="w-full sm:w-auto">
                    Concluir treino
                  </Button>
                  <Button type="button" variant="outline" disabled={!executionAvailable || executionBusy} onClick={() => void transition('partial')} className="w-full sm:w-auto">
                    Encerrar como parcial
                  </Button>
                </>
              )}
              {session.status === 'paused' && (
                <>
                  <Button type="button" disabled={!executionAvailable || executionBusy} onClick={() => void transition('in_progress')} className="w-full sm:w-auto">
                    Retomar treino
                  </Button>
                  <Button type="button" variant="outline" disabled={!executionAvailable || executionBusy} onClick={() => void transition('partial')} className="w-full sm:w-auto">
                    Encerrar como parcial
                  </Button>
                </>
              )}
            </div>
            {!executionAvailable && (
              <p id={executionNoteId} className="text-xs text-muted-foreground">
                O registro do treino pelo aplicativo não está disponível neste contexto.
              </p>
            )}
            {session.status === 'paused' && (
              <p className="text-xs text-muted-foreground">
                O treino está pausado. O tempo operacional permanece congelado até a retomada.
              </p>
            )}
            {executionError && (
              <div role="alert" className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900">
                <p>{executionError}</p>
                {executionError.includes('outro dispositivo') && onExecutionChanged && (
                  <Button type="button" variant="outline" size="sm" className="mt-2" disabled={executionBusy} onClick={() => void onExecutionChanged()}>
                    Atualizar estado
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}

function TodayEmptyState({ state, audience }: { state: 'not_released' | 'none'; audience: TrainingRoutineAudience }) {
  const copy =
    state === 'not_released'
      ? audience === 'student'
        ? {
            title: 'Seu treino de hoje ainda está sendo preparado',
            body: 'Existe uma sessão prevista para hoje, mas ela ainda não foi liberada pelo seu professor.',
          }
        : {
            title: 'Sessão de hoje ainda não liberada',
            body: 'Existe uma sessão montada para hoje que ainda não foi liberada ao aluno. Ela só aparece aqui depois da liberação.',
          }
      : audience === 'student'
        ? { title: 'Nenhum treino para hoje', body: 'Aproveite para descansar. Confira abaixo os próximos dias da sua semana.' }
        : { title: 'Nenhuma sessão liberada para hoje', body: 'Não há treino liberado para este aluno na data de hoje.' };

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4" role="status">
      <p className="font-semibold text-foreground">{copy.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
    </div>
  );
}

function WeekDayItem({ day }: { day: TrainingRoutineDay }) {
  return (
    <li
      className={`flex gap-3 p-3 ${day.isToday ? 'bg-primary/5' : ''}`}
      aria-current={day.isToday ? 'date' : undefined}
    >
      <div className="w-20 shrink-0 text-xs">
        <p className="font-semibold text-foreground">{formatWeekday(day.date).split('-')[0]}</p>
        <p className="text-muted-foreground">{formatShortDate(day.date)}</p>
        {day.isToday && (
          <span className="mt-1 inline-flex rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            Hoje
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {day.sessions.map((session) => (
          <div key={session.sessionId} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{sessionTitle(session.modalities)}</p>
              <p className="text-xs text-muted-foreground">
                {[formatDuration(session.durationMin), session.location].filter(Boolean).join(' · ') || session.planName}
              </p>
            </div>
            <StatusBadge status={session.status} />
          </div>
        ))}
        {day.sessions.length === 0 && day.pendingReleaseCount > 0 && (
          <p className="text-sm text-muted-foreground">Treino em preparação</p>
        )}
        {day.sessions.length === 0 && day.pendingReleaseCount === 0 && (
          <p className="text-sm text-muted-foreground">Recuperação · sem treino programado</p>
        )}
      </div>
    </li>
  );
}

const loadErrorCopy: Record<TrainingRoutineLoadErrorKind, { title: string; body: string; retry: boolean }> = {
  'access-denied': {
    title: 'Sem permissão para ver os treinos',
    body: 'Seu perfil não tem acesso à rotina de treino deste aluno.',
    retry: false,
  },
  'contract-required': {
    title: 'Selecione o contrato',
    body: 'Volte ao início e escolha o contrato para ver seus treinos.',
    retry: false,
  },
  error: {
    title: 'Não foi possível carregar os treinos',
    body: 'Os demais dados continuam disponíveis. Tente novamente em instantes.',
    retry: true,
  },
};

export type TrainingRoutinePanelProps = {
  audience: TrainingRoutineAudience;
  load: (date?: string) => Promise<TrainingRoutineView>;
  /** Quando falso, o painel mostra acesso negado sem chamar a API. */
  canView?: boolean;
  headingLevel?: 'h1' | 'h2';
  title?: string;
  saveCheckIn?: (sessionId: string, payload: UpsertPreWorkoutCheckInPayload) => Promise<PreWorkoutCheckInView>;
  saveFeedback?: (sessionId: string, payload: CreateCanonicalPostWorkoutFeedbackPayload) => Promise<CanonicalPostWorkoutFeedbackRevisionView>;
  transitionExecution?: (sessionId: string, payload: TrainingSessionExecutionTransitionPayload) => Promise<TrainingSessionExecutionView>;
};

export function TrainingRoutinePanel({
  audience,
  load,
  canView = true,
  headingLevel = 'h2',
  title = 'Treino de hoje',
  saveCheckIn,
  saveFeedback,
  transitionExecution,
}: TrainingRoutinePanelProps) {
  const [routine, setRoutine] = useState<TrainingRoutineView | null>(null);
  const [referenceDate, setReferenceDate] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(canView);
  const [errorKind, setErrorKind] = useState<TrainingRoutineLoadErrorKind | null>(canView ? null : 'access-denied');
  const requestRef = useRef(0);
  const Heading = headingLevel;
  const weekHeadingId = useId();

  const fetchRoutine = useCallback(
    async (date?: string) => {
      if (!canView) return;
      const requestId = ++requestRef.current;
      setLoading(true);
      setErrorKind(null);
      try {
        const data = await load(date);
        if (requestId === requestRef.current) setRoutine(data);
      } catch (error) {
        if (requestId === requestRef.current) setErrorKind(getTrainingRoutineErrorKind(error));
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    },
    [canView, load]
  );

  useEffect(() => {
    if (!canView) {
      setErrorKind('access-denied');
      setLoading(false);
      return;
    }
    void fetchRoutine(referenceDate);
  }, [canView, fetchRoutine, referenceDate]);

  useEffect(() => {
    if (!canView) return;

    const refreshCurrentContext = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchRoutine(referenceDate);
    };

    window.addEventListener('focus', refreshCurrentContext);
    document.addEventListener('visibilitychange', refreshCurrentContext);
    return () => {
      window.removeEventListener('focus', refreshCurrentContext);
      document.removeEventListener('visibilitychange', refreshCurrentContext);
    };
  }, [canView, fetchRoutine, referenceDate]);

  const header = (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
      <Heading className={headingLevel === 'h1' ? 'text-2xl font-bold text-foreground' : 'text-lg font-semibold text-foreground'}>
        {title}
      </Heading>
      {routine && <p className="text-sm text-muted-foreground">{formatLongDate(routine.today.date)}</p>}
    </div>
  );

  if (errorKind) {
    const copy = loadErrorCopy[errorKind];
    return (
      <section className="space-y-4" aria-live="polite">
        {header}
        <div className="rounded-lg border border-border bg-muted/20 p-4" role={errorKind === 'error' ? 'alert' : 'status'}>
          <p className="font-semibold text-foreground">{copy.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{copy.body}</p>
          {copy.retry && (
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void fetchRoutine(referenceDate)}>
              Tentar novamente
            </Button>
          )}
        </div>
      </section>
    );
  }

  if (!routine) {
    return (
      <section className="space-y-4" aria-busy="true" aria-live="polite">
        {header}
        <p className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">Carregando treinos...</p>
      </section>
    );
  }

  const isCurrentWeek = routine.days.some((day) => day.date === routine.today.date);

  return (
    <section className="space-y-4" aria-busy={loading}>
      {header}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {routine.today.state === 'released' ? (
            routine.today.sessions.map((session) => (
              <TodaySession
                key={session.sessionId}
                session={session}
                audience={audience}
                executionAvailable={routine.execution.available}
                saveCheckIn={saveCheckIn}
            saveFeedback={saveFeedback}
                transitionExecution={transitionExecution}
                onExecutionChanged={() => fetchRoutine(referenceDate)}
              />
            ))
          ) : (
            <TodayEmptyState state={routine.today.state} audience={audience} />
          )}
        </div>

        <section aria-labelledby={weekHeadingId} className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 id={weekHeadingId} className="text-sm font-semibold text-foreground">
                Rotina da semana
              </h3>
              <p className="text-xs text-muted-foreground">
                {formatShortDate(routine.week.startDate)} a {formatShortDate(routine.week.endDate)}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Semana anterior"
                disabled={loading}
                onClick={() => setReferenceDate(shiftDateOnly(routine.week.startDate, -7))}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              {!isCurrentWeek && (
                <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => setReferenceDate(routine.today.date)}>
                  Semana atual
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Próxima semana"
                disabled={loading}
                onClick={() => setReferenceDate(shiftDateOnly(routine.week.startDate, 7))}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <ol className="divide-y divide-border rounded-lg border border-border bg-background">
            {routine.days.map((day) => (
              <WeekDayItem key={day.date} day={day} />
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}
