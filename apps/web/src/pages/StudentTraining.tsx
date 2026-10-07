import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { buttonClassName } from '../components/ui/Button';
import { TrainingRoutinePanel } from '../components/training/TrainingRoutinePanel';
import { getStudentContractId, withStudentContractContext } from '../services/student-self.service';
import { trainingRoutineService } from '../services/training-routine.service';
import { preWorkoutCheckInService } from '../services/pre-workout-check-in.service';

/** Treino de hoje, rotina semanal e lifecycle canônico da sessão (#387/#389). */
export function StudentTraining() {
  const location = useLocation();
  const contractId = getStudentContractId(location.search);
  const load = useCallback(
    (date?: string) => trainingRoutineService.getForStudent({ date, contractId }),
    [contractId]
  );
  const saveCheckIn = useCallback(
    (sessionId: string, payload: Parameters<typeof preWorkoutCheckInService.saveForStudent>[1]) =>
      preWorkoutCheckInService.saveForStudent(sessionId, payload, { contractId }),
    [contractId]
  );
  const transitionExecution = useCallback(
    (sessionId: string, payload: Parameters<typeof trainingRoutineService.transitionForStudent>[1]) =>
      trainingRoutineService.transitionForStudent(sessionId, payload, { contractId }),
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
      <TrainingRoutinePanel
        audience="student"
        load={load}
        headingLevel="h1"
        saveCheckIn={saveCheckIn}
        transitionExecution={transitionExecution}
      />
    </div>
  );
}
