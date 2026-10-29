import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  GuidedResistanceCompletePayload, GuidedResistanceView, TrainingSessionExecutionStatus,
} from '@corrida/types';
import { Button } from '../ui/Button';

type GuidedResistanceOperation = { signature: string; payload: GuidedResistanceCompletePayload };

export type GuidedResistanceDraft = {
  sessionId: string;
  plannedSetId: string;
  repetitions: string;
  loadKg: string;
  operation: GuidedResistanceOperation | null;
  /** A 409 must remain a write lock even after switching to the overview. */
  conflictVersion: number | null;
};

type Props = {
  sessionId: string;
  status: TrainingSessionExecutionStatus;
  version: number;
  load: (sessionId: string) => Promise<GuidedResistanceView>;
  complete: (sessionId: string, payload: GuidedResistanceCompletePayload) => Promise<GuidedResistanceView>;
  onExecutionChanged?: () => Promise<void>;
  onOverview: () => void;
  /** Owned by the session panel, not by the unmounted guide or browser storage. */
  draftStore?: { current: GuidedResistanceDraft | null };
};

const sectionLabels: Record<string, string> = {
  mobilidade: 'Mobilidade',
  aquecimento: 'Aquecimento',
  sessao: 'Sessão',
  principal: 'Parte principal',
  resfriamento: 'Desaceleração',
  finalizacao: 'Finalização',
};
const groupLabels: Record<string, string> = {
  superserie: 'Supersérie',
  bi_set: 'Bi-set',
  tri_set: 'Tri-set',
  circuito: 'Circuito',
  bloco_tecnico: 'Bloco técnico',
  mobilidade: 'Mobilidade',
  finalizacao: 'Finalização',
};
const blockLabels: Record<string, string> = {
  aquecimento: 'Aquecimento',
  principal: 'Principal',
  tecnica: 'Técnica',
  complementar: 'Complementar',
  finalizacao: 'Finalização',
};
function readableContext(key: string, labels: Record<string, string>) {
  return labels[key] ?? key.split('_').join(' ');
}

function describeRepetitions(min: number | null, max: number | null) {
  if (min === null && max === null) return 'Não informado';
  if (min !== null && max !== null && min !== max) return String(min) + ' a ' + max;
  return String(min ?? max);
}

function parseActualNumber(text: string, integer: boolean): number | null {
  const value = text.trim().replace(',', '.');
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
    throw new Error(integer ? 'Informe um número inteiro de repetições.' : 'Informe uma carga válida em kg.');
  }
  return parsed;
}

