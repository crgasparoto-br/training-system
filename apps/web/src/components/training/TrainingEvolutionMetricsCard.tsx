import type { TrainingRoutineAudience, TrainingRoutineView, TrainingEvolutionMetricKey } from '@corrida/types';

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(value.slice(0, 10) + 'T00:00:00.000Z'));
}

function updatedLabel(value: string | null, timeZone: string): string {
  if (!value) return 'Não informada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Não informada';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone,
  }).format(date);
}

export function formatEvolutionValue(
  value: number, unit: string, key: TrainingEvolutionMetricKey,
): string {
  if (key === 'pace') {
    const seconds = Math.round(value * 60);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') + ' min/km';
  }
  return numberFormat.format(value) + ' ' + unit;
}

/** Read-only weekly metrics. No clinical information or automated performance judgement. */
export function TrainingEvolutionMetricsCard({
  routine, audience,
}: { routine: TrainingRoutineView; audience: TrainingRoutineAudience }) {
  const evolution = routine.weeklyEvolution;
  if (!evolution) return null;
  const metrics = evolution.metrics ?? [];
  const series = evolution.series ?? [];
  const technical = audience === 'professor' && routine.audience === 'professor'
    ? evolution.technical : undefined;

  return (
    <section aria-label="Indicadores de evolução" className="space-y-3 rounded-lg border border-border bg-background p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Evolução do treinamento</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {dateLabel(evolution.period.startDate)} a {dateLabel(evolution.period.endDate)}
          {' · '}Somente treinos liberados e registros confirmados.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <article key={metric.key} className="min-w-0 rounded-md border border-border bg-muted/10 p-3">
            <h3 className="text-xs font-semibold text-muted-foreground">{metric.label}</h3>
            <p className="mt-1 text-base font-semibold text-foreground">
              {metric.status === 'available' && metric.value !== null
                ? formatEvolutionValue(metric.value, metric.unit, metric.key)
                : metric.status === 'incomparable' ? 'Não comparável' : 'Dados insuficientes'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {metric.sampleCount} {metric.sampleCount === 1 ? 'medição' : 'medições'} · Unidade: {metric.unit}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Fonte: {metric.sourceLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Atualizado: {updatedLabel(metric.lastSourceUpdateAt, routine.timeZone)}
            </p>
          </article>
        ))}
      </div>
      {series.length ? (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Ver medições históricas comparáveis ({series.length} séries)
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Cada série preserva sua modalidade, unidade e contexto. Variações não indicam, por si só, melhora ou piora.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {series.map((item, index) => (
              <div key={item.key + ':' + index} className="rounded-md border border-border bg-muted/10 p-3">
                <p className="text-sm font-medium text-foreground">{item.label} · {item.scopeLabel}</p>
                <p className="text-xs text-muted-foreground">Modalidade: {item.modality} · Unidade: {item.unit}</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {item.points.map((point, pointIndex) => (
                    <li key={pointIndex}>
                      {dateLabel(point.date)}: {formatEvolutionValue(point.value, item.unit, item.key)}
                    </li>
                  ))}
                </ul>
                {item.points.length === 1 && (
                  <p className="mt-2 text-xs text-muted-foreground">Uma medição registrada; ainda não há evolução temporal.</p>
                )}
                {technical && item.technical && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-foreground">Origem das medições</summary>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {item.technical.sources.map((source, sourceIndex) => (
                        <li className="break-all" key={sourceIndex}>
                          Sessão {source.sessionId} · Liberação {source.releaseId} · Registro {source.sourceId}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">
          Não há medições executadas comparáveis nesta semana.
        </p>
      )}
      {technical?.indicators && (
        <details className="rounded-md border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Regras técnicas e rastreabilidade
          </summary>
          <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
            {technical.indicators.map((indicator) => (
              <li key={indicator.key} className="break-words">
                <strong className="text-foreground">{indicator.key}</strong>
                {' · '}{indicator.ruleVersion} · {indicator.formula}
                {' · '}Fonte: {indicator.source} ({indicator.observations.length} registros)
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs text-muted-foreground">
        Consistência: indisponível até que uma fórmula canônica seja aprovada. Nenhuma decisão sobre o treino é aplicada automaticamente.
      </p>
    </section>
  );
}
