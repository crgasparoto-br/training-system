import { useEffect } from 'react';
import { installStudentContractEndDateAdapter } from '../services/student-contract-end-date-adapter';
import { AlunoForm } from './AlunoForm';

export function AlunoFormWithContractEndDate() {
  useEffect(
    () => installStudentContractEndDateAdapter(undefined, document, window),
    []
  );

  return <AlunoForm />;
}
