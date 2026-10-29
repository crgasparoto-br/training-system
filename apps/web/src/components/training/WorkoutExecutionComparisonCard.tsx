import type {
  TrainingRoutineAudience,
  TrainingSessionComparison,
  TrainingSessionComparisonMetric,
  TrainingSessionComparisonOutcome,
} from '@corrida/types';

const outcomeLabel: Record<TrainingSessionComparisonOutcome, string> = {
  full: 'Realizado',
  partial: 'Parcial',
  substituted: 'Substituído',
  not_performed: 'Não realizado',
  not_recorded: 'Sem registro',
  unclassified: 'Situação não informada',
  incomplete_record: 'Registro incompleto',
};

function formatValue(value: number | string | null, unit: string | null) {
  if (value === null) return 'Indisponível';
  const text = typeof value === 'number' ? value.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : value;
  return unit ? `${text} ${unit}` : String(text);
}

export function formatComparisonMetric(metric: TrainingSessionComparisonMetric) {
  const lower = formatValue(metric.planned, metric.plannedUnit);
  const upper = metric.plannedMax === null ? null : formatValue(metric.plannedMax, metric.plannedUnit);
  return {
    planned: metric.planned === null && upper !== null
      ? `Até ${upper}` : upper !== null && metric.planned !== metric.plannedMax
        ? `${lower} a ${upper}` : lower,
    executed: formatValue(metric.executed, metric.executedUnit),
    difference: metric.difference === null
      ? null : formatValue(metric.difference, metric.executedUnit),
  };
}

/** Reads the same permission-scoped routine response; there is no client-side inference. */
export function WorkoutExecutionComparisonCard({
  comparison,
  audience,
}: {
  comparison: TrainingSessionComparison;
  audience: TrainingRoutineAudience;
}) {
  const visible = comparison.units.filter((item) =>
    audience === 'professor' || !['block', 'set'].includes(item.kind)
  );
  return (
    <section aria-label="Planejado e executado" className="rounded-lg border border-border p-3 sm:p-4">
      <h4 className="font-semibold text-foreground">Planejado × executado</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Valores da prescrição e registros da sessão, lado a lado. Ausência de registro não equivale a zero.
        {audience === 'professor' ? ' Diferenças numéricas não significam, por si só, melhora ou piora.' : ''}
      </p>
      {comparison.snapshotSource === 'released_plan' && (
        <p className="mt-2 text-xs text-muted-foreground">
          Esta execução antiga não possui uma captura congelada própria. As metas históricas e
          diferenças ficam indisponíveis para evitar usar a prescrição atual como se fosse a original.
        </p>
      )}
      <div className="mt-3 space-y-2">
        {visible.map((item) => {
          const metrics = item.metrics.filter((entry) => entry.planned !== null
            || entry.plannedMax !== null || entry.executed !== null);
          return (
            <details
              key={`${item.kind}:${item.plannedUnitId}:${item.iteration ?? 0}:${item.executedSetNumber ?? 'none'}`}
              className="rounded-md border border-border bg-background p-3"
              open={item.kind === 'session' ? true : undefined}
            >
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                {item.label}{item.iteration ? ` · volta ${item.iteration}` : ''}
                {item.kind === 'set' && item.executedSetNumber != null ? ` · registro ${item.executedSetNumber}` : ''}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {outcomeLabel[item.outcome]}
                  {item.containsSubstitution && item.outcome !== 'substituted' ? ' · com substituição' : ''}
                </span>
              </summary>
              {item.substitutionNote && (
                <p className="mt-2 text-xs text-foreground">
                  Substituição registrada: {item.substitutionNote}
                </p>
              )}
              {metrics.length ? (
                <dl className="mt-3 space-y-2 text-xs sm:text-sm">
                  {metrics.map((entry) => {
                    const value = formatComparisonMetric(entry);
                    return (
                      <div key={entry.key} className="grid grid-cols-1 gap-1 border-t border-border pt-2 sm:grid-cols-3">
                        <dt className="font-medium text-foreground">{entry.label}</dt>
                        <dd><span className="text-muted-foreground">Planejado:</span> {value.planned}</dd>
                        <dd><span className="text-muted-foreground">Executado:</span> {value.executed}
                          {audience === 'professor' && value.difference !== null && (
                            <span className="ml-1 text-muted-foreground">(diferença: {value.difference})</span>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Ainda não há medidas comparáveis registradas para esta unidade.
                </p>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
