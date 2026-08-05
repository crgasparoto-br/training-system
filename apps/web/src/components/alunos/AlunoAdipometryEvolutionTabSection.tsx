import { useEffect, useState } from 'react';
import { assessmentService, type Assessment } from '../../services/assessment.service';
import { AlunoAdipometryEvolutionCard } from './AlunoAdipometryEvolutionCard';

type AlunoAdipometryEvolutionTabSectionProps = {
  alunoId: string;
};

export function AlunoAdipometryEvolutionTabSection({
  alunoId,
}: AlunoAdipometryEvolutionTabSectionProps) {
  const [assessments, setAssessments] = useState<Assessment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAssessments(null);
    void assessmentService.listByAluno(alunoId)
      .then((items) => {
        if (!cancelled) setAssessments(items);
      })
      .catch(() => {
        if (!cancelled) setAssessments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [alunoId]);

  if (assessments === null) {
    return (
      <div role="status" className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        Preparando o histórico de avaliações…
      </div>
    );
  }

  return <AlunoAdipometryEvolutionCard alunoId={alunoId} assessments={assessments} />;
}
