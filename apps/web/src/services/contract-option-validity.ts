import type { StudentContractLink } from './aluno.service';
import {
  findStudentContractLink,
  resolveContractValidity,
  type ContractValidityPresentation,
} from './contract-validity';
import type { GeneratedContract } from './contract.service';

const validitySuffixPattern = /\s+•\s+Vigência:\s+[^•]+$/u;
const CONTRACT_OPTION_BASE_LABEL_DATASET_KEY = 'contractOptionBaseLabel';

export const stripContractOptionValidity = (label: string) =>
  label.replace(validitySuffixPattern, '').trim();

export const formatContractOptionValidity = (
  label: string,
  validity: ContractValidityPresentation | null
) => {
  const baseLabel = stripContractOptionValidity(label);
  return validity ? `${baseLabel} • Vigência: ${validity.label}` : baseLabel;
};

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

export const syncContractOptionValidityOptions = (
  select: HTMLSelectElement,
  contracts: GeneratedContract[],
  studentContractLinks: StudentContractLink[],
  now = new Date()
) => {
  const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));

  Array.from(select.options).forEach((option) => {
    if (!option.value) return;

    const baseLabel = readContractOptionBaseLabel(option);
    const contract = contractsById.get(option.value);
    const link = contract
      ? findStudentContractLink(contract.id, studentContractLinks)
      : null;
    const validity = contract
      ? resolveContractValidity(contract.status, link, now)
      : null;
    const nextLabel = formatContractOptionValidity(baseLabel, validity);

    if (option.textContent !== nextLabel) {
      option.textContent = nextLabel;
    }
  });
};
