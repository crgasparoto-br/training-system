import { useMemo, useState } from 'react';
import { BODY_REGIONS_FRONT, BODY_REGIONS_BACK, DISCOMFORT_TYPE_OPTIONS, type BodyDiscomfortEntry, type BodyRegion, type DiscomfortType } from '../constants/bodyRegions';
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

const getIntensityFill = (intensity?: number): string => {
  if (!intensity) return 'transparent';
  if (intensity <= 2) return 'rgba(253, 224, 71, 0.45)';
  if (intensity <= 5) return 'rgba(251, 146, 60, 0.50)';
  if (intensity <= 8) return 'rgba(239, 68, 68, 0.55)';
  return 'rgba(127, 29, 29, 0.65)';
};

const getIntensityStroke = (intensity?: number): string => {
  if (!intensity) return 'rgba(100,116,139,0.0)';
  if (intensity <= 2) return 'rgba(202,138,4,0.8)';
  if (intensity <= 5) return 'rgba(234,88,12,0.85)';
  if (intensity <= 8) return 'rgba(185,28,28,0.9)';
  return 'rgba(69,10,10,0.95)';
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

const renderRegionShape = (region: BodyRegion, fill: string, stroke: string, extraClass: string) => {
  const commonProps = {
    fill,
    stroke,
    strokeWidth: 2,
    className: extraClass,
  };

  if (region.shape.kind === 'ellipse') {
    return <ellipse cx={region.shape.cx} cy={region.shape.cy} rx={region.shape.rx} ry={region.shape.ry} {...commonProps} />;
  }

  if (region.shape.kind === 'rect') {
    return <rect x={region.shape.x} y={region.shape.y} width={region.shape.width} height={region.shape.height} rx={region.shape.rx} {...commonProps} />;
  }

  return <path d={region.shape.d} {...commonProps} />;
};

// All body regions for lookup
const ALL_BODY_REGIONS = [...BODY_REGIONS_FRONT, ...BODY_REGIONS_BACK];

export function BodyDiscomfortMap({ value, onChange }: BodyDiscomfortMapProps) {
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftEntry>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'front' | 'back'>('front');

  const entriesByRegionId = useMemo(
    () => new Map(value.map((entry) => [entry.regionId, entry])),
    [value]
  );

  const activeRegion = ALL_BODY_REGIONS.find((region) => region.id === activeRegionId);
  const activeEntry = activeRegionId ? entriesByRegionId.get(activeRegionId) : undefined;

  const currentRegions = view === 'front' ? BODY_REGIONS_FRONT : BODY_REGIONS_BACK;

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
    ].sort((a, b) => ALL_BODY_REGIONS.findIndex((region) => region.id === a.regionId) - ALL_BODY_REGIONS.findIndex((region) => region.id === b.regionId)));
    setActiveRegionId(null);
    setError(null);
  };

  const removeRegion = () => {
    if (!activeRegion) return;
    onChange(value.filter((entry) => entry.regionId !== activeRegion.id));
    setActiveRegionId(null);
    setError(null);
  };

  const switchView = (nextView: 'front' | 'back') => {
    setView(nextView);
    setActiveRegionId(null);
    setError(null);
  };

  const frontCount = value.filter((e) => BODY_REGIONS_FRONT.some((r) => r.id === e.regionId)).length;
  const backCount = value.filter((e) => BODY_REGIONS_BACK.some((r) => r.id === e.regionId)).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(320px,480px)_minmax(280px,1fr)]">
        {/* Body map panel */}
        <div className="rounded-xl border border-border bg-white p-4">
          {/* View toggle */}
          <div className="mb-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => switchView('front')}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                view === 'front'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Frente
              {frontCount > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${view === 'front' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700'}`}>
                  {frontCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => switchView('back')}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                view === 'back'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Costas
              {backCount > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${view === 'back' ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700'}`}>
                  {backCount}
                </span>
              )}
            </button>
          </div>

          {/* SVG with realistic body image */}
          <div className="relative mx-auto" style={{ maxWidth: 320 }}>
            <svg
              viewBox="0 0 400 600"
              role="img"
              aria-label={`Mapa corporal interativo – vista ${view === 'front' ? 'frontal' : 'posterior'}`}
              className="mx-auto h-auto w-full"
            >
              {/* Realistic body image as background */}
              <image
                href={view === 'front' ? '/body-front.png' : '/body-back.png'}
                x="0"
                y="0"
                width="400"
                height="600"
                preserveAspectRatio="xMidYMid meet"
              />

              {/* Interactive regions overlay */}
              {currentRegions.map((region) => {
                const entry = entriesByRegionId.get(region.id);
                const isActive = activeRegionId === region.id;
                const fill = isActive
                  ? 'rgba(59,130,246,0.35)'
                  : getIntensityFill(entry?.intensity);
                const stroke = isActive
                  ? 'rgba(37,99,235,0.9)'
                  : getIntensityStroke(entry?.intensity);

                const hoverClass = 'cursor-pointer transition-all duration-150 hover:brightness-110';

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
                      <title>{`${region.number} – ${region.name}`}</title>
                      {renderRegionShape(region, fill, stroke, hoverClass)}
                    </g>

                    {/* Number label – only show when region has discomfort or is active */}
                    {(entry || isActive) && (
                      <text
                        x={region.labelX}
                        y={region.labelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="select-none text-[9px] font-extrabold"
                        fill={isActive ? '#1d4ed8' : entry && entry.intensity >= 9 ? '#fff' : '#1e293b'}
                        stroke={isActive ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.7)'}
                        strokeWidth={3}
                        paintOrder="stroke"
                        pointerEvents="none"
                      >
                        {region.number}
                      </text>
                    )}

                    {/* Subtle number hint on hover for unselected regions */}
                    {!entry && !isActive && (
                      <text
                        x={region.labelX}
                        y={region.labelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="select-none text-[8px] font-bold opacity-0 transition-opacity hover:opacity-100"
                        fill="#334155"
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth={3}
                        paintOrder="stroke"
                        pointerEvents="none"
                      >
                        {region.number}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="mt-2 flex flex-wrap justify-center gap-2 text-xs">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-yellow-300 ring-1 ring-yellow-500" />
                <span className="text-muted-foreground">1-2 leve</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-orange-400 ring-1 ring-orange-600" />
                <span className="text-muted-foreground">3-5 moderado</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-red-500 ring-1 ring-red-700" />
                <span className="text-muted-foreground">6-8 forte</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm bg-red-900 ring-1 ring-red-950" />
                <span className="text-muted-foreground">9-10 insuportável</span>
              </span>
            </div>
          </div>
        </div>

        {/* Detail panel */}
        <div className="rounded-xl border border-border bg-muted/20 p-5">
          {activeRegion ? (
            <div className="space-y-5">
              <div>
                <p className="text-sm text-muted-foreground">Região selecionada</p>
                <h3 className="text-xl font-semibold text-foreground">{activeRegion.number} – {activeRegion.name}</h3>
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
              <p>Clique em uma região do corpo para registrar tipo, intensidade e observações do desconforto.</p>
              <p className="text-xs">Use os botões <strong>Frente</strong> e <strong>Costas</strong> para alternar a vista e acessar todas as regiões.</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">Resumo das regiões marcadas</h3>
        {value.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhum desconforto registrado.</p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {value.map((entry) => {
              const region = ALL_BODY_REGIONS.find((item) => item.id === entry.regionId);
              const isBack = BODY_REGIONS_BACK.some((r) => r.id === entry.regionId);
              return (
                <button
                  key={entry.regionId}
                  type="button"
                  onClick={() => {
                    if (region) {
                      switchView(isBack ? 'back' : 'front');
                      setTimeout(() => openRegion(region), 0);
                    }
                  }}
                  className="rounded-lg border border-border bg-muted/30 p-4 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{entry.regionId} – {entry.regionName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{isBack ? 'Vista posterior' : 'Vista frontal'}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{entry.discomfortTypes.join(', ')}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.intensity >= 9 ? 'bg-red-900 text-white' : entry.intensity >= 6 ? 'bg-red-100 text-red-900' : entry.intensity >= 3 ? 'bg-orange-100 text-orange-900' : 'bg-yellow-100 text-yellow-900'}`}>
                      {entry.intensity}/10
                    </span>
                  </div>
                  {entry.notes && <p className="mt-2 text-sm text-muted-foreground">{entry.notes}</p>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
