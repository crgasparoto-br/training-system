import type { Aluno } from '../../services/aluno.service';
import type { Assessment } from '../../services/assessment.service';
import { AlunoAdipometryEvolutionCard } from './AlunoAdipometryEvolutionCard';
import { AlunoAnthropometryFlowEntry } from './AlunoAnthropometryFlowEntry';

type AlunoAdipometryEvolutionTabSectionProps = {
  aluno: Aluno;
  assessments: Assessment[];
};

/** Consome a leitura ja confirmada pela Central; nao cria um segundo fetch do aluno ou do historico. */
export function AlunoAdipometryEvolutionTabSection({
  aluno,
  assessments,
}: AlunoAdipometryEvolutionTabSectionProps) {
  return (
    <div className="space-y-3">
      <AlunoAnthropometryFlowEntry aluno={aluno} assessments={assessments} />
      <AlunoAdipometryEvolutionCard
        key={aluno.id}
        alunoId={aluno.id}
        assessments={assessments}
      />
    </div>
  );
}
