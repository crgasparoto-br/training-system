import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { alunoService } from '../services/aluno.service';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { ArrowLeft } from 'lucide-react';

const numberOrUndefined = (value: unknown) =>
  typeof value === 'number' && Number.isNaN(value) ? undefined : value;

const optionalNumberSchema = (schema: z.ZodNumber) =>
  z.preprocess(numberOrUndefined, schema.optional());

const alunoSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no minimo 3 caracteres'),
  email: z.string().email('Email invalido'),
  phone: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  schedulePlan: z.enum(['free', 'fixed']),
  age: z.number().int().min(10, 'Idade minima: 10 anos').max(100, 'Idade maxima: 100 anos'),
  weight: z.number().positive('Peso deve ser positivo'),
  height: z.number().positive('Altura deve ser positiva'),
  bodyFatPercentage: optionalNumberSchema(z.number().min(0).max(100)),
  vo2Max: z.number().positive('VO2 Max deve ser positivo'),
  anaerobicThreshold: z.number().positive('Limiar anaerobico deve ser positivo'),
  maxHeartRate: z.number().int().min(100, 'FC maxima minima: 100 bpm').max(220, 'FC maxima maxima: 220 bpm'),
  restingHeartRate: z.number().int().min(30, 'FC repouso minima: 30 bpm').max(100, 'FC repouso maxima: 100 bpm'),
  systolicPressure: optionalNumberSchema(z.number().int().min(80).max(240)),
  diastolicPressure: optionalNumberSchema(z.number().int().min(40).max(160)),
  macronutrients: z.object({
    carbohydratesPercentage: optionalNumberSchema(z.number().min(0).max(100)),
    proteinsPercentage: optionalNumberSchema(z.number().min(0).max(100)),
    lipidsPercentage: optionalNumberSchema(z.number().min(0).max(100)),
    dailyCalories: optionalNumberSchema(z.number().int().positive()),
  }),
  intakeForm: z.object({
    assessmentDate: z.string().optional(),
    mainGoal: z.string().optional(),
    medicalHistory: z.string().optional(),
    currentMedications: z.string().optional(),
    injuriesHistory: z.string().optional(),
    trainingBackground: z.string().optional(),
    observations: z.string().optional(),
    parqResponses: z.object({
      q1: z.boolean(),
      q2: z.boolean(),
      q3: z.boolean(),
      q4: z.boolean(),
      q5: z.boolean(),
      q6: z.boolean(),
      q7: z.boolean(),
    }),
  }),
});

type AlunoFormData = z.infer<typeof alunoSchema>;

const selectClassName =
  'flex h-12 w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(59,130,246,0.15)]';

const textareaClassName =
  'flex min-h-[120px] w-full rounded-xl border border-[#cbd5e1] bg-background px-4 py-3 text-base ring-offset-background placeholder:text-[#94a3b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:shadow-[0_0_0_6px_rgba(59,130,246,0.15)]';

const parqQuestions = [
  { key: 'q1', label: 'Sente dor no peito durante atividade fisica?' },
  { key: 'q2', label: 'Perde equilibrio por tontura ou ja perdeu a consciencia?' },
  { key: 'q3', label: 'Possui problema osseo ou articular que pode piorar com exercicio?' },
  { key: 'q4', label: 'Usa medicacao para pressao arterial ou condicao cardiaca?' },
  { key: 'q5', label: 'Tem restricao medica atual para praticar exercicios?' },
  { key: 'q6', label: 'Teve lesoes recentes que limitam treino ou avaliacao?' },
  { key: 'q7', label: 'Existe outro motivo para evitar atividade fisica neste momento?' },
] as const;

const formatDateForInput = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

