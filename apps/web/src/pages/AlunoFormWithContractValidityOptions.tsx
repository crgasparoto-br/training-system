import { useCallback, useEffect, useRef, useState } from 'react';
import { alunoService, type StudentContractLink } from '../services/aluno.service';
import {
  installContractReplacementPreconfirmation,
} from '../services/contract-replacement-preconfirmation';
import { syncContractOptionValidityOptions } from '../services/contract-option-validity';
import { contractService, type GeneratedContract } from '../services/contract.service';
import {
  ensurePreservedFinancialServiceControl,
  FINANCIAL_SERVICE_FIELD,
  installFinancialServicePayloadAdapter,
  readFinancialServiceControlValue,
  readPersistedFinancialServiceName,
  removePreservedFinancialServiceFallback,
  resolveFinancialServiceLoadState,
} from '../services/financial-service-preservation';
import {
  installStudentContractEndDateAdapter,
  STUDENT_CONTRACTS_CHANGED_EVENT,
  type StudentContractsChangedDetail,
} from '../services/student-contract-end-date-adapter';
import {
  installStudentContractServiceResolutionAdapter,
  STUDENT_CONTRACT_LOOKUP_STATUSES,
} from '../services/student-contract-service-resolution';
import { AlunoFormWithFinancialContracts } from './AlunoFormWithFinancialContracts';

const CONTRACT_SELECTION_FIELD = 'intakeForm.financialInfo.selectedContractId';

const getContractSelectionControl = () =>
  document.querySelector<HTMLSelectElement>(`select[name="${CONTRACT_SELECTION_FIELD}"]`);

