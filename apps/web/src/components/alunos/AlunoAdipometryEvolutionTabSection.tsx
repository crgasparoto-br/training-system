import type { Aluno } from '../../services/aluno.service';
import type { Assessment } from '../../services/assessment.service';
import { AlunoAdipometryEvolutionCard } from './AlunoAdipometryEvolutionCard';
import { AlunoAnthropometryFlowEntry } from './AlunoAnthropometryFlowEntry';

type AlunoAdipometryEvolutionTabSectionProps = {
  aluno: Aluno;
  assessments: Assessment[] | null;
  assessmentHistoryState?: 'ready' | 'loading' | 'error';
};

/** Consome a leitura ja confirmada pela Central; nao cria um segundo fetch do aluno ou do historico. */
export function AlunoAdipometryEvolutionTabSection({
  aluno,
  assessments,
  assessmentHistoryState = 'ready',
}: AlunoAdipometryEvolutionTabSectionProps) {
  return (
    <div className="space-y-3">
      {assessments !== null && (
        <AlunoAnthropometryFlowEntry aluno={aluno} assessments={assessments} />
      )}
      <AlunoAdipometryEvolutionCard
        key={aluno.id}
        alunoId={aluno.id}
        assessments={assessments ?? []}
        legacyAssessmentsState={assessmentHistoryState}
      />
    </div>
  );
}
