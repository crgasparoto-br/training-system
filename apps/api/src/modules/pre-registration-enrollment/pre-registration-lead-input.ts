import type { CreatePreRegistrationLeadDTO } from '@corrida/types';
import {
  isValidStudentCpf,
  normalizeStudentEmail,
  normalizeStudentPhone,
} from '../alunos/student-identity.service.js';

export type CreatePreRegistrationLeadWithDecisionDTO = CreatePreRegistrationLeadDTO & {
  confirmedDuplicateReason?: string;
};

export type PreRegistrationLeadInputValidationResult =
  | { success: true; data: CreatePreRegistrationLeadWithDecisionDTO }
  | { success: false; message: string; fields: string[] };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function recordOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clean(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function cleanInline(value: unknown): string | undefined {
  const text = clean(value);
  return text?.replace(/\s+/g, ' ');
}

function cleanMultiline(value: unknown): string | undefined {
  const text = clean(value);
  return text
    ?.split(/\r?\n/)
    .map((line) => line.trim().replace(/[ \t]+/g, ' '))
    .join('\n');
}

function validEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

export function validateAndNormalizePreRegistrationLeadInput(
  input: unknown
): PreRegistrationLeadInputValidationResult {
  const source = recordOf(input);
  const name = cleanInline(source.name);
  const origin = cleanInline(source.origin);
  const phone = clean(source.phone);
  const additionalPhone = clean(source.additionalPhone);
  const email = normalizeStudentEmail(clean(source.email));
  const additionalEmail = normalizeStudentEmail(clean(source.additionalEmail));
  const cpf = clean(source.cpf);
  const fields: string[] = [];

  if (!name) fields.push('name');
  if (!origin) fields.push('origin');
  if (!phone && !email) fields.push('phone_or_email');
  if (phone && !normalizeStudentPhone(phone)) fields.push('phone');
  if (additionalPhone && !normalizeStudentPhone(additionalPhone)) fields.push('additionalPhone');
  if (email && !validEmail(email)) fields.push('email');
  if (additionalEmail && !validEmail(additionalEmail)) fields.push('additionalEmail');
  if (cpf && !isValidStudentCpf(cpf)) fields.push('cpf');

  if (fields.length > 0) {
    const message = fields.includes('cpf')
      ? 'Informe um CPF válido.'
      : fields.some((field) => field === 'phone' || field === 'additionalPhone')
        ? 'Informe um telefone válido com DDD.'
        : fields.some((field) => field === 'email' || field === 'additionalEmail')
          ? 'Informe um e-mail válido.'
          : 'Informe nome, origem e pelo menos telefone ou e-mail.';
    return { success: false, message, fields: [...new Set(fields)] };
  }

  return {
    success: true,
    data: {
      name: name!,
      origin: origin!,
      ...(phone ? { phone } : {}),
      ...(additionalPhone ? { additionalPhone } : {}),
      ...(email ? { email } : {}),
      ...(additionalEmail ? { additionalEmail } : {}),
      ...(cpf ? { cpf } : {}),
      ...(clean(source.responsibleProfessorId)
        ? { responsibleProfessorId: clean(source.responsibleProfessorId) }
        : {}),
      ...(cleanMultiline(source.commercialNotes)
        ? { commercialNotes: cleanMultiline(source.commercialNotes) }
        : {}),
      ...(cleanInline(source.unit) ? { unit: cleanInline(source.unit) } : {}),
      ...(clean(source.confirmedDuplicateFingerprint)
        ? { confirmedDuplicateFingerprint: clean(source.confirmedDuplicateFingerprint) }
        : {}),
      ...(clean(source.confirmedDuplicateReason)
        ? { confirmedDuplicateReason: clean(source.confirmedDuplicateReason) }
        : {}),
    },
  };
}
