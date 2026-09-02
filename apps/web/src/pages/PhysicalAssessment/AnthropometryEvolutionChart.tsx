import { useEffect, useMemo, useState } from 'react';
import type { AnthropometryAssessment, AnthropometrySegment } from '../../types/anthropometry';

interface Props {
  assessments: AnthropometryAssessment[];
  segments: AnthropometrySegment[];
}

const parseValue = (value?: string | null) => {
  const normalized = value?.trim();
  if (!normalized) return null;
  const parsed = Number(normalized.includes(',') ? normalized.replace(/\./g, '').replace(',', '.') : normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export function AnthropometryEvolutionChart({ assessments, segments }: Props) {
  const defaultSegmentId = segments.find((segment) => segment.requiredForCompletion)?.id ?? segments[0]?.id ?? '';
  const [segmentId, setSegmentId] = useState(defaultSegmentId);

  useEffect(() => {
    if (defaultSegmentId && !segments.some((segment) => segment.id === segmentId)) {
      setSegmentId(defaultSegmentId);
    }
  }, [defaultSegmentId, segmentId, segments]);

  const selectedSegment = segments.find((segment) => segment.id === segmentId) ?? segments[0];

  const points = useMemo(() => {
    if (!selectedSegment) return [];
    return [...assessments]
      .sort((left, right) => new Date(left.assessmentDate).getTime() - new Date(right.assessmentDate).getTime())
      .flatMap((assessment) => {
        const value = parseValue(assessment.values.find((item) => item.segmentId === selectedSegment.id)?.value);
        return value == null ? [] : [{ assessment, value }];
      });
  }, [assessments, selectedSegment]);

  if (!selectedSegment) {
    return <p className="text-sm text-muted-foreground">Não há segmentos disponíveis para exibir evolução.</p>;
  }

  const width = 720;
  const height = 220;
  const padding = 32;
  const values = points.map((point) => point.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const range = maxValue - minValue || 1;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length <= 1 ? width / 2 : padding + (index * (width - padding * 2)) / (points.length - 1),
    y: height - padding - ((point.value - minValue) / range) * (height - padding * 2),
  }));
  const polyline = coordinates.map((point) => `${point.x},${point.y}`).join(' ');

  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <label className="mb-2 block text-sm font-medium text-foreground" htmlFor="anthropometry-evolution-segment">
          Segmento exibido
        </label>
        <select
          id="anthropometry-evolution-segment"
          value={selectedSegment.id}
          onChange={(event) => setSegmentId(event.target.value)}
          className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {segments.map((segment) => (
            <option key={segment.id} value={segment.id}>{segment.name}</option>
          ))}
        </select>
      </div>

      {coordinates.length >= 2 ? (
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="min-w-[640px] w-full"
            role="img"
            aria-label={`Evolução de ${selectedSegment.name} em ${coordinates.length} avaliações`}
          >
            <title>Evolução de {selectedSegment.name}</title>
            <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="2" />
            {coordinates.map((point) => (
              <g key={point.assessment.id}>
                <circle cx={point.x} cy={point.y} r="4" fill="currentColor" />
                <text x={point.x} y={point.y - 10} textAnchor="middle" className="fill-current text-[11px]">
                  {point.value.toFixed(1).replace('.', ',')}
                </text>
                <text x={point.x} y={height - 8} textAnchor="middle" className="fill-current text-[10px]">
                  {new Date(point.assessment.assessmentDate).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: '2-digit', year: '2-digit' })}
                </text>
              </g>
            ))}
          </svg>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          São necessárias pelo menos duas avaliações com valor preenchido neste segmento para formar o gráfico.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        O gráfico é complementar. Os valores e variações continuam disponíveis na tabela comparativa acima.
      </p>
    </div>
  );
}
