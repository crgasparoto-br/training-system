import { useEffect, useState } from 'react';
import { alunoService, type Aluno } from '../../services/aluno.service';
import { assessmentService, type Assessment } from '../../services/assessment.service';
import { AlunoAdipometryEvolutionCard } from './AlunoAdipometryEvolutionCard';
import { AlunoAnthropometryFlowEntry } from './AlunoAnthropometryFlowEntry';

type AlunoAdipometryEvolutionTabSectionProps = {
  alunoId: string;
};

export function AlunoAdipometryEvolutionTabSection({
  alunoId,
}: AlunoAdipometryEvolutionTabSectionProps) {
  const [aluno, setAluno] = useState<Aluno | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setAluno(null);
    setAssessments([]);
    setHistoryLoading(true);

    void Promise.allSettled([
      assessmentService.listByAluno(alunoId),
      alunoService.getById(alunoId),
    ]).then(([historyResult, alunoResult]) => {
      if (cancelled) return;
      setAssessments(historyResult.status === 'fulfilled' ? historyResult.value : []);
      setAluno(alunoResult.status === 'fulfilled' ? alunoResult.value : null);
    }).finally(() => {
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
      {!historyLoading && aluno && (
        <AlunoAnthropometryFlowEntry aluno={aluno} assessments={assessments} />
      )}
      <AlunoAdipometryEvolutionCard
        key={alunoId}
        alunoId={alunoId}
        assessments={assessments}
      />
    </div>
  );
}
