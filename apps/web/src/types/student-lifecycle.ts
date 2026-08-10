import {
  STUDENT_LIFECYCLE_STATUSES,
  type StudentLifecycleStatus,
} from '@corrida/types';

/**
 * Adaptador de apresentação do frontend para o ciclo lead -> aluno.
 *
 * Os estados continuam definidos exclusivamente em @corrida/types. O frontend
 * mantém apenas os rótulos de exibição, com cobertura exaustiva garantida pelo
 * tipo compartilhado.
 */
export const STUDENT_LIFECYCLE_STATUS_LABELS: Readonly<
  Record<StudentLifecycleStatus, string>
> = {
  LEAD: 'Lead',
  INVITED: 'Convidado',
  PRE_REGISTRATION_IN_PROGRESS: 'Pré-cadastro em andamento',
  PRE_REGISTRATION_COMPLETED: 'Pré-cadastro concluído',
  READY_FOR_ENROLLMENT: 'Pronto para matrícula',
  ACTIVE_STUDENT: 'Aluno ativo',
  DISCARDED: 'Descartado',
};

export const getStudentLifecycleStatusOptions = () =>
  STUDENT_LIFECYCLE_STATUSES.map((value) => ({
    value,
    label: STUDENT_LIFECYCLE_STATUS_LABELS[value],
  }));
