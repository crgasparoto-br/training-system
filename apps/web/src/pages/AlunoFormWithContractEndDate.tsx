import { useEffect } from 'react';
import { installStudentFinancialContractAtomicAdapter } from '../services/student-financial-contract-atomic-adapter';
import { installStudentContractEndDateAdapter } from '../services/student-contract-end-date-adapter';
import { installStudentContractProfileCreateAdapter } from '../services/student-contract-profile-create-adapter';
import { installStudentContractServiceResolutionAdapter } from '../services/student-contract-service-resolution';
import { AlunoForm } from './AlunoForm';

export function AlunoFormWithContractEndDate() {
  useEffect(() => {
    const uninstallAtomicAdapter = installStudentFinancialContractAtomicAdapter();
    const uninstallEndDateAdapter = installStudentContractEndDateAdapter(
      undefined,
      document,
      window
    );
    const uninstallProfileCreateAdapter = installStudentContractProfileCreateAdapter();
    const uninstallServiceResolutionAdapter =
      installStudentContractServiceResolutionAdapter();

    return () => {
      uninstallServiceResolutionAdapter();
      uninstallProfileCreateAdapter();
      uninstallEndDateAdapter();
      uninstallAtomicAdapter();
    };
  }, []);

  return <AlunoForm />;
}
