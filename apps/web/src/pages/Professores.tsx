import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Camera, FileText, Upload } from 'lucide-react';
import { collaboratorFunctionService } from '../services/collaborator-function.service';
import { hourlyRateLevelService } from '../services/hourly-rate-level.service';
import { professorService } from '../services/professor.service';
import type {
  CollaboratorFunctionOption,
  HourlyRateLevel,
  ProfessorHourlyRates,
  ProfessorMaritalStatus,
  ProfessorSummary,
} from '@corrida/types';
import { useAuthStore } from '../stores/useAuthStore';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/Accordion';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { commonCopy, professoresCopy } from '../i18n/ptBR';

const createProfessorSchema = z.object({
  name: z.string().trim().min(3, 'O nome deve ter no mínimo 3 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  maritalStatus: z.string().optional(),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressComplement: z.string().optional(),
  addressZipCode: z.string().optional(),
  instagramHandle: z.string().optional(),
  cref: z.string().optional(),
  professionalSummary: z.string().optional(),
  lattesUrl: z.string().optional(),
  companyDocument: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  bankAccount: z.string().optional(),
  pixKey: z.string().optional(),
  avatar: z.string().trim().url('URL da foto inválida').optional(),
  admissionDate: z.string().optional(),
  currentStatus: z.string().optional(),
  signedContractDocumentUrl: z.string().trim().url('URL do contrato inválida').optional(),
  operationalRoleIds: z.array(z.string()).optional(),
  hourlyRates: z.object({
    personal: z.string().optional(),
    consulting: z.string().optional(),
    evaluation: z.string().optional(),
  }),
  hasSignedContract: z.boolean().optional(),
  collaboratorFunctionId: z.string().trim().min(1, 'Selecione uma função'),
  responsibleManagerId: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.hasSignedContract && !data.signedContractDocumentUrl?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['signedContractDocumentUrl'],
      message: professoresCopy.signedContractDocumentMissing,
    });
  }
});

const editProfessorSchema = z.object({
  name: z.string().trim().min(3, 'O nome deve ter no mínimo 3 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  password: z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || value.trim().length === 0 || value.length >= 8,
      'A senha deve ter no mínimo 8 caracteres'
    ),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  maritalStatus: z.string().optional(),
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressComplement: z.string().optional(),
  addressZipCode: z.string().optional(),
  instagramHandle: z.string().optional(),
  cref: z.string().optional(),
  professionalSummary: z.string().optional(),
  lattesUrl: z.string().optional(),
  companyDocument: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  bankAccount: z.string().optional(),
  pixKey: z.string().optional(),
  avatar: z.string().trim().url('URL da foto inválida').optional(),
  admissionDate: z.string().optional(),
  currentStatus: z.string().optional(),
  signedContractDocumentUrl: z.string().trim().url('URL do contrato inválida').optional(),
  operationalRoleIds: z.array(z.string()).optional(),
  hourlyRates: z.object({
    personal: z.string().optional(),
    consulting: z.string().optional(),
    evaluation: z.string().optional(),
  }),
  hasSignedContract: z.boolean().optional(),
  collaboratorFunctionId: z.string().trim().min(1, 'Selecione uma função'),
  responsibleManagerId: z.string().trim().optional(),
}).superRefine((data, ctx) => {
  if (data.hasSignedContract && !data.signedContractDocumentUrl?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['signedContractDocumentUrl'],
      message: professoresCopy.signedContractDocumentMissing,
    });
  }
});

type CreateProfessorForm = z.infer<typeof createProfessorSchema>;
type EditProfessorForm = z.infer<typeof editProfessorSchema>;

const maritalStatusOptions: Array<{
  value: ProfessorMaritalStatus;
  label: string;
}> = [
  { value: 'single', label: professoresCopy.maritalStatusSingle },
  { value: 'married', label: professoresCopy.maritalStatusMarried },
  { value: 'stable_union', label: professoresCopy.maritalStatusStableUnion },
  { value: 'divorced', label: professoresCopy.maritalStatusDivorced },
  { value: 'separated', label: professoresCopy.maritalStatusSeparated },
  { value: 'widowed', label: professoresCopy.maritalStatusWidowed },
  { value: 'other', label: professoresCopy.maritalStatusOther },
];

const currentStatusOptions = [
  { value: 'Ativo', label: professoresCopy.currentStatusActive },
  { value: 'Desligado', label: professoresCopy.currentStatusInactive },
] as const;

const hourlyRateSections = [
  { key: 'personal', label: professoresCopy.hourlyRatePersonalLabel },
  { key: 'consulting', label: professoresCopy.hourlyRateConsultingLabel },
  { key: 'evaluation', label: professoresCopy.hourlyRateEvaluationLabel },
] as const;

const baseUrl = import.meta.env.VITE_API_URL || '';

function getAvatarInitials(name?: string | null) {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'CL';
  }

  return parts.map((part) => part.charAt(0).toUpperCase()).join('');
}

function resolveAvatarUrl(avatar?: string | null) {
  if (!avatar) {
    return '';
  }

  if (/^(https?:|data:|blob:)/i.test(avatar)) {
    return avatar;
  }

  return `${baseUrl}/${avatar}`;
}

