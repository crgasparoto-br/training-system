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

const createProfessorSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter no mÃ­nimo 3 caracteres'),
  email: z.string().trim().email('Email invÃ¡lido'),
  password: z.string().min(8, 'Senha deve ter no mÃ­nimo 8 caracteres'),
});

const editProfessorSchema = z.object({
  name: z.string().trim().min(3, 'Nome deve ter no mÃ­nimo 3 caracteres'),
  email: z.string().trim().email('Email invÃ¡lido'),
  password: z
    .string()
    .optional()
    .refine(
      (value) => value === undefined || value.trim().length === 0 || value.length >= 8,
      'Senha deve ter no mÃ­nimo 8 caracteres'
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
      setError(err.response?.data?.error || 'Erro ao carregar professores');
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
      setError(err.response?.data?.error || 'Erro ao criar professor');
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
      setError(err.response?.data?.error || 'Erro ao atualizar professor');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (professorId: string) => {
    if (!confirm('Deseja gerar uma nova senha temporaria para este professor?')) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await professorService.resetPassword(professorId);
      setResetPassword(result.tempPassword);
      setResetTarget(professorId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao resetar senha');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (professorId: string) => {
    if (!confirm('Deseja desativar este professor?')) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await professorService.deactivate(professorId);
      await loadProfessores();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao desativar professor');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canManageProfessores) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Voce nao tem permissao para gerenciar professores.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Professores</h1>
        <p className="text-muted-foreground mt-2">
          Cadastre professores e gerencie o time da academia
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo Professor</CardTitle>
          <CardDescription>Crie um acesso para um professor da academia</CardDescription>
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
                label="Nome"
                placeholder="Maria Souza"
                error={errors.name?.message}
                {...register('name')}
              />
              <Input
                label="Email"
                type="email"
                placeholder="maria@academia.com"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>
            <Input
              label="Senha"
              type="password"
              placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
              error={errors.password?.message}
              {...register('password')}
            />
            <div className="flex justify-end">
              <Button type="submit" isLoading={isSubmitting}>
                Criar Professor
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Professores</CardTitle>
          <CardDescription>Professores vinculados ao contrato</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Carregando...</div>
          ) : professores.length === 0 ? (
            <div className="text-muted-foreground">Nenhum professor cadastrado ainda.</div>
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
                          label="Nome"
                          error={editErrors.name?.message}
                          {...registerEdit('name')}
                        />
                        <Input
                          label="Email"
                          type="email"
                          error={editErrors.email?.message}
                          {...registerEdit('email')}
                        />
                        <Input
                          label="Nova Senha"
                          type="password"
                          placeholder="Deixe em branco para manter a atual"
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
                          {professor.user?.profile?.name || 'Sem nome'}
                        </p>
                        <p className="text-sm text-muted-foreground">{professor.user?.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Ãšltimo acesso:{' '}
                          {professor.user?.lastLoginAt
                            ? new Date(professor.user.lastLoginAt).toLocaleString()
                            : 'Nunca'}
                        </p>
                        {resetTarget === professor.id && resetPassword && (
                          <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2">
                            Senha temporÃ¡ria: <span className="font-mono">{resetPassword}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs rounded-full px-2 py-1 bg-muted">
                          {professor.role === 'master' ? 'Master' : 'Professor'}
                        </span>
                        {professor.user?.isActive === false && (
                          <span className="text-xs rounded-full px-2 py-1 bg-red-100 text-red-700">
                            Desativado
                          </span>
                        )}
                        {professor.role !== 'master' && (
                          <>
                            <Button variant="outline" onClick={() => startEdit(professor)}>
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleResetPassword(professor.id)}
                              isLoading={isSubmitting}
                            >
                              Resetar Senha
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleDeactivate(professor.id)}
                              isLoading={isSubmitting}
                            >
                              Desativar
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

