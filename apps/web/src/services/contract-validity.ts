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

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/u;

export const parseContractCivilDate = (value?: string | null) => {
  if (!value) return null;

  const match = DATE_ONLY_PATTERN.exec(value.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
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

  const startDate = parseContractCivilDate(link.startDate);
  const endDate = parseContractCivilDate(link.endDate);

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
