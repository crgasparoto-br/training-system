import type { ProfessorMaritalStatus } from '@corrida/types';

export function formatCollaboratorPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

export function formatCollaboratorCpf(value: string) {
  return value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

export function formatCollaboratorRg(value: string) {
  return value
    .toUpperCase()
    .replace(/[^0-9X]/g, '')
    .slice(0, 9)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})([0-9X])$/, '.$1-$2');
}

export function formatCollaboratorCompanyDocument(value: string) {
  return value
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function formatCollaboratorBankAccount(value: string) {
  const normalized = value.toUpperCase().replace(/[^0-9X]/g, '').slice(0, 20);
  if (normalized.length <= 1) return normalized;
  return `${normalized.slice(0, -1)}-${normalized.slice(-1)}`;
}

export function formatCollaboratorRateInput(value?: string) {
  const input = value?.trim().replace(/\s/g, '');
  if (!input) return '';
  const normalized = input.includes(',')
    ? input.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(input)
      ? input.replace(/\./g, '')
      : input;
  const parsed = Number(normalized);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value ?? '';
}

export function normalizeCollaboratorInstagram(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return '';
  return normalized.startsWith('@') ? normalized : `@${normalized}`;
}

const maritalStatusLabels: Record<ProfessorMaritalStatus, string> = {
  single: 'Solteiro(a)',
  married: 'Casado(a)',
  stable_union: 'União estável',
  divorced: 'Divorciado(a)',
  separated: 'Separado(a)',
  widowed: 'Viúvo(a)',
  other: 'Outro',
};

export function formatMaritalStatus(value?: ProfessorMaritalStatus | null) {
  return value ? maritalStatusLabels[value] : 'Não informado';
}