function AvatarUploadField({
  name,
  avatar,
  size = 'md',
  isUploading,
  onUploadClick,
  onRemove,
}: {
  name?: string;
  avatar?: string;
  size?: 'sm' | 'md' | 'lg';
  isUploading: boolean;
  onUploadClick: () => void;
  onRemove: () => void;
}) {
  const resolvedAvatar = resolveAvatarUrl(avatar);
  const hasAvatar = !!resolvedAvatar;
  const sizeClassName =
    size === 'sm' ? 'h-12 w-12 text-sm' : size === 'lg' ? 'h-20 w-20 text-lg' : 'h-16 w-16 text-lg';

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div
            className={`relative flex items-center justify-center overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-background to-secondary/40 font-semibold text-foreground ${sizeClassName}`}
          >
            {hasAvatar ? (
              <img src={resolvedAvatar} alt={name || professoresCopy.nameLabel} className="h-full w-full object-cover" />
            ) : (
              <span>{getAvatarInitials(name)}</span>
            )}
            {!hasAvatar && !isUploading && (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center text-white/90">
                <Camera size={18} />
              </div>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Foto do colaborador</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasAvatar ? 'Substitua a foto atual quando necessário.' : 'Envie uma foto para facilitar a identificação do colaborador.'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onUploadClick}
            disabled={isUploading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={14} />
            {hasAvatar ? 'Trocar foto' : 'Enviar foto'}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={!hasAvatar || isUploading}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            Remover foto
          </button>
        </div>
      </div>
    </div>
  );
}

function CollaboratorAvatar({
  name,
  avatar,
}: {
  name?: string | null;
  avatar?: string | null;
}) {
  const resolvedAvatar = resolveAvatarUrl(avatar);

  return (
    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-background to-secondary/40 font-semibold text-foreground">
      {resolvedAvatar ? (
        <img src={resolvedAvatar} alt={name || professoresCopy.nameLabel} className="h-full w-full object-cover" />
      ) : (
        <span>{getAvatarInitials(name)}</span>
      )}
    </div>
  );
}

function SignedContractUploadField({
  documentUrl,
  onUploadClick,
  onRemove,
  isUploading,
  error,
  required,
}: {
  documentUrl?: string;
  onUploadClick: () => void;
  onRemove: () => void;
  isUploading: boolean;
  error?: string;
  required?: boolean;
}) {
  const hasDocument = !!documentUrl;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{professoresCopy.signedContractDocumentLabel}</p>
            {required ? (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                Obrigatório
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{professoresCopy.signedContractDocumentHint}</p>
        </div>
        {isUploading && (
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            Enviando...
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/30 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FileText size={18} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {hasDocument ? 'PDF anexado' : 'Nenhum PDF enviado'}
            </p>
            {hasDocument ? (
              <a
                href={documentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {professoresCopy.signedContractDocumentView}
              </a>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Arquivo aceito: PDF até 10 MB.</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onUploadClick}
            disabled={isUploading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={14} />
            {hasDocument
              ? professoresCopy.signedContractDocumentReplace
              : professoresCopy.signedContractDocumentUpload}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={!hasDocument || isUploading}
            className="inline-flex h-10 items-center justify-center rounded-full border border-border px-4 text-sm font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
          >
            {professoresCopy.signedContractDocumentRemove}
          </button>
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

const textareaClassName =
  'flex min-h-[120px] w-full rounded-lg border border-input bg-card px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const hourlyRateInputClassName =
  'h-11 w-full rounded-2xl border border-border bg-white px-4 text-sm text-foreground shadow-sm outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15';

type HourlyRatesForm = {
  personal?: string;
  consulting?: string;
  evaluation?: string;
};

type HourlyRateSectionKey = keyof HourlyRatesForm;
type HourlyRateErrors = Partial<Record<HourlyRateSectionKey, string | undefined>>;

function hasConfiguredHourlyRateLevels(levels: HourlyRateLevel[]) {
  return levels.length > 0 && levels.every((level) => typeof level.minValue === 'number' && typeof level.maxValue === 'number');
}

function getHourlyRateLevelLabel(value: string | undefined, levels: HourlyRateLevel[]) {
  const parsedValue = parseHourlyRateValue(value);

  if (parsedValue === null) {
    return professoresCopy.hourlyRatesNotConfigured;
  }

  if (!hasConfiguredHourlyRateLevels(levels)) {
    return professoresCopy.hourlyRateLevelPendingConfig;
  }

  const matchingLevel = levels.find(
    (level) =>
      typeof level.minValue === 'number' &&
      typeof level.maxValue === 'number' &&
      parsedValue >= level.minValue &&
      parsedValue <= level.maxValue
  );

  return matchingLevel?.label ?? professoresCopy.hourlyRateLevelUnclassified;
}

function HourlyRatesMatrix({
  errors,
  getInputProps,
  values,
  levels,
}: {
  errors?: HourlyRateErrors;
  getInputProps: (sectionKey: HourlyRateSectionKey) => Record<string, unknown>;
  values?: HourlyRatesForm;
  levels: HourlyRateLevel[];
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-medium text-foreground">{professoresCopy.hourlyRatesTitle}</p>
      <p className="mt-1 text-xs text-muted-foreground">{professoresCopy.hourlyRatesDescription}</p>
      <p className="mt-2 text-xs text-muted-foreground">{professoresCopy.hourlyRateLevelHint}</p>

      <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-border/70 bg-background/80">
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-px bg-border/70">
          <div className="bg-secondary/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Frente
          </div>
          <div className="bg-secondary/60 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {professoresCopy.hourlyRateValueColumnLabel}
          </div>
          <div className="bg-secondary/60 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {professoresCopy.hourlyRateLevelColumnLabel}
          </div>

          {hourlyRateSections.map((section) => (
            <div key={section.key} className="contents">
              <div className="flex items-center bg-white px-4 py-4 text-sm font-medium text-foreground">
                {`Valor/hora ${section.label.toLowerCase()}`}
              </div>
              <div className="bg-white px-3 py-3">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className={hourlyRateInputClassName}
                  {...getInputProps(section.key)}
                />
                {errors?.[section.key] && (
                  <p className="mt-1 text-xs text-destructive">{errors[section.key]}</p>
                )}
              </div>
              <div className="flex items-center justify-center bg-white px-3 py-3">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {getHourlyRateLevelLabel(values?.[section.key], levels)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function createDefaultHourlyRatesForm(): HourlyRatesForm {
  return {
    personal: '',
    consulting: '',
    evaluation: '',
  };
}

function sanitizeBaseProfessorPayload<T extends { name: string; email: string }>(data: T) {
  return {
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
  };
}

function formatDateForInput(value?: string | null) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().slice(0, 10);
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  if (digits.length <= 10) {
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

function formatCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11);

  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2');
}

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function formatZipCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  return digits.replace(/^(\d{5})(\d)/, '$1-$2');
}

function normalizeInstagramHandle(value?: string | null) {
  if (!value) return '';

  const trimmedValue = value.trim();
  if (!trimmedValue) return '';

  return trimmedValue.startsWith('@') ? trimmedValue : `@${trimmedValue}`;
}

function parseHourlyRateValue(value?: string) {
  if (!value) {
    return null;
  }

  const normalizedValue = Number(value.replace(',', '.'));
  if (Number.isNaN(normalizedValue) || normalizedValue < 0) {
    return null;
  }

  return normalizedValue;
}

function sanitizeHourlyRates(hourlyRates?: HourlyRatesForm): ProfessorHourlyRates | undefined {
  if (!hourlyRates) {
    return undefined;
  }

  const normalized: ProfessorHourlyRates = {
    personal: parseHourlyRateValue(hourlyRates.personal),
    consulting: parseHourlyRateValue(hourlyRates.consulting),
    evaluation: parseHourlyRateValue(hourlyRates.evaluation),
  };

  const hasValue = Object.values(normalized).some((value) => typeof value === 'number');

  return hasValue ? normalized : undefined;
}

function getHourlyRatesFormValue(hourlyRates?: ProfessorSummary['hourlyRates']): HourlyRatesForm {
  return {
    personal: hourlyRates?.personal?.toString() ?? '',
    consulting: hourlyRates?.consulting?.toString() ?? '',
    evaluation: hourlyRates?.evaluation?.toString() ?? '',
  };
}

function formatCurrencyValue(value?: number | null) {
  if (typeof value !== 'number') {
    return professoresCopy.hourlyRatesNotConfigured;
  }

  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatHourlyRateSummary(value: number | null | undefined, levels: HourlyRateLevel[]) {
  const currencyValue = formatCurrencyValue(value);
  const levelLabel = getHourlyRateLevelLabel(
    typeof value === 'number' ? value.toString() : undefined,
    levels
  );

  return `${currencyValue} | ${professoresCopy.hourlyRateLevelColumnLabel}: ${levelLabel}`;
}

function getLegalFinancialStatus(profile: ProfessorSummary['user']['profile']) {
  if (profile.legalFinancialValidatedAt) {
    return professoresCopy.legalFinancialValidated;
  }

  if (
    profile.companyDocument ||
    profile.bankName ||
    profile.bankBranch ||
    profile.bankAccount ||
    profile.pixKey
  ) {
    return professoresCopy.legalFinancialPending;
  }

  return professoresCopy.legalFinancialNotProvided;
}

function canValidateLegalFinancial(profile: ProfessorSummary['user']['profile']) {
  return !!(
    profile.companyDocument ||
    profile.bankName ||
    profile.bankBranch ||
    profile.bankAccount ||
    profile.pixKey
  );
}

function getDefaultCollaboratorFunctionId(items: CollaboratorFunctionOption[]) {
  return items.find((item) => item.isActive)?.id ?? '';
}

function requiresResponsibleManager(
  collaboratorFunctionId: string,
  items: CollaboratorFunctionOption[]
) {
  const collaboratorFunction = items.find((item) => item.id === collaboratorFunctionId);
  return collaboratorFunction ? collaboratorFunction.code !== 'manager' : false;
}

function getResponsibleManagerOptions(items: ProfessorSummary[]) {
  return items.filter(
    (item) =>
      item.user?.isActive !== false &&
      (item.role === 'master' || item.collaboratorFunction.code === 'manager')
  );
}

function getDefaultResponsibleManagerId(items: ProfessorSummary[]) {
  const masterManager = items.find((item) => item.role === 'master');
  if (masterManager) {
    return masterManager.id;
  }

  return items[0]?.id ?? '';
}

function sanitizeCreateProfessorPayload(data: CreateProfessorForm) {
  const phone = data.phone?.trim();
  const birthDate = data.birthDate?.trim();
  const cpf = data.cpf?.trim();
  const rg = data.rg?.trim();
  const maritalStatus = data.maritalStatus?.trim();
  const addressStreet = data.addressStreet?.trim();
  const addressNumber = data.addressNumber?.trim();
  const addressComplement = data.addressComplement?.trim();
  const addressZipCode = data.addressZipCode?.trim();
  const instagramHandle = data.instagramHandle?.trim();
  const cref = data.cref?.trim();
  const professionalSummary = data.professionalSummary?.trim();
  const lattesUrl = data.lattesUrl?.trim();
  const companyDocument = data.companyDocument?.trim();
  const bankName = data.bankName?.trim();
  const bankBranch = data.bankBranch?.trim();
  const bankAccount = data.bankAccount?.trim();
  const pixKey = data.pixKey?.trim();
  const avatar = data.avatar?.trim();
  const admissionDate = data.admissionDate?.trim();
  const currentStatus = data.currentStatus?.trim();
  const signedContractDocumentUrl = data.signedContractDocumentUrl?.trim();
  const responsibleManagerId = data.responsibleManagerId?.trim();
  const operationalRoleIds = data.collaboratorFunctionId ? [data.collaboratorFunctionId] : [];
  const hourlyRates = sanitizeHourlyRates(data.hourlyRates);

  return {
    ...sanitizeBaseProfessorPayload(data),
    password: data.password.trim(),
    ...(phone ? { phone } : {}),
    ...(birthDate ? { birthDate } : {}),
    ...(cpf ? { cpf } : {}),
    ...(rg ? { rg } : {}),
    ...(maritalStatus ? { maritalStatus: maritalStatus as ProfessorMaritalStatus } : {}),
    ...(addressStreet ? { addressStreet } : {}),
    ...(addressNumber ? { addressNumber } : {}),
    ...(addressComplement ? { addressComplement } : {}),
    ...(addressZipCode ? { addressZipCode } : {}),
    ...(instagramHandle ? { instagramHandle } : {}),
    ...(cref ? { cref } : {}),
    ...(professionalSummary ? { professionalSummary } : {}),
    ...(lattesUrl ? { lattesUrl } : {}),
    ...(companyDocument ? { companyDocument } : {}),
    ...(bankName ? { bankName } : {}),
    ...(bankBranch ? { bankBranch } : {}),
    ...(bankAccount ? { bankAccount } : {}),
    ...(pixKey ? { pixKey } : {}),
    ...(avatar ? { avatar } : {}),
    ...(admissionDate ? { admissionDate } : {}),
    ...(currentStatus ? { currentStatus } : {}),
    ...(signedContractDocumentUrl ? { signedContractDocumentUrl } : {}),
    ...(operationalRoleIds.length > 0 ? { operationalRoleIds } : {}),
    ...(hourlyRates ? { hourlyRates } : {}),
    ...(data.hasSignedContract ? { hasSignedContract: true } : {}),
    collaboratorFunctionId: data.collaboratorFunctionId,
    ...(responsibleManagerId ? { responsibleManagerId } : {}),
  };
}

function sanitizeUpdateProfessorPayload(data: EditProfessorForm) {
  const password = data.password?.trim();
  const phone = data.phone?.trim();
  const birthDate = data.birthDate?.trim();
  const cpf = data.cpf?.trim();
  const rg = data.rg?.trim();
  const maritalStatus = data.maritalStatus?.trim();
  const addressStreet = data.addressStreet?.trim();
  const addressNumber = data.addressNumber?.trim();
  const addressComplement = data.addressComplement?.trim();
  const addressZipCode = data.addressZipCode?.trim();
  const instagramHandle = data.instagramHandle?.trim();
  const cref = data.cref?.trim();
  const professionalSummary = data.professionalSummary?.trim();
  const lattesUrl = data.lattesUrl?.trim();
  const companyDocument = data.companyDocument?.trim();
  const bankName = data.bankName?.trim();
  const bankBranch = data.bankBranch?.trim();
  const bankAccount = data.bankAccount?.trim();
  const pixKey = data.pixKey?.trim();
  const avatar = data.avatar?.trim();
  const admissionDate = data.admissionDate?.trim();
  const currentStatus = data.currentStatus?.trim();
  const signedContractDocumentUrl = data.signedContractDocumentUrl?.trim();
  const responsibleManagerId = data.responsibleManagerId?.trim();
  const operationalRoleIds = data.collaboratorFunctionId ? [data.collaboratorFunctionId] : [];
  const hourlyRates = sanitizeHourlyRates(data.hourlyRates);

  return {
    ...sanitizeBaseProfessorPayload(data),
    phone: phone || null,
    birthDate: birthDate || null,
    cpf: cpf || null,
    rg: rg || null,
    maritalStatus: (maritalStatus as ProfessorMaritalStatus | undefined) || null,
    addressStreet: addressStreet || null,
    addressNumber: addressNumber || null,
    addressComplement: addressComplement || null,
    addressZipCode: addressZipCode || null,
    instagramHandle: instagramHandle || null,
    cref: cref || null,
    professionalSummary: professionalSummary || null,
    lattesUrl: lattesUrl || null,
    companyDocument: companyDocument || null,
    bankName: bankName || null,
    bankBranch: bankBranch || null,
    bankAccount: bankAccount || null,
    pixKey: pixKey || null,
    avatar: avatar || null,
    admissionDate: admissionDate || null,
    currentStatus: currentStatus || null,
    signedContractDocumentUrl: signedContractDocumentUrl || null,
    operationalRoleIds,
    hourlyRates,
    hasSignedContract: !!data.hasSignedContract,
    collaboratorFunctionId: data.collaboratorFunctionId,
    ...(responsibleManagerId ? { responsibleManagerId } : {}),
    ...(password ? { password } : {}),
  };
}

export function Professores() {
  const { user } = useAuthStore();
  const [professores, setProfessores] = useState<ProfessorSummary[]>([]);
  const [collaboratorFunctions, setCollaboratorFunctions] = useState<CollaboratorFunctionOption[]>([]);
  const [responsibleManagers, setResponsibleManagers] = useState<ProfessorSummary[]>([]);
  const [hourlyRateLevels, setHourlyRateLevels] = useState<HourlyRateLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingCreateAvatar, setUploadingCreateAvatar] = useState(false);
  const [uploadingEditAvatar, setUploadingEditAvatar] = useState(false);
  const [uploadingCreateSignedContract, setUploadingCreateSignedContract] = useState(false);
  const [uploadingEditSignedContract, setUploadingEditSignedContract] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const createAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const editAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const createSignedContractInputRef = useRef<HTMLInputElement | null>(null);
  const editSignedContractInputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateProfessorForm>({
    resolver: zodResolver(createProfessorSchema),
    defaultValues: {
      phone: '',
      birthDate: '',
      cpf: '',
      rg: '',
      maritalStatus: '',
      addressStreet: '',
      addressNumber: '',
      addressComplement: '',
      addressZipCode: '',
      instagramHandle: '',
      cref: '',
      professionalSummary: '',
      lattesUrl: '',
      companyDocument: '',
      bankName: '',
      bankBranch: '',
      bankAccount: '',
      pixKey: '',
      avatar: '',
      admissionDate: '',
      currentStatus: '',
      signedContractDocumentUrl: '',
      operationalRoleIds: [],
      hourlyRates: createDefaultHourlyRatesForm(),
      hasSignedContract: false,
      collaboratorFunctionId: '',
      responsibleManagerId: '',
    },
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    getValues: getEditValues,
    reset: resetEdit,
    setValue: setEditValue,
    watch: watchEdit,
    formState: { errors: editErrors },
  } = useForm<EditProfessorForm>({
    resolver: zodResolver(editProfessorSchema),
  });

  const canManageProfessores =
    user?.type === 'professor' &&
    user?.professor?.role === 'master' &&
    user?.professor?.contract?.type === 'academy';

  const createCollaboratorFunctionId = watch('collaboratorFunctionId');
  const editCollaboratorFunctionId = watchEdit('collaboratorFunctionId');
  const createAvatarUrl = watch('avatar');
  const editAvatarUrl = watchEdit('avatar');
  const createHasSignedContract = watch('hasSignedContract');
  const editHasSignedContract = watchEdit('hasSignedContract');
  const createSignedContractDocumentUrl = watch('signedContractDocumentUrl');
  const editSignedContractDocumentUrl = watchEdit('signedContractDocumentUrl');
  const createHourlyRates = watch('hourlyRates');
  const editHourlyRates = watchEdit('hourlyRates');

  useEffect(() => {
    if (!createHasSignedContract && createSignedContractDocumentUrl) {
      setValue('signedContractDocumentUrl', '');
    }
  }, [createHasSignedContract, createSignedContractDocumentUrl, setValue]);

  useEffect(() => {
    if (!editHasSignedContract && editSignedContractDocumentUrl) {
      setEditValue('signedContractDocumentUrl', '');
    }
  }, [editHasSignedContract, editSignedContractDocumentUrl, setEditValue]);

  const loadData = async (status: 'active' | 'inactive' | 'all' = statusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const [professorResult, activeProfessorResult, functionResult, hourlyRateLevelResult] = await Promise.all([
        professorService.list(status === 'all' ? undefined : status),
        professorService.list('active'),
        collaboratorFunctionService.list(),
        hourlyRateLevelService.list(),
      ]);
      const managerOptions = getResponsibleManagerOptions(activeProfessorResult);

      setProfessores(professorResult);
      setCollaboratorFunctions(functionResult);
      setResponsibleManagers(managerOptions);
      setHourlyRateLevels(hourlyRateLevelResult);

      const currentCreateValue = getValues('collaboratorFunctionId');
      if (!currentCreateValue) {
        setValue('collaboratorFunctionId', getDefaultCollaboratorFunctionId(functionResult));
      }

      const currentCreateResponsibleManagerId = getValues('responsibleManagerId');
      if (!currentCreateResponsibleManagerId) {
        setValue('responsibleManagerId', getDefaultResponsibleManagerId(managerOptions));
      }

      const currentEditValue = getEditValues('collaboratorFunctionId');
      if (editingId && !currentEditValue) {
        setEditValue('collaboratorFunctionId', getDefaultCollaboratorFunctionId(functionResult));
      }

      const currentEditResponsibleManagerId = getEditValues('responsibleManagerId');
      if (editingId && !currentEditResponsibleManagerId) {
        setEditValue('responsibleManagerId', getDefaultResponsibleManagerId(managerOptions));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManageProfessores) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [canManageProfessores, statusFilter]);

  const activeCollaboratorFunctions = collaboratorFunctions.filter((item) => item.isActive);
  const createRequiresResponsibleManager = requiresResponsibleManager(
    createCollaboratorFunctionId,
    collaboratorFunctions
  );
  const editRequiresResponsibleManager = requiresResponsibleManager(
    editCollaboratorFunctionId,
    collaboratorFunctions
  );

  const onSubmit = async (data: CreateProfessorForm) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await professorService.create(sanitizeCreateProfessorPayload(data));
      reset({
        phone: '',
        birthDate: '',
        cpf: '',
        rg: '',
        maritalStatus: '',
        addressStreet: '',
        addressNumber: '',
        addressComplement: '',
        addressZipCode: '',
        instagramHandle: '',
        cref: '',
        professionalSummary: '',
        lattesUrl: '',
        companyDocument: '',
        bankName: '',
        bankBranch: '',
        bankAccount: '',
        pixKey: '',
        avatar: '',
        admissionDate: '',
        currentStatus: '',
        signedContractDocumentUrl: '',
        operationalRoleIds: [],
        hourlyRates: createDefaultHourlyRatesForm(),
        hasSignedContract: false,
        collaboratorFunctionId: getDefaultCollaboratorFunctionId(collaboratorFunctions),
        responsibleManagerId: getDefaultResponsibleManagerId(responsibleManagers),
      });
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.createError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (professor: ProfessorSummary) => {
    const operationalRoleIds = professor.operationalRoleIds ?? [];

    setEditingId(professor.id);
    resetEdit({
      name: professor.user.profile.name,
      email: professor.user.email,
      password: '',
      phone: professor.user.profile.phone ?? '',
      birthDate: formatDateForInput(professor.user.profile.birthDate),
      cpf: professor.user.profile.cpf ?? '',
      rg: professor.user.profile.rg ?? '',
      maritalStatus: professor.user.profile.maritalStatus ?? '',
      addressStreet: professor.user.profile.addressStreet ?? '',
      addressNumber: professor.user.profile.addressNumber ?? '',
      addressComplement: professor.user.profile.addressComplement ?? '',
      addressZipCode: professor.user.profile.addressZipCode ?? '',
      instagramHandle: normalizeInstagramHandle(professor.user.profile.instagramHandle),
      cref: professor.user.profile.cref ?? '',
      professionalSummary: professor.user.profile.professionalSummary ?? '',
      lattesUrl: professor.user.profile.lattesUrl ?? '',
      companyDocument: professor.user.profile.companyDocument ?? '',
      bankName: professor.user.profile.bankName ?? '',
      bankBranch: professor.user.profile.bankBranch ?? '',
      bankAccount: professor.user.profile.bankAccount ?? '',
      pixKey: professor.user.profile.pixKey ?? '',
      avatar: professor.user.profile.avatar ?? '',
      admissionDate: formatDateForInput(professor.admissionDate),
      currentStatus: professor.currentStatus ?? '',
      signedContractDocumentUrl: professor.signedContractDocumentUrl ?? '',
      operationalRoleIds:
        operationalRoleIds.length > 0
          ? operationalRoleIds
          : [professor.collaboratorFunction.id],
      hourlyRates: getHourlyRatesFormValue(professor.hourlyRates),
      hasSignedContract: professor.hasSignedContract,
      collaboratorFunctionId: professor.collaboratorFunction.id,
      responsibleManagerId:
        professor.responsibleManager?.id ?? getDefaultResponsibleManagerId(responsibleManagers),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetEdit({
      name: '',
      email: '',
      password: '',
      phone: '',
      birthDate: '',
      cpf: '',
      rg: '',
      maritalStatus: '',
      addressStreet: '',
      addressNumber: '',
      addressComplement: '',
      addressZipCode: '',
      instagramHandle: '',
      cref: '',
      professionalSummary: '',
      lattesUrl: '',
      companyDocument: '',
      bankName: '',
      bankBranch: '',
      bankAccount: '',
      pixKey: '',
      avatar: '',
      admissionDate: '',
      currentStatus: '',
      signedContractDocumentUrl: '',
      operationalRoleIds: [],
      hourlyRates: createDefaultHourlyRatesForm(),
      hasSignedContract: false,
      collaboratorFunctionId: getDefaultCollaboratorFunctionId(collaboratorFunctions),
      responsibleManagerId: getDefaultResponsibleManagerId(responsibleManagers),
    });
  };

  const onSubmitEdit = async (data: EditProfessorForm) => {
    if (!editingId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await professorService.update(editingId, sanitizeUpdateProfessorPayload(data));
      await loadData();
      setEditingId(null);
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.updateError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAvatarUpload = async (file: File, mode: 'create' | 'edit') => {
    if (!file.type.startsWith('image/')) {
      setError('Selecione um arquivo de imagem válido.');
      return;
    }

    const setUploading = mode === 'create' ? setUploadingCreateAvatar : setUploadingEditAvatar;

    setUploading(true);
    setError(null);

    try {
      const avatarUrl = await professorService.uploadAvatar(file);

      if (mode === 'create') {
        setValue('avatar', avatarUrl, { shouldDirty: true, shouldValidate: true });
      } else {
        setEditValue('avatar', avatarUrl, { shouldDirty: true, shouldValidate: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao enviar foto do colaborador');
    } finally {
      setUploading(false);
    }
  };

  const handleSignedContractUpload = async (file: File, mode: 'create' | 'edit') => {
    if (file.type !== 'application/pdf') {
      setError(professoresCopy.signedContractDocumentFormatError);
      return;
    }

    const setUploading =
      mode === 'create' ? setUploadingCreateSignedContract : setUploadingEditSignedContract;

    setUploading(true);
    setError(null);

    try {
      const documentUrl = await professorService.uploadSignedContract(file);

      if (mode === 'create') {
        setValue('signedContractDocumentUrl', documentUrl, { shouldDirty: true, shouldValidate: true });
        setValue('hasSignedContract', true, { shouldDirty: true, shouldValidate: true });
      } else {
        setEditValue('signedContractDocumentUrl', documentUrl, { shouldDirty: true, shouldValidate: true });
        setEditValue('hasSignedContract', true, { shouldDirty: true, shouldValidate: true });
      }
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.signedContractDocumentMissing);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    await handleAvatarUpload(file, 'create');
  };

  const handleCreateSignedContractChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    await handleSignedContractUpload(file, 'create');
  };

  const handleEditAvatarChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    await handleAvatarUpload(file, 'edit');
  };

  const handleEditSignedContractChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    await handleSignedContractUpload(file, 'edit');
  };

  const handleRemoveCreateSignedContract = () => {
    setValue('signedContractDocumentUrl', '', { shouldDirty: true, shouldValidate: true });
    setValue('hasSignedContract', false, { shouldDirty: true, shouldValidate: true });
  };

  const handleRemoveEditSignedContract = () => {
    setEditValue('signedContractDocumentUrl', '', { shouldDirty: true, shouldValidate: true });
    setEditValue('hasSignedContract', false, { shouldDirty: true, shouldValidate: true });
  };

  const handleValidateLegalFinancial = async (professorId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await professorService.validateLegalFinancial(professorId);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.legalFinancialValidateError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (professorId: string) => {
    if (!confirm(professoresCopy.resetPasswordConfirm)) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await professorService.resetPassword(professorId);
      setResetPassword(result.tempPassword);
      setResetTarget(professorId);
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.resetPasswordError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (professorId: string) => {
    if (!confirm(professoresCopy.deactivateConfirm)) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await professorService.deactivate(professorId);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.deactivateError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActivate = async (professorId: string) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await professorService.activate(professorId);
      await loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.activateError);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canManageProfessores) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {professoresCopy.permissionError}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{professoresCopy.title}</h1>
        <p className="text-muted-foreground mt-2">
          {professoresCopy.description}
        </p>
      </div>

      {activeCollaboratorFunctions.length === 0 && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          {professoresCopy.noFunctionsAvailable}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{professoresCopy.newProfessorTitle}</CardTitle>
          <CardDescription>{professoresCopy.newProfessorDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20 mb-4">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Accordion type="single" collapsible defaultValue="access" className="rounded-2xl border border-border bg-card px-4">
              <AccordionItem value="access" className="border-none">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="space-y-1 text-left">
                    <p className="text-sm font-semibold text-foreground">Informações de acesso do colaborador</p>
                    <p className="text-sm text-muted-foreground">
                      Primeiro bloco para criar o login inicial e identificar o colaborador no sistema.
                    </p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-4 pt-0">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                      label={professoresCopy.nameLabel}
                      placeholder="Maria Souza"
                      error={errors.name?.message}
                      {...register('name')}
                    />
                    <Input
                      label={commonCopy.emailLabel}
                      type="email"
                      placeholder="maria@academia.com"
                      error={errors.email?.message}
                      {...register('email')}
                    />
                    <Input
                      label={professoresCopy.passwordLabel}
                      type="password"
                      placeholder="********"
                      error={errors.password?.message}
                      {...register('password')}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <Input
                      label={professoresCopy.phoneLabel}
                      type="tel"
                      placeholder="(11) 99999-9999"
                      error={errors.phone?.message}
                      {...register('phone', {
                        onChange: (event) => {
                          setValue('phone', formatPhone(event.target.value), {
                            shouldValidate: true,
                          });
                        },
                      })}
                    />
                    <Input
                      label={professoresCopy.cpfLabel}
                      placeholder="000.000.000-00"
                      error={errors.cpf?.message}
                      {...register('cpf', {
                        onChange: (event) => {
                          setValue('cpf', formatCpf(event.target.value), {
                            shouldValidate: true,
                          });
                        },
                      })}
                    />
                    <Input
                      label={professoresCopy.rgLabel}
                      placeholder="12.345.678-9"
                      error={errors.rg?.message}
                      {...register('rg')}
                    />
                    <Input
                      label={professoresCopy.birthDateLabel}
                      type="date"
                      error={errors.birthDate?.message}
                      {...register('birthDate')}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <label htmlFor="create-marital-status" className="mb-2 block text-sm font-medium">
                        {professoresCopy.maritalStatusLabel}
                      </label>
                      <select
                        id="create-marital-status"
                        className="ts-form-control"
                        {...register('maritalStatus')}
                      >
                        <option value="">{professoresCopy.maritalStatusPlaceholder}</option>
                        {maritalStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Input
                      label={professoresCopy.instagramLabel}
                      placeholder="@maria.souza"
                      error={errors.instagramHandle?.message}
                      {...register('instagramHandle')}
                    />
                    <Input
                      label={professoresCopy.crefLabel}
                      placeholder="000000-G/SP"
                      error={errors.cref?.message}
                      {...register('cref')}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    <div className="md:col-span-2">
                      <Input
                        label={professoresCopy.addressStreetLabel}
                        placeholder="Rua Exemplo"
                        error={errors.addressStreet?.message}
                        {...register('addressStreet')}
                      />
                    </div>
                    <Input
                      label={professoresCopy.addressNumberLabel}
                      placeholder="123"
                      error={errors.addressNumber?.message}
                      {...register('addressNumber')}
                    />
                    <Input
                      label={professoresCopy.addressZipCodeLabel}
                      placeholder="00000-000"
                      error={errors.addressZipCode?.message}
                      {...register('addressZipCode', {
                        onChange: (event) => {
                          setValue('addressZipCode', formatZipCode(event.target.value), {
                            shouldValidate: true,
                          });
                        },
                      })}
                    />
                  </div>
                  <Input
                    label={professoresCopy.addressComplementLabel}
                    placeholder="Apto 42, bloco B"
                    error={errors.addressComplement?.message}
                    {...register('addressComplement')}
                  />
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-foreground">
                        {professoresCopy.professionalSummaryLabel}
                      </label>
                      <textarea
                        className={textareaClassName}
                        placeholder={professoresCopy.professionalSummaryPlaceholder}
                        {...register('professionalSummary')}
                      />
                      {errors.professionalSummary?.message && (
                        <p className="mt-1 text-sm text-destructive">
                          {errors.professionalSummary.message}
                        </p>
                      )}
                    </div>
                    <Input
                      label={professoresCopy.lattesLabel}
                      type="url"
                      placeholder={professoresCopy.lattesPlaceholder}
                      error={errors.lattesUrl?.message}
                      {...register('lattesUrl')}
                    />
                  </div>
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-sm font-medium text-foreground">
                      {professoresCopy.legalFinancialSectionTitle}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {professoresCopy.legalFinancialSectionDescription}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {professoresCopy.legalFinancialValidationHint}
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <Input
                        label={professoresCopy.companyDocumentLabel}
                        placeholder="00.000.000/0000-00"
                        error={errors.companyDocument?.message}
                        {...register('companyDocument', {
                          onChange: (event) => {
                            setValue('companyDocument', formatCnpj(event.target.value), {
                              shouldValidate: true,
                            });
                          },
                        })}
                      />
                      <Input
                        label={professoresCopy.bankNameLabel}
                        placeholder="Banco do Brasil"
                        error={errors.bankName?.message}
                        {...register('bankName')}
                      />
                      <Input
                        label={professoresCopy.pixKeyLabel}
                        placeholder="pix@empresa.com"
                        error={errors.pixKey?.message}
                        {...register('pixKey')}
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Input
                        label={professoresCopy.bankBranchLabel}
                        placeholder="1234"
                        error={errors.bankBranch?.message}
                        {...register('bankBranch')}
                      />
                      <Input
                        label={professoresCopy.bankAccountLabel}
                        placeholder="12345-6"
                        error={errors.bankAccount?.message}
                        {...register('bankAccount')}
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <Accordion type="single" collapsible defaultValue="management" className="rounded-2xl border border-border bg-card px-4">
              <AccordionItem value="management" className="border-none">
                <AccordionTrigger className="py-4 hover:no-underline">
                  <div className="space-y-1 text-left">
                    <p className="text-sm font-semibold text-foreground">Configurações da gestão</p>
                    <p className="text-sm text-muted-foreground">
                      Classificação operacional e dados acompanhados pela gestão do contrato.
                    </p>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-4 pt-0">
                  <input type="hidden" {...register('avatar')} />
                  <input type="hidden" {...register('signedContractDocumentUrl')} />
                  <input
                    ref={createAvatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    aria-label="Upload da foto do colaborador"
                    title="Upload da foto do colaborador"
                    onChange={handleCreateAvatarChange}
                  />
                  <input
                    ref={createSignedContractInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    aria-label="Upload do contrato assinado"
                    title="Upload do contrato assinado"
                    onChange={handleCreateSignedContractChange}
                  />
                  <AvatarUploadField
                    name={watch('name')}
                    avatar={createAvatarUrl}
                    isUploading={uploadingCreateAvatar}
                    onUploadClick={() => createAvatarInputRef.current?.click()}
                    onRemove={() => setValue('avatar', '', { shouldDirty: true, shouldValidate: true })}
                  />
                  {createRequiresResponsibleManager && (
                    <div>
                      <label htmlFor="create-responsible-manager" className="mb-2 block text-sm font-medium">
                        {professoresCopy.responsibleManagerLabel}
                      </label>
                      <select
                        id="create-responsible-manager"
                        className="ts-form-control"
                        {...register('responsibleManagerId')}
                        disabled={responsibleManagers.length === 0}
                      >
                        <option value="">{professoresCopy.selectResponsibleManager}</option>
                        {responsibleManagers.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.user?.profile?.name || professoresCopy.noName}
                          </option>
                        ))}
                      </select>
                      {responsibleManagers.length === 0 && (
                        <p className="mt-1 text-sm text-destructive">
                          {professoresCopy.noResponsibleManagersAvailable}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Input
                      label={professoresCopy.admissionDateLabel}
                      type="date"
                      error={errors.admissionDate?.message}
                      {...register('admissionDate')}
                    />
                    <div>
                      <label htmlFor="create-current-status" className="mb-2 block text-sm font-medium">
                        {professoresCopy.currentStatusLabel}
                      </label>
                      <select
                        id="create-current-status"
                        className="ts-form-control"
                        {...register('currentStatus')}
                      >
                        <option value="">{professoresCopy.currentStatusPlaceholder}</option>
                        {currentStatusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {errors.currentStatus?.message ? (
                        <p className="mt-2 text-sm text-destructive">{errors.currentStatus.message}</p>
                      ) : null}
                    </div>
                    <label className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-sm">
                      <input type="checkbox" className="h-4 w-4" {...register('hasSignedContract')} />
                      <span>{professoresCopy.hasSignedContractLabel}</span>
                    </label>
                  </div>
                  {createHasSignedContract && (
                    <SignedContractUploadField
                      documentUrl={createSignedContractDocumentUrl}
                      onUploadClick={() => createSignedContractInputRef.current?.click()}
                      onRemove={handleRemoveCreateSignedContract}
                      isUploading={uploadingCreateSignedContract}
                      error={errors.signedContractDocumentUrl?.message}
                      required={createHasSignedContract}
                    />
                  )}
                  <div className="rounded-2xl border border-border p-4">
                    <p className="text-sm font-medium text-foreground">
                      {professoresCopy.collaboratorFunctionLabel}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Selecione a função operacional cadastrada para este colaborador.
                    </p>
                    <div className="mt-3">
                      <select
                        id="create-collaborator-function"
                        className="ts-form-control"
                        {...register('collaboratorFunctionId')}
                        disabled={activeCollaboratorFunctions.length === 0}
                      >
                        <option value="">Selecione uma função</option>
                        {activeCollaboratorFunctions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                      {errors.collaboratorFunctionId?.message && (
                        <p className="mt-1 text-sm text-destructive">
                          {errors.collaboratorFunctionId.message}
                        </p>
                      )}
                    </div>
                  </div>
                  <HourlyRatesMatrix
                    errors={{
                      personal: errors.hourlyRates?.personal?.message,
                      consulting: errors.hourlyRates?.consulting?.message,
                      evaluation: errors.hourlyRates?.evaluation?.message,
                    }}
                    getInputProps={(sectionKey) => register(`hourlyRates.${sectionKey}` as const)}
                    values={createHourlyRates}
                    levels={hourlyRateLevels}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                isLoading={isSubmitting}
                disabled={
                  activeCollaboratorFunctions.length === 0 ||
                  (createRequiresResponsibleManager && responsibleManagers.length === 0)
                }
              >
                {professoresCopy.createProfessor}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{professoresCopy.listTitle}</CardTitle>
          <CardDescription>{professoresCopy.listDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 w-full md:max-w-52">
            <label htmlFor="professores-status-filter" className="mb-2 block text-sm font-medium">
              {professoresCopy.statusLabel}
            </label>
            <select
              id="professores-status-filter"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'active' | 'inactive' | 'all')
              }
              className="ts-form-control"
              disabled={loading || isSubmitting}
            >
              <option value="active">{professoresCopy.statusActive}</option>
              <option value="inactive">{professoresCopy.statusInactive}</option>
              <option value="all">{professoresCopy.statusAll}</option>
            </select>
          </div>
          {loading ? (
            <div className="text-muted-foreground">{professoresCopy.loading}</div>
          ) : professores.length === 0 ? (
            <div className="text-muted-foreground">{professoresCopy.empty}</div>
          ) : (
            <div className="space-y-3">
              {professores.map((professor) => (
                <div
                  key={professor.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  {editingId === professor.id ? (
                    <form
                      onSubmit={handleSubmitEdit(onSubmitEdit)}
                      className="flex-1 space-y-3"
                    >
                      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">{professoresCopy.personalDataSectionTitle}</p>
                        <p className="mt-1">{professoresCopy.personalDataSectionDescription}</p>
                      </div>
                      <input type="hidden" {...registerEdit('avatar')} />
                      <input
                        ref={editAvatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        aria-label="Upload da foto do colaborador"
                        title="Upload da foto do colaborador"
                        onChange={handleEditAvatarChange}
                      />
                      <AvatarUploadField
                        name={watchEdit('name') || professor.user?.profile?.name}
                        avatar={editAvatarUrl}
                        isUploading={uploadingEditAvatar}
                        onUploadClick={() => editAvatarInputRef.current?.click()}
                        onRemove={() =>
                          setEditValue('avatar', '', { shouldDirty: true, shouldValidate: true })
                        }
                      />
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                          label={professoresCopy.nameLabel}
                          error={editErrors.name?.message}
                          {...registerEdit('name')}
                        />
                        <Input
                          label={commonCopy.emailLabel}
                          type="email"
                          error={editErrors.email?.message}
                          {...registerEdit('email')}
                        />
                        <Input
                          label={professoresCopy.phoneLabel}
                          type="tel"
                          placeholder="(11) 99999-9999"
                          error={editErrors.phone?.message}
                          {...registerEdit('phone', {
                            onChange: (event) => {
                              setEditValue('phone', formatPhone(event.target.value), {
                                shouldValidate: true,
                              });
                            },
                          })}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                          label={professoresCopy.cpfLabel}
                          placeholder="000.000.000-00"
                          error={editErrors.cpf?.message}
                          {...registerEdit('cpf', {
                            onChange: (event) => {
                              setEditValue('cpf', formatCpf(event.target.value), {
                                shouldValidate: true,
                              });
                            },
                          })}
                        />
                        <Input
                          label={professoresCopy.rgLabel}
                          placeholder="12.345.678-9"
                          error={editErrors.rg?.message}
                          {...registerEdit('rg')}
                        />
                        <Input
                          label={professoresCopy.birthDateLabel}
                          type="date"
                          error={editErrors.birthDate?.message}
                          {...registerEdit('birthDate')}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label htmlFor={`edit-marital-status-${professor.id}`} className="mb-2 block text-sm font-medium">
                            {professoresCopy.maritalStatusLabel}
                          </label>
                          <select
                            id={`edit-marital-status-${professor.id}`}
                            className="ts-form-control"
                            {...registerEdit('maritalStatus')}
                          >
                            <option value="">{professoresCopy.maritalStatusPlaceholder}</option>
                            {maritalStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Input
                          label={professoresCopy.instagramLabel}
                          placeholder="@maria.souza"
                          error={editErrors.instagramHandle?.message}
                          {...registerEdit('instagramHandle')}
                        />
                        <Input
                          label={professoresCopy.crefLabel}
                          placeholder="000000-G/SP"
                          error={editErrors.cref?.message}
                          {...registerEdit('cref')}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                          label={professoresCopy.addressStreetLabel}
                          placeholder="Rua Exemplo, 123"
                          error={editErrors.addressStreet?.message}
                          {...registerEdit('addressStreet')}
                        />
                        <Input
                          label={professoresCopy.addressNumberLabel}
                          placeholder="123"
                          error={editErrors.addressNumber?.message}
                          {...registerEdit('addressNumber')}
                        />
                        <Input
                          label={professoresCopy.addressComplementLabel}
                          placeholder="Apto 42"
                          error={editErrors.addressComplement?.message}
                          {...registerEdit('addressComplement')}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                          label={professoresCopy.addressZipCodeLabel}
                          placeholder="00000-000"
                          error={editErrors.addressZipCode?.message}
                          {...registerEdit('addressZipCode', {
                            onChange: (event) => {
                              setEditValue('addressZipCode', formatZipCode(event.target.value), {
                                shouldValidate: true,
                              });
                            },
                          })}
                        />
                        <div>
                          <label htmlFor={`edit-collaborator-function-${professor.id}`} className="mb-2 block text-sm font-medium">
                            {professoresCopy.collaboratorFunctionLabel}
                          </label>
                          <select id={`edit-collaborator-function-${professor.id}`} className="ts-form-control" {...registerEdit('collaboratorFunctionId')}>
                            {collaboratorFunctions
                              .filter(
                                (option) =>
                                  option.isActive || option.id === professor.collaboratorFunction.id
                              )
                              .map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                          {editErrors.collaboratorFunctionId?.message && (
                            <p className="mt-1 text-sm text-destructive">
                              {editErrors.collaboratorFunctionId.message}
                            </p>
                          )}
                        </div>
                        <Input
                          label={professoresCopy.newPasswordLabel}
                          type="password"
                          placeholder={professoresCopy.keepCurrentPassword}
                          error={editErrors.password?.message}
                          {...registerEdit('password')}
                        />
                      </div>
                      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">{professoresCopy.professionalDataSectionTitle}</p>
                        <p className="mt-1">{professoresCopy.professionalDataSectionDescription}</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-foreground">
                            {professoresCopy.professionalSummaryLabel}
                          </label>
                          <textarea
                            className={textareaClassName}
                            placeholder={professoresCopy.professionalSummaryPlaceholder}
                            {...registerEdit('professionalSummary')}
                          />
                          {editErrors.professionalSummary?.message && (
                            <p className="mt-1 text-sm text-destructive">
                              {editErrors.professionalSummary.message}
                            </p>
                          )}
                        </div>
                        <Input
                          label={professoresCopy.lattesLabel}
                          type="url"
                          placeholder={professoresCopy.lattesPlaceholder}
                          error={editErrors.lattesUrl?.message}
                          {...registerEdit('lattesUrl')}
                        />
                      </div>
                      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">{professoresCopy.legalFinancialSectionTitle}</p>
                        <p className="mt-1">{professoresCopy.legalFinancialSectionDescription}</p>
                        <p className="mt-2 text-xs">{professoresCopy.legalFinancialValidationHint}</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                          label={professoresCopy.companyDocumentLabel}
                          placeholder="00.000.000/0000-00"
                          error={editErrors.companyDocument?.message}
                          {...registerEdit('companyDocument', {
                            onChange: (event) => {
                              setEditValue('companyDocument', formatCnpj(event.target.value), {
                                shouldValidate: true,
                              });
                            },
                          })}
                        />
                        <Input
                          label={professoresCopy.bankNameLabel}
                          placeholder="Banco do Brasil"
                          error={editErrors.bankName?.message}
                          {...registerEdit('bankName')}
                        />
                        <Input
                          label={professoresCopy.pixKeyLabel}
                          placeholder="pix@empresa.com"
                          error={editErrors.pixKey?.message}
                          {...registerEdit('pixKey')}
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <Input
                          label={professoresCopy.bankBranchLabel}
                          placeholder="1234"
                          error={editErrors.bankBranch?.message}
                          {...registerEdit('bankBranch')}
                        />
                        <Input
                          label={professoresCopy.bankAccountLabel}
                          placeholder="12345-6"
                          error={editErrors.bankAccount?.message}
                          {...registerEdit('bankAccount')}
                        />
                      </div>
                      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                        <p className="font-medium text-foreground">{professoresCopy.operationalDataSectionTitle}</p>
                        <p className="mt-1">{professoresCopy.operationalDataSectionDescription}</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <Input
                          label={professoresCopy.admissionDateLabel}
                          type="date"
                          error={editErrors.admissionDate?.message}
                          {...registerEdit('admissionDate')}
                        />
                        <div>
                          <label htmlFor={`edit-current-status-${professor.id}`} className="mb-2 block text-sm font-medium">
                            {professoresCopy.currentStatusLabel}
                          </label>
                          <select
                            id={`edit-current-status-${professor.id}`}
                            className="ts-form-control"
                            {...registerEdit('currentStatus')}
                          >
                            <option value="">{professoresCopy.currentStatusPlaceholder}</option>
                            {currentStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {editErrors.currentStatus?.message ? (
                            <p className="mt-2 text-sm text-destructive">{editErrors.currentStatus.message}</p>
                          ) : null}
                        </div>
                        <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            {...registerEdit('hasSignedContract')}
                          />
                          <span>{professoresCopy.hasSignedContractLabel}</span>
                        </label>
                      </div>
                      <input type="hidden" {...registerEdit('signedContractDocumentUrl')} />
                      <input
                        ref={editSignedContractInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        aria-label="Upload do contrato assinado"
                        title="Upload do contrato assinado"
                        onChange={handleEditSignedContractChange}
                      />
                      {editHasSignedContract && (
                        <SignedContractUploadField
                          documentUrl={editSignedContractDocumentUrl}
                          onUploadClick={() => editSignedContractInputRef.current?.click()}
                          onRemove={handleRemoveEditSignedContract}
                          isUploading={uploadingEditSignedContract}
                          error={editErrors.signedContractDocumentUrl?.message}
                          required={editHasSignedContract}
                        />
                      )}
                      <div className="rounded-lg border border-border p-4">
                        <p className="text-sm font-medium text-foreground">
                          {professoresCopy.collaboratorFunctionLabel}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Selecione a função operacional cadastrada para este colaborador.
                        </p>
                        <div className="mt-3">
                          <select
                            id={`edit-management-collaborator-function-${professor.id}`}
                            className="ts-form-control"
                            {...registerEdit('collaboratorFunctionId')}
                          >
                            {collaboratorFunctions
                              .filter(
                                (option) =>
                                  option.isActive || option.id === professor.collaboratorFunction.id
                              )
                              .map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.name}
                                </option>
                              ))}
                          </select>
                          {editErrors.collaboratorFunctionId?.message && (
                            <p className="mt-1 text-sm text-destructive">
                              {editErrors.collaboratorFunctionId.message}
                            </p>
                          )}
                        </div>
                      </div>
                      <HourlyRatesMatrix
                        errors={{
                          personal: editErrors.hourlyRates?.personal?.message,
                          consulting: editErrors.hourlyRates?.consulting?.message,
                          evaluation: editErrors.hourlyRates?.evaluation?.message,
                        }}
                        getInputProps={(sectionKey) => registerEdit(`hourlyRates.${sectionKey}` as const)}
                        values={editHourlyRates}
                        levels={hourlyRateLevels}
                      />
                      {editRequiresResponsibleManager && (
                        <div>
                          <label htmlFor={`edit-responsible-manager-${professor.id}`} className="mb-2 block text-sm font-medium">
                            {professoresCopy.responsibleManagerLabel}
                          </label>
                          <select
                            id={`edit-responsible-manager-${professor.id}`}
                            className="ts-form-control"
                            {...registerEdit('responsibleManagerId')}
                          >
                            <option value="">{professoresCopy.selectResponsibleManager}</option>
                            {responsibleManagers
                              .filter((manager) => manager.id !== professor.id)
                              .map((manager) => (
                                <option key={manager.id} value={manager.id}>
                                  {manager.user?.profile?.name || professoresCopy.noName}
                                </option>
                              ))}
                          </select>
                          {responsibleManagers.length === 0 && (
                            <p className="mt-1 text-sm text-destructive">
                              {professoresCopy.noResponsibleManagersAvailable}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={cancelEdit}>
                          {commonCopy.cancel}
                        </Button>
                        <Button type="submit" isLoading={isSubmitting}>
                          {commonCopy.save}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-start gap-4">
                        <CollaboratorAvatar
                          name={professor.user?.profile?.name}
                          avatar={professor.user?.profile?.avatar}
                        />
                        <div>
                          <p className="font-medium">
                            {professor.user?.profile?.name || professoresCopy.noName}
                          </p>
                          <p className="text-sm text-muted-foreground">{professor.user?.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.phoneLabel}:{' '}
                          {professor.user?.profile?.phone || commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.birthDateLabel}:{' '}
                          {professor.user?.profile?.birthDate
                            ? new Date(professor.user.profile.birthDate).toLocaleDateString('pt-BR')
                            : commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.cpfLabel}:{' '}
                          {professor.user?.profile?.cpf || commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.crefLabel}:{' '}
                          {professor.user?.profile?.cref || commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.instagramLabel}:{' '}
                          {professor.user?.profile?.instagramHandle
                            ? normalizeInstagramHandle(professor.user.profile.instagramHandle)
                            : commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.lattesLabel}:{' '}
                          {professor.user?.profile?.lattesUrl || commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.professionalSummaryLabel}:{' '}
                          {professor.user?.profile?.professionalSummary || commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.companyDocumentLabel}:{' '}
                          {professor.user?.profile?.companyDocument || commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.bankNameLabel}:{' '}
                          {professor.user?.profile?.bankName || commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.bankBranchLabel}/{professoresCopy.bankAccountLabel}:{' '}
                          {professor.user?.profile?.bankBranch || commonCopy.notInformed} /{' '}
                          {professor.user?.profile?.bankAccount || commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.pixKeyLabel}:{' '}
                          {professor.user?.profile?.pixKey || commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.legalFinancialSectionTitle}:{' '}
                          {getLegalFinancialStatus(professor.user.profile)}
                        </p>
                        {professor.user?.profile?.legalFinancialProvidedAt && (
                          <p className="text-xs text-muted-foreground">
                            Preenchido em{' '}
                            {new Date(professor.user.profile.legalFinancialProvidedAt).toLocaleString('pt-BR')}
                            {professor.user.profile.legalFinancialProvidedByProfessor?.user?.profile?.name
                              ? ` por ${professor.user.profile.legalFinancialProvidedByProfessor.user.profile.name}`
                              : ''}
                          </p>
                        )}
                        {professor.user?.profile?.legalFinancialValidatedAt && (
                          <p className="text-xs text-muted-foreground">
                            Validado em{' '}
                            {new Date(professor.user.profile.legalFinancialValidatedAt).toLocaleString('pt-BR')}
                            {professor.user.profile.legalFinancialValidatedByProfessor?.user?.profile?.name
                              ? ` por ${professor.user.profile.legalFinancialValidatedByProfessor.user.profile.name}`
                              : ''}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.collaboratorFunctionLabel}:{' '}
                          {professor.collaboratorFunction.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.admissionDateLabel}:{' '}
                          {professor.admissionDate
                            ? new Date(professor.admissionDate).toLocaleDateString('pt-BR')
                            : commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.currentStatusLabel}:{' '}
                          {professor.currentStatus || commonCopy.notInformed}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.hasSignedContractLabel}:{' '}
                          {professor.hasSignedContract
                            ? professoresCopy.signedContractYes
                            : professoresCopy.signedContractNo}
                        </p>
                        {professor.signedContractDocumentUrl && (
                          <p className="text-xs text-muted-foreground">
                            <a
                              href={professor.signedContractDocumentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {professoresCopy.signedContractDocumentView}
                            </a>
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.hourlyRatePersonalLabel}:{' '}
                          {formatHourlyRateSummary(professor.hourlyRates?.personal, hourlyRateLevels)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.hourlyRateConsultingLabel}:{' '}
                          {formatHourlyRateSummary(professor.hourlyRates?.consulting, hourlyRateLevels)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.hourlyRateEvaluationLabel}:{' '}
                          {formatHourlyRateSummary(professor.hourlyRates?.evaluation, hourlyRateLevels)}
                        </p>
                        {(professor.responsibleManager || professor.collaboratorFunction.code !== 'manager') && (
                          <p className="text-xs text-muted-foreground">
                            {professoresCopy.responsibleManagerLabel}:{' '}
                            {professor.responsibleManager?.user?.profile?.name ||
                              professoresCopy.noResponsibleManager}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.lastAccess}:{' '}
                          {professor.user.lastLoginAt
                            ? new Date(professor.user.lastLoginAt).toLocaleString()
                            : professoresCopy.neverAccessed}
                        </p>
                        {resetTarget === professor.id && resetPassword && (
                          <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2">
                            {professoresCopy.temporaryPassword}: <span className="font-mono">{resetPassword}</span>
                          </div>
                        )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs rounded-full px-2 py-1 bg-muted">
                          {professor.role === 'master' ? professoresCopy.masterRole : professoresCopy.professorRole}
                        </span>
                        {professor.user?.isActive === false && (
                          <span className="text-xs rounded-full px-2 py-1 bg-red-100 text-red-700">
                            {professoresCopy.deactivated}
                          </span>
                        )}
                        {professor.role !== 'master' && (
                          <>
                            {professor.user?.isActive === false ? (
                              <Button
                                variant="secondary"
                                onClick={() => handleActivate(professor.id)}
                                isLoading={isSubmitting}
                              >
                                {professoresCopy.activate}
                              </Button>
                            ) : (
                              <>
                                <Button variant="outline" onClick={() => startEdit(professor)}>
                                  {professoresCopy.edit}
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => handleValidateLegalFinancial(professor.id)}
                                  isLoading={isSubmitting}
                                  disabled={!canValidateLegalFinancial(professor.user.profile)}
                                >
                                  {professoresCopy.legalFinancialValidateAction}
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => handleResetPassword(professor.id)}
                                  isLoading={isSubmitting}
                                >
                                  {professoresCopy.resetPassword}
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleDeactivate(professor.id)}
                                  isLoading={isSubmitting}
                                >
                                  {professoresCopy.deactivate}
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
