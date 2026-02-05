import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { educatorService } from '../services/educator.service';
import type { EducatorSummary } from '@corrida/types';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';

const createEducatorSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
});

type CreateEducatorForm = z.infer<typeof createEducatorSchema>;
type EditEducatorForm = z.infer<typeof createEducatorSchema>;

export function Educators() {
  const { user } = useAuthStore();
  const [educators, setEducators] = useState<EducatorSummary[]>([]);
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
  } = useForm<CreateEducatorForm>({
    resolver: zodResolver(createEducatorSchema),
  });

  const {
    register: registerEdit,
    handleSubmit: handleSubmitEdit,
    reset: resetEdit,
    formState: { errors: editErrors },
  } = useForm<EditEducatorForm>({
    resolver: zodResolver(createEducatorSchema),
  });

  const canManageEducators =
    user?.type === 'educator' &&
    user?.educator?.role === 'master' &&
    user?.educator?.contract?.type === 'academy';

  const loadEducators = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await educatorService.list();
      setEducators(result);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar educadores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canManageEducators) {
      loadEducators();
    } else {
      setLoading(false);
    }
  }, [canManageEducators]);

  const onSubmit = async (data: CreateEducatorForm) => {
    setIsSubmitting(true);
    setError(null);
    try {
      await educatorService.create(data);
      reset();
      await loadEducators();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar educador');
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEdit = (educator: EducatorSummary) => {
    setEditingId(educator.id);
    resetEdit({
      name: educator.user.profile.name,
      email: educator.user.email,
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

  const onSubmitEdit = async (data: EditEducatorForm) => {
    if (!editingId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await educatorService.update(editingId, {
        name: data.name,
        email: data.email,
        password: data.password,
      });
      await loadEducators();
      setEditingId(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao atualizar educador');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (educatorId: string) => {
    if (!confirm('Deseja gerar uma nova senha temporária para este educador?')) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await educatorService.resetPassword(educatorId);
      setResetPassword(result.tempPassword);
      setResetTarget(educatorId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao resetar senha');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async (educatorId: string) => {
    if (!confirm('Deseja desativar este educador?')) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await educatorService.deactivate(educatorId);
      await loadEducators();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao desativar educador');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canManageEducators) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Você não tem permissão para gerenciar educadores.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Educadores</h1>
        <p className="text-muted-foreground mt-2">
          Cadastre educadores e gerencie o time da academia
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Novo Educador</CardTitle>
          <CardDescription>Crie um acesso para um educador da academia</CardDescription>
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
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />
            <div className="flex justify-end">
              <Button type="submit" isLoading={isSubmitting}>
                Criar Educador
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Educadores</CardTitle>
          <CardDescription>Educadores vinculados ao contrato</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground">Carregando...</div>
          ) : educators.length === 0 ? (
            <div className="text-muted-foreground">Nenhum educador cadastrado ainda.</div>
          ) : (
            <div className="space-y-3">
              {educators.map((educator) => (
                <div
                  key={educator.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  {editingId === educator.id ? (
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
                          {educator.user?.profile?.name || 'Sem nome'}
                        </p>
                        <p className="text-sm text-muted-foreground">{educator.user?.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Último acesso:{' '}
                          {educator.user?.lastLoginAt
                            ? new Date(educator.user.lastLoginAt).toLocaleString()
                            : 'Nunca'}
                        </p>
                        {resetTarget === educator.id && resetPassword && (
                          <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md p-2">
                            Senha temporária: <span className="font-mono">{resetPassword}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs rounded-full px-2 py-1 bg-muted">
                          {educator.role === 'master' ? 'Master' : 'Educador'}
                        </span>
                        {educator.user?.isActive === false && (
                          <span className="text-xs rounded-full px-2 py-1 bg-red-100 text-red-700">
                            Desativado
                          </span>
                        )}
                        {educator.role !== 'master' && (
                          <>
                            <Button variant="outline" onClick={() => startEdit(educator)}>
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => handleResetPassword(educator.id)}
                              isLoading={isSubmitting}
                            >
                              Resetar Senha
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleDeactivate(educator.id)}
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
