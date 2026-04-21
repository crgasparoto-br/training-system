import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collaboratorFunctionService } from '../services/collaborator-function.service';
import { professorService } from '../services/professor.service';
import type { CollaboratorFunctionOption, ProfessorSummary } from '@corrida/types';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { commonCopy, professoresCopy } from '../i18n/ptBR';

const createProfessorSchema = z.object({
  name: z.string().trim().min(3, 'O nome deve ter no mínimo 3 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
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
  collaboratorFunctionId: z.string().trim().min(1, 'Selecione uma função'),
  responsibleManagerId: z.string().trim().optional(),
});

type CreateProfessorForm = z.infer<typeof createProfessorSchema>;
type EditProfessorForm = z.infer<typeof editProfessorSchema>;

function sanitizeBaseProfessorPayload<T extends { name: string; email: string }>(data: T) {
  return {
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
  };
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
  const responsibleManagerId = data.responsibleManagerId?.trim();

  return {
    ...sanitizeBaseProfessorPayload(data),
    password: data.password.trim(),
    collaboratorFunctionId: data.collaboratorFunctionId,
    ...(responsibleManagerId ? { responsibleManagerId } : {}),
  };
}

function sanitizeUpdateProfessorPayload(data: EditProfessorForm) {
  const password = data.password?.trim();
  const responsibleManagerId = data.responsibleManagerId?.trim();

  return {
    ...sanitizeBaseProfessorPayload(data),
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
            <Input
              label={professoresCopy.passwordLabel}
              type="password"
              placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
              error={errors.password?.message}
              {...register('password')}
            />
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
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
