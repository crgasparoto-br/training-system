import { useEffect, useState } from 'react';
import { assessmentService, type Assessment } from '../../services/assessment.service';
import { AlunoAdipometryEvolutionCard } from './AlunoAdipometryEvolutionCard';

type AlunoAdipometryEvolutionTabSectionProps = {
  alunoId: string;
};

export function AlunoAdipometryEvolutionTabSection({
  alunoId,
}: AlunoAdipometryEvolutionTabSectionProps) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setAssessments([]);
    setHistoryLoading(true);
    void assessmentService.listByAluno(alunoId)
      .then((items) => {
        if (!cancelled) setAssessments(items);
      })
      .catch(() => {
        if (!cancelled) setAssessments([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [alunoId]);

  return (
    <div className="space-y-3">
      {historyLoading && (
        <div role="status" className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          Atualizando o histórico geral de avaliações…
        </div>
      )}
      <AlunoAdipometryEvolutionCard alunoId={alunoId} assessments={assessments} />
    </div>
  );
}
