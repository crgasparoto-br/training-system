import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  GuidedCyclicActionPayload, GuidedCyclicUnit, GuidedCyclicView,
  TrainingSessionExecutionOutcome, TrainingSessionExecutionStatus,
} from '@corrida/types';
import { Button } from '../ui/Button';

type Props = {
  sessionId: string;
  status: TrainingSessionExecutionStatus;
  version: number;
  load: (sessionId: string) => Promise<GuidedCyclicView>;
  act: (sessionId: string, payload: GuidedCyclicActionPayload) => Promise<GuidedCyclicView>;
  onExecutionChanged?: () => Promise<void>;
};

const kindLabel: Record<GuidedCyclicUnit['kind'], string> = {
  warmup: 'Aquecimento', work: 'Trabalho', recovery: 'Recuperação', cooldown: 'Desaquecimento',
};
const kindStyle: Record<GuidedCyclicUnit['kind'], string> = {
  warmup: 'border-sky-200 bg-sky-50/40',
  work: 'border-emerald-200 bg-emerald-50/40',
  recovery: 'border-amber-200 bg-amber-50/40',
  cooldown: 'border-violet-200 bg-violet-50/40',
};
const targets: Record<NonNullable<GuidedCyclicUnit['targetKind']>, {
  label: string; unit: string; field: keyof NonNullable<GuidedCyclicActionPayload['values']>;
}> = {
  pace_min_per_km: { label: 'Ritmo (pace)', unit: 'min/km', field: 'paceMinPerKm' },
  speed_kmh: { label: 'Velocidade', unit: 'km/h', field: 'speedKmh' },
  heart_rate_bpm: { label: 'Frequência cardíaca', unit: 'bpm', field: 'heartRateBpm' },
  zone: { label: 'Zona de frequência cardíaca', unit: 'zona', field: 'heartRateZone' },
  pse: { label: 'Percepção de esforço (PSE)', unit: 'PSE', field: 'pse' },
};

const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 9 });
export function cyclicTargetText(stage: GuidedCyclicUnit): string | null {
  if (!stage.targetKind) return null;
  const target = targets[stage.targetKind];
  const value = stage.targetValue === null
    ? stage.targetMin !== null && stage.targetMax !== null
      ? number(stage.targetMin) + ' a ' + number(stage.targetMax)
      : stage.targetMin !== null ? 'A partir de ' + number(stage.targetMin)
        : stage.targetMax !== null ? 'Até ' + number(stage.targetMax) : null
    : number(stage.targetValue);
  return value === null ? null : target.label + ': ' + value + ' ' + target.unit;
}
function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
}
function validateNumber(text: string, integer: boolean): number | null {
  if (!text.trim()) return null;
  const parsed = Number(text.trim().replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new Error('Informe um valor realizado válido, sem números negativos.');
  }
  return parsed;
}

