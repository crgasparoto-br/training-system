import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { professorService } from '../services/professor.service';
import type { ProfessorSummary } from '@corrida/types';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { commonCopy, professoresCopy } from '../i18n/ptBR';

const createProfessorSchema = z.object({
  name: z.string().trim().min(3, 'O nome deve ter no mínimo 3 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
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
});

type CreateProfessorForm = z.infer<typeof createProfessorSchema>;
type EditProfessorForm = z.infer<typeof editProfessorSchema>;

function sanitizeBaseProfessorPayload<T extends { name: string; email: string }>(data: T) {
  return {
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
  };
}

function sanitizeCreateProfessorPayload(data: CreateProfessorForm) {
  return {
    ...sanitizeBaseProfessorPayload(data),
    password: data.password.trim(),
  };
}

function sanitizeUpdateProfessorPayload(data: EditProfessorForm) {
  const password = data.password?.trim();

  return {
    ...sanitizeBaseProfessorPayload(data),
    ...(password ? { password } : {}),
  };
}

export function Professores() {
  const { user } = useAuthStore();
  const [professores, setProfessores] = useState<ProfessorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateProfessorForm>({
    resolver: zodResolver(createProfessorSchema),
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    formState: { errors: editErrors },
  } = useForm<EditProfessorForm>({
    resolver: zodResolver(editProfessorSchema),
  });

  const canManageProfessores =
    user?.type === 'professor' &&
    user?.professor?.role === 'master' &&
    user?.professor?.contract?.type === 'academy';

  const loadProfessores = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await professorService.list();
      setProfessores(result);
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManageProfessores) {
      loadProfessores();
    } else {
      setLoading(false);
    }
  }, [canManageProfessores]);

  const onSubmit = async (data: CreateProfessorForm) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await professorService.create(sanitizeCreateProfessorPayload(data));
      reset();
      await loadProfessores();
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
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    resetEdit({
      name: '',
      email: '',
      password: '',
    });
  };

  const onSubmitEdit = async (data: EditProfessorForm) => {
    if (!editingId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await professorService.update(editingId, sanitizeUpdateProfessorPayload(data));
      await loadProfessores();
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
      await loadProfessores();
    } catch (err: any) {
      setError(err.response?.data?.error || professoresCopy.deactivateError);
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            </div>
            <Input
              label={professoresCopy.passwordLabel}
              type="password"
              placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
              error={errors.password?.message}
              {...register('password')}
            />
            <div className="flex justify-end">
              <Button type="submit" isLoading={isSubmitting}>
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
                          label={professoresCopy.newPasswordLabel}
                          type="password"
                          placeholder={professoresCopy.keepCurrentPassword}
                          error={editErrors.password?.message}
                          {...registerEdit('password')}
                        />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={cancelEdit}>
                          Cancelar
                        </Button>
                        <Button type="submit" isLoading={isSubmitting}>
                          Salvar
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