export function AlunoForm() {
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
  } = useForm<AlunoFormData>({
    resolver: zodResolver(alunoSchema),
    defaultValues: {
      schedulePlan: 'free',
      gender: 'male',
      macronutrients: {
        carbohydratesPercentage: undefined,
        proteinsPercentage: undefined,
        lipidsPercentage: undefined,
        dailyCalories: undefined,
      },
      intakeForm: {
        assessmentDate: '',
        mainGoal: '',
        medicalHistory: '',
        currentMedications: '',
        injuriesHistory: '',
        trainingBackground: '',
        observations: '',
        parqResponses: {
          q1: false,
          q2: false,
          q3: false,
          q4: false,
          q5: false,
          q6: false,
          q7: false,
        },
      },
    },
  });

  const weight = watch('weight');
  const height = watch('height');
  const bmi = weight && height ? alunoService.calculateBMI(weight, height) : 0;
  const bmiClass = bmi ? alunoService.getBMIClassification(bmi) : '';

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  };

  useEffect(() => {
    if (isEditMode && id) {
      loadAlunoData(id);
    }
  }, [id, isEditMode]);

  const loadAlunoData = async (alunoId: string) => {
    setLoadingData(true);
    try {
      const aluno = await alunoService.getById(alunoId);
      setValue('name', aluno.user.profile.name);
      setValue('email', aluno.user.email);
      setValue('phone', aluno.user.profile.phone || '');
      setValue('birthDate', formatDateForInput(aluno.user.profile.birthDate));
      setValue('gender', aluno.user.profile.gender || 'male');
      setValue('schedulePlan', aluno.schedulePlan);
      setValue('age', aluno.age);
      setValue('weight', aluno.weight);
      setValue('height', aluno.height);
      setValue('bodyFatPercentage', aluno.bodyFatPercentage);
      setValue('vo2Max', aluno.vo2Max);
      setValue('anaerobicThreshold', aluno.anaerobicThreshold);
      setValue('maxHeartRate', aluno.maxHeartRate);
      setValue('restingHeartRate', aluno.restingHeartRate);
      setValue('systolicPressure', aluno.systolicPressure);
      setValue('diastolicPressure', aluno.diastolicPressure);
      setValue('macronutrients.carbohydratesPercentage', aluno.macronutrients?.carbohydratesPercentage);
      setValue('macronutrients.proteinsPercentage', aluno.macronutrients?.proteinsPercentage);
      setValue('macronutrients.lipidsPercentage', aluno.macronutrients?.lipidsPercentage);
      setValue('macronutrients.dailyCalories', aluno.macronutrients?.dailyCalories);
      setValue('intakeForm.assessmentDate', formatDateForInput(aluno.intakeForm?.assessmentDate));
      setValue('intakeForm.mainGoal', aluno.intakeForm?.mainGoal || '');
      setValue('intakeForm.medicalHistory', aluno.intakeForm?.medicalHistory || '');
      setValue('intakeForm.currentMedications', aluno.intakeForm?.currentMedications || '');
      setValue('intakeForm.injuriesHistory', aluno.intakeForm?.injuriesHistory || '');
      setValue('intakeForm.trainingBackground', aluno.intakeForm?.trainingBackground || '');
      setValue('intakeForm.observations', aluno.intakeForm?.observations || '');
      setValue('intakeForm.parqResponses.q1', aluno.intakeForm?.parqResponses?.q1 ?? false);
      setValue('intakeForm.parqResponses.q2', aluno.intakeForm?.parqResponses?.q2 ?? false);
      setValue('intakeForm.parqResponses.q3', aluno.intakeForm?.parqResponses?.q3 ?? false);
      setValue('intakeForm.parqResponses.q4', aluno.intakeForm?.parqResponses?.q4 ?? false);
      setValue('intakeForm.parqResponses.q5', aluno.intakeForm?.parqResponses?.q5 ?? false);
      setValue('intakeForm.parqResponses.q6', aluno.intakeForm?.parqResponses?.q6 ?? false);
      setValue('intakeForm.parqResponses.q7', aluno.intakeForm?.parqResponses?.q7 ?? false);
    } catch (error) {
      console.error('Erro ao carregar aluno:', error);
      alert('Erro ao carregar dados do aluno');
      navigate('/alunos');
    } finally {
      setLoadingData(false);
    }
  };

  const onSubmit = async (data: AlunoFormData) => {
    setLoading(true);
    try {
      const payload = {
        ...(isEditMode
          ? {}
          : {
              name: data.name,
              email: data.email,
              phone: data.phone,
            }),
        birthDate: data.birthDate || undefined,
        gender: data.gender,
        schedulePlan: data.schedulePlan,
        age: data.age,
        weight: data.weight,
        height: data.height,
        bodyFatPercentage: data.bodyFatPercentage,
        vo2Max: data.vo2Max,
        anaerobicThreshold: data.anaerobicThreshold,
        maxHeartRate: data.maxHeartRate,
        restingHeartRate: data.restingHeartRate,
        systolicPressure: data.systolicPressure,
        diastolicPressure: data.diastolicPressure,
        macronutrients: data.macronutrients,
        intakeForm: {
          assessmentDate: data.intakeForm.assessmentDate || undefined,
          mainGoal: data.intakeForm.mainGoal || undefined,
          medicalHistory: data.intakeForm.medicalHistory || undefined,
          currentMedications: data.intakeForm.currentMedications || undefined,
          injuriesHistory: data.intakeForm.injuriesHistory || undefined,
          trainingBackground: data.intakeForm.trainingBackground || undefined,
          observations: data.intakeForm.observations || undefined,
          parqResponses: data.intakeForm.parqResponses,
        },
      };

      if (isEditMode && id) {
        await alunoService.update(id, payload);
        alert('Aluno atualizado com sucesso!');
        navigate(`/alunos/${id}`);
        return;
      }

      const createdAluno = await alunoService.create(payload);
      navigate(`/alunos/${createdAluno.aluno.id}`, {
        state: { tempPassword: createdAluno.tempPassword },
      });
    } catch (error: any) {
      console.error('Erro ao salvar aluno:', error);
      alert(error.response?.data?.error || 'Erro ao salvar aluno');
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="mt-4 text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/alunos')}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{isEditMode ? 'Editar Aluno' : 'Novo Aluno'}</h1>
          <p className="mt-2 text-muted-foreground">
            {isEditMode
              ? 'Atualize o cadastro e a avaliacao inicial do aluno'
              : 'Preencha o formulario de cadastro inicial do aluno'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Escopo do Cadastro</CardTitle>
            <CardDescription>
              A tela agora cobre cadastro basico, indicadores iniciais, PAR-Q, pressao arterial, objetivos e distribuicao de macronutrientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              Historicos completos de avaliacao fisica em PDF, variaveis detalhadas de laudo e reprocessamento continuam centralizados na area de avaliacoes do aluno.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Identificacao e Cadastro</CardTitle>
            <CardDescription>Dados fixos do aluno que devem permanecer no cadastro principal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input label="Nome Completo" placeholder="Joao Silva" error={errors.name?.message} disabled={isEditMode} {...register('name')} />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Email" type="email" placeholder="joao@email.com" error={errors.email?.message} disabled={isEditMode} {...register('email')} />
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input label="Data de Nascimento" type="date" error={errors.birthDate?.message} {...register('birthDate')} />
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Genero</label>
                <select className={selectClassName} {...register('gender')}>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <Input label="Idade" type="number" placeholder="30" error={errors.age?.message} {...register('age', { valueAsNumber: true })} />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Plano de agenda do aluno</label>
              <select className={selectClassName} {...register('schedulePlan')}>
                <option value="free">Livre</option>
                <option value="fixed">Fixo</option>
              </select>
              <p className="mt-2 text-sm text-muted-foreground">Use plano fixo para alunos com rotina recorrente de agenda e reposicoes vinculadas.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Antropometria e Composicao Corporal</CardTitle>
            <CardDescription>Campos iniciais do formulario fisico usados no acompanhamento do aluno</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input label="Peso (kg)" type="number" step="0.1" placeholder="70.5" error={errors.weight?.message} {...register('weight', { valueAsNumber: true })} />
              <Input label="Altura (cm)" type="number" step="0.1" placeholder="175" error={errors.height?.message} {...register('height', { valueAsNumber: true })} />
              <Input label="% Gordura Corporal" type="number" step="0.1" placeholder="15.5" error={errors.bodyFatPercentage?.message} {...register('bodyFatPercentage', { valueAsNumber: true })} />
            </div>

            {bmi > 0 && (
              <div className="rounded-lg bg-muted p-4">
                <p className="text-sm font-medium">IMC Calculado</p>
                <p className="text-2xl font-bold">{bmi.toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">{bmiClass}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avaliacao Metabolica e Cardiovascular</CardTitle>
            <CardDescription>Dados principais para prescricao e leitura inicial do aluno</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="VO2 Max (ml/kg/min)" type="number" step="0.1" placeholder="55.0" error={errors.vo2Max?.message} {...register('vo2Max', { valueAsNumber: true })} />
              <Input label="Limiar Anaerobico (km/h)" type="number" step="0.1" placeholder="15.0" error={errors.anaerobicThreshold?.message} {...register('anaerobicThreshold', { valueAsNumber: true })} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="FC Maxima (bpm)" type="number" placeholder="190" error={errors.maxHeartRate?.message} {...register('maxHeartRate', { valueAsNumber: true })} />
              <Input label="FC Repouso (bpm)" type="number" placeholder="60" error={errors.restingHeartRate?.message} {...register('restingHeartRate', { valueAsNumber: true })} />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input label="Data da Avaliacao Inicial" type="date" error={errors.intakeForm?.assessmentDate?.message} {...register('intakeForm.assessmentDate')} />
              <Input label="Pressao Sistólica (mmHg)" type="number" placeholder="120" error={errors.systolicPressure?.message} {...register('systolicPressure', { valueAsNumber: true })} />
              <Input label="Pressao Diastólica (mmHg)" type="number" placeholder="80" error={errors.diastolicPressure?.message} {...register('diastolicPressure', { valueAsNumber: true })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aporte Energetico e Macronutrientes</CardTitle>
            <CardDescription>Resumo nutricional do formulario inicial quando disponivel</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Input label="Carboidratos (%)" type="number" step="0.1" placeholder="55" error={errors.macronutrients?.carbohydratesPercentage?.message} {...register('macronutrients.carbohydratesPercentage', { valueAsNumber: true })} />
              <Input label="Proteinas (%)" type="number" step="0.1" placeholder="25" error={errors.macronutrients?.proteinsPercentage?.message} {...register('macronutrients.proteinsPercentage', { valueAsNumber: true })} />
              <Input label="Lipidios (%)" type="number" step="0.1" placeholder="20" error={errors.macronutrients?.lipidsPercentage?.message} {...register('macronutrients.lipidsPercentage', { valueAsNumber: true })} />
              <Input label="Kcal por dia" type="number" placeholder="2200" error={errors.macronutrients?.dailyCalories?.message} {...register('macronutrients.dailyCalories', { valueAsNumber: true })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Avaliacao Inicial Complementar</CardTitle>
            <CardDescription>Objetivos, historico, lesoes e contexto inicial do aluno</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Objetivo principal</label>
              <textarea className={textareaClassName} placeholder="Ex.: melhorar performance, reduzir gordura, retornar ao treino" {...register('intakeForm.mainGoal')} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Historico de treino e atividade fisica</label>
              <textarea className={textareaClassName} placeholder="Descreva frequencia, modalidades e experiencia previa" {...register('intakeForm.trainingBackground')} />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Historico medico</label>
              <textarea className={textareaClassName} placeholder="Condicoes clinicas relevantes, cirurgias ou observacoes" {...register('intakeForm.medicalHistory')} />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Medicacoes em uso</label>
                <textarea className={textareaClassName} placeholder="Medicacoes continuas ou recentes" {...register('intakeForm.currentMedications')} />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">Lesoes e restricoes</label>
                <textarea className={textareaClassName} placeholder="Lesoes anteriores, dores recorrentes e limitacoes" {...register('intakeForm.injuriesHistory')} />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Observacoes do profissional</label>
              <textarea className={textareaClassName} placeholder="Observacoes complementares da avaliacao inicial" {...register('intakeForm.observations')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>PAR-Q</CardTitle>
            <CardDescription>Questionario de prontidao para atividade fisica registrado junto ao cadastro</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {parqQuestions.map((question) => (
              <label key={question.key} className="flex items-start gap-3 rounded-xl border border-[#e2e8f0] px-4 py-3 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" {...register(`intakeForm.parqResponses.${question.key}` as const)} />
                <span>{question.label}</span>
              </label>
            ))}
            <p className="text-sm text-muted-foreground">Marque as respostas positivas. Se todas permanecerem desmarcadas, o aluno nao sinalizou restricoes no PAR-Q.</p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigate('/alunos')}>
            Cancelar
          </Button>
          <Button type="submit" isLoading={loading}>
            {isEditMode ? 'Atualizar Aluno' : 'Criar Aluno'}
          </Button>
        </div>
      </form>
    </div>
  );
}

