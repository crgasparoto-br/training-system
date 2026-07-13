import type { StudentContractLink } from './aluno.service';
import type { GeneratedContract } from './contract.service';

export type ContractValidityStatus =
  | 'current'
  | 'expired'
  | 'future'
  | 'ended'
  | 'pending'
  | 'undefined';

export interface ContractValidityPresentation {
  status: ContractValidityStatus;
  label: string;
}

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDay = (value: Date) => {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
};

const endOfDay = (value: Date) => {
  const result = new Date(value);
  result.setHours(23, 59, 59, 999);
  return result;
};

export const findStudentContractLink = (
  contractId: string,
  links: StudentContractLink[]
): StudentContractLink | null =>
  links.find((link) => link.contractId === contractId || link.contract.id === contractId) || null;

export const resolveContractValidity = (
  documentStatus: GeneratedContract['status'],
  link: StudentContractLink | null,
  now = new Date()
): ContractValidityPresentation | null => {
  if (documentStatus !== 'SIGNED') return null;

  if (!link) {
    return { status: 'undefined', label: 'Sem vigência definida' };
  }

  if (link.status === 'canceled' || link.status === 'terminated') {
    return { status: 'ended', label: 'Encerrado' };
  }

  const startDate = parseDate(link.startDate);
  const endDate = parseDate(link.endDate);

  if (link.status === 'expired' || (endDate && endDate < startOfDay(now))) {
    return { status: 'expired', label: 'Vencido' };
  }

  if (startDate && startDate > endOfDay(now)) {
    return { status: 'future', label: 'Vigência futura' };
  }

  if (link.status === 'active') {
    return { status: 'current', label: 'Vigente' };
  }

  if (link.status === 'pending_signature' || link.status === 'draft') {
    return { status: 'pending', label: 'Aguardando vigência' };
  }

  return { status: 'undefined', label: 'Sem vigência definida' };
};
