import { useEffect, useState } from 'react';
import { alunoService, type StudentContractLink } from '../services/aluno.service';
import {
  findStudentContractLink,
  resolveContractValidity,
} from '../services/contract-validity';
import {
  formatContractOptionValidity,
  stripContractOptionValidity,
} from '../services/contract-option-validity';
import { contractService, type GeneratedContract } from '../services/contract.service';
import { AlunoFormWithFinancialContracts } from './AlunoFormWithFinancialContracts';

const CONTRACT_SELECTION_FIELD = 'intakeForm.financialInfo.selectedContractId';
const CONTRACT_OPTION_BASE_LABEL_DATASET_KEY = 'contractOptionBaseLabel';

const getContractSelectionControl = () =>
  document.querySelector<HTMLSelectElement>(`select[name="${CONTRACT_SELECTION_FIELD}"]`);

const readContractOptionBaseLabel = (option: HTMLOptionElement) => {
  const currentLabel = option.textContent?.trim() || '';
  const currentBaseLabel = stripContractOptionValidity(currentLabel);
  const storedBaseLabel = option.dataset[CONTRACT_OPTION_BASE_LABEL_DATASET_KEY];

  if (!storedBaseLabel || currentLabel === currentBaseLabel) {
    option.dataset[CONTRACT_OPTION_BASE_LABEL_DATASET_KEY] = currentBaseLabel;
    return currentBaseLabel;
  }

  return storedBaseLabel;
};

export function AlunoFormWithContractValidityOptions() {
  const id = window.location.pathname.match(/^\/alunos\/([^/]+)\/edit/)?.[1] || '';
  const [contracts, setContracts] = useState<GeneratedContract[]>([]);
  const [studentContractLinks, setStudentContractLinks] = useState<StudentContractLink[]>([]);

  useEffect(() => {
    setContracts([]);
    setStudentContractLinks([]);

    if (!id) return undefined;

    let active = true;

    Promise.allSettled([
      contractService.listAlunoContracts(id),
      alunoService.listStudentContracts(id),
    ]).then(([contractsResult, linksResult]) => {
      if (!active) return;

      setContracts(contractsResult.status === 'fulfilled' ? contractsResult.value : []);
      setStudentContractLinks(
        linksResult.status === 'fulfilled' ? linksResult.value.contracts : []
      );
    });

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));

    const syncContractOptionValidity = () => {
      const select = getContractSelectionControl();
      if (!select) return;

      Array.from(select.options).forEach((option) => {
        if (!option.value) return;

        const baseLabel = readContractOptionBaseLabel(option);
        const contract = contractsById.get(option.value);
        const link = contract
          ? findStudentContractLink(contract.id, studentContractLinks)
          : null;
        const validity = contract
          ? resolveContractValidity(contract.status, link)
          : null;
        const nextLabel = formatContractOptionValidity(baseLabel, validity);

        if (option.textContent !== nextLabel) {
          option.textContent = nextLabel;
        }
      });
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
