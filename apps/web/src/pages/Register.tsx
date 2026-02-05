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
  type: z.literal('educator'),
  contractType: z.enum(['academy', 'personal']),
  document: z.string().min(11, 'Documento inválido'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
}).refine((data) => {
  const normalized = data.document.replace(/\D/g, '');
  return data.contractType === 'academy' ? normalized.length === 14 : normalized.length === 11;
}, {
  message: 'Documento inválido para o tipo de contrato',
  path: ['document'],
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
    watch,
    setValue,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      type: 'educator',
      contractType: 'academy',
    },
  });

  const contractType = watch('contractType');
  const documentLabel = contractType === 'academy' ? 'CNPJ' : 'CPF';

  const formatDocument = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (contractType === 'academy') {
      const limited = digits.slice(0, 14);
      return limited
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    const limited = digits.slice(0, 11);
    return limited
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  };

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    clearError();
    try {
      await registerUser({
        name: data.name,
        email: data.email,
        password: data.password,
        type: data.type,
        contractType: data.contractType,
        document: data.document,
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
            <input type="hidden" value="educator" {...register('type')} />
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
                Tipo de Contrato <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="academy"
                    {...register('contractType')}
                    className="w-4 h-4"
                  />
                  <span>Academia (CNPJ)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value="personal"
                    {...register('contractType')}
                    className="w-4 h-4"
                  />
                  <span>Personal (CPF)</span>
                </label>
              </div>
              {errors.contractType && (
                <p className="text-sm text-destructive mt-1">{errors.contractType.message}</p>
              )}
            </div>

            <Input
              label={documentLabel}
              type="text"
              placeholder={documentLabel === 'CNPJ' ? '00.000.000/0000-00' : '000.000.000-00'}
              error={errors.document?.message}
              {...register('document', {
                onChange: (event) => {
                  const formatted = formatDocument(event.target.value);
                  setValue('document', formatted, { shouldValidate: true });
                },
              })}
            />

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
