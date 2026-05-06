import { Image, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { AnthropometryAssessment, AnthropometrySegment } from '../../types/anthropometry';

interface Props {
  assessments: AnthropometryAssessment[];
  currentAssessmentId?: string;
  segments: AnthropometrySegment[];
  values: Record<string, string>;
  onValueChange: (segmentId: string, value: string) => void;
  onOpenHelp: (segment: AnthropometrySegment) => void;
}

const dateLabel = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

const professorName = (assessment: AnthropometryAssessment) =>
  assessment.professor?.user?.profile?.name || 'Professor';

const asNumber = (value?: string | null) => {
  if (!value) return null;
  const parsed = Number(value.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export function AnthropometryComparisonTable({
  assessments,
  currentAssessmentId,
  segments,
  values,
  onValueChange,
  onOpenHelp,
}: Props) {
  const orderedAssessments = [...assessments].reverse();
  const currentIndex = orderedAssessments.findIndex((item) => item.id === currentAssessmentId);
  const previousAssessment = currentIndex > 0 ? orderedAssessments[currentIndex - 1] : null;

  const valueFor = (assessment: AnthropometryAssessment, segmentId: string) =>
    assessment.values.find((item) => item.segmentId === segmentId)?.value ?? '';

  const variationFor = (segmentId: string) => {
    const current = currentAssessmentId ? asNumber(values[segmentId]) : null;
    const previous = previousAssessment ? asNumber(valueFor(previousAssessment, segmentId)) : null;
    if (current == null || previous == null) return null;
    return current - previous;
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-[920px] w-full border-collapse bg-card text-sm">
        <thead className="bg-muted/60">
          <tr>
            <th className="sticky left-0 z-10 w-64 bg-muted px-3 py-3 text-left font-semibold text-foreground">Segmento</th>
            <th className="w-20 px-3 py-3 text-center font-semibold text-foreground">Ajuda</th>
            {orderedAssessments.map((assessment) => (
              <th key={assessment.id} className="min-w-44 px-3 py-3 text-left font-semibold text-foreground">
                <span className="block">{assessment.code}</span>
                <span className="block text-xs font-normal text-muted-foreground">{dateLabel(assessment.assessmentDate)}</span>
                <span className="block text-xs font-normal text-muted-foreground">{professorName(assessment)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => {
            const variation = variationFor(segment.id);

            return (
              <tr key={segment.id} className="border-t border-border">
                <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-foreground">{segment.name}</td>
                <td className="px-3 py-2 text-center">
                  <Button type="button" size="icon" variant="ghost" onClick={() => onOpenHelp(segment)} aria-label={`Ajuda de ${segment.name}`}>
                    <Image className="h-4 w-4" />
                  </Button>
                </td>
                {orderedAssessments.map((assessment) => {
                  const editable = assessment.id === currentAssessmentId;
                  return (
                    <td key={`${assessment.id}-${segment.id}`} className="px-3 py-2 align-top">
                      {editable ? (
                        <div className="space-y-1">
                          <input
                            value={values[segment.id] ?? ''}
                            onChange={(event) => onValueChange(segment.id, event.target.value)}
                            placeholder="0,0"
                            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          />
                          {variation != null ? (
                            <span className={variation >= 0 ? 'flex items-center gap-1 text-xs text-success' : 'flex items-center gap-1 text-xs text-destructive'}>
                              {variation >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {variation > 0 ? '+' : ''}{variation.toFixed(1).replace('.', ',')} cm
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-foreground">{valueFor(assessment, segment.id) || '-'}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
