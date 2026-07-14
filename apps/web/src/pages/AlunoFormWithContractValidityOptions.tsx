import { useCallback, useEffect, useRef, useState } from 'react';
import { alunoService, type StudentContractLink } from '../services/aluno.service';
import { installContractReplacementPreconfirmation } from '../services/contract-replacement-preconfirmation';
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
import { installStudentFinancialContractAtomicAdapter } from '../services/student-financial-contract-atomic-adapter';
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
  document.querySelector<HTMLSelectElement>(
    `select[name="${CONTRACT_SELECTION_FIELD}"]`
  );

const normalizeServiceName = (value?: string | null) =>
  value?.replace(/\s+/gu, ' ').trim() || '';

export function AlunoFormWithContractValidityOptions() {
  const id = window.location.pathname.match(/^\/alunos\/([^/]+)\/edit/)?.[1] || '';
  const loadSequenceRef = useRef(0);
  const contractCaptureSequenceRef = useRef(0);
  const contractEndDatesRef = useRef(new Map<string, string | null | undefined>());
  const contractServiceNamesRef = useRef(new Map<string, string>());
  const activeContractIdRef = useRef('');
  const financialServiceValueRef = useRef('');
  const financialServiceResolutionReadyRef = useRef(false);
  const userChangedFinancialServiceRef = useRef(false);
  const applyingResolvedFinancialServiceRef = useRef(false);
  const [contracts, setContracts] = useState<GeneratedContract[]>([]);
  const [studentContractLinks, setStudentContractLinks] = useState<StudentContractLink[]>([]);
  const [financialServiceName, setFinancialServiceName] = useState('');
  const [financialServiceResolutionReady, setFinancialServiceResolutionReady] =
    useState(false);

  const loadContractData = useCallback(async () => {
    if (!id) return;

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

    if (contractsResult.status === 'fulfilled') {
      setContracts(contractsResult.value);
    }

    const serviceNames = new Map<string, string>();
    if (availableContractsResult.status === 'fulfilled') {
      availableContractsResult.value.forEach((contract) => {
        const serviceName = normalizeServiceName(contract.service?.name);
        if (serviceName) serviceNames.set(contract.id, serviceName);
      });
    }

    if (linksResult.status === 'fulfilled') {
      const endDates = new Map<string, string | null | undefined>();
      linksResult.value.contracts.forEach((link) => {
        endDates.set(link.contractId, link.endDate);
        endDates.set(link.contract.id, link.endDate);
        const serviceName =
          serviceNames.get(link.contractId) || normalizeServiceName(link.service?.name);
        if (serviceName) {
          serviceNames.set(link.contractId, serviceName);
          serviceNames.set(link.contract.id, serviceName);
        }
      });
      contractEndDatesRef.current = endDates;
      activeContractIdRef.current = linksResult.value.activeContract?.contractId ?? '';
      setStudentContractLinks(linksResult.value.contracts);
    }
    contractServiceNamesRef.current = serviceNames;

    const authoritativeActiveServiceName = links?.activeContract
      ? serviceNames.get(links.activeContract.contractId) || serviceResolution.serviceName
      : serviceResolution.serviceName;

    if (!userChangedFinancialServiceRef.current && serviceResolution.shouldApply) {
      setFinancialServiceName(authoritativeActiveServiceName);
      financialServiceValueRef.current = authoritativeActiveServiceName;
      financialServiceResolutionReadyRef.current = true;
      setFinancialServiceResolutionReady(true);
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
    const uninstallAtomicAdapter = installStudentFinancialContractAtomicAdapter();
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
      uninstallAtomicAdapter();
    };
  }, [id, loadContractData]);

  useEffect(() => {
    void loadContractData();
  }, [loadContractData]);

  useEffect(() => {
    let active = true;

    const syncFinancialService = () => {
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
      if (!select || select.value === desiredServiceName) return;

      applyingResolvedFinancialServiceRef.current = true;
      try {
        select.value = desiredServiceName;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      } finally {
        applyingResolvedFinancialServiceRef.current = false;
      }
    };

    const captureContractSelection = (selectedContractId: string) => {
      const captureSequence = ++contractCaptureSequenceRef.current;
      const knownServiceName = contractServiceNamesRef.current.get(selectedContractId) || '';

      // Capture phase only prepares an inactive/legacy option. AlunoForm's
      // contract onChange remains the single writer that applies the value.
      if (knownServiceName) {
        ensurePreservedFinancialServiceControl(document, knownServiceName);
      }

      queueMicrotask(async () => {
        let serviceName = readFinancialServiceControlValue(document);
        if (!serviceName && selectedContractId && id) {
          try {
            const available = await contractService.listAvailableForStudent({
              alunoId: id,
              status: STUDENT_CONTRACT_LOOKUP_STATUSES,
            });
            if (!active || captureSequence !== contractCaptureSequenceRef.current) return;
            const selected = available.find((contract) => contract.id === selectedContractId);
            serviceName = normalizeServiceName(selected?.service?.name);
            if (serviceName) {
              const control = ensurePreservedFinancialServiceControl(document, serviceName);
              if (control && control.value !== serviceName) {
                applyingResolvedFinancialServiceRef.current = true;
                try {
                  control.value = serviceName;
                  control.dispatchEvent(new Event('change', { bubbles: true }));
                } finally {
                  applyingResolvedFinancialServiceRef.current = false;
                }
              }
            }
          } catch {
            // The atomic backend mutation remains fail-closed if the contract
            // cannot be resolved; never restore the previous service here.
          }
        }

        if (!active || captureSequence !== contractCaptureSequenceRef.current) return;
        userChangedFinancialServiceRef.current = true;
        financialServiceValueRef.current = serviceName;
        syncFinancialService();
      });
    };

    const registerChange = (event: Event) => {
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
        captureContractSelection(target.value);
      }
    };

    syncFinancialService();
    document.addEventListener('change', registerChange, true);
    const observer = new MutationObserver(syncFinancialService);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(syncFinancialService, 250);

    return () => {
      active = false;
      contractCaptureSequenceRef.current += 1;
      document.removeEventListener('change', registerChange, true);
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
