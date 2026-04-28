import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthCardLayout } from '../components/auth/AuthCardLayout';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { authService } from '../services/auth.service';
import { authCopy } from '../i18n/ptBR';

const forgotPasswordSchema = z.object({
  email: z.string().email(authCopy.forgotPassword.validation.invalidEmail),
});

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, authCopy.resetPassword.validation.minPassword),
    confirmPassword: z.string().min(8, authCopy.resetPassword.validation.minPassword),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: authCopy.resetPassword.validation.passwordMismatch,
    path: ['confirmPassword'],
  });

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('token');
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const title = useMemo(
    () => (resetToken ? authCopy.resetPassword.title : authCopy.forgotPassword.title),
    [resetToken]
  );
  const description = useMemo(
    () => (resetToken ? authCopy.resetPassword.description : authCopy.forgotPassword.description),
    [resetToken]
  );

  const forgotForm = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const resetForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const handleForgotPasswordSubmit = forgotForm.handleSubmit(async (data) => {
    setRequestLoading(true);
    setRequestError(null);
    setRequestMessage(null);

    try {
      const response = await authService.forgotPassword(data);
      setRequestMessage(response.message);
    } catch (error: any) {
      setRequestError(error.response?.data?.error || 'Não foi possível gerar o link de redefinição.');
    } finally {
      setRequestLoading(false);
    }
  });

  const handleResetPasswordSubmit = resetForm.handleSubmit(async (data) => {
    if (!resetToken) {
      setResetError(authCopy.resetPassword.validation.missingToken);
      return;
    }

    setResetLoading(true);
    setResetError(null);

    try {
      await authService.resetPassword({
        token: resetToken,
        password: data.password,
      });
      setResetSuccess(true);
      resetForm.reset();
    } catch (error: any) {
      setResetError(error.response?.data?.error || 'Não foi possível redefinir a senha.');
    } finally {
      setResetLoading(false);
    }
  });

  return (
    <AuthCardLayout
      title={title}
      description={description}
      footer={
        <>
          <Link to="/login" className="w-full">
            <Button type="button" variant={resetToken ? 'outline' : 'default'} className="w-full">
              {authCopy.forgotPassword.backToLogin}
            </Button>
          </Link>
        </>
      }
    >
      {resetToken ? (
        resetSuccess ? (
          <div className="space-y-2 rounded-md border border-success/20 bg-success/10 p-4 text-sm text-foreground">
            <p className="font-medium text-success">{authCopy.resetPassword.successTitle}</p>
            <p>{authCopy.resetPassword.successDescription}</p>
          </div>
        ) : (
          <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
            {resetError ? (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {resetError}
              </div>
            ) : null}

            <Input
              label={authCopy.resetPassword.passwordLabel}
              type="password"
              placeholder={authCopy.resetPassword.passwordPlaceholder}
              autoComplete="new-password"
              error={resetForm.formState.errors.password?.message}
              {...resetForm.register('password')}
            />

            <Input
              label={authCopy.resetPassword.confirmPasswordLabel}
              type="password"
              placeholder={authCopy.resetPassword.confirmPasswordPlaceholder}
              autoComplete="new-password"
              error={resetForm.formState.errors.confirmPassword?.message}
              {...resetForm.register('confirmPassword')}
            />

            <Button type="submit" className="w-full" isLoading={resetLoading}>
              {authCopy.resetPassword.submit}
            </Button>
          </form>
        )
      ) : (
        <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
          {requestError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {requestError}
            </div>
          ) : null}

          {requestMessage ? (
            <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
              <p className="font-medium text-primary">{authCopy.forgotPassword.successTitle}</p>
              <p>{requestMessage}</p>
              <p className="text-muted-foreground">{authCopy.forgotPassword.successHint}</p>
            </div>
          ) : null}

          <Input
            label={authCopy.forgotPassword.emailLabel}
            type="email"
            placeholder={authCopy.forgotPassword.emailPlaceholder}
            autoComplete="email"
            error={forgotForm.formState.errors.email?.message}
            {...forgotForm.register('email')}
          />

          <Button type="submit" className="w-full" isLoading={requestLoading}>
            {authCopy.forgotPassword.submit}
          </Button>
        </form>
      )}
    </AuthCardLayout>
  );
}