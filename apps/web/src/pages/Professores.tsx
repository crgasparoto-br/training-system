import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FocusEvent } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Briefcase,
  Camera,
  Edit3,
  ExternalLink,
  FileText,
  Filter,
  KeyRound,
  Mail,
  Phone,
  RotateCcw,
  Search,
  ShieldCheck,
  Upload,
  UserCheck,
  UserRound,
  UserX,
  X,
} from 'lucide-react';
import { bankService } from '../services/bank.service';
import { collaboratorFunctionService } from '../services/collaborator-function.service';
import { formatCep, getCepLookupFeedbackMessage, lookupCep, onlyCepDigits } from '../services/cep.service';
import { hourlyRateLevelService } from '../services/hourly-rate-level.service';
import { professorService } from '../services/professor.service';
import type {
  BankOption,
  CollaboratorFunctionOption,
  HourlyRateLevel,
  ProfessorHourlyRates,
  ProfessorMaritalStatus,
  ProfessorSummary,
} from '@corrida/types';
import { useAuthStore } from '../stores/useAuthStore';
import { canAccessBlock, canAccessScreen, getDataScopeForScreen } from '../access/access-control';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { commonCopy, professoresCopy } from '../i18n/ptBR';
import { getHourlyRateLevelBadgeClassName } from '../utils/hourlyRateLevelTone';
import { resolveAssetUrl } from '../utils/assetUrl';
import { cn } from '@/utils/cn';

const ACCESS_REFRESH_SIGNAL_KEY = 'auth-permissions-updated-at';

const optionalUrlField = (message: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return value;
      }

      const trimmedValue = value.trim();
      return trimmedValue.length === 0 ? undefined : trimmedValue;
    },
    z.string().trim().url(message).optional()
  );

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
  addressNeighborhood: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressComplement: z.string().optional(),
  addressZipCode: z.string().optional(),
  instagramHandle: z.string().optional(),
  cref: z.string().optional(),
  professionalSummary: z.string().optional(),
  lattesUrl: optionalUrlField('URL do curriculo inválida'),
  companyDocument: z.string().optional(),
  bankCode: z.string().optional(),
  bankBranch: z.string().optional(),
  bankAccount: z.string().optional(),
  pixKey: z.string().optional(),
  avatar: optionalUrlField('URL da foto inválida'),
  admissionDate: z.string().optional(),
  dismissalDate: z.string().optional(),
  currentStatus: z.string().optional(),
  signedContractDocumentUrl: optionalUrlField('URL do contrato inválida'),
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
  addressNeighborhood: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressComplement: z.string().optional(),
  addressZipCode: z.string().optional(),
  instagramHandle: z.string().optional(),
  cref: z.string().optional(),
  professionalSummary: z.string().optional(),
  lattesUrl: optionalUrlField('URL do curriculo inválida'),
  companyDocument: z.string().optional(),
  bankCode: z.string().optional(),
  bankBranch: z.string().optional(),
  bankAccount: z.string().optional(),
  pixKey: z.string().optional(),
  avatar: optionalUrlField('URL da foto inválida'),
  admissionDate: z.string().optional(),
  dismissalDate: z.string().optional(),
  currentStatus: z.string().optional(),
  signedContractDocumentUrl: optionalUrlField('URL do contrato inválida'),
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

interface ProfessoresProps {
  mode?: 'manage' | 'consult';
}

type ConsultContractFilter = 'all' | 'signed' | 'pending';
type ConsultLegalFinancialFilter = 'all' | 'validated' | 'pending' | 'not_provided';
type ConsultBadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

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

const consultContractFilterOptions: Array<{ value: ConsultContractFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'signed', label: 'Contrato assinado' },
  { value: 'pending', label: 'Contrato pendente' },
];

const consultLegalFinancialFilterOptions: Array<{ value: ConsultLegalFinancialFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'validated', label: professoresCopy.legalFinancialValidated },
  { value: 'pending', label: professoresCopy.legalFinancialPending },
  { value: 'not_provided', label: professoresCopy.legalFinancialNotProvided },
];

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
  return resolveAssetUrl(avatar);
}

