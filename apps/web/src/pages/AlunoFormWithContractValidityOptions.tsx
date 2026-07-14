import { useCallback, useEffect, useRef, useState } from 'react';
import { alunoService, type StudentContractLink } from '../services/aluno.service';
import { syncContractOptionValidityOptions } from '../services/contract-option-validity';
import { contractService, type GeneratedContract } from '../services/contract.service';
import {
  installStudentContractEndDateAdapter,
  STUDENT_CONTRACTS_CHANGED_EVENT,
  type StudentContractsChangedDetail,
} from '../services/student-contract-end-date-adapter';
import { AlunoFormWithFinancialContracts } from './AlunoFormWithFinancialContracts';

const CONTRACT_SELECTION_FIELD = 'intakeForm.financialInfo.selectedContractId';

const getContractSelectionControl = () =>
  document.querySelector<HTMLSelectElement>(`select[name="${CONTRACT_SELECTION_FIELD}"]`);

export function AlunoFormWithContractValidityOptions() {
  const id = window.location.pathname.match(/^\/alunos\/([^/]+)\/edit/)?.[1] || '';
  const loadSequenceRef = useRef(0);
  const [contracts, setContracts] = useState<GeneratedContract[]>([]);
  const [studentContractLinks, setStudentContractLinks] = useState<StudentContractLink[]>([]);

  const loadContractData = useCallback(async () => {
    if (!id) {
      setContracts([]);
      setStudentContractLinks([]);
      return;
    }

    const loadSequence = ++loadSequenceRef.current;
    const [contractsResult, linksResult] = await Promise.allSettled([
      contractService.listAlunoContracts(id),
      alunoService.listStudentContracts(id),
    ]);

    if (loadSequence !== loadSequenceRef.current) return;

    setContracts(contractsResult.status === 'fulfilled' ? contractsResult.value : []);
    setStudentContractLinks(
      linksResult.status === 'fulfilled' ? linksResult.value.contracts : []
    );
  }, [id]);

  useEffect(() => {
    void loadContractData();
  }, [loadContractData]);

  useEffect(() => {
    const uninstallAdapter = installStudentContractEndDateAdapter();

    const refreshContractData = (event: Event) => {
      const detail = (event as CustomEvent<StudentContractsChangedDetail>).detail;
      if (detail?.alunoId !== id) return;
      void loadContractData();
    };

    window.addEventListener(STUDENT_CONTRACTS_CHANGED_EVENT, refreshContractData);

    return () => {
      window.removeEventListener(STUDENT_CONTRACTS_CHANGED_EVENT, refreshContractData);
      uninstallAdapter();
    };
  }, [id, loadContractData]);

  useEffect(() => {
    const syncContractOptionValidity = () => {
      const select = getContractSelectionControl();
      if (!select) return;

      syncContractOptionValidityOptions(select, contracts, studentContractLinks);
    };

    syncContractOptionValidity();

    const observer = new MutationObserver(syncContractOptionValidity);
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = window.setInterval(syncContractOptionValidity, 250);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, [contracts, studentContractLinks]);

  return <AlunoFormWithFinancialContracts />;
}
