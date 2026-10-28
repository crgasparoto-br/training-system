import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type {
  GuidedResistanceCompletePayload, GuidedResistanceView, TrainingSessionExecutionStatus,
} from '@corrida/types';
import { Button } from '../ui/Button';

type Props = {
  sessionId: string;
  status: TrainingSessionExecutionStatus;
  version: number;
  load: (sessionId: string) => Promise<GuidedResistanceView>;
  complete: (sessionId: string, payload: GuidedResistanceCompletePayload) => Promise<GuidedResistanceView>;
  onExecutionChanged?: () => Promise<void>;
  onOverview: () => void;
};

const sectionLabels: Record<string, string> = {
  mobilidade: 'Mobilidade',
  aquecimento: 'Aquecimento',
  sessao: 'Sessão',
  principal: 'Parte principal',
  resfriamento: 'Desaceleração',
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
  return labels[key] ?? key.replaceAll('_', ' ');
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
  sessionId, status, version, load, complete, onExecutionChanged, onOverview,
}: Props) {
  const headingId = useId();
  const repsId = useId();
  const loadId = useId();
  const [view, setView] = useState<GuidedResistanceView | null>(null);
  const [repetitions, setRepetitions] = useState('');
  const [loadKg, setLoadKg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [lastRest, setLastRest] = useState<number | null>(null);
  const currentSetRef = useRef<string | null>(null);
  const operationRef = useRef<{ signature: string; payload: GuidedResistanceCompletePayload } | null>(null);

  const acceptView = useCallback((saved: GuidedResistanceView) => {
    const currentId = saved.current?.plannedSetId ?? null;
    if (currentSetRef.current !== currentId) {
      currentSetRef.current = currentId;
      setRepetitions(saved.current?.repsMin === null || saved.current?.repsMin === undefined
        ? '' : String(saved.current.repsMin));
      setLoadKg(saved.current?.loadKg === null || saved.current?.loadKg === undefined
        ? '' : String(saved.current.loadKg));
      operationRef.current = null;
    }
    setView(saved);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      acceptView(await load(sessionId));
      setError(null);
    } catch {
      setError('Não foi possível consultar a posição salva. Confira a conexão e atualize o treino.');
    } finally {
      setLoading(false);
    }
  }, [acceptView, load, sessionId]);

  useEffect(() => {
    // A mudança de estado canônico (pausa, retomada, outra sessão) invalida
    // a leitura anterior; nunca depender de memória local para a posição.
    void refresh();
  }, [refresh, status, version]);

  async function confirmCurrent() {
    if (!view?.current || view.status !== 'in_progress' || status !== 'in_progress' || busy || loading) return;
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
    setBusy(true);
    setError(null);
    setConfirmation(null);
    try {
      const saved = await complete(sessionId, operationRef.current.payload);
      setLastRest(current.restSec);
      acceptView(saved);
      operationRef.current = null;
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
        try {
          await refresh();
          setError('O treino mudou em outro dispositivo. Revise a série atualizada antes de confirmar novamente.');
        } catch {
          setError('O treino mudou em outro dispositivo. Atualize a sessão antes de tentar novamente.');
        }
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
        <Button type="button" variant="outline" size="sm" onClick={onOverview}>Ver ficha completa</Button>
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
                  {readableContext(current.section, sectionLabels)} · {readableContext(current.blockKind, blockLabels)} · Série {current.setNumber} de {current.exerciseSetTotal}
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
                    <input id={repsId} value={repetitions} onChange={(event) => setRepetitions(event.target.value)}
                      inputMode="numeric" autoComplete="off" disabled={busy || view.status !== 'in_progress' || status !== 'in_progress'}
                      placeholder="Informe as repetições" className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-base" />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor={loadId} className="text-sm font-medium">Carga realizada (kg)</label>
                    <input id={loadId} value={loadKg} onChange={(event) => setLoadKg(event.target.value)}
                      inputMode="decimal" autoComplete="off" disabled={busy || view.status !== 'in_progress'}
                      placeholder="Informe a carga" className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-base" />
                  </div>
                </div>
                {view.status === 'paused' && <p role="status" className="text-sm text-amber-800">Treino pausado. Retome a sessão para registrar esta série.</p>}
                <Button type="submit" className="w-full sm:w-auto" disabled={busy || loading || view.status !== 'in_progress' || status !== 'in_progress'}>
                  {busy ? 'Salvando série...' : 'Concluir série'}
                </Button>
              </form>
              <p className="text-sm text-muted-foreground">Próximo: {view.next ? view.next.exerciseName + ', série ' + view.next.setNumber : 'revisar e finalizar o treino'}.</p>
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
