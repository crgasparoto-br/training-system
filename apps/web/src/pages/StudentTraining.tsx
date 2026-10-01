import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buttonClassName } from '../components/ui/Button';
import { TrainingRoutinePanel } from '../components/training/TrainingRoutinePanel';
import { getStudentContractId, withStudentContractContext } from '../services/student-self.service';
import { trainingRoutineService } from '../services/training-routine.service';

/** Treino de hoje e rotina semanal do aluno autenticado (#387), somente leitura. */
export function StudentTraining() {
  const location = useLocation();
  const contractId = getStudentContractId(location.search);
  const load = useCallback(
    (date?: string) => trainingRoutineService.getForStudent({ date, contractId }),
    [contractId]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Link to={withStudentContractContext('/inicio', contractId)} className={buttonClassName({ variant: 'outline', size: 'sm' })}>
          Voltar ao início
        </Link>
        <Link
          to={withStudentContractContext('/student/workouts', contractId)}
          className={buttonClassName({ variant: 'ghost', size: 'sm' })}
        >
          Ver todos os treinos liberados
        </Link>
      </div>
      <TrainingRoutinePanel audience="student" load={load} headingLevel="h1" />
    </div>
  );
}
