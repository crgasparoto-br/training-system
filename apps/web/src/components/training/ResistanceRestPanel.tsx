import { useEffect, useRef, useState } from 'react';
import type { GuidedResistanceRestView, TrainingSessionExecutionStatus } from '@corrida/types';
import { Button } from '../ui/Button';

/** Client-only measurement: one HTTP response was requested/received on this page's
 * monotonic clock. It never changes the server's rest or its authorization. */
export type ResistanceRestObservation = {
  requestedAtMs: number;
  receivedAtMs: number;
};

export type ResistanceRestActionResult = 'accepted' | 'retry' | 'blocked';

type Props = {
  rest: GuidedResistanceRestView;
  observation: ResistanceRestObservation;
  status: TrainingSessionExecutionStatus;
  busy: boolean;
  disabled?: boolean;
  onAction: (action: 'extend_15' | 'skip' | 'finish') => Promise<ResistanceRestActionResult> | void;
};

function displaySeconds(value: number): string {
  const seconds = Math.max(0, Math.ceil(value / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':'
    + String(seconds % 60).padStart(2, '0');
}

/**
 * A server snapshot is created after a request begins. The round-trip is an
 * upper estimate of its transport age (the server can spend some of it working).
 * Measuring it with performance.now avoids trusting the device's wall-clock or
 * its timezone. After receipt, the same monotonic clock advances the display.
 * Only the backend may authorize the actual completion.
 */
export function projectRestDisplay(
  rest: GuidedResistanceRestView,
  status: TrainingSessionExecutionStatus,
  observation: ResistanceRestObservation,
  nowMs: number,
) {
  const displayDelta = status === 'in_progress'
    ? Math.max(0, observation.receivedAtMs - observation.requestedAtMs)
      + Math.max(0, nowMs - observation.receivedAtMs)
    : 0;
  return {
    remainingMs: Math.max(0, rest.remainingMs - displayDelta),
    elapsedMs: rest.elapsedMs + displayDelta,
  };
}

/** Rendering only: timer ticks cannot mutate the persisted rest. */
export function ResistanceRestPanel({ rest, observation, status, busy, disabled = false, onAction }: Props) {
  const [tick, setTick] = useState(0);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const notifiedSecondsRef = useRef<string | null>(null);
  const autoFinishRef = useRef<{
    key: string; pending: boolean; finished: boolean; failures: number; retryAtMs: number;
  } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const { remainingMs, elapsedMs } = projectRestDisplay(rest, status, observation, performance.now());
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const controlsDisabled = disabled || busy || status !== 'in_progress';

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 250);
    return () => clearInterval(interval);
  }, [rest.id]);

  useEffect(() => () => {
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!alertsEnabled || status !== 'in_progress' || secondsLeft > 3 || secondsLeft < 1) return;
    const key = rest.id + ':' + rest.targetEndsAt + ':' + secondsLeft;
    if (notifiedSecondsRef.current === key) return;
    notifiedSecondsRef.current = key;
    try { if (typeof navigator.vibrate === 'function') navigator.vibrate(60); } catch { /* optional */ }
    try {
      const context = audioContextRef.current;
      if (context && context.state === 'running') {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = 660;
        gain.gain.value = 0.04;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.07);
      }
    } catch { /* device may block audio */ }
  }, [alertsEnabled, rest.id, rest.targetEndsAt, secondsLeft, status]);

  // Display expiry only REQUESTS finish. A 409 caused by an optimistic
  // round-trip estimate or a network timeout must not permanently disarm it.
  // The canonical GET/POST in the parent still guards state, version and owner.
  useEffect(() => {
    const key = rest.id + ':' + rest.targetEndsAt;
    if (remainingMs > 0 || controlsDisabled) return;
    let attempt = autoFinishRef.current;
    if (!attempt || attempt.key !== key) {
      attempt = { key, pending: false, finished: false, failures: 0, retryAtMs: 0 };
      autoFinishRef.current = attempt;
    }
    if (attempt.pending || attempt.finished || performance.now() < attempt.retryAtMs) return;
    attempt.pending = true;
    const currentAttempt = attempt;
    void (async () => {
      let outcome: ResistanceRestActionResult | void;
      try {
        outcome = await onAction('finish');
      } catch {
        outcome = 'retry';
      }
      if (autoFinishRef.current !== currentAttempt) return;
      currentAttempt.pending = false;
      if (outcome === 'retry') {
        currentAttempt.failures += 1;
        currentAttempt.retryAtMs = performance.now()
          + Math.min(1000 * 2 ** (currentAttempt.failures - 1), 15_000);
      } else {
        currentAttempt.finished = true;
      }
    })();
  }, [tick, remainingMs, controlsDisabled, rest.id, rest.targetEndsAt, onAction]);

  async function enableAlerts() {
    try {
      if (typeof AudioContext !== 'undefined' && !audioContextRef.current) {
        audioContextRef.current = new AudioContext();
        await audioContextRef.current.resume();
      }
    } catch { /* optional alerts degrade gracefully */ }
    setAlertsEnabled(true);
  }

  return (
    <section aria-label="Descanso entre séries" className="space-y-4 rounded-xl border border-border bg-primary/5 p-4 sm:p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descanso</p>
        <p className="mt-1 text-4xl font-bold tabular-nums text-foreground sm:text-5xl" role="timer" aria-live="off">
          {displaySeconds(remainingMs)}
        </p>
        <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
          {status === 'paused' ? 'Treino pausado — relógio congelado.'
            : status !== 'in_progress' ? 'Treino encerrado — descanso interrompido.'
              : secondsLeft === 0 ? 'Intervalo terminado. Confirmando o próximo passo...'
                : 'Prepare-se para a próxima série.'}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-muted-foreground">Intervalo prescrito</dt><dd className="font-semibold">{rest.plannedSeconds} s</dd></div>
        <div><dt className="text-muted-foreground">Descanso transcorrido</dt><dd className="font-semibold">{displaySeconds(elapsedMs)}</dd></div>
        {rest.extensionSeconds > 0 && <div><dt className="text-muted-foreground">Acréscimo nesta execução</dt><dd className="font-semibold">+{rest.extensionSeconds} s</dd></div>}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={controlsDisabled} onClick={() => { void onAction('extend_15'); }}>+15 s</Button>
        <Button type="button" variant="outline" disabled={controlsDisabled} onClick={() => { void onAction('skip'); }}>Pular descanso</Button>
        {secondsLeft === 0 && <Button type="button" disabled={controlsDisabled} onClick={() => { void onAction('finish'); }}>
          Continuar para a próxima série
        </Button>}
      </div>
      <div className="text-sm">
        {alertsEnabled
          ? <span className="text-muted-foreground">Avisos finais ativados neste dispositivo quando permitidos.</span>
          : <Button type="button" variant="ghost" size="sm" onClick={() => void enableAlerts()}>
            Ativar avisos nos segundos finais
          </Button>}
      </div>
    </section>
  );
}
