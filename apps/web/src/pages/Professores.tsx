import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Briefcase, Camera, ExternalLink, FileText, Upload, UserRound } from 'lucide-react';
import { bankService } from '../services/bank.service';
import { collaboratorFunctionService } from '../services/collaborator-function.service';
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
import { canAccessBlock, canAccessScreen } from '../access/access-control';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { commonCopy, professoresCopy } from '../i18n/ptBR';
import { getHourlyRateLevelBadgeClassName } from '../utils/hourlyRateLevelTone';
import { cn } from '@/utils/cn';

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

export function Professores({ mode = 'manage' }: ProfessoresProps) {
  const { user } = useAuthStore();
  const [professores, setProfessores] = useState<ProfessorSummary[]>([]);
  const [banks, setBanks] = useState<BankOption[]>([]);
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
  const [activeSignedContractModal, setActiveSignedContractModal] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createActiveTab, setCreateActiveTab] = useState<CollaboratorRegistrationTab>('collaborator');
  const [editActiveTab, setEditActiveTab] = useState<CollaboratorRegistrationTab>('collaborator');
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
  const createCollaboratorFunctionName =
    collaboratorFunctions.find((item) => item.id === createCollaboratorFunctionId)?.name ||
    'Selecione uma função';
  const editCollaboratorFunctionName =
    collaboratorFunctions.find((item) => item.id === editCollaboratorFunctionId)?.name ||
    'Selecione uma função';
  const createRequiresResponsibleManager = requiresResponsibleManager(
    createCollaboratorFunctionId,
    collaboratorFunctions
  );
  const editRequiresResponsibleManager = requiresResponsibleManager(
    editCollaboratorFunctionId,
    collaboratorFunctions
  );
  const createResponsibleManagerName =
    responsibleManagers.find((m) => m.id === createResponsibleManagerId)?.user?.profile?.name ?? null;
  const editResponsibleManagerName =
    responsibleManagers.find((m) => m.id === editResponsibleManagerId)?.user?.profile?.name ?? null;

  const onSubmit = async (data: CreateProfessorForm) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await professorService.create(sanitizeCreateProfessorPayload(data));
      setCreateActiveTab(getAllowedRegistrationTab('collaborator'));
      reset({
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

  const onInvalidSubmit = (formErrors: FieldErrors<CreateProfessorForm>) => {
    setCreateActiveTab(getAllowedRegistrationTab(getRegistrationTabFromErrors(formErrors)));
  };

  const startEdit = (professor: ProfessorSummary) => {
    const operationalRoleIds = professor.operationalRoleIds ?? [];

    setEditingId(professor.id);
    setEditActiveTab(getAllowedRegistrationTab('collaborator'));
    resetEdit({
      name: professor.user.profile.name,
      email: professor.user.email,
      password: '',
      phone: professor.user.profile.phone ?? '',
      birthDate: formatDateForInput(professor.user.profile.birthDate),
      cpf: formatCpf(professor.user.profile.cpf ?? ''),
      rg: formatRg(professor.user.profile.rg ?? ''),
      maritalStatus: professor.user.profile.maritalStatus ?? '',
      addressStreet: professor.user.profile.addressStreet ?? '',
      addressNumber: professor.user.profile.addressNumber ?? '',
      addressNeighborhood: professor.user.profile.addressNeighborhood ?? '',
      addressCity: professor.user.profile.addressCity ?? '',
      addressState: professor.user.profile.addressState ?? '',
      addressComplement: professor.user.profile.addressComplement ?? '',
      addressZipCode: professor.user.profile.addressZipCode ?? '',
      instagramHandle: normalizeInstagramHandle(professor.user.profile.instagramHandle),
      cref: professor.user.profile.cref ?? '',
      professionalSummary: professor.user.profile.professionalSummary ?? '',
      lattesUrl: professor.user.profile.lattesUrl ?? '',
      companyDocument: professor.user.profile.companyDocument ?? '',
      bankCode: getBankSelectValue(professor.user.profile.bankCode, professor.user.profile.bankName, banks),
      bankBranch: professor.user.profile.bankBranch ?? '',
      bankAccount: formatBankAccount(professor.user.profile.bankAccount ?? ''),
      pixKey: professor.user.profile.pixKey ?? '',
      avatar: professor.user.profile.avatar ?? '',
      admissionDate: formatDateForInput(professor.admissionDate),
      dismissalDate: formatDateForInput(professor.dismissalDate),
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
    setEditActiveTab(getAllowedRegistrationTab('collaborator'));
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
      setEditActiveTab(getAllowedRegistrationTab('collaborator'));
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.updateError);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onInvalidSubmitEdit = (formErrors: FieldErrors<EditProfessorForm>) => {
    setEditActiveTab(getAllowedRegistrationTab(getRegistrationTabFromErrors(formErrors)));
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
    setActiveSignedContractModal(null);
  };

  const handleRemoveEditSignedContract = () => {
    setEditValue('signedContractDocumentUrl', '', { shouldDirty: true, shouldValidate: true });
    setEditValue('hasSignedContract', false, { shouldDirty: true, shouldValidate: true });
    setActiveSignedContractModal(null);
  };

  const handleCreateSignedContractToggle = (checked: boolean) => {
    if (checked) {
      setValue('hasSignedContract', true, { shouldDirty: true, shouldValidate: true });
      setActiveSignedContractModal('create');
      return;
    }

    handleRemoveCreateSignedContract();
  };

  const handleEditSignedContractToggle = (checked: boolean) => {
    if (checked) {
      setEditValue('hasSignedContract', true, { shouldDirty: true, shouldValidate: true });
      setActiveSignedContractModal('edit');
      return;
    }

    handleRemoveEditSignedContract();
  };

  const handleCloseSignedContractModal = () => {
    if (activeSignedContractModal === 'create' && !createSignedContractDocumentUrl) {
      setValue('hasSignedContract', false, { shouldDirty: true, shouldValidate: true });
    }

    if (activeSignedContractModal === 'edit' && !editSignedContractDocumentUrl) {
      setEditValue('hasSignedContract', false, { shouldDirty: true, shouldValidate: true });
    }

    setActiveSignedContractModal(null);
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
        <h1 className="text-3xl font-bold">{isConsultMode ? professoresCopy.consultTitle : professoresCopy.title}</h1>
        <p className="text-muted-foreground mt-2">
          {isConsultMode ? professoresCopy.consultDescription : professoresCopy.description}
        </p>
      </div>

      {!isConsultMode && activeCollaboratorFunctions.length === 0 && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          {professoresCopy.noFunctionsAvailable}
        </div>
      )}

      {!isConsultMode && <Card>
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
          <form onSubmit={handleSubmit(onSubmit, onInvalidSubmit)} className="space-y-5">
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
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="overflow-x-auto bg-muted/30 px-4 py-2">
                <div role="tablist" aria-label={professoresCopy.registrationTabsAriaLabel} className="flex min-w-max gap-2">
                  {canViewCollaboratorRegistrationBlock && (
                    <RegistrationTabButton
                      id="create-collaborator-tab"
                      isActive={createActiveTab === 'collaborator'}
                      label={professoresCopy.collaboratorTabLabel}
                      icon={UserRound}
                      onClick={() => setCreateActiveTab('collaborator')}
                    />
                  )}
                  {canViewManagerRegistrationBlock && (
                    <RegistrationTabButton
                      id="create-manager-tab"
                      isActive={createActiveTab === 'manager'}
                      label={professoresCopy.managerTabLabel}
                      icon={Briefcase}
                      onClick={() => setCreateActiveTab('manager')}
                    />
                  )}
                </div>
              </div>

              <div className="p-6">
                {!canViewCollaboratorRegistrationBlock && !canViewManagerRegistrationBlock && (
                  <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                    Seu perfil não tem permissão para visualizar os blocos internos desta tela.
                  </div>
                )}

                {createActiveTab === 'collaborator' && canViewCollaboratorRegistrationBlock && (
                  <div
                    id="create-collaborator-panel"
                    role="tabpanel"
                    aria-labelledby="create-collaborator-tab"
                    className="space-y-5"
                  >
                    <div className="rounded-lg border border-border bg-muted/20 p-4">
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-foreground">Identificação e acesso</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Dados essenciais para criar o acesso e identificar o colaborador.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_280px]">
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
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
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
                          {...register('rg', {
                            onChange: (event) => {
                              setValue('rg', formatRg(event.target.value), {
                                shouldValidate: true,
                              });
                            },
                          })}
                        />
                        <Input
                          label={professoresCopy.birthDateLabel}
                          type="date"
                          error={errors.birthDate?.message}
                          {...register('birthDate')}
                        />
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
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-foreground">Perfil profissional e contato</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Canal social, currículo resumido e dados de qualificação profissional.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                      <div className="mt-3 space-y-3">
                        <Input
                          label={professoresCopy.lattesLabel}
                          type="url"
                          placeholder={professoresCopy.lattesPlaceholder}
                          error={errors.lattesUrl?.message}
                          {...register('lattesUrl')}
                        />
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
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-4">
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-foreground">Endereço</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Distribuição mais compacta para acelerar o preenchimento do endereço.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.4fr)_140px_180px]">
                        <Input
                          label={professoresCopy.addressStreetLabel}
                          placeholder="Rua Exemplo"
                          error={errors.addressStreet?.message}
                          {...register('addressStreet')}
                        />
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
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Input
                          label={professoresCopy.addressNeighborhoodLabel}
                          placeholder="Centro"
                          error={errors.addressNeighborhood?.message}
                          {...register('addressNeighborhood')}
                        />
                        <Input
                          label={professoresCopy.addressCityLabel}
                          placeholder="São Paulo"
                          error={errors.addressCity?.message}
                          {...register('addressCity')}
                        />
                        <Input
                          label={professoresCopy.addressStateLabel}
                          placeholder="SP"
                          error={errors.addressState?.message}
                          {...register('addressState')}
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                        <Input
                          label={professoresCopy.addressComplementLabel}
                          placeholder="Apto 42, bloco B"
                          error={errors.addressComplement?.message}
                          {...register('addressComplement')}
                        />
                      </div>
                    </div>
                    <div className="rounded-2xl border border-border p-4">
                      <p className="text-sm font-medium text-foreground">
                        {professoresCopy.legalFinancialSectionTitle}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {professoresCopy.legalFinancialSectionDescription}
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
                        <BankSelectField
                          id="create-bank-code"
                          label={professoresCopy.bankNameLabel}
                          error={errors.bankCode?.message}
                          value={createBankCode}
                          banks={banks}
                          onChange={(value) => setValue('bankCode', value, { shouldDirty: true, shouldValidate: true })}
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
                          {...register('bankAccount', {
                            onChange: (event) => {
                              setValue('bankAccount', formatBankAccount(event.target.value), {
                                shouldValidate: true,
                              });
                            },
                          })}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {createActiveTab === 'manager' && canViewManagerRegistrationBlock && (
                  <div
                    id="create-manager-panel"
                    role="tabpanel"
                    aria-labelledby="create-manager-tab"
                    className="space-y-5"
                  >
                    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)] xl:items-start">
                      <div className="space-y-4 xl:sticky xl:top-4">
                        <ManagerOverviewCard
                          title="Panorama da gestão"
                          description="Resumo rápido do enquadramento para organizar vínculo, situação e contrato antes de concluir o cadastro."
                          items={[
                            {
                              label: 'Função',
                              value: createCollaboratorFunctionName,
                              tone: createCollaboratorFunctionId ? 'primary' : 'default',
                            },
                            {
                              label: 'Situação',
                              value: createCurrentStatus || 'Não definida',
                              tone: createCurrentStatus === 'Ativo' ? 'success' : createCurrentStatus === 'Desligado' ? 'destructive' : 'default',
                            },
                            {
                              label: 'Gestor responsável',
                              value: !createRequiresResponsibleManager
                                ? 'Não necessário'
                                : createResponsibleManagerName
                                  ? createResponsibleManagerName
                                  : 'Pendente',
                              tone: !createRequiresResponsibleManager
                                ? 'default'
                                : createResponsibleManagerName
                                  ? 'success'
                                  : 'warning',
                            },
                            {
                              label: 'Contrato',
                              value: createHasSignedContract ? professoresCopy.signedContractYes : professoresCopy.signedContractNo,
                              tone: createHasSignedContract ? 'success' : 'warning',
                            },
                          ]}
                        />

                        <div className="rounded-lg border border-border bg-muted/20 p-4 shadow-[var(--shadow-card)]">
                          <div className="mb-4">
                            <p className="text-sm font-semibold text-foreground">Identificação visual</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Mantenha a foto ao lado do panorama para validar a identidade do colaborador no mesmo eixo de leitura.
                            </p>
                          </div>
                          <AvatarUploadField
                            name={watch('name')}
                            avatar={createAvatarUrl}
                            embedded
                            isUploading={uploadingCreateAvatar}
                            onUploadClick={() => createAvatarInputRef.current?.click()}
                            onRemove={() => setValue('avatar', '', { shouldDirty: true, shouldValidate: true })}
                          />
                        </div>
                      </div>

                      <div className="space-y-5">
                        <div className="rounded-lg border border-border bg-background p-4 shadow-[var(--shadow-card)]">
                          <div className="mb-4">
                            <p className="text-sm font-semibold text-foreground">Status contratual</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Organize a linha do tempo do colaborador e o controle do contrato assinado no mesmo bloco.
                            </p>
                          </div>
                          <div className="grid gap-4 lg:grid-cols-2">
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
                            <Input
                              label={professoresCopy.dismissalDateLabel}
                              type="date"
                              disabled={createCurrentStatus !== 'Desligado'}
                              error={errors.dismissalDate?.message}
                              {...register('dismissalDate')}
                            />
                            <SignedContractToggleField
                              inputId="create-has-signed-contract"
                              checked={!!createHasSignedContract}
                              onChange={handleCreateSignedContractToggle}
                              documentUrl={createSignedContractDocumentUrl}
                            />
                          </div>
                        </div>

                        <div className="rounded-lg border border-border bg-background p-4 shadow-[var(--shadow-card)]">
                          <div className="mb-4">
                            <p className="text-sm font-semibold text-foreground">Enquadramento operacional</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Defina a função principal, o gestor responsável e revise a matriz de valores por hora do colaborador.
                            </p>
                          </div>
                          <div className="space-y-4">
                            <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                              <div className="rounded-lg border border-border bg-muted/20 p-4">
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
                              <div className="rounded-lg border border-border bg-muted/20 p-4">
                                <p className="text-sm font-medium text-foreground">Gestão responsável</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Defina quem acompanha o colaborador quando a função exigir liderança ativa.
                                </p>
                                {createRequiresResponsibleManager ? (
                                  <div className="mt-3">
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
                                ) : (
                                  <p className="mt-3 text-sm text-muted-foreground">
                                    Esta função não exige gestor responsável.
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="rounded-lg border border-border bg-muted/20 p-4">
                              <p className="text-sm font-medium text-foreground">Valores de hora</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Revise personal, consultoria e avaliação dentro da mesma matriz operacional.
                              </p>
                              <div className="mt-4">
                                <HourlyRatesMatrix
                                  errors={{
                                    personal: errors.hourlyRates?.personal?.message,
                                    consulting: errors.hourlyRates?.consulting?.message,
                                    evaluation: errors.hourlyRates?.evaluation?.message,
                                  }}
                                  getInputProps={(sectionKey) => register(`hourlyRates.${sectionKey}` as const)}
                                  onValueChange={(sectionKey, value) =>
                                    setValue(`hourlyRates.${sectionKey}`, value, {
                                      shouldDirty: true,
                                      shouldValidate: true,
                                    })
                                  }
                                  onValueBlur={(sectionKey) =>
                                    setValue(`hourlyRates.${sectionKey}`, formatPtBrHourlyRateValue(createHourlyRates?.[sectionKey]), {
                                      shouldDirty: true,
                                      shouldValidate: true,
                                    })
                                  }
                                  values={createHourlyRates}
                                  levels={hourlyRateLevels}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

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
      </Card>}

      {activeSignedContractModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={() => setActiveSignedContractModal(null)}
        >
          <div
            className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-card)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-foreground">
                  {professoresCopy.signedContractDocumentLabel}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Envie ou revise o PDF do contrato assinado do colaborador.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseSignedContractModal}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Cancelar
              </button>
            </div>
            <SignedContractUploadField
              documentUrl={
                activeSignedContractModal === 'create'
                  ? createSignedContractDocumentUrl
                  : editSignedContractDocumentUrl
              }
              onUploadClick={() =>
                activeSignedContractModal === 'create'
                  ? createSignedContractInputRef.current?.click()
                  : editSignedContractInputRef.current?.click()
              }
              onRemove={() =>
                activeSignedContractModal === 'create'
                  ? handleRemoveCreateSignedContract()
                  : handleRemoveEditSignedContract()
              }
              isUploading={
                activeSignedContractModal === 'create'
                  ? uploadingCreateSignedContract
                  : uploadingEditSignedContract
              }
              error={
                activeSignedContractModal === 'create'
                  ? errors.signedContractDocumentUrl?.message
                  : editErrors.signedContractDocumentUrl?.message
              }
              required={
                activeSignedContractModal === 'create' ? createHasSignedContract : editHasSignedContract
              }
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCloseSignedContractModal}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => setActiveSignedContractModal(null)}
                disabled={
                  (activeSignedContractModal === 'create'
                    ? !createSignedContractDocumentUrl || uploadingCreateSignedContract
                    : !editSignedContractDocumentUrl || uploadingEditSignedContract)
                }
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Confirmar upload
              </button>
            </div>
          </div>
        </div>
      )}

      {isConsultMode && <Card>
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
                      onSubmit={handleSubmitEdit(onSubmitEdit, onInvalidSubmitEdit)}
                      className="flex-1 space-y-3"
                    >
                      <input type="hidden" {...registerEdit('avatar')} />
                      <input type="hidden" {...registerEdit('signedContractDocumentUrl')} />
                      <input
                        ref={editAvatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        aria-label="Upload da foto do colaborador"
                        title="Upload da foto do colaborador"
                        onChange={handleEditAvatarChange}
                      />
                      <input
                        ref={editSignedContractInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        aria-label="Upload do contrato assinado"
                        title="Upload do contrato assinado"
                        onChange={handleEditSignedContractChange}
                      />
                      <div className="overflow-hidden rounded-2xl border border-border bg-background">
                        <div className="overflow-x-auto bg-muted/30 px-4 py-2">
                          <div role="tablist" aria-label={professoresCopy.registrationTabsAriaLabel} className="flex min-w-max gap-2">
                            {canViewCollaboratorRegistrationBlock && (
                              <RegistrationTabButton
                                id={`edit-collaborator-tab-${professor.id}`}
                                isActive={editActiveTab === 'collaborator'}
                                label={professoresCopy.collaboratorTabLabel}
                                icon={UserRound}
                                onClick={() => setEditActiveTab('collaborator')}
                              />
                            )}
                            {canViewManagerRegistrationBlock && (
                              <RegistrationTabButton
                                id={`edit-manager-tab-${professor.id}`}
                                isActive={editActiveTab === 'manager'}
                                label={professoresCopy.managerTabLabel}
                                icon={Briefcase}
                                onClick={() => setEditActiveTab('manager')}
                              />
                            )}
                          </div>
                        </div>

                        <div className="p-4">
                          {!canViewCollaboratorRegistrationBlock && !canViewManagerRegistrationBlock && (
                            <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                              Seu perfil não tem permissão para visualizar os blocos internos desta tela.
                            </div>
                          )}

                          {editActiveTab === 'collaborator' && canViewCollaboratorRegistrationBlock && (
                            <div
                              id={`edit-collaborator-panel-${professor.id}`}
                              role="tabpanel"
                              aria-labelledby={`edit-collaborator-tab-${professor.id}`}
                              className="space-y-3"
                            >
                              <div className="rounded-lg border border-border bg-muted/20 p-4">
                                <div className="mb-4">
                                  <p className="text-sm font-semibold text-foreground">Identificação e acesso</p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    Campos principais de cadastro, autenticação e documentação civil.
                                  </p>
                                </div>
                                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_280px]">
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
                                    label={professoresCopy.newPasswordLabel}
                                    type="password"
                                    placeholder={professoresCopy.keepCurrentPassword}
                                    error={editErrors.password?.message}
                                    {...registerEdit('password')}
                                  />
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
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
                                    {...registerEdit('rg', {
                                      onChange: (event) => {
                                        setEditValue('rg', formatRg(event.target.value), {
                                          shouldValidate: true,
                                        });
                                      },
                                    })}
                                  />
                                  <Input
                                    label={professoresCopy.birthDateLabel}
                                    type="date"
                                    error={editErrors.birthDate?.message}
                                    {...registerEdit('birthDate')}
                                  />
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
                                </div>
                              </div>
                              <div className="rounded-lg border border-border bg-background p-4">
                                <div className="mb-4">
                                  <p className="text-sm font-semibold text-foreground">Perfil profissional e contato</p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    Contato social, currículo resumido e referências profissionais do colaborador.
                                  </p>
                                </div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                                <div className="mt-3 space-y-3">
                                  <Input
                                    label={professoresCopy.lattesLabel}
                                    type="url"
                                    placeholder={professoresCopy.lattesPlaceholder}
                                    error={editErrors.lattesUrl?.message}
                                    {...registerEdit('lattesUrl')}
                                  />
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
                                </div>
                              </div>
                              <div className="rounded-lg border border-border bg-muted/20 p-4">
                                <div className="mb-4">
                                  <p className="text-sm font-semibold text-foreground">Endereço</p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    Campos agrupados para reduzir saltos visuais durante a edição.
                                  </p>
                                </div>
                                <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.4fr)_140px_180px]">
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
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                                  <Input
                                    label={professoresCopy.addressNeighborhoodLabel}
                                    placeholder="Centro"
                                    error={editErrors.addressNeighborhood?.message}
                                    {...registerEdit('addressNeighborhood')}
                                  />
                                  <Input
                                    label={professoresCopy.addressCityLabel}
                                    placeholder="São Paulo"
                                    error={editErrors.addressCity?.message}
                                    {...registerEdit('addressCity')}
                                  />
                                  <Input
                                    label={professoresCopy.addressStateLabel}
                                    placeholder="SP"
                                    error={editErrors.addressState?.message}
                                    {...registerEdit('addressState')}
                                  />
                                </div>
                                <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                                  <Input
                                    label={professoresCopy.addressComplementLabel}
                                    placeholder="Apto 42"
                                    error={editErrors.addressComplement?.message}
                                    {...registerEdit('addressComplement')}
                                  />
                                </div>
                              </div>
                              <div className="rounded-lg border border-border p-4">
                                <p className="text-sm font-medium text-foreground">{professoresCopy.legalFinancialSectionTitle}</p>
                                <p className="mt-1 text-sm text-muted-foreground">{professoresCopy.legalFinancialSectionDescription}</p>
                                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
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
                                  <BankSelectField
                                    id={`edit-bank-code-${professor.id}`}
                                    label={professoresCopy.bankNameLabel}
                                    error={editErrors.bankCode?.message}
                                    value={editBankCode}
                                    banks={banks}
                                    onChange={(value) => setEditValue('bankCode', value, { shouldDirty: true, shouldValidate: true })}
                                  />
                                  <Input
                                    label={professoresCopy.pixKeyLabel}
                                    placeholder="pix@empresa.com"
                                    error={editErrors.pixKey?.message}
                                    {...registerEdit('pixKey')}
                                  />
                                </div>
                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                    {...registerEdit('bankAccount', {
                                      onChange: (event) => {
                                        setEditValue('bankAccount', formatBankAccount(event.target.value), {
                                          shouldValidate: true,
                                        });
                                      },
                                    })}
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {editActiveTab === 'manager' && canViewManagerRegistrationBlock && (
                            <div
                              id={`edit-manager-panel-${professor.id}`}
                              role="tabpanel"
                              aria-labelledby={`edit-manager-tab-${professor.id}`}
                              className="space-y-3"
                            >
                              <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)] xl:items-start">
                                <div className="space-y-4 xl:sticky xl:top-4">
                                  <ManagerOverviewCard
                                    title="Panorama da gestão"
                                    description="Leitura rápida do enquadramento atual para revisar vínculo, situação e contrato antes de salvar a edição."
                                    items={[
                                      {
                                        label: 'Função',
                                        value: editCollaboratorFunctionName,
                                        tone: editCollaboratorFunctionId ? 'primary' : 'default',
                                      },
                                      {
                                        label: 'Situação',
                                        value: editCurrentStatus || 'Não definida',
                                        tone: editCurrentStatus === 'Ativo' ? 'success' : editCurrentStatus === 'Desligado' ? 'destructive' : 'default',
                                      },
                                      {
                                        label: 'Gestor responsável',
                                        value: !editRequiresResponsibleManager
                                          ? 'Não necessário'
                                          : editResponsibleManagerName
                                            ? editResponsibleManagerName
                                            : 'Pendente',
                                        tone: !editRequiresResponsibleManager
                                          ? 'default'
                                          : editResponsibleManagerName
                                            ? 'success'
                                            : 'warning',
                                      },
                                      {
                                        label: 'Contrato',
                                        value: editHasSignedContract ? professoresCopy.signedContractYes : professoresCopy.signedContractNo,
                                        tone: editHasSignedContract ? 'success' : 'warning',
                                      },
                                    ]}
                                  />

                                  <div className="rounded-lg border border-border bg-muted/20 p-4 shadow-[var(--shadow-card)]">
                                    <div className="mb-4">
                                      <p className="text-sm font-semibold text-foreground">Identificação visual</p>
                                      <p className="mt-1 text-sm text-muted-foreground">
                                        Mantenha a foto próxima ao panorama para revisar identidade, função e vínculo com mais rapidez.
                                      </p>
                                    </div>
                                    <AvatarUploadField
                                      name={watchEdit('name') || professor.user?.profile?.name}
                                      avatar={editAvatarUrl}
                                      embedded
                                      isUploading={uploadingEditAvatar}
                                      onUploadClick={() => editAvatarInputRef.current?.click()}
                                      onRemove={() =>
                                        setEditValue('avatar', '', { shouldDirty: true, shouldValidate: true })
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="space-y-5">
                                  <div className="rounded-lg border border-border bg-background p-4 shadow-[var(--shadow-card)]">
                                    <div className="mb-4">
                                      <p className="text-sm font-semibold text-foreground">Status contratual</p>
                                      <p className="mt-1 text-sm text-muted-foreground">
                                        Revise situação, datas e contrato assinado em uma única faixa operacional.
                                      </p>
                                    </div>
                                    <div className="grid gap-4 lg:grid-cols-2">
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
                                      <Input
                                        label={professoresCopy.dismissalDateLabel}
                                        type="date"
                                        disabled={editCurrentStatus !== 'Desligado'}
                                        error={editErrors.dismissalDate?.message}
                                        {...registerEdit('dismissalDate')}
                                      />
                                      <SignedContractToggleField
                                        inputId={`edit-has-signed-contract-${professor.id}`}
                                        checked={!!editHasSignedContract}
                                        onChange={handleEditSignedContractToggle}
                                        documentUrl={editSignedContractDocumentUrl}
                                      />
                                    </div>
                                  </div>

                                  <div className="rounded-lg border border-border bg-background p-4 shadow-[var(--shadow-card)]">
                                    <div className="mb-4">
                                      <p className="text-sm font-semibold text-foreground">Enquadramento operacional</p>
                                      <p className="mt-1 text-sm text-muted-foreground">
                                        Reforce a função principal, o gestor responsável e revise os valores por hora em um fluxo único de edição.
                                      </p>
                                    </div>
                                    <div className="space-y-4">
                                      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
                                        <div className="rounded-lg border border-border bg-muted/20 p-4">
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
                                        <div className="rounded-lg border border-border bg-muted/20 p-4">
                                          <p className="text-sm font-medium text-foreground">Gestão responsável</p>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            Defina quem acompanha o colaborador quando a função exigir liderança ativa.
                                          </p>
                                          {editRequiresResponsibleManager ? (
                                            <div className="mt-3">
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
                                          ) : (
                                            <p className="mt-3 text-sm text-muted-foreground">
                                              Esta função não exige gestor responsável.
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="rounded-lg border border-border bg-muted/20 p-4">
                                        <p className="text-sm font-medium text-foreground">Valores de hora</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          Ajuste personal, consultoria e avaliação no mesmo painel operacional.
                                        </p>
                                        <div className="mt-4">
                                          <HourlyRatesMatrix
                                            errors={{
                                              personal: editErrors.hourlyRates?.personal?.message,
                                              consulting: editErrors.hourlyRates?.consulting?.message,
                                              evaluation: editErrors.hourlyRates?.evaluation?.message,
                                            }}
                                            getInputProps={(sectionKey) => registerEdit(`hourlyRates.${sectionKey}` as const)}
                                            onValueChange={(sectionKey, value) =>
                                              setEditValue(`hourlyRates.${sectionKey}`, value, {
                                                shouldDirty: true,
                                                shouldValidate: true,
                                              })
                                            }
                                            onValueBlur={(sectionKey) =>
                                              setEditValue(`hourlyRates.${sectionKey}`, formatPtBrHourlyRateValue(editHourlyRates?.[sectionKey]), {
                                                shouldDirty: true,
                                                shouldValidate: true,
                                              })
                                            }
                                            values={editHourlyRates}
                                            levels={hourlyRateLevels}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
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
      </Card>}
    </div>
  );
}
