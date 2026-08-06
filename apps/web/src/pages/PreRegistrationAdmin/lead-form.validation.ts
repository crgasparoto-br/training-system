import { formatBrazilianDocument } from '../../utils/document';

export interface LeadFormValues {
  name: string;
  phone: string;
  additionalPhone: string;
  email: string;
  additionalEmail: string;
  cpf: string;
  origin: string;
  responsibleProfessorId: string;
  commercialNotes: string;
  unit: string;
}

export type LeadFormErrors = Partial<Record<keyof LeadFormValues, string>>;

export const EMPTY_LEAD_FORM_VALUES: LeadFormValues = {
  name: '',
  phone: '',
  additionalPhone: '',
  email: '',
  additionalEmail: '',
  cpf: '',
  origin: '',
  responsibleProfessorId: '',
  commercialNotes: '',
  unit: '',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function digitsOnly(value: string) {
  return value.replace(/\D/g, '');
}

function normalizeInlineText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeMultilineText(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n')
    .trim();
}

export function formatLeadPhone(value: string): string {
  const raw = value.trimStart();
  const digits = digitsOnly(raw);

  if (raw.startsWith('+')) {
    return digits ? `+${digits.slice(0, 15)}` : '';
  }

  const limited = digits.slice(0, 11);
  if (!limited) return '';
  if (limited.length <= 2) return `(${limited}`;

  const areaCode = limited.slice(0, 2);
  const number = limited.slice(2);
  if (number.length <= 4) return `(${areaCode}) ${number}`;

  const splitAt = limited.length === 11 ? 5 : 4;
  return `(${areaCode}) ${number.slice(0, splitAt)}-${number.slice(splitAt)}`;
}

export function isValidLeadPhone(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  let digits = digitsOnly(raw);
  const explicitInternational = raw.startsWith('+') || raw.startsWith('00');

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (explicitInternational) return digits.length >= 11 && digits.length <= 15;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return true;
  }
  if (digits.startsWith('0') && (digits.length === 13 || digits.length === 14)) {
    const nationalNumber = digits.slice(3);
    return nationalNumber.length === 10 || nationalNumber.length === 11;
  }
  return digits.length === 10 || digits.length === 11;
}

export function isValidLeadEmail(value: string): boolean {
  const email = value.trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function isValidLeadCpf(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calculateDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(digits[9]) && calculateDigit(10) === Number(digits[10]);
}

export function formatLeadFieldValue(field: keyof LeadFormValues, value: string): string {
  if (field === 'phone' || field === 'additionalPhone') return formatLeadPhone(value);
  if (field === 'cpf') return formatBrazilianDocument(value, 'cpf');
  return value;
}

export function normalizeLeadFormValues(values: LeadFormValues): LeadFormValues {
  return {
    ...values,
    name: normalizeInlineText(values.name),
    phone: values.phone.trim(),
    additionalPhone: values.additionalPhone.trim(),
    email: values.email.trim().toLocaleLowerCase('pt-BR'),
    additionalEmail: values.additionalEmail.trim().toLocaleLowerCase('pt-BR'),
    cpf: values.cpf.trim(),
    origin: normalizeInlineText(values.origin),
    responsibleProfessorId: values.responsibleProfessorId.trim(),
    commercialNotes: normalizeMultilineText(values.commercialNotes),
    unit: normalizeInlineText(values.unit),
  };
}

export function normalizeLeadFieldOnBlur(
  field: keyof LeadFormValues,
  value: string
): string {
  if (field === 'email' || field === 'additionalEmail') {
    return value.trim().toLocaleLowerCase('pt-BR');
  }
  if (field === 'commercialNotes') return normalizeMultilineText(value);
  if (field === 'name' || field === 'origin' || field === 'unit') {
    return normalizeInlineText(value);
  }
  return value.trim();
}

export function validateLeadFormValues(values: LeadFormValues): LeadFormErrors {
  const errors: LeadFormErrors = {};

  if (!values.name) errors.name = 'Informe o nome completo.';
  if (!values.origin) errors.origin = 'Informe a origem do contato.';

  if (values.phone && !isValidLeadPhone(values.phone)) {
    errors.phone = 'Informe um telefone válido com DDD.';
  }
  if (values.additionalPhone && !isValidLeadPhone(values.additionalPhone)) {
    errors.additionalPhone = 'Informe um telefone adicional válido com DDD.';
  }
  if (values.email && !isValidLeadEmail(values.email)) {
    errors.email = 'Informe um e-mail válido.';
  }
  if (values.additionalEmail && !isValidLeadEmail(values.additionalEmail)) {
    errors.additionalEmail = 'Informe um e-mail adicional válido.';
  }
  if (values.cpf && !isValidLeadCpf(values.cpf)) {
    errors.cpf = 'Informe um CPF válido.';
  }

  if (!values.phone && !values.email) {
    const contactMessage = 'Informe pelo menos telefone ou e-mail.';
    errors.phone = contactMessage;
    errors.email = contactMessage;
  }

  return errors;
}
