import { Image, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { AnthropometryAssessment, AnthropometrySegment } from '../../types/anthropometry';

interface Props {
  assessments: AnthropometryAssessment[];
  editableAssessmentId?: string;
  segments: AnthropometrySegment[];
  values: Record<string, string>;
  onValueChange: (segmentId: string, value: string) => void;
  onOpenHelp: (segment: AnthropometrySegment) => void;
}

const dateLabel = (value: string) => new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

const professorName = (assessment: AnthropometryAssessment) =>
  assessment.professor?.user?.profile?.name || 'Professor';

const variationLabel = (absolute: number, percentage: number | null) => {
  const absoluteText = `${absolute > 0 ? '+' : ''}${absolute.toFixed(1).replace('.', ',')} cm`;
  const percentageText = percentage == null
    ? 'percentual indisponível'
    : `${percentage > 0 ? '+' : ''}${percentage.toFixed(1).replace('.', ',')}%`;
  return `${absoluteText} (${percentageText})`;
};

export function AnthropometryComparisonTable({
  assessments,
  editableAssessmentId,
  segments,
  values,
  onValueChange,
  onOpenHelp,
}: Props) {
  const orderedAssessments = [...assessments].reverse();

  const valueFor = (assessment: AnthropometryAssessment, segmentId: string) =>
    assessment.values.find((item) => item.segmentId === segmentId);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-[920px] w-full border-collapse bg-card text-sm">
        <caption className="sr-only">Comparação das medidas antropométricas por avaliação, com variações persistidas.</caption>
        <thead className="bg-muted/60">
          <tr>
            <th className="sticky left-0 z-10 w-64 bg-muted px-3 py-3 text-left font-semibold text-foreground">Segmento</th>
            <th className="w-20 px-3 py-3 text-center font-semibold text-foreground">Ajuda</th>
            {orderedAssessments.map((assessment) => (
              <th key={assessment.id} className="min-w-48 px-3 py-3 text-left font-semibold text-foreground">
                <span className="block">{assessment.code}</span>
                <span className="block text-xs font-normal text-muted-foreground">{dateLabel(assessment.assessmentDate)}</span>
                <span className="block text-xs font-normal text-muted-foreground">{professorName(assessment)}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {assessment.status === 'COMPLETED' ? 'Concluída' : 'Rascunho'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segments.map((segment) => (
            <tr key={segment.id} className="border-t border-border">
              <td className="sticky left-0 z-10 bg-card px-3 py-2 font-medium text-foreground">
                <span>{segment.name}</span>
                {segment.requiredForCompletion ? (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">Obrigatória</span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-center">
                <Button type="button" size="icon" variant="ghost" onClick={() => onOpenHelp(segment)} aria-label={`Ajuda de ${segment.name}`}>
                  <Image className="h-4 w-4" />
                </Button>
              </td>
              {orderedAssessments.map((assessment) => {
                const editable = assessment.id === editableAssessmentId;
                const stored = valueFor(assessment, segment.id);
                const variation = stored?.variationFromPrevious ?? null;
                return (
                  <td key={`${assessment.id}-${segment.id}`} className="px-3 py-2 align-top">
                    {editable ? (
                      <div className="space-y-1">
                        <input
                          aria-label={`${segment.name} em ${assessment.code}`}
                          value={values[segment.id] ?? ''}
                          onChange={(event) => onValueChange(segment.id, event.target.value)}
                          placeholder="0,0"
                          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        {variation ? (
                          <span className={variation.absolute >= 0 ? 'flex items-center gap-1 text-xs text-success' : 'flex items-center gap-1 text-xs text-destructive'}>
                            {variation.absolute >= 0 ? <TrendingUp className="h-3 w-3" aria-hidden="true" /> : <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                            {variationLabel(variation.absolute, variation.percentage)}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <span className="text-foreground">{stored?.value || '-'}</span>
                        {variation ? (
                          <span className="block text-xs text-muted-foreground">
                            Variação: {variationLabel(variation.absolute, variation.percentage)}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
