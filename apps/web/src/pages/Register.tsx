import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { AuthCardLayout } from '../components/auth/AuthCardLayout';

const registerSchema = z
  .object({
    name: z.string().min(3, 'Nome deve ter no minimo 3 caracteres'),
    email: z.string().email('Email invalido'),
    password: z.string().min(8, 'Senha deve ter no minimo 8 caracteres'),
    confirmPassword: z.string(),
    type: z.literal('professor'),
    contractType: z.enum(['academy', 'personal']),
    document: z.string().min(11, 'Documento invalido'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas nao coincidem',
    path: ['confirmPassword'],
  })
  .refine(
    (data) => {
      const normalized = data.document.replace(/\D/g, '');
      return data.contractType === 'academy' ? normalized.length === 14 : normalized.length === 11;
    },
    {
      message: 'Documento invalido para o tipo de contrato',
      path: ['document'],
    }
  );

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
      type: 'professor',
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
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCardLayout
      title="Criar conta"
      description="Preencha os dados para cadastrar um novo acesso."
      footer={
        <>
          <Button type="submit" form="register-form" className="w-full" isLoading={isLoading}>
            Criar conta
          </Button>
          <div className="text-center text-sm text-muted-foreground">
            Ja tem uma conta?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </div>
        </>
      }
    >
      <form id="register-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <input type="hidden" value="professor" {...register('type')} />

        {error && (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Input label="Nome completo" type="text" placeholder="Joao Silva" error={errors.name?.message} {...register('name')} />

        <Input
          label="Email"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <label className="mb-2 block text-sm font-medium">Tipo de contrato</label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm">
              <input type="radio" value="academy" {...register('contractType')} className="h-4 w-4" />
              <span>Academia (CNPJ)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-2 text-sm">
              <input type="radio" value="personal" {...register('contractType')} className="h-4 w-4" />
              <span>Personal (CPF)</span>
            </label>
          </div>
          {errors.contractType && <p className="mt-1 text-sm text-destructive">{errors.contractType.message}</p>}
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
          placeholder="Digite sua senha"
          autoComplete="new-password"
          error={errors.password?.message}
          {...register('password')}
        />

        <Input
          label="Confirmar senha"
          type="password"
          placeholder="Repita sua senha"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />
      </form>
    </AuthCardLayout>
  );
}
