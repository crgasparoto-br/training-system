import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collaboratorFunctionService } from '../services/collaborator-function.service';
import { professorService } from '../services/professor.service';
import type {
  CollaboratorFunctionOption,
  ProfessorMaritalStatus,
  ProfessorSummary,
} from '@corrida/types';
import { useAuthStore } from '../stores/useAuthStore';
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
  collaboratorFunctionId: z.string().trim().min(1, 'Selecione uma função'),
  responsibleManagerId: z.string().trim().optional(),
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
  collaboratorFunctionId: z.string().trim().min(1, 'Selecione uma função'),
  responsibleManagerId: z.string().trim().optional(),
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

const textareaClassName =
  'flex min-h-[120px] w-full rounded-lg border border-input bg-card px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

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
  const responsibleManagerId = data.responsibleManagerId?.trim();

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
  const responsibleManagerId = data.responsibleManagerId?.trim();

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);

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

  const loadData = async (status: 'active' | 'inactive' | 'all' = statusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const [professorResult, activeProfessorResult, functionResult] = await Promise.all([
        professorService.list(status === 'all' ? undefined : status),
        professorService.list('active'),
        collaboratorFunctionService.list(),
      ]);
      const managerOptions = getResponsibleManagerOptions(activeProfessorResult);

      setProfessores(professorResult);
      setCollaboratorFunctions(functionResult);
      setResponsibleManagers(managerOptions);

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

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>{professoresCopy.catalogRoadmapTitle}</CardTitle>
          <CardDescription>{professoresCopy.catalogRoadmapDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {professoresCopy.catalogRoadmapBody}
          </p>
        </CardContent>
      </Card>

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
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{professoresCopy.personalDataSectionTitle}</p>
              <p className="mt-1">{professoresCopy.personalDataSectionDescription}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label={professoresCopy.addressStreetLabel}
                placeholder="Rua Exemplo, 123"
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
                label={professoresCopy.addressComplementLabel}
                placeholder="Apto 42"
                error={errors.addressComplement?.message}
                {...register('addressComplement')}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <div>
                <label htmlFor="create-collaborator-function" className="mb-2 block text-sm font-medium">
                  {professoresCopy.collaboratorFunctionLabel}
                </label>
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
              <Input
                label={professoresCopy.passwordLabel}
                type="password"
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                error={errors.password?.message}
                {...register('password')}
              />
            </div>
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{professoresCopy.professionalDataSectionTitle}</p>
              <p className="mt-1">{professoresCopy.professionalDataSectionDescription}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <p className="mt-1 text-sm text-destructive">{errors.professionalSummary.message}</p>
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
            <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{professoresCopy.legalFinancialSectionTitle}</p>
              <p className="mt-1">{professoresCopy.legalFinancialSectionDescription}</p>
              <p className="mt-2 text-xs">{professoresCopy.legalFinancialValidationHint}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="flex justify-end">
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
                        {(professor.responsibleManager || professor.collaboratorFunction.code !== 'manager') && (
                          <p className="text-xs text-muted-foreground">
                            {professoresCopy.responsibleManagerLabel}:{' '}
                            {professor.responsibleManager?.user?.profile?.name ||
                              professoresCopy.noResponsibleManager}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {professoresCopy.lastAccess}:{' '}
                          {professor.user?.lastLoginAt
                            ? new Date(professor.user.lastLoginAt).toLocaleString()
                            : professoresCopy.neverAccessed}
                        </p>
                        {resetTarget === professor.id && resetPassword && (
                          <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2">
                            {professoresCopy.temporaryPassword}: <span className="font-mono">{resetPassword}</span>
                          </div>
                        )}
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
