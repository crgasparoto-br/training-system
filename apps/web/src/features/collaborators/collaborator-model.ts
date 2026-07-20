import { z } from 'zod';
import type {
  CreateProfessorRequest,
  ProfessorHourlyRates,
  ProfessorMaritalStatus,
  ProfessorSummary,
  UpdateProfessorRequest,
} from '@corrida/types';
import { formatCep } from '../../services/cep.service';
import {
  formatCollaboratorBankAccount,
  formatCollaboratorCompanyDocument,
  formatCollaboratorCpf,
  formatCollaboratorPhone,
  formatCollaboratorRg,
  normalizeCollaboratorInstagram,
} from './collaborator-formatters';

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().url('Informe uma URL válida').optional()
);

export const collaboratorFormSchema = z
  .object({
    name: z.string().trim().min(3, 'O nome deve ter no mínimo 3 caracteres'),
    email: z.string().trim().email('Informe um e-mail válido'),
    password: z.string().optional().refine(
      (value) => !value?.trim() || value.trim().length >= 8,
      'A senha deve ter no mínimo 8 caracteres'
    ),
    phone: z.string().optional(),
    birthDate: z.string().optional(),
    cpf: z.string().optional(),
    rg: z.string().optional(),
    maritalStatus: z.string().optional(),
    addressStreet: z.string().optional(),
    addressNumber: z.string().optional(),
    addressNeighborhood: z.string().optional(),
    addressCity: z.string().optional(),
    addressState: z.string().optional(),
    addressComplement: z.string().optional(),
    addressZipCode: z.string().optional(),
    instagramHandle: z.string().optional(),
    cref: z.string().optional(),
    professionalSummary: z.string().optional(),
    lattesUrl: optionalUrl,
    companyDocument: z.string().optional(),
    bankCode: z.string().optional(),
    bankBranch: z.string().optional(),
    bankAccount: z.string().optional(),
    pixKey: z.string().optional(),
    avatar: z.string().optional(),
    admissionDate: z.string().optional(),
    dismissalDate: z.string().optional(),
    currentStatus: z.string().optional(),
    collaboratorFunctionId: z.string().trim().min(1, 'Selecione uma função'),
    responsibleManagerId: z.string().optional(),
    operationalRoleIds: z.array(z.string()).default([]),
    hourlyRates: z.object({
      personal: z.string().optional(),
      consulting: z.string().optional(),
      evaluation: z.string().optional(),
    }),
    hasSignedContract: z.boolean().default(false),
    signedContractDocumentUrl: optionalUrl,
  })
  .superRefine((data, context) => {
    if (data.hasSignedContract && !data.signedContractDocumentUrl?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['signedContractDocumentUrl'],
        message: 'Envie o PDF do contrato assinado',
      });
    }
  });

export type CollaboratorFormValues = z.infer<typeof collaboratorFormSchema>;

export function createCollaboratorFormValues(professor?: ProfessorSummary): CollaboratorFormValues {
  const profile = professor?.user.profile;
  const hourlyRates = professor?.hourlyRates;

  return {
    name: profile?.name ?? '',
    email: professor?.user.email ?? '',
    password: '',
    phone: formatCollaboratorPhone(profile?.phone ?? ''),
    birthDate: toInputDate(profile?.birthDate),
    cpf: formatCollaboratorCpf(profile?.cpf ?? ''),
    rg: formatCollaboratorRg(profile?.rg ?? ''),
    maritalStatus: profile?.maritalStatus ?? '',
    addressStreet: profile?.addressStreet ?? '',
    addressNumber: profile?.addressNumber ?? '',
    addressNeighborhood: profile?.addressNeighborhood ?? '',
    addressCity: profile?.addressCity ?? '',
    addressState: profile?.addressState ?? '',
    addressComplement: profile?.addressComplement ?? '',
    addressZipCode: formatCep(profile?.addressZipCode ?? ''),
    instagramHandle: normalizeCollaboratorInstagram(profile?.instagramHandle),
    cref: profile?.cref ?? '',
    professionalSummary: profile?.professionalSummary ?? '',
    lattesUrl: profile?.lattesUrl ?? '',
    companyDocument: formatCollaboratorCompanyDocument(profile?.companyDocument ?? ''),
    bankCode: profile?.bankCode ?? '',
    bankBranch: profile?.bankBranch ?? '',
    bankAccount: formatCollaboratorBankAccount(profile?.bankAccount ?? ''),
    pixKey: profile?.pixKey ?? '',
    avatar: profile?.avatar ?? '',
    admissionDate: toInputDate(professor?.admissionDate),
    dismissalDate: toInputDate(professor?.dismissalDate),
    currentStatus: professor?.currentStatus ?? (professor?.user.isActive === false ? 'Desligado' : 'Ativo'),
    collaboratorFunctionId: professor?.collaboratorFunction.id ?? '',
    responsibleManagerId: professor?.responsibleManager?.id ?? '',
    operationalRoleIds: professor?.operationalRoleIds ?? [],
    hourlyRates: {
      personal: toRateInput(hourlyRates?.personal),
      consulting: toRateInput(hourlyRates?.consulting),
      evaluation: toRateInput(hourlyRates?.evaluation),
    },
    hasSignedContract: professor?.hasSignedContract ?? false,
    signedContractDocumentUrl: professor?.signedContractDocumentUrl ?? '',
  };
}

function toInputDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function toRateInput(value?: number | null) {
  return typeof value === 'number'
    ? value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
}

function emptyToUndefined(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function emptyToNull(value?: string) {
  return emptyToUndefined(value) ?? null;
}

function parseRate(value?: string) {
  const input = value?.trim().replace(/\s/g, '');
  if (!input) return null;

  const normalized = input.includes(',')
    ? input.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(input)
      ? input.replace(/\./g, '')
      : input;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : null;
}

function mapHourlyRates(values: CollaboratorFormValues): ProfessorHourlyRates | undefined {
  const hourlyRates = {
    personal: parseRate(values.hourlyRates.personal),
    consulting: parseRate(values.hourlyRates.consulting),
    evaluation: parseRate(values.hourlyRates.evaluation),
  };

  return Object.values(hourlyRates).some((value) => typeof value === 'number') ? hourlyRates : undefined;
}

export function toCreateProfessorRequest(values: CollaboratorFormValues): CreateProfessorRequest {
  if (!values.password || values.password.length < 8) {
    throw new Error('A senha deve ter no mínimo 8 caracteres');
  }

  return {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    password: values.password,
    phone: emptyToUndefined(values.phone),
    birthDate: emptyToUndefined(values.birthDate),
    cpf: emptyToUndefined(values.cpf),
    rg: emptyToUndefined(values.rg),
    maritalStatus: emptyToUndefined(values.maritalStatus) as ProfessorMaritalStatus | undefined,
    addressStreet: emptyToUndefined(values.addressStreet),
    addressNumber: emptyToUndefined(values.addressNumber),
    addressNeighborhood: emptyToUndefined(values.addressNeighborhood),
    addressCity: emptyToUndefined(values.addressCity),
    addressState: emptyToUndefined(values.addressState),
    addressComplement: emptyToUndefined(values.addressComplement),
    addressZipCode: emptyToUndefined(values.addressZipCode),
    instagramHandle: emptyToUndefined(values.instagramHandle),
    cref: emptyToUndefined(values.cref),
    professionalSummary: emptyToUndefined(values.professionalSummary),
    lattesUrl: emptyToUndefined(values.lattesUrl),
    companyDocument: emptyToUndefined(values.companyDocument),
    bankCode: emptyToUndefined(values.bankCode),
    bankBranch: emptyToUndefined(values.bankBranch),
    bankAccount: emptyToUndefined(values.bankAccount),
    pixKey: emptyToUndefined(values.pixKey),
    avatar: emptyToUndefined(values.avatar),
    admissionDate: emptyToUndefined(values.admissionDate),
    dismissalDate: emptyToUndefined(values.dismissalDate),
    currentStatus: emptyToUndefined(values.currentStatus),
    collaboratorFunctionId: values.collaboratorFunctionId,
    responsibleManagerId: emptyToUndefined(values.responsibleManagerId),
    operationalRoleIds: values.operationalRoleIds,
    hourlyRates: mapHourlyRates(values),
    hasSignedContract: values.hasSignedContract,
    signedContractDocumentUrl: values.hasSignedContract
      ? emptyToUndefined(values.signedContractDocumentUrl)
      : undefined,
  };
}

export function toUpdateProfessorRequest(values: CollaboratorFormValues): UpdateProfessorRequest {
  return {
    name: values.name.trim(),
    email: values.email.trim().toLowerCase(),
    ...(values.password?.trim() ? { password: values.password } : {}),
    phone: emptyToNull(values.phone),
    birthDate: emptyToNull(values.birthDate),
    cpf: emptyToNull(values.cpf),
    rg: emptyToNull(values.rg),
    maritalStatus: emptyToNull(values.maritalStatus) as ProfessorMaritalStatus | null,
    addressStreet: emptyToNull(values.addressStreet),
    addressNumber: emptyToNull(values.addressNumber),
    addressNeighborhood: emptyToNull(values.addressNeighborhood),
    addressCity: emptyToNull(values.addressCity),
    addressState: emptyToNull(values.addressState),
    addressComplement: emptyToNull(values.addressComplement),
    addressZipCode: emptyToNull(values.addressZipCode),
    instagramHandle: emptyToNull(values.instagramHandle),
    cref: emptyToNull(values.cref),
    professionalSummary: emptyToNull(values.professionalSummary),
    lattesUrl: emptyToNull(values.lattesUrl),
    companyDocument: emptyToNull(values.companyDocument),
    bankCode: emptyToNull(values.bankCode),
    bankBranch: emptyToNull(values.bankBranch),
    bankAccount: emptyToNull(values.bankAccount),
    pixKey: emptyToNull(values.pixKey),
    avatar: emptyToNull(values.avatar),
    admissionDate: emptyToNull(values.admissionDate),
    dismissalDate: emptyToNull(values.dismissalDate),
    currentStatus: emptyToNull(values.currentStatus),
    collaboratorFunctionId: values.collaboratorFunctionId,
    responsibleManagerId: emptyToUndefined(values.responsibleManagerId),
    operationalRoleIds: values.operationalRoleIds,
    hourlyRates: mapHourlyRates(values),
    hasSignedContract: values.hasSignedContract,
    signedContractDocumentUrl: values.hasSignedContract
      ? emptyToNull(values.signedContractDocumentUrl)
      : null,
  };
}

const SELF_SERVICE_FIELDS: Array<keyof UpdateProfessorRequest> = [
  'name',
  'email',
  'password',
  'phone',
  'birthDate',
  'cpf',
  'rg',
  'maritalStatus',
  'addressStreet',
  'addressNumber',
  'addressNeighborhood',
  'addressCity',
  'addressState',
  'addressComplement',
  'addressZipCode',
  'instagramHandle',
  'cref',
  'professionalSummary',
  'lattesUrl',
  'companyDocument',
  'bankCode',
  'bankName',
  'bankBranch',
  'bankAccount',
  'pixKey',
  'avatar',
];

export function toSelfServiceUpdateProfessorRequest(values: CollaboratorFormValues): UpdateProfessorRequest {
  const payload = toUpdateProfessorRequest(values);
  return Object.fromEntries(
    SELF_SERVICE_FIELDS
      .filter((field) => payload[field] !== undefined)
      .map((field) => [field, payload[field]])
  ) as UpdateProfessorRequest;
}

export function getLegalFinancialStatus(professor: ProfessorSummary) {
  const profile = professor.user.profile;
  if (profile.legalFinancialValidatedAt) return 'Validado';
  if (profile.companyDocument || profile.bankName || profile.bankBranch || profile.bankAccount || profile.pixKey) {
    return 'Pendente de validação';
  }
  return 'Não informado';
}

export function formatCollaboratorDate(value?: string | null) {
  if (!value) return 'Não informado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não informado' : date.toLocaleDateString('pt-BR');
}

export function formatCurrency(value?: number | null) {
  if (typeof value !== 'number') return 'Não informado';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatAddress(professor: ProfessorSummary) {
  const profile = professor.user.profile;
  const firstLine = [profile.addressStreet, profile.addressNumber].filter(Boolean).join(', ');
  const secondLine = [profile.addressNeighborhood, profile.addressCity, profile.addressState].filter(Boolean).join(' - ');
  return [firstLine, secondLine, profile.addressZipCode].filter(Boolean).join(' · ') || 'Não informado';
}
