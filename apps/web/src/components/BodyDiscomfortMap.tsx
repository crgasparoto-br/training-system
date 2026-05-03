import { useMemo, useState } from 'react';
import { BODY_REGIONS, DISCOMFORT_TYPE_OPTIONS, type BodyDiscomfortEntry, type BodyRegion, type DiscomfortType } from '../constants/bodyRegions';
import { Button } from './ui/Button';

type BodyDiscomfortMapProps = {
  value: BodyDiscomfortEntry[];
  onChange: (value: BodyDiscomfortEntry[]) => void;
};

type DraftEntry = {
  discomfortTypes: DiscomfortType[];
  intensity: number;
  notes: string;
};

const emptyDraft: DraftEntry = {
  discomfortTypes: [],
  intensity: 1,
  notes: '',
};

const getIntensityClassName = (intensity?: number) => {
  if (!intensity) return 'fill-slate-200/60 stroke-slate-400/70';
  if (intensity <= 2) return 'fill-yellow-200 stroke-yellow-500';
  if (intensity <= 5) return 'fill-orange-400 stroke-orange-600';
  if (intensity <= 8) return 'fill-red-500 stroke-red-700';
  return 'fill-red-900 stroke-red-950';
};

const getIntensityLabel = (intensity: number) => {
  if (intensity <= 2) return 'leve';
  if (intensity <= 5) return 'moderado';
  if (intensity <= 8) return 'forte';
  return 'insuportável';
};

const getIntensityAccentColor = (intensity: number) => {
  if (intensity <= 2) return '#fde047';
  if (intensity <= 5) return '#fb923c';
  if (intensity <= 8) return '#ef4444';
  return '#7f1d1d';
};

const getRegionPathLabel = (region: BodyRegion, entry?: BodyDiscomfortEntry) =>
  `${region.number} ${region.name}. ${entry ? `Selecionado, intensidade ${entry.intensity} ${getIntensityLabel(entry.intensity)}.` : 'Não selecionado.'}`;

const renderRegionShape = (region: BodyRegion, className: string) => {
  if (region.shape.kind === 'ellipse') {
    return <ellipse cx={region.shape.cx} cy={region.shape.cy} rx={region.shape.rx} ry={region.shape.ry} className={className} />;
  }

  if (region.shape.kind === 'rect') {
    return <rect x={region.shape.x} y={region.shape.y} width={region.shape.width} height={region.shape.height} rx={region.shape.rx} className={className} />;
  }

  return <path d={region.shape.d} className={className} />;
};

