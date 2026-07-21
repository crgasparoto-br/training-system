import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Clock3, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  agendaService,
  type FixedScheduleAvailabilityResult,
  type FixedScheduleSlotInput,
  type TrainingSpace,
  type AgendaProfessor,
} from '../../services/agenda.service';

export interface FixedScheduleSlotDraft extends FixedScheduleSlotInput {
  clientKey: string;
  availability?: FixedScheduleAvailabilityResult | null;
}

interface FixedScheduleEditorProps {
  alunoId?: string;
  plan: 'free' | 'fixed';
  value: FixedScheduleSlotDraft[];
  onChange: (value: FixedScheduleSlotDraft[]) => void;
  refreshKey?: number;
}

const weekdays = [
  { value: 1, label: 'Segunda-feira' },
  { value: 2, label: 'Terça-feira' },
  { value: 3, label: 'Quarta-feira' },
  { value: 4, label: 'Quinta-feira' },
  { value: 5, label: 'Sexta-feira' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

const selectClassName =
  'flex h-10 w-full rounded-lg border border-[#cbd5e1] bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2';

const newClientKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `fixed-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createBlankRow = (professorId = '', spaceId = ''): FixedScheduleSlotDraft => ({
  clientKey: newClientKey(),
  professorId,
  spaceId,
  dayOfWeek: 1,
  startTime: '08:00',
  endTime: '09:00',
  notes: '',
  availability: null,
});

function availabilityClass(result?: FixedScheduleAvailabilityResult | null) {
  if (!result) return 'border-slate-200 bg-slate-50 text-slate-600';
  return result.available
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-800';
}

export function FixedScheduleEditor({
  alunoId,
  plan,
  value,
  onChange,
  refreshKey = 0,
}: FixedScheduleEditorProps) {
  const [spaces, setSpaces] = useState<TrainingSpace[]>([]);
  const [professors, setProfessors] = useState<AgendaProfessor[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (plan !== 'fixed') return;

    let active = true;
    setLoading(true);
    setLoadError(null);

    Promise.all([
      agendaService.getMetadata(),
      alunoId ? agendaService.listFixedSlots({ alunoId }) : Promise.resolve([]),
    ])
      .then(([metadata, existing]) => {
        if (!active) return;
        const activeSpaces = metadata.spaces.filter((space) => space.isActive);
        setSpaces(activeSpaces);
        setProfessors(metadata.professores);

        if (alunoId) {
          onChange(
            existing
              .filter((slot) => slot.isActive)
              .map((slot) => ({
                id: slot.id,
                clientKey: slot.id,
                professorId: slot.professorId,
                spaceId: slot.spaceId || '',
                dayOfWeek: slot.dayOfWeek,
                startTime: slot.startTime,
                endTime: slot.endTime,
                notes: slot.notes || '',
                availability: null,
              }))
          );
        } else if (value.length === 0) {
          onChange([
            createBlankRow(metadata.professores[0]?.id || '', activeSpaces[0]?.id || ''),
          ]);
        }
      })
      .catch((error: any) => {
        if (!active) return;
        setLoadError(error.response?.data?.error || 'Não foi possível carregar os dados da agenda.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // O refreshKey é incrementado somente após uma gravação concluída.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alunoId, plan, refreshKey]);

  const hasIncompleteRows = useMemo(
    () =>
      value.some(
        (row) =>
          !row.professorId ||
          !row.spaceId ||
          !row.dayOfWeek ||
          !row.startTime ||
          !row.endTime
      ),
    [value]
  );

  if (plan !== 'fixed') return null;

  const updateRow = <K extends keyof FixedScheduleSlotDraft>(
    clientKey: string,
    field: K,
    nextValue: FixedScheduleSlotDraft[K]
  ) => {
    onChange(
      value.map((row) =>
        row.clientKey === clientKey
          ? { ...row, [field]: nextValue, availability: null }
          : row
      )
    );
  };

  const addRow = () => {
    onChange([
      ...value,
      createBlankRow(professors[0]?.id || '', spaces[0]?.id || ''),
    ]);
  };

  const removeRow = (clientKey: string) => {
    onChange(value.filter((row) => row.clientKey !== clientKey));
  };

  const checkRows = async (targetClientKey?: string) => {
    setChecking(true);
    try {
      const results = await agendaService.checkFixedScheduleAvailability({
        alunoId,
        slots: value.map(({ availability: _availability, ...slot }) => slot),
      });
      const byClientKey = new Map(
        results.map((result) => [result.clientKey || value[result.rowIndex]?.clientKey, result])
      );
      onChange(
        value.map((row) => {
          if (targetClientKey && row.clientKey !== targetClientKey) return row;
          return { ...row, availability: byClientKey.get(row.clientKey) || null };
        })
      );
    } catch (error: any) {
      const message = error.response?.data?.error || 'Não foi possível verificar os horários.';
      if (targetClientKey) {
        onChange(
          value.map((row, rowIndex) =>
            row.clientKey === targetClientKey
              ? {
                  ...row,
                  availability: {
                    rowIndex,
                    clientKey: targetClientKey,
                    available: false,
                    code: error.response?.data?.code || 'FIXED_SCHEDULE_CHANGED',
                    message,
                    stage: error.response?.data?.stage || 'schedule',
                  },
                }
              : row
          )
        );
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h4 className="font-semibold text-foreground">Horários recorrentes</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe cada dia, período, espaço e professor. A academia é verificada antes do professor.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => checkRows()}
            disabled={checking || hasIncompleteRows || value.length === 0}
          >
            <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Verificando...' : 'Verificar todos'}
          </Button>
          <Button type="button" variant="outline" onClick={addRow}>
            <Plus size={16} /> Adicionar recorrência
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando agenda...</p>}
      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      {!loading && spaces.length === 0 && (
        <p className="text-sm text-amber-700">
          Cadastre e ative ao menos um espaço da academia antes de usar a agenda fixa.
        </p>
      )}
      {!loading && professors.length === 0 && (
        <p className="text-sm text-amber-700">Nenhum professor ativo está disponível para seleção.</p>
      )}

      <div className="space-y-3">
        {value.map((row, index) => (
          <div key={row.clientKey} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">Recorrência {index + 1}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeRow(row.clientKey)}
                aria-label={`Remover recorrência ${index + 1}`}
              >
                <Trash2 size={16} />
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-1 text-sm font-medium text-foreground">
                Dia da semana
                <select
                  className={selectClassName}
                  value={row.dayOfWeek}
                  onChange={(event) => updateRow(row.clientKey, 'dayOfWeek', Number(event.target.value))}
                >
                  {weekdays.map((day) => (
                    <option key={day.value} value={day.value}>{day.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                Início
                <input
                  className={selectClassName}
                  type="time"
                  value={row.startTime}
                  onChange={(event) => updateRow(row.clientKey, 'startTime', event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                Fim
                <input
                  className={selectClassName}
                  type="time"
                  value={row.endTime}
                  onChange={(event) => updateRow(row.clientKey, 'endTime', event.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                Espaço
                <select
                  className={selectClassName}
                  value={row.spaceId}
                  onChange={(event) => updateRow(row.clientKey, 'spaceId', event.target.value)}
                >
                  <option value="">Selecione</option>
                  {spaces.map((space) => (
                    <option key={space.id} value={space.id}>
                      {space.name} · capacidade {space.capacity}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-foreground">
                Professor responsável
                <select
                  className={selectClassName}
                  value={row.professorId}
                  onChange={(event) => updateRow(row.clientKey, 'professorId', event.target.value)}
                >
                  <option value="">Selecione</option>
                  {professors.map((professor) => (
                    <option key={professor.id} value={professor.id}>
                      {professor.user.profile.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${availabilityClass(row.availability)}`}
              >
                {row.availability?.available ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                ) : row.availability ? (
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                ) : (
                  <Clock3 size={16} className="mt-0.5 shrink-0" />
                )}
                <span>
                  {row.availability?.message ||
                    'Disponibilidade ainda não verificada ou alterada após a última verificação.'}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => checkRows(row.clientKey)}
                disabled={checking || !row.professorId || !row.spaceId || !row.startTime || !row.endTime}
              >
                Verificar linha
              </Button>
            </div>
          </div>
        ))}
      </div>

      {value.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Adicione ao menos uma recorrência para salvar o plano de agenda fixa.
        </div>
      )}
    </div>
  );
}
