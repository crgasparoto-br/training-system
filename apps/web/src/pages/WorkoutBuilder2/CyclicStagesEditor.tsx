import { useEffect, useState } from 'react';
import type { CyclicStage, CyclicStageKind, CyclicStageTarget } from '../../services/workout.service';

interface Props {
  dayOfWeek: number;
  stages?: CyclicStage[];
  editable: boolean;
  onApply: (stages: CyclicStage[]) => void;
}

const KINDS: Array<{ kind: CyclicStageKind; label: string }> = [
  { kind: 'warmup', label: 'Aquecimento' },
  { kind: 'work', label: 'Trabalho' },
  { kind: 'recovery', label: 'Recuperação' },
  { kind: 'cooldown', label: 'Desaquecimento' },
  { kind: 'repeat', label: 'Repetir grupo' },
];
const TARGETS: Array<{ kind: CyclicStageTarget; label: string }> = [
  { kind: 'heart_rate_bpm', label: 'Frequência cardíaca (bpm)' },
  { kind: 'speed_kmh', label: 'Velocidade (km/h)' },
  { kind: 'pace_min_per_km', label: 'Ritmo (min/km)' },
  { kind: 'zone', label: 'Zona de esforço' },
  { kind: 'pse', label: 'PSE (0 a 10)' },
];
const reorder = (stages: CyclicStage[]) => stages.map((stage, i) => ({ ...stage, position: i + 1 }));
const newStage = (kind: CyclicStageKind): CyclicStage => kind === 'repeat'
  ? { kind, position: 1, repeatCount: 2, children: [
      { kind: 'work', position: 1, durationUnit: 'seconds' },
      { kind: 'recovery', position: 2, durationUnit: 'seconds' },
    ] }
  : { kind, position: 1, durationUnit: 'seconds' };
const numberOrUndefined = (value: string) => value.trim() === '' ? undefined : Number(value);

function stageError(stages: CyclicStage[]): string | null {
  const test = (stage: CyclicStage): string | null => {
    if (stage.kind === 'repeat') {
      if (!Number.isInteger(stage.repeatCount) || (stage.repeatCount ?? 0) < 2 || (stage.repeatCount ?? 0) > 100) {
        return 'Informe de 2 a 100 repetições.';
      }
      if (!stage.children || stage.children.length < 2
        || !stage.children.some((child) => child.kind === 'work')
        || !stage.children.some((child) => child.kind === 'recovery')) {
        return 'Cada grupo precisa de etapas de trabalho e recuperação.';
      }
      return stage.children.map(test).find(Boolean) ?? null;
    }
    if (!stage.durationUnit || !Number.isFinite(stage.durationValue)
      || (stage.durationValue ?? 0) <= 0) return 'Informe a duração positiva de cada etapa.';
    if (stage.targetKind
      && ![stage.targetValue, stage.targetMin, stage.targetMax].some((value) => value !== undefined && value !== null)) {
      return 'Informe o valor ou a faixa de cada alvo escolhido.';
    }
    if (stage.targetMin !== undefined && stage.targetMax !== undefined
      && stage.targetMin !== null && stage.targetMax !== null && stage.targetMin > stage.targetMax) {
      return 'O alvo mínimo deve ser menor ou igual ao máximo.';
    }
    return null;
  };
  if (stages.length > 40) return 'Use no máximo 40 etapas por dia.';
  return stages.map(test).find(Boolean) ?? null;
}

interface RowProps {
  stage: CyclicStage;
  label: string;
  nested?: boolean;
  disabled: boolean;
  update: (patch: Partial<CyclicStage>) => void;
  changeKind: (kind: CyclicStageKind) => void;
  remove: () => void;
  up: () => void;
  down: () => void;
  canUp: boolean;
  canDown: boolean;
  updateChild: (index: number, patch: Partial<CyclicStage>) => void;
  changeChildKind: (index: number, kind: CyclicStageKind) => void;
  addChild: () => void;
  removeChild: (index: number) => void;
  moveChild: (index: number, delta: number) => void;
}

