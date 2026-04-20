import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AuthCardLayout } from '../components/auth/AuthCardLayout';
import { authCopy, commonCopy } from '../i18n/ptBR';

const loginSchema = z.object({
  email: z.string().email(authCopy.login.validation.invalidEmail),
  password: z.string().min(6, authCopy.login.validation.minPassword),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function Login() {
  const navigate = useNavigate();
  const { login, error, clearError } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    clearError();

    try {
      await login(data);
      navigate('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCardLayout
      title={authCopy.login.title}
      description={authCopy.login.description}
      footer={
        <>
          <Button type="submit" form="login-form" className="w-full" isLoading={isLoading}>
            {authCopy.login.submit}
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            {authCopy.login.noAccount}{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              {authCopy.register.title}
            </Link>
          </div>
        </>
      }
    >
      <form id="login-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Input
          label={commonCopy.emailLabel}
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Senha"
          type="password"
          placeholder="Digite sua senha"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex items-center justify-end text-sm">
          <Link to="/forgot-password" className="text-primary hover:underline">
            {authCopy.login.forgotPassword}
          </Link>
        </div>
      </form>
    </AuthCardLayout>
  );
}