export function BodyDiscomfortMap({ value, onChange }: BodyDiscomfortMapProps) {
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftEntry>(emptyDraft);
  const [error, setError] = useState<string | null>(null);

  const entriesByRegionId = useMemo(
    () => new Map(value.map((entry) => [entry.regionId, entry])),
    [value]
  );

  const activeRegion = BODY_REGIONS.find((region) => region.id === activeRegionId);
  const activeEntry = activeRegionId ? entriesByRegionId.get(activeRegionId) : undefined;

  const openRegion = (region: BodyRegion) => {
    const currentEntry = entriesByRegionId.get(region.id);
    setActiveRegionId(region.id);
    setDraft(
      currentEntry
        ? {
            discomfortTypes: currentEntry.discomfortTypes,
            intensity: currentEntry.intensity,
            notes: currentEntry.notes || '',
          }
        : emptyDraft
    );
    setError(null);
  };

  const toggleDiscomfortType = (type: DiscomfortType) => {
    setDraft((current) => ({
      ...current,
      discomfortTypes: current.discomfortTypes.includes(type)
        ? current.discomfortTypes.filter((item) => item !== type)
        : [...current.discomfortTypes, type],
    }));
  };

  const saveRegion = () => {
    if (!activeRegion) return;
    if (draft.discomfortTypes.length === 0) {
      setError('Selecione pelo menos um tipo de desconforto.');
      return;
    }
    if (draft.intensity < 1 || draft.intensity > 10) {
      setError('Informe uma intensidade entre 1 e 10.');
      return;
    }

    const nextEntry: BodyDiscomfortEntry = {
      regionId: activeRegion.id,
      regionName: activeRegion.name,
      discomfortTypes: draft.discomfortTypes,
      intensity: draft.intensity,
      notes: draft.notes.trim() || undefined,
    };

    onChange([
      ...value.filter((entry) => entry.regionId !== activeRegion.id),
      nextEntry,
    ].sort((a, b) => BODY_REGIONS.findIndex((region) => region.id === a.regionId) - BODY_REGIONS.findIndex((region) => region.id === b.regionId)));
    setActiveRegionId(null);
    setError(null);
  };

  const removeRegion = () => {
    if (!activeRegion) return;
    onChange(value.filter((entry) => entry.regionId !== activeRegion.id));
    setActiveRegionId(null);
    setError(null);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(320px,440px)_minmax(280px,1fr)]">
        <div className="rounded-xl border border-border bg-card p-4">
          <svg
            viewBox="0 0 300 620"
            role="img"
            aria-label="Mapa corporal interativo para marcar desconfortos"
            className="mx-auto h-auto w-full max-w-[420px]"
          >
            <path
              d="M150 18 C166 18 178 31 177 48 C176 63 165 75 150 75 C135 75 124 63 123 48 C122 31 134 18 150 18 Z M116 92 H184 C205 105 218 138 218 181 V248 C218 274 201 291 176 292 H124 C99 291 82 274 82 248 V181 C82 138 95 105 116 92 Z M110 289 H145 V544 H104 V430 C104 406 96 393 96 362 V314 C96 299 101 292 110 289 Z M155 289 H190 C199 292 204 299 204 314 V362 C204 393 196 406 196 430 V544 H155 Z"
              className="fill-slate-50 stroke-slate-300 stroke-[1.5]"
            />

            {BODY_REGIONS.map((region) => {
              const entry = entriesByRegionId.get(region.id);
              const className = `${getIntensityClassName(entry?.intensity)} cursor-pointer stroke-2 opacity-90 outline-none transition-opacity hover:opacity-100 focus-visible:stroke-sky-700 focus-visible:stroke-[4]`;

              return (
                <g key={region.id}>
                  <g
                    id={`body-region-${region.id}`}
                    role="button"
                    tabIndex={0}
                    aria-label={getRegionPathLabel(region, entry)}
                    onClick={() => openRegion(region)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openRegion(region);
                      }
                    }}
                  >
                    <title>{`${region.number} - ${region.name}`}</title>
                    {renderRegionShape(region, className)}
                  </g>
                  <text
                    x={region.labelX}
                    y={region.labelY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="select-none fill-slate-900 text-[10px] font-bold"
                    pointerEvents="visiblePainted"
                  >
                    <title>{`${region.number} - ${region.name}`}</title>
                    {region.number}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-5">
          {activeRegion ? (
            <div className="space-y-5">
              <div>
                <p className="text-sm text-muted-foreground">Região selecionada</p>
                <h3 className="text-xl font-semibold text-foreground">{activeRegion.number} - {activeRegion.name}</h3>
              </div>

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-foreground">Tipo de desconforto</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DISCOMFORT_TYPE_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={draft.discomfortTypes.includes(option.value)}
                        onChange={() => toggleDiscomfortType(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="body-discomfort-intensity">
                  Intensidade: {draft.intensity} ({getIntensityLabel(draft.intensity)})
                </label>
                <input
                  id="body-discomfort-intensity"
                  type="range"
                  min={1}
                  max={10}
                  value={draft.intensity}
                  onChange={(event) => setDraft((current) => ({ ...current, intensity: Number(event.target.value) }))}
                  className="w-full"
                  style={{ accentColor: getIntensityAccentColor(draft.intensity) }}
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>1</span>
                  <span>10</span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="body-discomfort-notes">
                  Observação
                </label>
                <textarea
                  id="body-discomfort-notes"
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  className="flex min-h-[96px] w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-[#94a3b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(59,130,246,0.15)]"
                  placeholder="Ex.: dor ao agachar, formigamento após corrida longa"
                />
              </div>

              {error && <p className="text-sm font-medium text-destructive">{error}</p>}

              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={saveRegion}>Salvar</Button>
                <Button type="button" variant="outline" onClick={removeRegion} disabled={!activeEntry}>
                  Remover seleção
                </Button>
                <Button type="button" variant="ghost" onClick={() => setActiveRegionId(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col justify-center gap-3 text-sm text-muted-foreground">
              <h3 className="text-lg font-semibold text-foreground">Mapa corporal</h3>
              <p>Clique em uma região numerada para registrar tipo, intensidade e observações do desconforto.</p>
              <div className="grid gap-2 pt-2 sm:grid-cols-2">
                <span className="rounded-lg border border-border bg-yellow-100 px-3 py-2 text-yellow-900">1-2 leve</span>
                <span className="rounded-lg border border-border bg-orange-200 px-3 py-2 text-orange-950">3-5 moderado</span>
                <span className="rounded-lg border border-border bg-red-200 px-3 py-2 text-red-950">6-8 forte</span>
                <span className="rounded-lg border border-border bg-red-900 px-3 py-2 text-white">9-10 insuportável</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Resumo das regiões marcadas</h3>
        {value.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum desconforto registrado.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {value.map((entry) => (
              <button
                key={entry.regionId}
                type="button"
                onClick={() => {
                  const region = BODY_REGIONS.find((item) => item.id === entry.regionId);
                  if (region) openRegion(region);
                }}
                className="rounded-lg border border-border bg-muted/30 p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{entry.regionId} - {entry.regionName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{entry.discomfortTypes.join(', ')}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.intensity >= 9 ? 'bg-red-900 text-white' : entry.intensity >= 6 ? 'bg-red-100 text-red-900' : entry.intensity >= 3 ? 'bg-orange-100 text-orange-900' : 'bg-yellow-100 text-yellow-900'}`}>
                    {entry.intensity}/10
                  </span>
                </div>
                {entry.notes && <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