export function GuidedResistanceCard({
  sessionId, status, version, load, complete, onExecutionChanged, onOverview, draftStore,
}: Props) {
  const headingId = useId();
  const repsId = useId();
  const loadId = useId();
  const [view, setView] = useState<GuidedResistanceView | null>(null);
  const [repetitions, setRepetitions] = useState('');
  const [loadKg, setLoadKg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [lastRest, setLastRest] = useState<number | null>(null);
  const currentSetRef = useRef<string | null>(null);
  // Only the latest read may change the UI. A confirmed mutation also invalidates
  // reads started before the POST returned.
  const refreshSequenceRef = useRef(0);
  const acceptedVersionRef = useRef<{ sessionId: string; version: number } | null>(null);
  // The parent can advance while an older POST is awaiting its response.
  // A callback captured before that render must still see the latest version.
  const parentVersionRef = useRef({ sessionId, version });
  if (parentVersionRef.current.sessionId !== sessionId) {
    parentVersionRef.current = { sessionId, version };
  } else {
    parentVersionRef.current.version = Math.max(parentVersionRef.current.version, version);
  }
  const conflictVersionRef = useRef<number | null>(draftStore?.current?.sessionId === sessionId
    ? draftStore.current.conflictVersion : null);
  const operationRef = useRef<GuidedResistanceOperation | null>(null);

  const keepDraft = (nextRepetitions: string, nextLoadKg: string, operation = operationRef.current) => {
    const plannedSetId = currentSetRef.current;
    if (!draftStore || !plannedSetId) return;
    draftStore.current = { sessionId, plannedSetId, repetitions: nextRepetitions,
      loadKg: nextLoadKg, operation, conflictVersion: conflictVersionRef.current };
  };

  const acceptView = useCallback((saved: GuidedResistanceView, sourceSessionId: string): boolean => {
    const accepted = acceptedVersionRef.current;
    const versionFloor = Math.max(
      parentVersionRef.current.sessionId === sourceSessionId ? parentVersionRef.current.version : -1,
      accepted?.sessionId === sourceSessionId ? accepted.version : -1,
    );
    if (saved.version < versionFloor) return false;
    acceptedVersionRef.current = { sessionId: sourceSessionId, version: saved.version };
    const currentId = saved.current?.plannedSetId ?? null;
    if (currentSetRef.current !== currentId) {
      currentSetRef.current = currentId;
      const retained = draftStore?.current;
      const sameUnit = Boolean(currentId && retained?.sessionId === sourceSessionId
        && retained.plannedSetId === currentId);
      const nextRepetitions = sameUnit ? retained!.repetitions
        : saved.current?.repsMin == null ? '' : String(saved.current.repsMin);
      const nextLoadKg = sameUnit ? retained!.loadKg
        : saved.current?.loadKg == null ? '' : String(saved.current.loadKg);
      const retainedOperation = sameUnit && retained!.operation?.payload.expectedVersion === saved.version
        ? retained!.operation : null;
      setRepetitions(nextRepetitions);
      setLoadKg(nextLoadKg);
      operationRef.current = retainedOperation;
      if (draftStore) draftStore.current = currentId ? {
        sessionId: sourceSessionId, plannedSetId: currentId,
        repetitions: nextRepetitions, loadKg: nextLoadKg, operation: retainedOperation,
        conflictVersion: conflictVersionRef.current,
      } : null;
    } else if (operationRef.current && operationRef.current.payload.expectedVersion !== saved.version) {
      // The same planned set may survive a pause/resume or a competing edit.
      // Keep the entered values, but never reuse an operation for an old version.
      operationRef.current = null;
      if (draftStore?.current?.sessionId === sourceSessionId
        && draftStore.current.plannedSetId === currentId) {
        draftStore.current = { ...draftStore.current, operation: null };
      }
    }
    setView(saved);
    return true;
  }, [draftStore]);

  const refresh = useCallback(async (reason: 'normal' | 'conflict' = 'normal'): Promise<boolean> => {
    const requestId = ++refreshSequenceRef.current;
    setLoading(true);
    try {
      const saved = await load(sessionId);
      // An older GET must never override a newer GET, a POST, or a 409 lock.
      if (requestId !== refreshSequenceRef.current) return false;
      const previouslyAccepted = acceptedVersionRef.current;
      const highestKnownVersion = Math.max(
        parentVersionRef.current.sessionId === sessionId ? parentVersionRef.current.version : version,
        previouslyAccepted?.sessionId === sessionId ? previouslyAccepted.version : -1,
      );
      if (saved.sessionId !== sessionId || saved.version < highestKnownVersion ||
          !acceptView(saved, sessionId)) {
        setReconciliationRequired(true);
        setError('O servidor retornou uma posição desatualizada. Atualize novamente antes de confirmar outra série.');
        return false;
      }
      if (conflictVersionRef.current !== null && saved.version <= conflictVersionRef.current) {
        // Show the same-series draft after remount, but do not trust an unchanged
        // version to clear the 409 lock or to permit another confirmation.
        setReconciliationRequired(true);
        setError('O servidor retornou uma posição desatualizada. Atualize novamente antes de confirmar outra série.');
        return false;
      }
      conflictVersionRef.current = null;
      if (draftStore?.current?.sessionId === sessionId) {
        draftStore.current = { ...draftStore.current, conflictVersion: null };
      }
      setReconciliationRequired(false);
      setError(reason === 'conflict'
        ? 'O treino mudou em outro dispositivo. Revise a série atualizada antes de confirmar novamente.'
        : null);
      return true;
    } catch {
      if (requestId !== refreshSequenceRef.current) return false;
      setReconciliationRequired(true);
      setError(reason === 'conflict'
        ? 'O treino mudou em outro dispositivo e a recarga falhou. Nova confirmação bloqueada até atualizar o estado salvo.'
        : 'Não foi possível consultar a posição salva. Atualize o treino antes de confirmar outra série.');
      return false;
    } finally {
      if (requestId === refreshSequenceRef.current) setLoading(false);
    }
  }, [acceptView, draftStore, load, sessionId, version]);

  useEffect(() => {
    // Pausa, retomada e mudança de versão exigem uma leitura canônica nova.
    // Cleanup também invalida GETs da sessão anterior ou de um unmount.
    void refresh();
    return () => { refreshSequenceRef.current += 1; };
  }, [refresh, status, version]);

  async function confirmCurrent() {
    if (!view?.current || view.status !== 'in_progress' || status !== 'in_progress' || busy || loading || reconciliationRequired) return;
    const current = view.current;
    let actualReps: number | null;
    let actualLoad: number | null;
    try {
      actualReps = parseActualNumber(repetitions, true);
      actualLoad = parseActualNumber(loadKg, false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Revise os valores realizados.');
      return;
    }
    const signature = [
      sessionId, view.version, current.plannedSetId, current.setNumber, actualReps, actualLoad,
    ].join(':');
    if (operationRef.current?.signature !== signature) {
      operationRef.current = {
        signature,
        payload: {
          operationKey: 'guided-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12),
          expectedVersion: view.version,
          plannedUnitId: current.plannedUnitId,
          plannedSetId: current.plannedSetId,
          setNumber: current.setNumber,
          repetitions: actualReps,
          loadKg: actualLoad,
        },
      };
    }
    keepDraft(repetitions, loadKg);
    setBusy(true);
    setError(null);
    setConfirmation(null);
    try {
      const saved = await complete(sessionId, operationRef.current.payload);
      // A late POST may have committed while the parent already knew a newer
      // version. Invalidate older reads and revalidate before another write.
      refreshSequenceRef.current += 1;
      setLoading(false);
      operationRef.current = null;
      if (saved.sessionId !== sessionId || !acceptView(saved, sessionId)) {
        setReconciliationRequired(true);
        // Do not show the stale POST result or a false success. Replace any
        // invalidated in-flight GET with a fresh authoritative read.
        if (await refresh('conflict')) {
          try {
            await onExecutionChanged?.();
          } catch {
            setError('A série foi salva, mas não foi possível atualizar o resumo. Revise a posição exibida.');
          }
        }
        return;
      }
      // The canonical group determines whether the interval is intermediate.
      // A rest hint is meaningful only while another step remains.
      setLastRest(saved.current ? current.restSec : null);
      setConfirmation('Série registrada. O próximo passo foi atualizado com os dados salvos.');
      try {
        await onExecutionChanged?.();
      } catch {
        setError('A série foi salva, mas não foi possível atualizar o resumo. A posição exibida veio do servidor.');
      }
    } catch (cause) {
      const httpStatus = (cause as { response?: { status?: number } })?.response?.status;
      if (httpStatus === 409) {
        operationRef.current = null;
        conflictVersionRef.current = Math.max(conflictVersionRef.current ?? -1, view.version);
        // Preserve the 409 lock with the draft before the card can unmount.
        keepDraft(repetitions, loadKg, null);
        // Invalidate any read started before we learned about the conflict.
        refreshSequenceRef.current += 1;
        setLoading(false);
        setReconciliationRequired(true);
        await refresh('conflict');
      } else {
        setError('Não foi possível confirmar a gravação. Atualize o estado salvo ou tente novamente; sua informação foi preservada.');
      }
    } finally {
      setBusy(false);
    }
  }

  const current = view?.current;
  const unavailableCopy = {
    legacy_read_only: 'Este treino tem exercícios sem séries estruturadas. Consulte a ficha e peça ao professor para preparar a execução guiada.',
    grouping_pending: 'Este treino usa exercícios agrupados. A execução guiada só ficará disponível após a estrutura de agrupamentos ser liberada pelo professor.',
    no_structured_resistance: 'Não há séries resistidas estruturadas liberadas para executar neste treino.',
  };

  return (
    <section aria-labelledby={headingId} className="space-y-4 rounded-xl border border-border bg-muted/20 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Execução resistida</p>
          <h4 id={headingId} className="text-lg font-semibold text-foreground">Passo a passo</h4>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onOverview}>Ver ficha completa</Button>
      </div>
      {loading && !view && <p role="status" className="text-sm text-muted-foreground">Consultando a série atual...</p>}
      {view && view.availability !== 'available' && (
        <div role="status" className="rounded-md border border-border bg-background p-3 text-sm">
          <p>{unavailableCopy[view.availability]}</p>
        </div>
      )}
      {view?.availability === 'available' && (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            {view.completed} de {view.total} séries confirmadas
          </p>
          {current ? (
            <div className="space-y-4 rounded-lg border border-border bg-background p-4">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {current.groupId
                    ? `${groupLabels[current.groupType ?? ''] ?? 'Agrupamento'} · rodada ${current.roundNumber} de ${current.roundTotal} · item ${current.groupPosition} de ${current.groupSize}`
                    : `${readableContext(current.section, sectionLabels)} · ${readableContext(current.blockKind, blockLabels)} · Série ${current.setNumber} de ${current.exerciseSetTotal}`}
                </p>
                <h5 className="text-xl font-semibold text-foreground">{current.exerciseName}</h5>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div><dt className="text-muted-foreground">Repetições prescritas</dt><dd className="font-semibold">{describeRepetitions(current.repsMin, current.repsMax)}</dd></div>
                <div><dt className="text-muted-foreground">Carga prescrita</dt><dd className="font-semibold">{current.loadKg === null ? 'Não informada' : current.loadKg.toLocaleString('pt-BR') + ' kg'}</dd></div>
                {current.loadPercent !== null && <div><dt className="text-muted-foreground">Percentual previsto</dt><dd>{current.loadPercent}%</dd></div>}
                {current.rir !== null && <div><dt className="text-muted-foreground">RIR</dt><dd>{current.rir}</dd></div>}
                {current.rpe !== null && <div><dt className="text-muted-foreground">RPE</dt><dd>{current.rpe}</dd></div>}
                {current.tempo && <div><dt className="text-muted-foreground">Cadência</dt><dd>{current.tempo}</dd></div>}
                {current.restSec !== null && <div><dt className="text-muted-foreground">Descanso prescrito</dt><dd>{current.restSec} s</dd></div>}
              </dl>
              {current.notes && <p className="rounded-md bg-muted/50 p-3 text-sm">{current.notes}</p>}
              {current.videoUrl && (
                <a href={current.videoUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4">
                  Ver vídeo de orientação do exercício
                </a>
              )}
              <form aria-label="Registrar série realizada" onSubmit={(event) => { event.preventDefault(); void confirmCurrent(); }} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor={repsId} className="text-sm font-medium">Repetições realizadas</label>
                    <input id={repsId} value={repetitions} onChange={(event) => {
                      setRepetitions(event.target.value);
                      keepDraft(event.target.value, loadKg);
                    }}
                      inputMode="numeric" autoComplete="off" disabled={busy || view.status !== 'in_progress' || status !== 'in_progress'}
                      placeholder="Informe as repetições" className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-base" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={loadId} className="text-sm font-medium">Carga realizada (kg)</label>
                    <input id={loadId} value={loadKg} onChange={(event) => {
                      setLoadKg(event.target.value);
                      keepDraft(repetitions, event.target.value);
                    }}
                      inputMode="decimal" autoComplete="off" disabled={busy || view.status !== 'in_progress'}
                      placeholder="Informe a carga" className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-base" />
                  </div>
                </div>
                {view.status === 'paused' && <p role="status" className="text-sm text-amber-800">Treino pausado. Retome a sessão para registrar esta série.</p>}
              {reconciliationRequired && <p role="status" className="text-sm text-amber-800">Confirmação bloqueada até revalidar a posição no servidor.</p>}
                <Button type="submit" className="w-full sm:w-auto" disabled={busy || loading || reconciliationRequired || view.status !== 'in_progress' || status !== 'in_progress'}>
                  {busy ? 'Salvando série...' : 'Concluir série'}
                </Button>
              </form>
              <p className="text-sm text-muted-foreground">
                {view.next
                  ? current.groupId && view.next.groupId === current.groupId && view.next.roundNumber === current.roundNumber
                    ? `Próximo nesta rodada: ${view.next.exerciseName}.`
                    : `Próximo: ${view.next.exerciseName}, ${view.next.groupId ? `rodada ${view.next.roundNumber}` : `série ${view.next.setNumber}`}.`
                  : 'Próximo: revisar e finalizar o treino.'}
              </p>
            </div>
          ) : (
            <p role="status" className="rounded-lg border border-border bg-background p-4 text-sm font-semibold">
              Todas as séries foram registradas. Confira a ficha e conclua a sessão pelos controles do treino.
            </p>
          )}
        </>
      )}
      {lastRest !== null && confirmation && lastRest > 0 && (
        <p className="text-sm text-muted-foreground">
          Descanso prescrito após a série anterior: {lastRest} s. O cronômetro automático será disponibilizado em uma etapa própria.
        </p>
      )}
      {confirmation && <p role="status" className="text-sm text-emerald-700">{confirmation}</p>}
      {error && (
        <div role="alert" className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>{error}</p>
          <Button type="button" variant="outline" size="sm" disabled={busy || loading} onClick={() => void refresh()}>Atualizar estado salvo</Button>
        </div>
      )}
    </section>
  );
}
