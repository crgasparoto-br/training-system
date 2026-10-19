import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { ResistanceBlock, ResistancePlannedSet } from '../../services/workout.service';

interface Props {
  blocks?: ResistanceBlock[];
  onChange: (blocks: ResistanceBlock[]) => void;
  exerciseName: string;
}

const KINDS: Array<{ value: ResistanceBlock['kind']; label: string }> = [
  { value: 'aquecimento', label: 'Aquecimento' },
  { value: 'principal', label: 'Principal' },
  { value: 'tecnica', label: 'Técnica' },
  { value: 'complementar', label: 'Complementar' },
  { value: 'finalizacao', label: 'Finalização' },
];

const freshSet = (position: number): ResistancePlannedSet => ({
  position, repsMin: null, repsMax: null, loadKg: null, loadPercent: null,
  rir: null, rpe: null, tempo: null, restSec: null, notes: null,
});
const reindex = (blocks: ResistanceBlock[]) => blocks.map((block, index) => ({
  ...block,
  position: index + 1,
  plannedSets: block.plannedSets.map((set, setIndex) => ({ ...set, position: setIndex + 1 })),
}));

export default function ResistanceBlocksEditor({ blocks, onChange, exerciseName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const items = blocks ?? [];
  const updateBlock = (index: number, patch: Partial<ResistanceBlock>) =>
    onChange(items.map((block, position) => position === index ? { ...block, ...patch } : block));
  const updateSet = (blockIndex: number, setIndex: number, patch: Partial<ResistancePlannedSet>) =>
    updateBlock(blockIndex, {
      plannedSets: items[blockIndex].plannedSets.map((set, position) =>
        position === setIndex ? { ...set, ...patch } : set),
    });

  const numberInput = (
    blockIndex: number,
    setIndex: number,
    key: keyof ResistancePlannedSet,
    label: string,
    options: { min?: number; max?: number; step?: string } = {},
  ) => {
    const set = items[blockIndex].plannedSets[setIndex];
    return (
      <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
        <span className="block">{label}</span>
        <input
          type="number"
          inputMode="decimal"
          min={options.min ?? 0}
          max={options.max}
          step={options.step ?? '1'}
          value={(set[key] as number | null | undefined) ?? ''}
          aria-label={`${label}, série ${setIndex + 1} de ${exerciseName}`}
          onChange={(event) => updateSet(blockIndex, setIndex, {
            [key]: event.target.value === '' ? null : Number(event.target.value),
          })}
          className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`Detalhar séries de ${exerciseName}`}
          onClick={() => setExpanded((open) => !open)}
          className="rounded-md px-2 py-1 text-left text-xs font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Séries detalhadas · {items.length ? `${items.length} bloco(s), ${items.reduce((sum, block) => sum + block.plannedSets.length, 0)} série(s)` : 'estrutura simples (legado)'}
        </button>
        {expanded && (
          <Button
            type="button" variant="outline" size="sm"
            disabled={items.length >= 12}
            onClick={() => onChange([...items, {
              position: items.length + 1, kind: 'principal', notes: null, plannedSets: [freshSet(1)],
            }])}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar bloco
          </Button>
        )}
      </div>
      {expanded && (
        <div className="mt-3 space-y-3">
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Este exercício usa séries simples. Adicione um bloco para prescrever cada série separadamente.
            </p>
          )}
          {items.map((block, blockIndex) => (
            <section key={blockIndex} className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <label className="min-w-40 flex-1 space-y-1 text-xs text-muted-foreground">
                  <span className="block">Bloco {blockIndex + 1} · tipo</span>
                  <select
                    value={block.kind}
                    onChange={(event) => updateBlock(blockIndex, { kind: event.target.value as ResistanceBlock['kind'] })}
                    className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
                  >
                    {KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
                  </select>
                </label>
                <Button
                  type="button" variant="outline" size="sm"
                  onClick={() => onChange(reindex(items.filter((_, index) => index !== blockIndex)))}
                  aria-label={`Remover bloco ${blockIndex + 1} de ${exerciseName}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover bloco
                </Button>
              </div>
              <div className="space-y-3">
                {block.plannedSets.map((set, setIndex) => (
                  <div key={setIndex} className="rounded-md border border-border bg-card p-2">
                    <div className="mb-2 flex justify-between gap-2 text-xs font-medium text-foreground">
                      <span>Série {setIndex + 1}</span>
                      <button
                        type="button" disabled={block.plannedSets.length <= 1}
                        onClick={() => updateBlock(blockIndex, {
                          plannedSets: block.plannedSets.filter((_, index) => index !== setIndex)
                            .map((part, index) => ({ ...part, position: index + 1 })),
                        })}
                        className="rounded-md px-2 text-muted-foreground hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                        aria-label={`Remover série ${setIndex + 1}`}
                      >Remover série</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
                      {numberInput(blockIndex, setIndex, 'repsMin', 'Rep. mín.', { max: 999 })}
                      {numberInput(blockIndex, setIndex, 'repsMax', 'Rep. máx.', { max: 999 })}
                      {numberInput(blockIndex, setIndex, 'loadKg', 'Carga (kg)', { max: 99999, step: 'any' })}
                      {numberInput(blockIndex, setIndex, 'loadPercent', 'Carga (%)', { max: 999, step: 'any' })}
                      {numberInput(blockIndex, setIndex, 'rir', 'RIR', { max: 10, step: 'any' })}
                      {numberInput(blockIndex, setIndex, 'rpe', 'RPE', { max: 10, step: 'any' })}
                      {numberInput(blockIndex, setIndex, 'restSec', 'Descanso (s)', { max: 86400 })}
                      <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
                        <span className="block">Tempo/cadência</span>
                        <input type="text" maxLength={64} value={set.tempo ?? ''}
                          onChange={(event) => updateSet(blockIndex, setIndex, { tempo: event.target.value || null })}
                          className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
                          aria-label={`Tempo da série ${setIndex + 1} de ${exerciseName}`}
                          placeholder="Ex.: 3-1-1-0"
                        />
                      </label>
                    </div>
                    <label className="mt-2 block space-y-1 text-xs text-muted-foreground">
                      <span className="block">Observação da série</span>
                      <input type="text" maxLength={1000} value={set.notes ?? ''}
                        onChange={(event) => updateSet(blockIndex, setIndex, { notes: event.target.value || null })}
                        className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
                      />
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <label className="min-w-40 flex-1 space-y-1 text-xs text-muted-foreground">
                  <span className="block">Observação do bloco</span>
                  <input type="text" maxLength={1000} value={block.notes ?? ''}
                    onChange={(event) => updateBlock(blockIndex, { notes: event.target.value || null })}
                    className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm text-foreground"
                  />
                </label>
                <Button type="button" size="sm" variant="outline" disabled={block.plannedSets.length >= 30}
                  onClick={() => updateBlock(blockIndex, {
                    plannedSets: [...block.plannedSets, freshSet(block.plannedSets.length + 1)],
                  })}
                ><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar série</Button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