function StageRow({
  stage, label, nested = false, disabled, update, changeKind, remove, up, down,
  canUp, canDown, updateChild, changeChildKind, addChild, removeChild, moveChild,
}: RowProps) {
  const range = stage.targetMin !== undefined || stage.targetMax !== undefined;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-sm text-slate-900">{label}</span>
        <div className="flex gap-1">
          <button type="button" disabled={disabled || !canUp} onClick={up} aria-label={`Subir ${label}`}
            className="rounded border px-2 py-1 text-xs disabled:opacity-40">↑</button>
          <button type="button" disabled={disabled || !canDown} onClick={down} aria-label={`Descer ${label}`}
            className="rounded border px-2 py-1 text-xs disabled:opacity-40">↓</button>
          <button type="button" disabled={disabled} onClick={remove}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 disabled:opacity-40">Remover</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <label className="block text-xs font-medium text-slate-700">Tipo de etapa
          <select value={stage.kind} disabled={disabled}
            onChange={(event) => changeKind(event.target.value as CyclicStageKind)}
            className="mt-1 w-full rounded border px-2 py-2 text-sm">
            {KINDS.filter((item) => !nested || item.kind !== 'repeat').map((item) => (
              <option key={item.kind} value={item.kind}>{item.label}</option>
            ))}
          </select>
        </label>
        {stage.kind === 'repeat' ? (
          <label className="block text-xs font-medium text-slate-700">Número de voltas
            <input type="number" min={2} max={100} step={1} value={stage.repeatCount ?? ''}
              disabled={disabled} onChange={(event) => update({ repeatCount: numberOrUndefined(event.target.value) })}
              className="mt-1 w-full rounded border px-2 py-2 text-sm" />
          </label>
        ) : (
          <>
            <label className="block text-xs font-medium text-slate-700">Unidade
              <select value={stage.durationUnit ?? ''} disabled={disabled}
                onChange={(event) => update({ durationUnit: event.target.value as CyclicStage['durationUnit'] })}
                className="mt-1 w-full rounded border px-2 py-2 text-sm">
                <option value="seconds">Segundos</option>
                <option value="meters">Metros</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-slate-700">Duração ou distância
              <input type="number" min={0.001} step="any" value={stage.durationValue ?? ''}
                disabled={disabled} onChange={(event) => update({ durationValue: numberOrUndefined(event.target.value) })}
                className="mt-1 w-full rounded border px-2 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-slate-700">Alvo (opcional)
              <select value={stage.targetKind ?? ''} disabled={disabled}
                onChange={(event) => update({
                  targetKind: event.target.value ? event.target.value as CyclicStageTarget : undefined,
                  targetValue: undefined, targetMin: undefined, targetMax: undefined,
                })} className="mt-1 w-full rounded border px-2 py-2 text-sm">
                <option value="">Sem alvo específico</option>
                {TARGETS.map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}
              </select>
            </label>
            {stage.targetKind && (
              <>
                <label className="block text-xs font-medium text-slate-700">Formato do alvo
                  <select value={range ? 'range' : 'single'} disabled={disabled}
                    onChange={(event) => update(event.target.value === 'range'
                      ? { targetValue: undefined, targetMin: undefined, targetMax: undefined }
                      : { targetMin: undefined, targetMax: undefined, targetValue: undefined })}
                    className="mt-1 w-full rounded border px-2 py-2 text-sm">
                    <option value="single">Valor único</option>
                    <option value="range">Faixa mínima/máxima</option>
                  </select>
                </label>
                {(range ? ['targetMin', 'targetMax'] as const : ['targetValue'] as const).map((field) => (
                  <label key={field} className="block text-xs font-medium text-slate-700">
                    {field === 'targetMin' ? 'Mínimo' : field === 'targetMax' ? 'Máximo' : 'Valor alvo'}
                    <input type="number" step="any" disabled={disabled}
                      value={stage[field] ?? ''}
                      onChange={(event) => update({ [field]: numberOrUndefined(event.target.value) })}
                      className="mt-1 w-full rounded border px-2 py-2 text-sm" />
                  </label>
                ))}
              </>
            )}
            <label className="block text-xs font-medium text-slate-700">Inclinação (%) opcional
              <input type="number" step="any" disabled={disabled} value={stage.inclinePercent ?? ''}
                onChange={(event) => update({ inclinePercent: numberOrUndefined(event.target.value) })}
                className="mt-1 w-full rounded border px-2 py-2 text-sm" />
            </label>
            <label className="block text-xs font-medium text-slate-700">Cadência (passos/min) opcional
              <input type="number" step={1} disabled={disabled} value={stage.cadenceSpm ?? ''}
                onChange={(event) => update({ cadenceSpm: numberOrUndefined(event.target.value) })}
                className="mt-1 w-full rounded border px-2 py-2 text-sm" />
            </label>
          </>
        )}
      </div>
      <label className="block text-xs font-medium text-slate-700">Orientação para o aluno (opcional)
        <textarea rows={2} maxLength={500} disabled={disabled} value={stage.notes ?? ''}
          onChange={(event) => update({ notes: event.target.value })}
          className="mt-1 w-full rounded border px-2 py-2 text-sm" />
      </label>
      {stage.kind === 'repeat' && (
        <div className="space-y-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
          <p className="text-sm font-medium text-slate-800">Etapas de cada volta</p>
          {(stage.children ?? []).map((child, index, all) => (
            <StageRow key={index} stage={child} label={`Etapa ${index + 1} da volta`} nested disabled={disabled}
              update={(patch) => updateChild(index, patch)}
              changeKind={(kind) => changeChildKind(index, kind)}
              remove={() => removeChild(index)}
              up={() => moveChild(index, -1)}
              down={() => moveChild(index, 1)}
              canUp={index > 0} canDown={index < all.length - 1}
              updateChild={() => undefined} changeChildKind={() => undefined}
              addChild={() => undefined} removeChild={() => undefined} moveChild={() => undefined} />
          ))}
          <button type="button" disabled={disabled || (stage.children?.length ?? 0) >= 20}
            onClick={addChild} className="rounded border bg-white px-3 py-2 text-sm disabled:opacity-40">
            Adicionar etapa na volta
          </button>
        </div>
      )}
    </div>
  );
}