function AvatarUploadField({
  name,
  avatar,
  size = 'md',
  embedded = false,
  isUploading,
  onUploadClick,
  onRemove,
}: {
  name?: string;
  avatar?: string;
  size?: 'sm' | 'md' | 'lg';
  embedded?: boolean;
  isUploading: boolean;
  onUploadClick: () => void;
  onRemove: () => void;
}) {
  const resolvedAvatar = resolveAvatarUrl(avatar);
  const hasAvatar = !!resolvedAvatar;
  const sizeClassName =
    size === 'sm'
      ? 'h-[144px] w-[144px] text-sm'
      : size === 'lg'
        ? 'h-[192px] w-[192px] text-xl'
        : 'h-[168px] w-[168px] text-lg';

  return (
    <div className={`${embedded ? 'w-full' : 'mx-auto w-full max-w-[260px]'} rounded-lg border border-border bg-card p-3`}>
      {embedded ? (
        isUploading ? (
          <div className="mb-3 flex justify-end">
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              Enviando...
            </span>
          </div>
        ) : null
      ) : (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Foto do colaborador</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {hasAvatar
                ? 'Passe o mouse sobre a imagem para trocar ou remover a foto atual.'
                : 'Envie uma foto para facilitar a identificação do colaborador.'}
            </p>
          </div>
          {isUploading ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              Enviando...
            </span>
          ) : null}
        </div>
      )}
      <div className="group relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-background to-secondary/30">
        <div className="flex justify-center px-3 pt-3">
          <div className={`relative flex items-center justify-center overflow-hidden rounded-[28px] border border-border bg-gradient-to-br from-primary/10 via-background to-secondary/30 font-semibold text-foreground ${sizeClassName}`}>
          {hasAvatar ? (
            <img src={resolvedAvatar} alt={name || professoresCopy.nameLabel} className="h-full w-full object-cover" />
          ) : (
            <span className="text-5xl">{getAvatarInitials(name)}</span>
          )}
          {!hasAvatar && !isUploading && (
            <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center text-foreground/80">
              <Camera size={24} />
            </div>
          )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100" />
            <div className="absolute inset-x-0 bottom-0 p-2.5">
              <div className="flex translate-y-0 flex-col gap-2 transition sm:translate-y-3 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:group-focus-within:translate-y-0 sm:group-focus-within:opacity-100">
              <button
                type="button"
                onClick={onUploadClick}
                disabled={isUploading}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-background/95 px-4 text-sm font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Upload size={14} />
                {hasAvatar ? 'Trocar foto' : 'Enviar foto'}
              </button>
              <button
                type="button"
                onClick={onRemove}
                disabled={!hasAvatar || isUploading}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-white/35 bg-black/35 px-4 text-sm font-medium text-white backdrop-blur transition hover:bg-black/45 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Remover foto
              </button>
            </div>
          </div>
        </div>
        </div>
        <div className="border-t border-border/70 bg-background/95 px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">{name?.trim() || 'Colaborador sem nome informado'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasAvatar ? 'Imagem pronta para revisão visual no cadastro.' : 'Nenhuma foto enviada até o momento.'}
          </p>
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

function SignedContractToggleField({
  inputId,
  checked,
  onChange,
  documentUrl,
}: {
  inputId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  documentUrl?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm">
      <label htmlFor={inputId} className="flex items-center gap-3 text-sm">
        <input
          id={inputId}
          type="checkbox"
          className="h-4 w-4"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{professoresCopy.hasSignedContractLabel}</span>
      </label>
      {documentUrl ? (
        <a
          href={documentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-primary transition hover:bg-muted"
          title={professoresCopy.signedContractDocumentView}
        >
          <span>PDF</span>
          <ExternalLink size={12} />
        </a>
      ) : null}
    </div>
  );
}

function ManagerOverviewCard({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: Array<{
    label: string;
    value: string;
    tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  }>;
}) {
  const toneClassNames: Record<NonNullable<(typeof items)[number]['tone']>, string> = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="rounded-lg border border-border bg-background p-4 shadow-[var(--shadow-card)]">
      <div className="mb-4">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {items.map((item) => {
          const tone = item.tone ?? 'default';

          return (
            <div key={`${item.label}-${item.value}`} className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {item.label}
              </p>
              <span
                className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${toneClassNames[tone]}`}
              >
                {item.value}
              </span>
            </div>
          );
        })}
      </div>
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
type CollaboratorRegistrationTab = 'collaborator' | 'manager';

const collaboratorTabFields = [
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
  'bankBranch',
  'bankAccount',
  'pixKey',
  'avatar',
] as const;

function getRegistrationTabFromErrors(errors: FieldErrors<CreateProfessorForm | EditProfessorForm>): CollaboratorRegistrationTab {
  for (const field of collaboratorTabFields) {
    if (field in errors) {
      return 'collaborator';
    }
  }

  return 'manager';
}

function RegistrationTabButton({
  id,
  isActive,
  label,
  icon: Icon,
  onClick,
}: {
  id: string;
  isActive: boolean;
  label: string;
  icon: typeof UserRound;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      className={`inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-card text-primary shadow-sm ring-1 ring-border'
          : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function hasConfiguredHourlyRateLevels(levels: HourlyRateLevel[]) {
  return levels.some(
    (level) =>
      level.isActive !== false &&
      typeof level.minValue === 'number' &&
      typeof level.maxValue === 'number'
  );
}

function normalizePtBrHourlyRateInput(value: string) {
  const sanitizedValue = value.replace(/[^\d,.-]/g, '').replace(/\./g, ',');
  const isNegative = sanitizedValue.startsWith('-');
  const unsignedValue = sanitizedValue.replace(/-/g, '');
  const [integerPartRaw = '', ...decimalParts] = unsignedValue.split(',');
  const integerPart = integerPartRaw.replace(/\D/g, '');
  const decimalPart = decimalParts.join('').replace(/\D/g, '').slice(0, 2);
  const prefix = isNegative ? '-' : '';

  if (unsignedValue.includes(',')) {
    return `${prefix}${integerPart},${decimalPart}`;
  }

  return `${prefix}${integerPart}`;
}

function formatPtBrHourlyRateValue(value?: string) {
  const parsedValue = parseHourlyRateValue(value);

  if (parsedValue === null) {
    return value?.trim() ? value : '';
  }

  return parsedValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getHourlyRateLevelLabel(value: string | undefined, levels: HourlyRateLevel[]) {
  const parsedValue = parseHourlyRateValue(value);

  if (parsedValue === null) {
    return professoresCopy.hourlyRatesNotConfigured;
  }

  if (!hasConfiguredHourlyRateLevels(levels)) {
    return professoresCopy.hourlyRateLevelPendingConfig;
  }

  const configuredLevels = levels.filter(
    (level): level is HourlyRateLevel & { minValue: number; maxValue: number } =>
      level.isActive !== false &&
      typeof level.minValue === 'number' &&
      typeof level.maxValue === 'number'
  );

  const matchingLevel = configuredLevels
    .sort((first, second) => first.order - second.order)
    .find(
      (level) => parsedValue >= level.minValue && parsedValue <= level.maxValue
    );

  return matchingLevel?.label ?? professoresCopy.hourlyRateLevelUnclassified;
}

function HourlyRatesMatrix({
  errors,
  getInputProps,
  onValueChange,
  onValueBlur,
  values,
  levels,
}: {
  errors?: HourlyRateErrors;
  getInputProps: (sectionKey: HourlyRateSectionKey) => Record<string, unknown>;
  onValueChange: (sectionKey: HourlyRateSectionKey, value: string) => void;
  onValueBlur: (sectionKey: HourlyRateSectionKey) => void;
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
                {(() => {
                  const inputProps = getInputProps(section.key) as {
                    name?: string;
                    onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
                    ref?: React.Ref<HTMLInputElement>;
                  };

                  return (
                <input
                  type="text"
                  inputMode="decimal"
                  className={hourlyRateInputClassName}
                  name={inputProps.name}
                  ref={inputProps.ref}
                  value={values?.[section.key] ?? ''}
                  aria-label={`Valor/hora ${section.label.toLowerCase()}`}
                  placeholder="0,00"
                  onChange={(event) => onValueChange(section.key, normalizePtBrHourlyRateInput(event.target.value))}
                  onBlur={(event) => {
                    onValueBlur(section.key);
                    inputProps.onBlur?.(event);
                  }}
                />
                  );
                })()}
                {errors?.[section.key] && (
                  <p className="mt-1 text-xs text-destructive">{errors[section.key]}</p>
                )}
              </div>
              <div className="flex items-center justify-center bg-white px-3 py-3">
                {(() => {
                  const levelLabel = getHourlyRateLevelLabel(values?.[section.key], levels);

                  return (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${getHourlyRateLevelBadgeClassName(levelLabel)}`}
                    >
                      {levelLabel}
                    </span>
                  );
                })()}
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

function getBankSelectValue(bankCode?: string | null, bankName?: string | null, banks: BankOption[] = []) {
  if (bankCode?.trim()) {
    return bankCode.trim();
  }

  if (!bankName?.trim()) {
    return '';
  }

  const matchingBank = banks.find((bank) => bank.description === bankName.trim());
  return matchingBank?.code ?? '';
}

function normalizeBankSearchTerm(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatBankOptionLabel(bank: BankOption) {
  return `${bank.code} - ${bank.description}`;
}

function BankSelectField({
  id,
  label,
  error,
  value,
  banks,
  onChange,
}: {
  id: string;
  label: string;
  error?: string;
  value?: string;
  banks: BankOption[];
  onChange: (value: string) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedBank = banks.find((bank) => bank.code === value);

  useEffect(() => {
    setSearch(selectedBank ? formatBankOptionLabel(selectedBank) : '');
  }, [selectedBank]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch(selectedBank ? formatBankOptionLabel(selectedBank) : '');
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [selectedBank]);

  const normalizedSearch = normalizeBankSearchTerm(search);
  const filteredBanks = normalizedSearch
    ? banks.filter((bank) => {
        const optionLabel = formatBankOptionLabel(bank);
        return (
          normalizeBankSearchTerm(bank.code).includes(normalizedSearch) ||
          normalizeBankSearchTerm(bank.description).includes(normalizedSearch) ||
          normalizeBankSearchTerm(optionLabel).includes(normalizedSearch)
        );
      })
    : banks;
  const visibleBanks =
    selectedBank && !filteredBanks.some((bank) => bank.code === selectedBank.code)
      ? [selectedBank, ...filteredBanks]
      : filteredBanks;

  useEffect(() => {
    setHighlightedIndex(visibleBanks.length === 0 ? -1 : 0);
  }, [search, visibleBanks.length]);

  const handleSelectBank = (bankCode: string) => {
    onChange(bankCode);
    setIsOpen(false);
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex(visibleBanks.length === 0 ? -1 : 0);
      return;
    }

    if (!isOpen) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => {
        if (visibleBanks.length === 0) return -1;
        if (current < 0) return 0;
        return (current + 1) % visibleBanks.length;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => {
        if (visibleBanks.length === 0) return -1;
        if (current < 0) return visibleBanks.length - 1;
        return current === 0 ? visibleBanks.length - 1 : current - 1;
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const bank = highlightedIndex >= 0 ? visibleBanks[highlightedIndex] : undefined;
      if (bank) {
        handleSelectBank(bank.code);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      setSearch(selectedBank ? formatBankOptionLabel(selectedBank) : '');
    }
  };

  return (
    <div ref={wrapperRef} className="w-full space-y-2">
      <label className="text-sm font-medium text-foreground" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          label=""
          role="combobox"
          aria-label={label}
          title={label}
          aria-expanded={isOpen}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          aria-activedescendant={highlightedIndex >= 0 ? `${id}-option-${highlightedIndex}` : undefined}
          value={search}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="Pesquise por código ou nome do banco"
          autoComplete="off"
        />

        {isOpen ? (
          <div
            id={`${id}-listbox`}
            role="listbox"
            aria-label={`${label} disponíveis`}
            title={`${label} disponíveis`}
            className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-border bg-popover p-2 shadow-lg"
          >
            <div
              id={`${id}-option-empty`}
              role="option"
              className={cn(
                'flex cursor-pointer rounded-lg px-3 py-2 text-left text-sm transition hover:bg-muted',
                !value && 'bg-muted text-foreground'
              )}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange('');
                setSearch('');
                setIsOpen(false);
              }}
            >
              Selecionar depois
            </div>

            {visibleBanks.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Nenhum banco encontrado.</div>
            ) : (
              visibleBanks.map((bank, index) => {
                const isHighlighted = index === highlightedIndex;
                const isSelected = bank.code === value;

                return (
                  <div
                    key={bank.code}
                    id={`${id}-option-${index}`}
                    role="option"
                    className={cn(
                      'mt-1 flex cursor-pointer items-start rounded-lg px-3 py-2 text-left text-sm transition first:mt-2',
                      isHighlighted && 'bg-primary/10 text-primary',
                      isSelected && 'font-medium'
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelectBank(bank.code)}
                  >
                    <span className="block">
                      <span className="block font-medium">{bank.code}</span>
                      <span className="block text-muted-foreground">{bank.description}</span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
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

function formatRg(value: string) {
  const normalized = value.toUpperCase().replace(/[^0-9X]/g, '').slice(0, 9);

  return normalized
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})([0-9X])$/, '.$1-$2');
}

function formatBankAccount(value: string) {
  const normalized = value.toUpperCase().replace(/[^0-9X]/g, '').slice(0, 20);

  if (normalized.length <= 1) {
    return normalized;
  }

  return `${normalized.slice(0, -1)}-${normalized.slice(-1)}`;
}

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
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

  const normalizedValue = Number(value.replace(/\./g, '').replace(',', '.'));
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
    personal:
      typeof hourlyRates?.personal === 'number'
        ? hourlyRates.personal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '',
    consulting:
      typeof hourlyRates?.consulting === 'number'
        ? hourlyRates.consulting.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '',
    evaluation:
      typeof hourlyRates?.evaluation === 'number'
        ? hourlyRates.evaluation.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '',
  };
}

function getLegalFinancialStatusKey(
  profile: ProfessorSummary['user']['profile']
): Exclude<ConsultLegalFinancialFilter, 'all'> {
  if (profile.legalFinancialValidatedAt) {
    return 'validated';
  }

  if (
    profile.companyDocument ||
    profile.bankName ||
    profile.bankBranch ||
    profile.bankAccount ||
    profile.pixKey
  ) {
    return 'pending';
  }

  return 'not_provided';
}

function getLegalFinancialStatus(profile: ProfessorSummary['user']['profile']) {
  const status = getLegalFinancialStatusKey(profile);

  if (status === 'validated') {
    return professoresCopy.legalFinancialValidated;
  }

  if (status === 'pending') {
    return professoresCopy.legalFinancialPending;
  }

  return professoresCopy.legalFinancialNotProvided;
}

function normalizeConsultFilterValue(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function formatConsultDate(value?: string | null) {
  if (!value) {
    return commonCopy.notInformed;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return commonCopy.notInformed;
  }

  return date.toLocaleDateString('pt-BR');
}

function formatConsultDateTime(value?: string | null) {
  if (!value) {
    return professoresCopy.neverAccessed;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return professoresCopy.neverAccessed;
  }

  return date.toLocaleString('pt-BR');
}

function getConsultBadgeClassName(tone: ConsultBadgeTone) {
  const toneClassNames: Record<ConsultBadgeTone, string> = {
    neutral: 'border-border bg-muted/70 text-muted-foreground',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    danger: 'border-red-200 bg-red-50 text-red-700',
    info: 'border-sky-200 bg-sky-50 text-sky-700',
  };

  return cn(
    'inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium',
    toneClassNames[tone]
  );
}

function ConsultBadge({
  tone = 'neutral',
  children,
}: {
  tone?: ConsultBadgeTone;
  children: string;
}) {
  return <span className={getConsultBadgeClassName(tone)}>{children}</span>;
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
  const addressNeighborhood = data.addressNeighborhood?.trim();
  const addressCity = data.addressCity?.trim();
  const addressState = data.addressState?.trim();
  const addressComplement = data.addressComplement?.trim();
  const addressZipCode = data.addressZipCode?.trim();
  const instagramHandle = data.instagramHandle?.trim();
  const cref = data.cref?.trim();
  const professionalSummary = data.professionalSummary?.trim();
  const lattesUrl = data.lattesUrl?.trim();
  const companyDocument = data.companyDocument?.trim();
  const bankCode = data.bankCode?.trim();
  const bankBranch = data.bankBranch?.trim();
  const bankAccount = data.bankAccount?.trim();
  const pixKey = data.pixKey?.trim();
  const avatar = data.avatar?.trim();
  const admissionDate = data.admissionDate?.trim();
  const dismissalDate = data.dismissalDate?.trim();
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
    ...(addressNeighborhood ? { addressNeighborhood } : {}),
    ...(addressCity ? { addressCity } : {}),
    ...(addressState ? { addressState } : {}),
    ...(addressComplement ? { addressComplement } : {}),
    ...(addressZipCode ? { addressZipCode } : {}),
    ...(instagramHandle ? { instagramHandle } : {}),
    ...(cref ? { cref } : {}),
    ...(professionalSummary ? { professionalSummary } : {}),
    ...(lattesUrl ? { lattesUrl } : {}),
    ...(companyDocument ? { companyDocument } : {}),
    ...(bankCode ? { bankCode } : {}),
    ...(bankBranch ? { bankBranch } : {}),
    ...(bankAccount ? { bankAccount } : {}),
    ...(pixKey ? { pixKey } : {}),
    ...(avatar ? { avatar } : {}),
    ...(admissionDate ? { admissionDate } : {}),
    ...(dismissalDate ? { dismissalDate } : {}),
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
  const addressNeighborhood = data.addressNeighborhood?.trim();
  const addressCity = data.addressCity?.trim();
  const addressState = data.addressState?.trim();
  const addressComplement = data.addressComplement?.trim();
  const addressZipCode = data.addressZipCode?.trim();
  const instagramHandle = data.instagramHandle?.trim();
  const cref = data.cref?.trim();
  const professionalSummary = data.professionalSummary?.trim();
  const lattesUrl = data.lattesUrl?.trim();
  const companyDocument = data.companyDocument?.trim();
  const bankCode = data.bankCode?.trim();
  const bankBranch = data.bankBranch?.trim();
  const bankAccount = data.bankAccount?.trim();
  const pixKey = data.pixKey?.trim();
  const avatar = data.avatar?.trim();
  const admissionDate = data.admissionDate?.trim();
  const dismissalDate = data.dismissalDate?.trim();
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
    addressNeighborhood: addressNeighborhood || null,
    addressCity: addressCity || null,
    addressState: addressState || null,
    addressComplement: addressComplement || null,
    addressZipCode: addressZipCode || null,
    instagramHandle: instagramHandle || null,
    cref: cref || null,
    professionalSummary: professionalSummary || null,
    lattesUrl: lattesUrl || null,
    companyDocument: companyDocument || null,
    bankCode: bankCode || null,
    bankBranch: bankBranch || null,
    bankAccount: bankAccount || null,
    pixKey: pixKey || null,
    avatar: avatar || null,
    admissionDate: admissionDate || null,
    dismissalDate: dismissalDate || null,
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

function sanitizeSelfServiceUpdateProfessorPayload(data: EditProfessorForm) {
  const {
    admissionDate,
    dismissalDate,
    currentStatus,
    signedContractDocumentUrl,
    operationalRoleIds,
    hourlyRates,
    hasSignedContract,
    collaboratorFunctionId,
    responsibleManagerId,
    ...payload
  } = sanitizeUpdateProfessorPayload(data);

  return payload;
}

export function Professores({ mode = 'manage' }: ProfessoresProps) {
  const { user, loadUser } = useAuthStore();
  const [professores, setProfessores] = useState<ProfessorSummary[]>([]);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [collaboratorFunctions, setCollaboratorFunctions] = useState<CollaboratorFunctionOption[]>([]);
  const [responsibleManagers, setResponsibleManagers] = useState<ProfessorSummary[]>([]);
  const [hourlyRateLevels, setHourlyRateLevels] = useState<HourlyRateLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('all');
  const [consultSearch, setConsultSearch] = useState('');
  const [collaboratorFunctionFilter, setCollaboratorFunctionFilter] = useState('all');
  const [contractFilter, setContractFilter] = useState<ConsultContractFilter>('all');
  const [legalFinancialFilter, setLegalFinancialFilter] = useState<ConsultLegalFinancialFilter>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingCreateAvatar, setUploadingCreateAvatar] = useState(false);
  const [uploadingEditAvatar, setUploadingEditAvatar] = useState(false);
  const [uploadingCreateSignedContract, setUploadingCreateSignedContract] = useState(false);
  const [uploadingEditSignedContract, setUploadingEditSignedContract] = useState(false);
  const [activeSignedContractModal, setActiveSignedContractModal] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createActiveTab, setCreateActiveTab] = useState<CollaboratorRegistrationTab>('collaborator');
  const [editActiveTab, setEditActiveTab] = useState<CollaboratorRegistrationTab>('collaborator');
  const [createCepError, setCreateCepError] = useState<string | null>(null);
  const [editCepError, setEditCepError] = useState<string | null>(null);
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
      addressNeighborhood: '',
      addressCity: '',
      addressState: '',
      addressComplement: '',
      addressZipCode: '',
      instagramHandle: '',
      cref: '',
      professionalSummary: '',
      lattesUrl: '',
      companyDocument: '',
      bankCode: '',
      bankBranch: '',
      bankAccount: '',
      pixKey: '',
      avatar: '',
      admissionDate: '',
      dismissalDate: '',
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

  const createZipCodeField = register('addressZipCode');
  const editZipCodeField = registerEdit('addressZipCode');

  const handleCreateZipCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setCreateCepError(null);
    setValue('addressZipCode', formatCep(event.target.value), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleEditZipCodeChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEditCepError(null);
    setEditValue('addressZipCode', formatCep(event.target.value), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleCreateZipCodeBlur = async (event: FocusEvent<HTMLInputElement>) => {
    createZipCodeField.onBlur(event);

    const cep = onlyCepDigits(event.target.value);

    if (cep.length < 8) {
      return;
    }

    setCreateCepError(null);

    try {
      const address = await lookupCep(cep);

      if (!address) {
        return;
      }

      setValue('addressStreet', address.street, { shouldDirty: true, shouldValidate: true });
      setValue('addressNeighborhood', address.neighborhood, { shouldDirty: true, shouldValidate: true });
      setValue('addressCity', address.city, { shouldDirty: true, shouldValidate: true });
      setValue('addressState', address.state, { shouldDirty: true, shouldValidate: true });
    } catch (error) {
      setCreateCepError(getCepLookupFeedbackMessage(error));
    }
  };

  const handleEditZipCodeBlur = async (event: FocusEvent<HTMLInputElement>) => {
    editZipCodeField.onBlur(event);

    const cep = onlyCepDigits(event.target.value);

    if (cep.length < 8) {
      return;
    }

    setEditCepError(null);

    try {
      const address = await lookupCep(cep);

      if (!address) {
        return;
      }

      setEditValue('addressStreet', address.street, { shouldDirty: true, shouldValidate: true });
      setEditValue('addressNeighborhood', address.neighborhood, { shouldDirty: true, shouldValidate: true });
      setEditValue('addressCity', address.city, { shouldDirty: true, shouldValidate: true });
      setEditValue('addressState', address.state, { shouldDirty: true, shouldValidate: true });
    } catch (error) {
      setEditCepError(getCepLookupFeedbackMessage(error));
    }
  };

  useEffect(() => {
    register('collaboratorFunctionId');
    register('responsibleManagerId');
    register('bankCode');
    register('hourlyRates.personal');
    register('hourlyRates.consulting');
    register('hourlyRates.evaluation');
  }, [register]);

  useEffect(() => {
    registerEdit('collaboratorFunctionId');
    registerEdit('responsibleManagerId');
    registerEdit('bankCode');
    registerEdit('hourlyRates.personal');
    registerEdit('hourlyRates.consulting');
    registerEdit('hourlyRates.evaluation');
  }, [registerEdit]);

  const isConsultMode = mode === 'consult';
  const canManageProfessores = canAccessScreen(
    user,
    isConsultMode ? 'collaborators.consultation' : 'collaborators.registration'
  );
  const canViewCollaboratorRegistrationBlock = canAccessBlock(
    user,
    'collaborators.registration.collaborator'
  );
  const canViewManagerRegistrationBlock = canAccessBlock(
    user,
    'collaborators.registration.manager'
  );
  const currentDataScope = getDataScopeForScreen(
    user,
    isConsultMode ? 'collaborators.consultation' : 'collaborators.registration'
  );
  const canPerformAdministrativeActions = currentDataScope === 'contract';
  const currentProfessorId = user?.professor?.id;

  const getAllowedRegistrationTab = (preferredTab: CollaboratorRegistrationTab) => {
    if (preferredTab === 'manager' && canViewManagerRegistrationBlock) {
      return 'manager';
    }

    if (preferredTab === 'collaborator' && canViewCollaboratorRegistrationBlock) {
      return 'collaborator';
    }

    if (canViewCollaboratorRegistrationBlock) {
      return 'collaborator';
    }

    if (canViewManagerRegistrationBlock) {
      return 'manager';
    }

    return preferredTab;
  };

  const createCollaboratorFunctionId = watch('collaboratorFunctionId');
  const editCollaboratorFunctionId = watchEdit('collaboratorFunctionId');
  const createAvatarUrl = watch('avatar');
  const editAvatarUrl = watchEdit('avatar');
  const createCurrentStatus = watch('currentStatus');
  const editCurrentStatus = watchEdit('currentStatus');
  const createHasSignedContract = watch('hasSignedContract');
  const editHasSignedContract = watchEdit('hasSignedContract');
  const createSignedContractDocumentUrl = watch('signedContractDocumentUrl');
  const editSignedContractDocumentUrl = watchEdit('signedContractDocumentUrl');
  const createBankCode = watch('bankCode');
  const editBankCode = watchEdit('bankCode');
  const createHourlyRates = watch('hourlyRates');
  const editHourlyRates = watchEdit('hourlyRates');
  const createResponsibleManagerId = watch('responsibleManagerId');
  const editResponsibleManagerId = watchEdit('responsibleManagerId');

  useEffect(() => {
    if (!createHasSignedContract && createSignedContractDocumentUrl) {
      setValue('signedContractDocumentUrl', '');
    }
  }, [createHasSignedContract, createSignedContractDocumentUrl, setValue]);

  useEffect(() => {
    if (createCurrentStatus !== 'Desligado') {
      setValue('dismissalDate', '');
    }
  }, [createCurrentStatus, setValue]);

  useEffect(() => {
    if (!editHasSignedContract && editSignedContractDocumentUrl) {
      setEditValue('signedContractDocumentUrl', '');
    }
  }, [editHasSignedContract, editSignedContractDocumentUrl, setEditValue]);

  useEffect(() => {
    if (editCurrentStatus !== 'Desligado') {
      setEditValue('dismissalDate', '');
    }
  }, [editCurrentStatus, setEditValue]);

  useEffect(() => {
    setCreateActiveTab((current) => getAllowedRegistrationTab(current));
  }, [canViewCollaboratorRegistrationBlock, canViewManagerRegistrationBlock]);

  useEffect(() => {
    setEditActiveTab((current) => getAllowedRegistrationTab(current));
  }, [canViewCollaboratorRegistrationBlock, canViewManagerRegistrationBlock]);

  const loadData = async (status: 'active' | 'inactive' | 'all' = statusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const [professorResult, activeProfessorResult, functionResult, hourlyRateLevelResult, bankResult] = await Promise.all([
        professorService.list(status === 'all' ? undefined : status),
        professorService.list('active'),
        collaboratorFunctionService.list(),
        hourlyRateLevelService.list(),
        bankService.list(),
      ]);
      const managerOptions = getResponsibleManagerOptions(activeProfessorResult);

      setProfessores(professorResult);
      setBanks(bankResult);
      setCollaboratorFunctions(functionResult);
      setResponsibleManagers(managerOptions);
      setHourlyRateLevels(hourlyRateLevelResult);

      const currentCreateValue = getValues('collaboratorFunctionId');
      if (!currentCreateValue) {
        setValue('collaboratorFunctionId', getDefaultCollaboratorFunctionId(functionResult));
      }
