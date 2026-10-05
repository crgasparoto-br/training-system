import { useEffect, useId, useRef, useState } from 'react';
import type {
  PreWorkoutCheckInView,
  PreWorkoutCheckInValues,
  TrainingRoutineAudience,
  TrainingRoutineExecutionProjectionStatus,
  UpsertPreWorkoutCheckInPayload,
} from '@corrida/types';
import { Button } from '../ui/Button';
import { getPreWorkoutCheckInSaveFailure } from '../../services/pre-workout-check-in.service';

const emptyValues: PreWorkoutCheckInValues = {
  psr: null,
  sleepQuality: null,
  fatigue: null,
  painLevel: null,
  motivation: null,
  availableMinutes: null,
  notes: null,
};

const fields: Array<{ key: keyof Omit<PreWorkoutCheckInValues, 'notes'>; label: string; max?: number }> = [
  { key: 'psr', label: 'Recuperação percebida (PSR)', max: 10 },
  { key: 'sleepQuality', label: 'Qualidade do sono', max: 10 },
  { key: 'fatigue', label: 'Fadiga', max: 10 },
  { key: 'painLevel', label: 'Dor ou desconforto' },
  { key: 'motivation', label: 'Motivação', max: 10 },
  { key: 'availableMinutes', label: 'Tempo disponível (min)' },
];

const triageLabel = {
  green: 'Faixa verde',
  attention: 'Atenção',
  alert: 'Alerta',
};

type Props = {
  audience: TrainingRoutineAudience;
  sessionStatus: TrainingRoutineExecutionProjectionStatus;
  initialCheckIn: PreWorkoutCheckInView | null;
  save?: (payload: UpsertPreWorkoutCheckInPayload) => Promise<PreWorkoutCheckInView>;
};

export function PreWorkoutCheckInCard({ audience, sessionStatus, initialCheckIn, save }: Props) {
  const headingId = useId();
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [values, setValues] = useState<PreWorkoutCheckInValues>(initialCheckIn?.values ?? emptyValues);
  const [saving, setSaving] = useState(false);
  const [sessionLocked, setSessionLocked] = useState(false);
  const submissionInFlight = useRef(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const pendingOperation = useRef<{ fingerprint: string; key: string } | null>(null);
  const editable = !sessionLocked && audience === 'student' && sessionStatus === 'not_started' && (checkIn?.editable ?? true);

  useEffect(() => {
    setCheckIn(initialCheckIn);
    setValues(initialCheckIn?.values ?? emptyValues);
  }, [initialCheckIn]);

  if (audience === 'professor') {
    if (!checkIn) {
      return (
        <section aria-labelledby={headingId} className="rounded-lg border border-border bg-muted/20 p-3">
          <h4 id={headingId} className="text-sm font-semibold text-foreground">Check-in pré-treino</h4>
          <p className="mt-1 text-sm text-muted-foreground">Nenhum check-in registrado para esta sessão.</p>
        </section>
      );
    }
    return (
      <section aria-labelledby={headingId} className="rounded-lg border border-border bg-muted/20 p-3">
        <h4 id={headingId} className="text-sm font-semibold text-foreground">Check-in pré-treino</h4>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          {fields.map(({ key, label }) => (
            <div key={key}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium text-foreground">{checkIn.values[key] ?? 'Não informado'}</dd>
            </div>
          ))}
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Observação do aluno</dt>
            <dd className="font-medium text-foreground">{checkIn.values.notes || 'Não informada'}</dd>
          </div>
        </dl>
        {checkIn.technical && (
          <div className="mt-3 border-t border-border pt-2 text-xs text-muted-foreground">
            <p>Regra: {checkIn.technical.ruleSetVersion}</p>
            {checkIn.technical.technicalMessage && <p className="mt-1">{checkIn.technical.technicalMessage}</p>}
          </div>
        )}
      </section>
    );
  }

  const setNumeric = (key: keyof Omit<PreWorkoutCheckInValues, 'notes'>, raw: string) => {
    setValues((current) => ({ ...current, [key]: raw === '' ? null : Number(raw) }));
    setMessage(null);
  };

  const submit = async () => {
    if (!save || !editable || submissionInFlight.current) return;
    submissionInFlight.current = true;
    const payloadValues = { ...values, notes: values.notes?.trim() || null };
    const fingerprint = JSON.stringify(payloadValues);
    if (!pendingOperation.current || pendingOperation.current.fingerprint !== fingerprint) {
      pendingOperation.current = {
        fingerprint,
        key: globalThis.crypto?.randomUUID?.() ?? `checkin-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await save({ operationKey: pendingOperation.current.key, ...payloadValues });
      pendingOperation.current = null;
      setCheckIn(saved);
      setValues(saved.values);
      setMessage({ kind: 'success', text: 'Check-in salvo. Você pode ajustá-lo até iniciar o treino.' });
    } catch (error) {
      const failure = getPreWorkoutCheckInSaveFailure(error);
      if (failure.kind === 'session-locked') setSessionLocked(true);
      setMessage({ kind: 'error', text: failure.message });
    } finally {
      submissionInFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-border bg-muted/20 p-3">
      <h4 id={headingId} className="text-sm font-semibold text-foreground">Como você está antes do treino?</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Preencha o que fizer sentido agora. O check-in não altera seu treino automaticamente.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {fields.map(({ key, label, max }) => (
          <label key={key} className="space-y-1 text-sm">
            <span className="font-medium text-foreground">{label}</span>
            <input
              type="number"
              min={0}
              {...(max === undefined ? {} : { max })}
              step={1}
              value={values[key] ?? ''}
              onChange={(event) => setNumeric(key, event.target.value)}
              disabled={!editable || saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            />
            {max === 10 && <span className="block text-xs text-muted-foreground">Escala de 0 a 10.</span>}
            {key === 'painLevel' && (
              <span className="block text-xs text-muted-foreground">0–2 verde, 3–4 atenção, acima de 4 alerta.</span>
            )}
          </label>
        ))}
      </div>

      <label className="mt-3 block space-y-1 text-sm">
        <span className="font-medium text-foreground">Observação</span>
        <textarea
          value={values.notes ?? ''}
          maxLength={500}
          rows={3}
          onChange={(event) => {
            setValues((current) => ({ ...current, notes: event.target.value }));
            setMessage(null);
          }}
          disabled={!editable || saving}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Algo que seu professor deva saber antes do treino?"
        />
      </label>

      {checkIn?.guidance.painTriage && (
        <div className="mt-3 rounded-md border border-border bg-background p-3 text-sm" role="status">
          <p className="font-semibold text-foreground">{triageLabel[checkIn.guidance.painTriage]}</p>
          {checkIn.guidance.studentMessage && <p className="mt-1 text-foreground">{checkIn.guidance.studentMessage}</p>}
        </div>
      )}

      {!editable && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {sessionLocked
            ? 'As alterações desta tela não foram salvas. Recarregue a página para consultar o check-in registrado.'
            : checkIn
            ? 'Este check-in está somente leitura porque o treino já foi iniciado ou encerrado.'
            : 'Não houve check-in registrado antes do início desta sessão.'}
        </p>
      )}

      {message && (
        <p className={`mt-3 text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-foreground'}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      {editable && (
        <Button type="button" size="sm" className="mt-3" disabled={saving} onClick={() => void submit()}>
          {saving ? 'Salvando...' : checkIn ? 'Atualizar check-in' : 'Salvar check-in'}
        </Button>
      )}
    </section>
  );
}