export default function CyclicStagesEditor({ dayOfWeek, stages, editable, onApply }: Props) {
  const [draft, setDraft] = useState<CyclicStage[]>(stages ?? []);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDraft(stages ?? []); setError(null); }, [dayOfWeek, stages]);
  const applyTop = (index: number, mutate: (stage: CyclicStage) => CyclicStage) => {
    setDraft((previous) => previous.map((stage, i) => i === index ? mutate(stage) : stage));
    setError(null);
  };
  const updateChild = (index: number, childIndex: number, patch: Partial<CyclicStage>) =>
    applyTop(index, (stage) => ({
      ...stage,
      children: (stage.children ?? []).map((child, i) => i === childIndex ? { ...child, ...patch } : child),
    }));
  const setChildKind = (index: number, childIndex: number, kind: CyclicStageKind) =>
    applyTop(index, (stage) => ({
      ...stage,
      children: (stage.children ?? []).map((child, i) => i === childIndex
        ? { ...newStage(kind), position: child.position } : child),
    }));
  const editChildList = (index: number, mutate: (children: CyclicStage[]) => CyclicStage[]) =>
    applyTop(index, (stage) => ({ ...stage, children: reorder(mutate(stage.children ?? [])) }));
  const move = (list: CyclicStage[], index: number, delta: number) => {
    const copy = [...list];
    const next = index + delta;
    if (next < 0 || next >= copy.length) return copy;
    [copy[index], copy[next]] = [copy[next], copy[index]];
    return reorder(copy);
  };
  const apply = () => {
    const errorMessage = stageError(draft);
    if (errorMessage) { setError(errorMessage); return; }
    onApply(reorder(draft));
    setError(null);
  };

  return (
    <div className="space-y-3 rounded-lg border border-green-200 bg-green-50/50 p-4">
      <div>
        <h4 className="text-sm font-semibold text-slate-900">Etapas estruturadas do dia {dayOfWeek}</h4>
        <p className="mt-1 text-xs text-slate-600">
          Defina aquecimento, trabalho, recuperação e desaquecimento na ordem da sessão.
          Os dados legados continuam disponíveis e nenhuma etapa é criada automaticamente.
        </p>
      </div>
      {draft.length === 0 && <p className="rounded border border-dashed p-3 text-sm text-slate-600">
        Nenhuma etapa estruturada. O detalhamento antigo continuará sendo exibido.
      </p>}
      <div className="space-y-3">
        {draft.map((stage, index, all) => (
          <StageRow key={index} stage={stage} label={`Etapa ${index + 1}`} disabled={!editable}
            update={(patch) => applyTop(index, (current) => ({ ...current, ...patch }))}
            changeKind={(kind) => applyTop(index, () => ({ ...newStage(kind), position: index + 1 }))}
            remove={() => setDraft((prev) => reorder(prev.filter((_, i) => i !== index)))}
            up={() => setDraft((prev) => move(prev, index, -1))}
            down={() => setDraft((prev) => move(prev, index, 1))}
            canUp={index > 0} canDown={index < all.length - 1}
            updateChild={(childIndex, patch) => updateChild(index, childIndex, patch)}
            changeChildKind={(childIndex, kind) => setChildKind(index, childIndex, kind)}
            addChild={() => editChildList(index, (children) => [...children, newStage('work')])}
            removeChild={(childIndex) => editChildList(index, (children) => children.filter((_, i) => i !== childIndex))}
            moveChild={(childIndex, delta) => editChildList(index, (children) => move(children, childIndex, delta))}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!editable || draft.length >= 40}
          onClick={() => { setDraft((prev) => reorder([...prev, newStage('work')])); setError(null); }}
          className="rounded-md border border-green-700 bg-white px-3 py-2 text-sm text-green-800 disabled:opacity-40">
          Adicionar etapa
        </button>
        <button type="button" disabled={!editable || draft.length >= 40}
          onClick={() => { setDraft((prev) => reorder([...prev, newStage('repeat')])); setError(null); }}
          className="rounded-md border border-green-700 bg-white px-3 py-2 text-sm text-green-800 disabled:opacity-40">
          Adicionar repetição
        </button>
        <button type="button" disabled={!editable} onClick={apply}
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          Aplicar etapas do dia
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!editable && <p className="text-sm text-slate-600">Somente leitura: este dia não está disponível para edição.</p>}
    </div>
  );
}