export function GuidedCyclicCard({ sessionId, status, version, load, act, onExecutionChanged }: Props) {
  const headingId = useId();
  const distanceId = useId();
  const actualTargetId = useId();
  const replacementId = useId();
  const outcomeId = useId();
  const [view, setView] = useState<GuidedCyclicView | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [, setTick] = useState(0);
  const [distance, setDistance] = useState('');
  const [actualTarget, setActualTarget] = useState('');
  const [outcome, setOutcome] = useState<TrainingSessionExecutionOutcome>('full');
  const [substitutionNote, setSubstitutionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const seq = useRef(0);
  const acceptedVersion = useRef(-1);
  const pending = useRef<{ signature: string; payload: GuidedCyclicActionPayload } | null>(null);
  const identity = useRef('');
  const parent = useRef({ sessionId, version });
  parent.current = { sessionId, version };

  const accept = useCallback((saved: GuidedCyclicView, received: number) => {
    if (saved.sessionId !== sessionId || saved.version < acceptedVersion.current
      || saved.version < (parent.current.sessionId === sessionId ? parent.current.version : 0)) return false;
    acceptedVersion.current = saved.version;
    const key = saved.current?.plannedStageId + ':' + saved.current?.iteration;
    if (identity.current !== key) {
      identity.current = key;
      setDistance('');
      setActualTarget('');
      setSubstitutionNote('');
      setOutcome('full');
      pending.current = null;
    }
    setReceivedAt(received);
    setView(saved);
    return true;
  }, [sessionId]);

  const refresh = useCallback(async (cause: 'normal' | 'conflict' = 'normal') => {
    const current = ++seq.current;
    setLoading(true);
    try {
      const response = await load(sessionId);
      if (current !== seq.current) return false;
      if (!accept(response, performance.now())) {
        setLocked(true);
        setError('A resposta não corresponde à versão atual. Atualize o estado salvo antes de continuar.');
        return false;
      }
      setLocked(false);
      setError(cause === 'conflict'
        ? 'O treino mudou em outro dispositivo. Revise a etapa exibida antes de confirmar novamente.' : null);
      return true;
    } catch {
      if (current === seq.current) {
        setLocked(true);
        setError('Não foi possível consultar as etapas salvas. Tente atualizar para continuar com segurança.');
      }
      return false;
    } finally {
      if (current === seq.current) setLoading(false);
    }
  }, [accept, load, sessionId]);

  useEffect(() => {
    void refresh();
    return () => { seq.current += 1; };
  }, [refresh, status, version]);

  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!view?.currentStartedAt || view.status !== 'in_progress' || status !== 'in_progress'
      || view.elapsedMs === null || view.availability !== 'available') return;
    const timer = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(timer);
  }, [status, view]);

  const current = view?.current;
  const canEdit = !busy && !loading && !locked && view?.availability === 'available'
    && view.status === 'in_progress' && status === 'in_progress'
    && view.version >= version;
  // Only server-derived remaining time is projected forward by a monotonic display
  // clock. No browser timer changes persistent progress or confirms a stage.
  const liveRemaining = view?.remainingMs === null || view?.remainingMs === undefined
    ? null : view.status === 'in_progress' && status === 'in_progress'
      ? Math.max(0, view.remainingMs - Math.max(0, performance.now() - receivedAt))
      : view.remainingMs;
  const liveElapsed = view?.elapsedMs === null || view?.elapsedMs === undefined
    ? null : view.status === 'in_progress' && status === 'in_progress'
      ? view.elapsedMs + Math.max(0, performance.now() - receivedAt)
      : view.elapsedMs;
  const target = current?.targetKind ? targets[current.targetKind] : null;

  async function submit(action: 'start' | 'complete') {
    if (!view || !current || !canEdit || (action === 'complete' && !view.currentStartedAt)) return;
    let values: GuidedCyclicActionPayload['values'];
    try {
      if (action === 'complete') {
        values = {};
        if (outcome === 'substituted' && !substitutionNote.trim()) {
          throw new Error('Descreva a substituição realizada.');
        }
        if (outcome === 'substituted') values.substitutionNote = substitutionNote.trim();
        if (outcome !== 'not_performed') {
          if (current.durationUnit === 'meters') {
            const meters = validateNumber(distance, false);
            if ((outcome === 'full' || outcome === 'partial') && meters === null) {
              throw new Error('Confirme a distância realizada em metros.');
            }
            if (meters !== null) values.distanceMeters = meters;
          }
          if (target) {
            const raw = actualTarget.trim();
            if (target.field === 'heartRateZone') {
              if (raw) values.heartRateZone = raw;
            } else {
              const numberValue = validateNumber(raw, target.field === 'heartRateBpm');
              if (numberValue !== null) {
                if (target.field === 'heartRateBpm') values.heartRateBpm = numberValue;
                if (target.field === 'paceMinPerKm') values.paceMinPerKm = numberValue;
                if (target.field === 'speedKmh') values.speedKmh = numberValue;
                if (target.field === 'pse') values.pse = numberValue;
              }
            }
          }
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Confira os dados registrados.');
      return;
    }
    const payload: GuidedCyclicActionPayload = {
      operationKey: '', expectedVersion: view.version, plannedStageId: current.plannedStageId,
      iteration: current.iteration, action,
      ...(action === 'complete' ? { outcome, values } : {}),
    };
    const signature = JSON.stringify({ ...payload, operationKey: null });
    if (pending.current?.signature !== signature) pending.current = {
      signature,
      payload: { ...payload, operationKey: 'cyclic-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12) },
    };
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await act(sessionId, pending.current.payload);
      seq.current += 1; // Invalidate GETs started before the write.
      setLoading(false);
      if (response.version <= view.version || !accept(response, performance.now())) {
        setLocked(true);
        setError('O registro foi enviado, mas o estado precisa ser conferido antes de continuar.');
        await refresh('conflict');
        return;
      }
      pending.current = null;
      setMessage(action === 'start' ? 'Etapa iniciada. O tempo é preservado mesmo ao sair desta tela.'
        : 'Etapa registrada. Continue pela próxima etapa planejada.');
      try { await onExecutionChanged?.(); } catch {
        setError('A etapa foi salva, mas o resumo não foi atualizado. Confira o progresso exibido.');
      }
    } catch (cause) {
      const statusCode = (cause as { response?: { status?: number } })?.response?.status;
      if (statusCode === 409) {
        pending.current = null;
        setLocked(true);
        seq.current += 1;
        await refresh('conflict');
      } else {
        const permanent = statusCode !== undefined && statusCode >= 400 && statusCode < 500 && statusCode !== 429;
        if (permanent) setLocked(true);
        setError(permanent
          ? 'Os valores não foram aceitos. Corrija os dados ou atualize o estado salvo.'
          : 'Não foi possível confirmar a gravação. Seus valores foram mantidos; tente novamente.');
      }
    } finally {
      setBusy(false);
    }
  }

  const fallback = {
    legacy_read_only: 'Esta sessão tem um plano cíclico legado sem etapas estruturadas. Consulte a ficha; nenhuma etapa foi criada automaticamente.',
    invalid_plan: 'As etapas liberadas estão incompletas ou excedem o limite de execução. Peça ao professor para revisar o planejamento.',
    reconciliation_required: 'O progresso salvo não corresponde à sequência de etapas. É necessária uma revisão antes de continuar.',
  };

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Execução cíclica</p>
        <h4 id={headingId} className="text-lg font-semibold">Etapa por etapa</h4>
      </div>
      {loading && !view && <p role="status">Consultando a etapa atual...</p>}
      {view && view.availability !== 'available' && (
        <p role="status" className="rounded-lg border border-border bg-background p-3 text-sm">
          {fallback[view.availability]}
        </p>
      )}
      {view?.availability === 'available' && (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {view.completed} de {view.total} etapas registradas
          </p>
          {current ? (
            <div className={`space-y-4 rounded-lg border p-4 ${kindStyle[current.kind]}`}>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide">
                  Etapa {current.order} de {view.total}
                  {current.roundTotal !== null ? ` · Rodada ${current.roundNumber} de ${current.roundTotal}` : ''}
                </p>
                <h5 className="text-xl font-semibold">{kindLabel[current.kind]}</h5>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Prescrição</dt>
                  <dd className="font-semibold">{number(current.durationValue)} {current.durationUnit === 'seconds' ? 'segundos' : 'metros'}</dd></div>
                {current.targetKind && cyclicTargetText(current) && (
                  <div><dt className="text-muted-foreground">Alvo</dt>
                    <dd className="font-semibold">{cyclicTargetText(current)}</dd></div>
                )}
                {current.inclinePercent !== null && <div><dt>Inclinação</dt><dd>{number(current.inclinePercent)}%</dd></div>}
                {current.cadenceSpm !== null && <div><dt>Cadência</dt><dd>{number(current.cadenceSpm)} ppm</dd></div>}
              </dl>
              {current.notes && <p className="rounded-md bg-background/80 p-3 text-sm">{current.notes}</p>}
              {view.currentStartedAt && current.durationUnit === 'seconds' && liveRemaining !== null && (
                <div className="rounded-lg border border-border bg-background px-3 py-2 text-center" role="timer"
                  aria-label="Tempo restante da etapa">
                  <p className="text-xs text-muted-foreground">Tempo restante</p>
                  <p className="text-3xl font-semibold tabular-nums">{clock(liveRemaining)}</p>
                  {liveRemaining === 0 && <p className="text-sm">Tempo previsto encerrado. Confirme a etapa.</p>}
                </div>
              )}
              {view.currentStartedAt && current.durationUnit === 'meters' && (
                <div className="space-y-2">
                  {liveElapsed !== null && (
                    <div className="rounded-lg border border-border bg-background px-3 py-2 text-center"
                      role="timer" aria-label="Tempo decorrido da etapa">
                      <p className="text-xs text-muted-foreground">Tempo decorrido</p>
                      <p className="text-3xl font-semibold tabular-nums">{clock(liveElapsed)}</p>
                    </div>
                  )}
                  <p className="text-sm">Avance após percorrer a distância. Confirme o valor realizado abaixo.</p>
                </div>
              )}
              {view.status === 'paused' && (
                <p role="status" className="text-sm font-medium text-amber-900">
                  Treino pausado. O relógio está congelado; retome a sessão para continuar.
                </p>
              )}
              {!view.currentStartedAt ? (
                <Button type="button" className="w-full sm:w-auto min-h-11" disabled={!canEdit}
                  onClick={() => void submit('start')}>Iniciar etapa</Button>
              ) : (
                <form onSubmit={(event) => { event.preventDefault(); void submit('complete'); }} className="space-y-3">
                  <div className="space-y-1">
                    <label htmlFor={outcomeId} className="block text-sm font-medium">Como foi a etapa?</label>
                    <select id={outcomeId} value={outcome} onChange={(event) => setOutcome(event.target.value as TrainingSessionExecutionOutcome)}
                      disabled={!canEdit} className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base">
                      <option value="full">Realizada</option>
                      <option value="partial">Parcialmente realizada</option>
                      <option value="substituted">Substituída</option>
                      <option value="not_performed">Não realizada</option>
                    </select>
                  </div>
                  {outcome !== 'not_performed' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {current.durationUnit === 'meters' && (
                        <div className="space-y-1">
                          <label htmlFor={distanceId} className="block text-sm font-medium">Distância realizada (m)</label>
                          <input id={distanceId} value={distance} inputMode="decimal"
                            onChange={(event) => setDistance(event.target.value)} disabled={!canEdit}
                            className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                            placeholder="Ex.: 800" />
                        </div>
                      )}
                      {target && (
                        <div className="space-y-1">
                          <label htmlFor={actualTargetId} className="block text-sm font-medium">
                            {target.label} realizado ({target.unit}) — opcional
                          </label>
                          <input id={actualTargetId} value={actualTarget} inputMode={target.field === 'heartRateZone' ? 'text' : 'decimal'}
                            onChange={(event) => setActualTarget(event.target.value)} disabled={!canEdit}
                            className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base"
                            placeholder="Valor medido" />
                        </div>
                      )}
                    </div>
                  )}
                  {outcome === 'substituted' && (
                    <div className="space-y-1">
                      <label htmlFor={replacementId} className="block text-sm font-medium">O que foi feito no lugar?</label>
                      <input id={replacementId} value={substitutionNote} maxLength={500}
                        onChange={(event) => setSubstitutionNote(event.target.value)} disabled={!canEdit}
                        className="min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base" />
                    </div>
                  )}
                  <Button type="submit" className="w-full sm:w-auto min-h-11" disabled={!canEdit
                    || (outcome === 'full' && current.durationUnit === 'seconds' && (liveRemaining ?? 1) > 0)}>
                    {busy ? 'Registrando etapa...' : 'Confirmar etapa'}
                  </Button>
                </form>
              )}
              <p className="text-sm text-muted-foreground">
                {view.next ? `Próxima: ${kindLabel[view.next.kind]}${view.next.roundTotal !== null ? `, rodada ${view.next.roundNumber}` : ''}.`
                  : 'Próximo: conferir a ficha e encerrar a sessão.'}
              </p>
            </div>
          ) : (
            <p role="status" className="rounded-lg border border-border bg-background p-4 text-sm font-semibold">
              Todas as etapas cíclicas foram registradas. Conclua a sessão nos controles do treino.
            </p>
          )}
        </>
      )}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {error && <div role="alert" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p>{error}</p>
        <Button type="button" variant="outline" size="sm" disabled={busy || loading}
          onClick={() => void refresh()}>Atualizar estado salvo</Button>
      </div>}
    </section>
  );
}
