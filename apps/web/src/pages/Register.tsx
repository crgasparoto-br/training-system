import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';

const registerSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  confirmPassword: z.string(),
  type: z.enum(['educator', 'student']),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

type RegisterFormData = z.infer<typeof registerSchema>;

export function Register() {
  const navigate = useNavigate();
  const { register: registerUser, error, clearError } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      type: 'educator',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    clearError();
    try {
      await registerUser({
        name: data.name,
        email: data.email,
        password: data.password,
        type: data.type,
      });
      navigate('/dashboard');
    } catch (error) {
      // Erro já tratado no store
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center">Criar Conta</CardTitle>
          <CardDescription className="text-center">
            Preencha os dados abaixo para criar sua conta
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md border border-destructive/20">
                {error}
              </div>
            )}

            <Input
              label="Nome Completo"
              type="text"
              placeholder="João Silva"
              error={errors.name?.message}
              {...register('name')}
            />

            <Input
              label="Email"
              type="email"
              placeholder="seu@email.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <div>
              <label className="block text-sm font-medium mb-2">
                Tipo de Conta <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="educator"
                    {...register('type')}
                    className="w-4 h-4"
                  />
                  <span>Educador Físico</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="student"
                    {...register('type')}
                    className="w-4 h-4"
                  />
                  <span>Aluno</span>
                </label>
              </div>
              {errors.type && (
                <p className="text-sm text-destructive mt-1">{errors.type.message}</p>
              )}
            </div>

            <Input
              label="Senha"
              type="password"
              placeholder="••••••••"
              error={errors.password?.message}
              {...register('password')}
            />

            <Input
              label="Confirmar Senha"
              type="password"
              placeholder="••••••••"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" isLoading={isLoading}>
              Criar Conta
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              Já tem uma conta?{' '}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Faça login
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
