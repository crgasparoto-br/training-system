import { useCallback } from 'react';
import { TrainingRoutinePanel } from '../training/TrainingRoutinePanel';
import { trainingRoutineService } from '../../services/training-routine.service';

/** Reutiliza o contrato canônico do treino; não cria persistência paralela. */
export function AlunoTrainingTab({ alunoId }: { alunoId: string }) {
  const load = useCallback(
    (date?: string) => trainingRoutineService.getForAluno(alunoId, { date }),
    [alunoId]
  );

  return (
    <div className="rounded-lg border border-border bg-background p-4 sm:p-6">
      <TrainingRoutinePanel key={alunoId} audience="professor" load={load} />
    </div>
  );
}
