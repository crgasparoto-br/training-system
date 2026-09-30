import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthCardLayout } from '../components/auth/AuthCardLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { authService } from '../services/auth.service';
import { useAuthStore } from '../stores/useAuthStore';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Informe sua senha temporaria atual'),
    password: z.string().min(8, 'A nova senha deve ter no minimo 8 caracteres'),
    confirmPassword: z.string().min(8, 'Confirme a nova senha'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas nao coincidem',
  })
  .refine((data) => data.password !== data.currentPassword, {
    path: ['password'],
    message: 'A nova senha deve ser diferente da senha atual',
  });

type FormData = z.infer<typeof schema>;

export function ChangePassword() {
  const navigate = useNavigate();
  const { isAuthenticated, user, loadUser, logout } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.mustChangePassword) {
    return <Navigate to="/inicio" replace />;
  }

  const onSubmit = handleSubmit(async (data) => {
    setIsSaving(true);
    setServerError(null);

    try {
      await authService.changePassword({
        currentPassword: data.currentPassword,
        password: data.password,
      });
      await loadUser();
      navigate('/inicio', { replace: true });
    } catch (error: any) {
      setServerError(
        error.response?.data?.error ||
          error.message ||
          'Nao foi possivel atualizar sua senha.'
      );
    } finally {
      setIsSaving(false);
    }
  });

  return (
    <AuthCardLayout
      title="Defina sua nova senha"
      description="Sua senha atual e temporaria. Crie uma senha definitiva para continuar usando o sistema."
      footer={
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => void logout()}
        >
          Sair
        </Button>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {serverError ? (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <Input
          label="Senha temporaria atual"
          type="password"
          autoComplete="current-password"
          error={errors.currentPassword?.message}
          {...register('currentPassword')}
        />

        <Input
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Input
          label="Confirmar nova senha"
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" className="w-full" isLoading={isSaving}>
          Salvar nova senha
        </Button>
      </form>
    </AuthCardLayout>
  );
}
