import { useEffect, useRef, useState } from 'react';
import type { GuidedResistanceRestView, TrainingSessionExecutionStatus } from '@corrida/types';
import { Button } from '../ui/Button';

type Props = {
  rest: GuidedResistanceRestView;
  status: TrainingSessionExecutionStatus;
  busy: boolean;
  disabled?: boolean;
  onAction: (action: 'extend_15' | 'skip' | 'finish') => void;
};

function displaySeconds(value: number): string {
  const seconds = Math.max(0, Math.ceil(value / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':'
    + String(seconds % 60).padStart(2, '0');
}

/**
 * Rendering clock only: the server supplies deadlines, elapsed time and pause
 * semantics. setInterval cannot mutate execution or earn elapsed time.
 */
export function ResistanceRestPanel({ rest, status, busy, disabled = false, onAction }: Props) {
  const [, setTick] = useState(0);
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const anchorRef = useRef({ fingerprint: '', clientReceivedAt: Date.now() });
  const notifiedSecondsRef = useRef<string | null>(null);
  const autoFinishRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fingerprint = [rest.id, rest.serverNow, rest.targetEndsAt, status].join(':');
  if (anchorRef.current.fingerprint !== fingerprint) {
    anchorRef.current = { fingerprint, clientReceivedAt: Date.now() };
  }
  const displayDelta = status === 'in_progress'
    ? Math.max(0, Date.now() - anchorRef.current.clientReceivedAt) : 0;
  const remainingMs = Math.max(0, rest.remainingMs - displayDelta);
  const elapsedMs = rest.elapsedMs + displayDelta;
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

  // Local expiry only REQUESTS the canonical finish. The API checks clock,
  // version, ownership and pause/terminal state on every request.
  useEffect(() => {
    const key = rest.id + ':' + rest.targetEndsAt;
    if (remainingMs > 0 || controlsDisabled || autoFinishRef.current === key) return;
    autoFinishRef.current = key;
    onAction('finish');
  }, [remainingMs, controlsDisabled, rest.id, rest.targetEndsAt, onAction]);

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
        <Button type="button" variant="outline" disabled={controlsDisabled} onClick={() => onAction('extend_15')}>+15 s</Button>
        <Button type="button" variant="outline" disabled={controlsDisabled} onClick={() => onAction('skip')}>Pular descanso</Button>
        {secondsLeft === 0 && <Button type="button" disabled={controlsDisabled} onClick={() => onAction('finish')}>
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
