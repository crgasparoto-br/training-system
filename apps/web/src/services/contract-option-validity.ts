import type { ContractValidityPresentation } from './contract-validity';

const validitySuffixPattern = /\s+•\s+Vigência:\s+[^•]+$/u;

export const stripContractOptionValidity = (label: string) =>
  label.replace(validitySuffixPattern, '').trim();

export const formatContractOptionValidity = (
  label: string,
  validity: ContractValidityPresentation | null
) => {
  const baseLabel = stripContractOptionValidity(label);
  return validity ? `${baseLabel} • Vigência: ${validity.label}` : baseLabel;
};
