import { useCallback, useEffect, useRef, useState } from 'react';
import { alunoService, type StudentContractLink } from '../services/aluno.service';
import { syncContractOptionValidityOptions } from '../services/contract-option-validity';
import { contractService, type GeneratedContract } from '../services/contract.service';
import {
  ensurePreservedFinancialServiceControl,
  FINANCIAL_SERVICE_FIELD,
  installFinancialServicePayloadAdapter,
  readPersistedFinancialServiceName,
  removePreservedFinancialServiceFallback,
  resolveFinancialServiceName,
} from '../services/financial-service-preservation';
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
  const contractEndDatesRef = useRef(new Map<string, string | null | undefined>());
  const activeContractIdRef = useRef('');
  const financialServiceValueRef = useRef('');
  const userChangedFinancialServiceRef = useRef(false);
  const [contracts, setContracts] = useState<GeneratedContract[]>([]);
  const [studentContractLinks, setStudentContractLinks] = useState<StudentContractLink[]>([]);
  const [financialServiceName, setFinancialServiceName] = useState('');

  const loadContractData = useCallback(async () => {
    if (!id) {
      setContracts([]);
      setStudentContractLinks([]);
      setFinancialServiceName('');
      contractEndDatesRef.current.clear();
      activeContractIdRef.current = '';
      return;
    }

    const loadSequence = ++loadSequenceRef.current;
    const [contractsResult, linksResult, alunoResult] = await Promise.allSettled([
      contractService.listAlunoContracts(id),
      alunoService.listStudentContracts(id),
      alunoService.getById(id),
    ]);

    if (loadSequence !== loadSequenceRef.current) return;

    const links = linksResult.status === 'fulfilled' ? linksResult.value : null;
    const aluno = alunoResult.status === 'fulfilled' ? alunoResult.value : null;
    const resolvedServiceName = resolveFinancialServiceName({
      activeContractServiceName: links?.activeContract?.service?.name,
      persistedFinancialServiceName: readPersistedFinancialServiceName(
        aluno?.intakeForm?.formResponses
      ),
    });

    const endDates = new Map<string, string | null | undefined>();
    links?.contracts.forEach((link) => {
      endDates.set(link.contractId, link.endDate);
      endDates.set(link.contract.id, link.endDate);
    });
    contractEndDatesRef.current = endDates;
    activeContractIdRef.current = links?.activeContract?.contractId ?? '';
    setContracts(contractsResult.status === 'fulfilled' ? contractsResult.value : []);
    setStudentContractLinks(links?.contracts ?? []);
    if (!userChangedFinancialServiceRef.current) {
      setFinancialServiceName(resolvedServiceName);
      financialServiceValueRef.current = resolvedServiceName;
    }
  }, [id]);

  useEffect(() => {
    userChangedFinancialServiceRef.current = false;
    financialServiceValueRef.current = '';
    contractEndDatesRef.current.clear();
    activeContractIdRef.current = '';
  }, [id]);

  useEffect(() => {
    const uninstallEndDateAdapter = installStudentContractEndDateAdapter(
      undefined,
      document,
      window,
      {
        getExistingEndDate: () => {
          const selectedContractId =
            getContractSelectionControl()?.value || activeContractIdRef.current;
          return contractEndDatesRef.current.get(selectedContractId);
        },
      }
    );
    const uninstallFinancialServiceAdapter = installFinancialServicePayloadAdapter(
      () => financialServiceValueRef.current
    );

    const refreshContractData = (event: Event) => {
      const detail = (event as CustomEvent<StudentContractsChangedDetail>).detail;
      if (detail?.alunoId !== id) return;
      void loadContractData();
    };

    window.addEventListener(STUDENT_CONTRACTS_CHANGED_EVENT, refreshContractData);

    return () => {
      window.removeEventListener(STUDENT_CONTRACTS_CHANGED_EVENT, refreshContractData);
      uninstallFinancialServiceAdapter();
      uninstallEndDateAdapter();
    };
  }, [id, loadContractData]);

  useEffect(() => {
    void loadContractData();
  }, [loadContractData]);

  useEffect(() => {
    if (!financialServiceName) return undefined;

    const syncFinancialService = () => {
      if (userChangedFinancialServiceRef.current) return;
      const select = ensurePreservedFinancialServiceControl(document, financialServiceName);
      if (!select) return;

      if (select.value !== financialServiceName) {
        select.value = financialServiceName;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      financialServiceValueRef.current = financialServiceName;
    };

    const registerManualChange = (event: Event) => {
      const target = event.target;
      if (
        event.isTrusted &&
        target instanceof HTMLSelectElement &&
        target.name === FINANCIAL_SERVICE_FIELD
      ) {
        userChangedFinancialServiceRef.current = true;
        financialServiceValueRef.current = target.value;
      }
    };

    syncFinancialService();
    document.addEventListener('change', registerManualChange, true);
    const observer = new MutationObserver(syncFinancialService);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(syncFinancialService, 250);

    return () => {
      document.removeEventListener('change', registerManualChange, true);
      observer.disconnect();
      window.clearInterval(interval);
      removePreservedFinancialServiceFallback(document);
    };
  }, [financialServiceName]);

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