export function AlunoFormWithContractValidityOptions() {
  const id = window.location.pathname.match(/^\/alunos\/([^/]+)\/edit/)?.[1] || '';
  const loadSequenceRef = useRef(0);
  const contractServiceCaptureSequenceRef = useRef(0);
  const contractEndDatesRef = useRef(new Map<string, string | null | undefined>());
  const contractServiceNamesRef = useRef(new Map<string, string>());
  const activeContractIdRef = useRef('');
  const financialServiceValueRef = useRef('');
  const financialServiceResolutionReadyRef = useRef(false);
  const userChangedFinancialServiceRef = useRef(false);
  const applyingResolvedFinancialServiceRef = useRef(false);
  const contractServiceCapturePendingRef = useRef(false);
  const [contracts, setContracts] = useState<GeneratedContract[]>([]);
  const [studentContractLinks, setStudentContractLinks] = useState<StudentContractLink[]>([]);
  const [financialServiceName, setFinancialServiceName] = useState('');
  const [financialServiceResolutionReady, setFinancialServiceResolutionReady] =
    useState(false);

  const markFinancialServiceResolutionReady = (ready: boolean) => {
    financialServiceResolutionReadyRef.current = ready;
    setFinancialServiceResolutionReady(ready);
  };

  const loadContractData = useCallback(async () => {
    if (!id) {
      setContracts([]);
      setStudentContractLinks([]);
      setFinancialServiceName('');
      contractEndDatesRef.current.clear();
      contractServiceNamesRef.current.clear();
      activeContractIdRef.current = '';
      return;
    }

    const loadSequence = ++loadSequenceRef.current;
    const [contractsResult, availableContractsResult, linksResult, alunoResult] =
      await Promise.allSettled([
        contractService.listAlunoContracts(id),
        contractService.listAvailableForStudent({
          alunoId: id,
          status: STUDENT_CONTRACT_LOOKUP_STATUSES,
        }),
        alunoService.listStudentContracts(id),
        alunoService.getById(id),
      ]);

    if (loadSequence !== loadSequenceRef.current) return;

    const links = linksResult.status === 'fulfilled' ? linksResult.value : null;
    const aluno = alunoResult.status === 'fulfilled' ? alunoResult.value : null;
    const serviceResolution = resolveFinancialServiceLoadState({
      activeContractServiceName: links?.activeContract?.service?.name,
      persistedFinancialServiceName: readPersistedFinancialServiceName(
        aluno?.intakeForm?.formResponses
      ),
      activeContractSourceLoaded: linksResult.status === 'fulfilled',
      persistedFinancialSourceLoaded: alunoResult.status === 'fulfilled',
    });

    if (linksResult.status === 'fulfilled') {
      const endDates = new Map<string, string | null | undefined>();
      links.contracts.forEach((link) => {
        endDates.set(link.contractId, link.endDate);
        endDates.set(link.contract.id, link.endDate);
      });
      contractEndDatesRef.current = endDates;
      activeContractIdRef.current = links.activeContract?.contractId ?? '';
      setStudentContractLinks(links.contracts);
    }

    if (contractsResult.status === 'fulfilled') {
      setContracts(contractsResult.value);
    }

    if (
      availableContractsResult.status === 'fulfilled' ||
      linksResult.status === 'fulfilled'
    ) {
      const serviceNames = new Map(contractServiceNamesRef.current);
      links?.contracts.forEach((link) => {
        const serviceName = link.service?.name?.replace(/\s+/gu, ' ').trim();
        if (serviceName) {
          serviceNames.set(link.contractId, serviceName);
          serviceNames.set(link.contract.id, serviceName);
        }
      });
      if (availableContractsResult.status === 'fulfilled') {
        availableContractsResult.value.forEach((contract) => {
          const serviceName = contract.service?.name?.replace(/\s+/gu, ' ').trim();
          if (serviceName) serviceNames.set(contract.id, serviceName);
        });
      }
      contractServiceNamesRef.current = serviceNames;
    }

    if (!userChangedFinancialServiceRef.current && serviceResolution.shouldApply) {
      setFinancialServiceName(serviceResolution.serviceName);
      financialServiceValueRef.current = serviceResolution.serviceName;
      markFinancialServiceResolutionReady(true);
    }
  }, [id]);

  useEffect(() => {
    userChangedFinancialServiceRef.current = false;
    financialServiceValueRef.current = '';
    financialServiceResolutionReadyRef.current = false;
    setFinancialServiceResolutionReady(false);
    contractEndDatesRef.current.clear();
    contractServiceNamesRef.current.clear();
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
    const uninstallServiceResolutionAdapter =
      installStudentContractServiceResolutionAdapter();
    const uninstallReplacementPreconfirmation =
      installContractReplacementPreconfirmation({
        getActiveContractId: () => activeContractIdRef.current,
      });
    const uninstallFinancialServiceAdapter = installFinancialServicePayloadAdapter(
      () => {
        if (
          userChangedFinancialServiceRef.current ||
          financialServiceResolutionReadyRef.current
        ) {
          return financialServiceValueRef.current;
        }

        return readFinancialServiceControlValue(document) || undefined;
      }
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
      uninstallReplacementPreconfirmation();
      uninstallServiceResolutionAdapter();
      uninstallEndDateAdapter();
    };
  }, [id, loadContractData]);

  useEffect(() => {
    void loadContractData();
  }, [loadContractData]);

  useEffect(() => {
    let active = true;

    const syncFinancialService = () => {
      if (contractServiceCapturePendingRef.current) return;
      if (
        !userChangedFinancialServiceRef.current &&
        !financialServiceResolutionReady
      ) {
        return;
      }

      const desiredServiceName = userChangedFinancialServiceRef.current
        ? financialServiceValueRef.current
        : financialServiceName;
      const select = ensurePreservedFinancialServiceControl(document, desiredServiceName);
      if (!select) return;

      if (select.value !== desiredServiceName) {
        applyingResolvedFinancialServiceRef.current = true;
        try {
          select.value = desiredServiceName;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        } finally {
          applyingResolvedFinancialServiceRef.current = false;
        }
      }
      financialServiceValueRef.current = desiredServiceName;
    };

    const captureServiceSelectedByContract = async (
      selectedContractId: string,
      captureSequence: number
    ) => {
      let selectedServiceName = contractServiceNamesRef.current.get(selectedContractId) || '';

      if (!selectedServiceName && selectedContractId && id) {
        try {
          const availableContracts = await contractService.listAvailableForStudent({
            alunoId: id,
            status: STUDENT_CONTRACT_LOOKUP_STATUSES,
          });
          if (!active || captureSequence !== contractServiceCaptureSequenceRef.current) return;

          const serviceNames = new Map(contractServiceNamesRef.current);
          availableContracts.forEach((contract) => {
            const serviceName = contract.service?.name?.replace(/\s+/gu, ' ').trim();
            if (serviceName) serviceNames.set(contract.id, serviceName);
          });
          contractServiceNamesRef.current = serviceNames;
          selectedServiceName = serviceNames.get(selectedContractId) || '';
        } catch {
          // The link mutation will fail closed if the contract service cannot be resolved.
        }
      }

      if (!active || captureSequence !== contractServiceCaptureSequenceRef.current) return;

      contractServiceCapturePendingRef.current = false;
      userChangedFinancialServiceRef.current = true;

      if (selectedServiceName) {
        const select = ensurePreservedFinancialServiceControl(
          document,
          selectedServiceName
        );
        if (select) {
          applyingResolvedFinancialServiceRef.current = true;
          try {
            select.value = selectedServiceName;
            select.dispatchEvent(new Event('change', { bubbles: true }));
          } finally {
            applyingResolvedFinancialServiceRef.current = false;
          }
        }
        financialServiceValueRef.current = selectedServiceName;
      } else {
        financialServiceValueRef.current = readFinancialServiceControlValue(document);
      }

      syncFinancialService();
    };

    const scheduleContractServiceCapture = (selectedContractId: string) => {
      contractServiceCapturePendingRef.current = true;
      userChangedFinancialServiceRef.current = true;
      const captureSequence = ++contractServiceCaptureSequenceRef.current;
      queueMicrotask(() => {
        void captureServiceSelectedByContract(selectedContractId, captureSequence);
      });
    };

    const registerManualChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;

      if (
        target.name === FINANCIAL_SERVICE_FIELD &&
        event.isTrusted &&
        !applyingResolvedFinancialServiceRef.current
      ) {
        userChangedFinancialServiceRef.current = true;
        financialServiceValueRef.current = target.value;
        return;
      }

      if (target.name === CONTRACT_SELECTION_FIELD && event.isTrusted) {
        scheduleContractServiceCapture(target.value);
      }
    };

    syncFinancialService();
    document.addEventListener('change', registerManualChange, true);
    const observer = new MutationObserver(syncFinancialService);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(syncFinancialService, 250);

    return () => {
      active = false;
      contractServiceCapturePendingRef.current = false;
      contractServiceCaptureSequenceRef.current += 1;
      document.removeEventListener('change', registerManualChange, true);
      observer.disconnect();
      window.clearInterval(interval);
      removePreservedFinancialServiceFallback(document);
    };
  }, [financialServiceName, financialServiceResolutionReady, id]);

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
