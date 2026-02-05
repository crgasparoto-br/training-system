import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { athleteService } from '../services/athlete.service';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { ArrowLeft } from 'lucide-react';

const athleteSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  age: z.number().int().min(10, 'Idade mínima: 10 anos').max(100, 'Idade máxima: 100 anos'),
  weight: z.number().positive('Peso deve ser positivo'),
  height: z.number().positive('Altura deve ser positiva'),
  bodyFatPercentage: z.number().min(0).max(100).optional(),
  vo2Max: z.number().positive('VO2 Max deve ser positivo'),
  anaerobicThreshold: z.number().positive('Limiar anaeróbico deve ser positivo'),
  maxHeartRate: z.number().int().min(100, 'FC máxima mínima: 100 bpm').max(220, 'FC máxima máxima: 220 bpm'),
  restingHeartRate: z.number().int().min(30, 'FC repouso mínima: 30 bpm').max(100, 'FC repouso máxima: 100 bpm'),
});

type AthleteFormData = z.infer<typeof athleteSchema>;

export function AthleteForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = !!id;
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditMode);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<AthleteFormData>({
    resolver: zodResolver(athleteSchema),
  });

  const weight = watch('weight');
  const height = watch('height');

  // Calcular IMC em tempo real
  const bmi = weight && height ? athleteService.calculateBMI(weight, height) : 0;
  const bmiClass = bmi ? athleteService.getBMIClassification(bmi) : '';

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  };

  useEffect(() => {
    if (isEditMode && id) {
      loadAthleteData(id);
    }
  }, [id, isEditMode]);

  const loadAthleteData = async (athleteId: string) => {
    setLoadingData(true);
    try {
      const athlete = await athleteService.getById(athleteId);
      setValue('name', athlete.user.profile.name);
      setValue('email', athlete.user.email);
      setValue('phone', athlete.user.profile.phone || '');
      setValue('age', athlete.age);
      setValue('weight', athlete.weight);
      setValue('height', athlete.height);
      setValue('bodyFatPercentage', athlete.bodyFatPercentage);
      setValue('vo2Max', athlete.vo2Max);
      setValue('anaerobicThreshold', athlete.anaerobicThreshold);
      setValue('maxHeartRate', athlete.maxHeartRate);
      setValue('restingHeartRate', athlete.restingHeartRate);
    } catch (error) {
      console.error('Erro ao carregar atleta:', error);
      alert('Erro ao carregar dados do atleta');
      navigate('/athletes');
    } finally {
      setLoadingData(false);
    }
  };

  const onSubmit = async (data: AthleteFormData) => {
    setLoading(true);
    try {
      if (isEditMode && id) {
        // Atualizar atleta existente
        await athleteService.update(id, {
          age: data.age,
          weight: data.weight,
          height: data.height,
          bodyFatPercentage: data.bodyFatPercentage,
          vo2Max: data.vo2Max,
          anaerobicThreshold: data.anaerobicThreshold,
          maxHeartRate: data.maxHeartRate,
          restingHeartRate: data.restingHeartRate,
        });
        alert('Atleta atualizado com sucesso!');
      } else {
        // Criar novo atleta
        await athleteService.create({
          name: data.name,
          email: data.email,
          phone: data.phone,
          age: data.age,
          weight: data.weight,
          height: data.height,
          bodyFatPercentage: data.bodyFatPercentage,
          vo2Max: data.vo2Max,
          anaerobicThreshold: data.anaerobicThreshold,
          maxHeartRate: data.maxHeartRate,
          restingHeartRate: data.restingHeartRate,
        });
        alert('Atleta criado com sucesso!');
      }
      navigate('/athletes');
    } catch (error: any) {
      console.error('Erro ao salvar atleta:', error);
      alert(error.response?.data?.error || 'Erro ao salvar atleta');
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/athletes')}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">
            {isEditMode ? 'Editar Atleta' : 'Novo Atleta'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {isEditMode
              ? 'Atualize as informações do atleta'
              : 'Preencha os dados para cadastrar um novo atleta'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Dados Pessoais */}
        <Card>
          <CardHeader>
            <CardTitle>Dados Pessoais</CardTitle>
            <CardDescription>Informações básicas do atleta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="Nome Completo"
              placeholder="João Silva"
              error={errors.name?.message}
              disabled={isEditMode}
              {...register('name')}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Email"
                type="email"
                placeholder="joao@email.com"
                error={errors.email?.message}
                disabled={isEditMode}
                {...register('email')}
              />

              <Input
                label="Telefone"
                type="tel"
                placeholder="(11) 99999-9999"
                error={errors.phone?.message}
                disabled={isEditMode}
                {...register('phone', {
                  onChange: (event) => {
                    const formatted = formatPhone(event.target.value);
                    setValue('phone', formatted, { shouldValidate: true });
                  },
                })}
              />
            </div>

            <Input
              label="Idade"
              type="number"
              placeholder="30"
              error={errors.age?.message}
              {...register('age', { valueAsNumber: true })}
            />
          </CardContent>
        </Card>

        {/* Dados Antropométricos */}
        <Card>
          <CardHeader>
            <CardTitle>Dados Antropométricos</CardTitle>
            <CardDescription>Medidas físicas do atleta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                label="Peso (kg)"
                type="number"
                step="0.1"
                placeholder="70.5"
                error={errors.weight?.message}
                {...register('weight', { valueAsNumber: true })}
              />

              <Input
                label="Altura (cm)"
                type="number"
                step="0.1"
                placeholder="175"
                error={errors.height?.message}
                {...register('height', { valueAsNumber: true })}
              />

              <Input
                label="% Gordura Corporal"
                type="number"
                step="0.1"
                placeholder="15.5"
                error={errors.bodyFatPercentage?.message}
                {...register('bodyFatPercentage', { valueAsNumber: true })}
              />
            </div>

            {bmi > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">IMC Calculado</p>
                <p className="text-2xl font-bold">{bmi.toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">{bmiClass}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dados de Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Dados de Performance</CardTitle>
            <CardDescription>Métricas de desempenho do atleta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="VO2 Max (ml/kg/min)"
                type="number"
                step="0.1"
                placeholder="55.0"
                error={errors.vo2Max?.message}
                {...register('vo2Max', { valueAsNumber: true })}
              />

              <Input
                label="Limiar Anaeróbico (km/h)"
                type="number"
                step="0.1"
                placeholder="15.0"
                error={errors.anaerobicThreshold?.message}
                {...register('anaerobicThreshold', { valueAsNumber: true })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="FC Máxima (bpm)"
                type="number"
                placeholder="190"
                error={errors.maxHeartRate?.message}
                {...register('maxHeartRate', { valueAsNumber: true })}
              />

              <Input
                label="FC Repouso (bpm)"
                type="number"
                placeholder="60"
                error={errors.restingHeartRate?.message}
                {...register('restingHeartRate', { valueAsNumber: true })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/athletes')}
          >
            Cancelar
          </Button>
          <Button type="submit" isLoading={loading}>
            {isEditMode ? 'Atualizar Atleta' : 'Criar Atleta'}
          </Button>
        </div>
      </form>
    </div>
  );
}
