import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { planService } from '../services/plan.service';
import { alunoService, type Aluno } from '../services/aluno.service';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { parseDateOnly, toDateInputValue, toIsoDateAtNoonUTC } from '../utils/date';
import { ArrowLeft, CalendarDays, CheckCircle2, CircleAlert, UserRound } from 'lucide-react';

const planSchema = z.object({
  alunoId: z.string().min(1, 'Selecione um aluno'),
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  description: z.string().optional(),
  startDate: z.string().min(1, 'Data de início é obrigatória'),
  endDate: z.string().min(1, 'Data de término é obrigatória'),
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end > start;
}, {
  message: 'Data de término deve ser posterior à data de início',
  path: ['endDate'],
});

type PlanFormData = z.infer<typeof planSchema>;

export function PlanForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id;
  const alunoIdParam = searchParams.get('alunoId') || '';
  const hasStudentContext = !isEditMode && !!alunoIdParam;
  const returnPath = hasStudentContext ? `/central-do-aluno/${alunoIdParam}` : '/plans';
  const [loading, setLoading] = useState(false);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [loadingAlunos, setLoadingAlunos] = useState(true);
  const [alunosError, setAlunosError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
    setValue,
  } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      alunoId: alunoIdParam,
      name: '',
      description: '',
      startDate: '',
      endDate: '',
    },
  });

  const selectedAlunoId = watch('alunoId');
  const startDate = watch('startDate');
  const endDate = watch('endDate');

  const selectedAluno = useMemo(
    () => alunos.find((aluno) => aluno.id === selectedAlunoId) ?? null,
    [alunos, selectedAlunoId]
  );

  const duration = useMemo(() => {
    if (!startDate || !endDate) return 0;

    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end) return 0;

    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
  }, [endDate, startDate]);

  useEffect(() => {
    loadAlunos();
    if (isEditMode && id) {
      loadPlan(id);
    }
  }, [id, isEditMode]);

  const loadPlan = async (planId: string) => {
    try {
      const plan = await planService.getById(planId);
      reset({
        alunoId: plan.alunoId,
        name: plan.name,
        description: plan.description || '',
        startDate: toDateInputValue(plan.startDate),
        endDate: toDateInputValue(plan.endDate),
      });
    } catch (error) {
      console.error('Erro ao carregar plano:', error);
      alert('Erro ao carregar plano');
      navigate('/plans');
    }
  };

  const loadAlunos = async () => {
    setLoadingAlunos(true);
    setAlunosError(null);
    try {
      const data = await alunoService.list(1, 100);
      setAlunos(data.alunos);
      if (hasStudentContext) {
        setValue('alunoId', alunoIdParam, { shouldValidate: true });
      }
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
      setAlunosError('Não foi possível carregar os alunos. Tente novamente antes de salvar o plano.');
    } finally {
      setLoadingAlunos(false);
    }
  };

  const onSubmit = async (data: PlanFormData) => {
    setLoading(true);
    setSubmitError(null);
    try {
      if (isEditMode && id) {
        await planService.update(id, {
          ...data,
          startDate: toIsoDateAtNoonUTC(data.startDate),
          endDate: toIsoDateAtNoonUTC(data.endDate),
        });
        alert('Plano atualizado com sucesso!');
        navigate(`/plans/${id}`);
      } else {
        const plan = await planService.create({
          ...data,
          startDate: toIsoDateAtNoonUTC(data.startDate),
          endDate: toIsoDateAtNoonUTC(data.endDate),
        });

        await planService.generateWeeks(plan.id);

        alert('Plano criado com sucesso!');
        navigate(`/plans/${plan.id}`);
      }
    } catch (error: any) {
      console.error(`Erro ao ${isEditMode ? 'atualizar' : 'criar'} plano:`, error);
      setSubmitError(
        error.response?.data?.error || `Não foi possível ${isEditMode ? 'atualizar' : 'criar'} o plano. Tente novamente.`
      );
    } finally {
      setLoading(false);
    }
  };

  const durationLabel = duration === 1 ? '1 semana' : `${duration} semanas`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex items-start gap-3 sm:gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(returnPath)}
          aria-label={hasStudentContext ? 'Voltar para a Central do Aluno' : 'Voltar para planos'}
          className="mt-0.5 shrink-0"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {isEditMode ? 'Editar plano de treino' : 'Novo plano de treino'}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
            {isEditMode
              ? 'Atualize o período, o nome e as informações que orientam este plano.'
              : hasStudentContext
                ? 'Defina o período e as informações do plano mantendo o aluno selecionado como contexto.'
                : 'Defina o aluno, o período e as informações principais antes de montar as semanas de treino.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Informações principais</CardTitle>
                <CardDescription>Identifique o plano e confirme para quem ele será aplicado.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="plan-student" className="text-sm font-medium text-foreground">
                    Aluno <span className="text-destructive">*</span>
                  </label>

                  {hasStudentContext ? (
                    <>
                      <input type="hidden" {...register('alunoId')} />
                      <div
                        id="plan-student"
                        className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <UserRound className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            {loadingAlunos
                              ? 'Carregando aluno...'
                              : selectedAluno?.user.profile.name || 'Aluno selecionado'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            O plano será criado no contexto deste aluno.
                          </p>
                        </div>
                      </div>
                    </>
                  ) : loadingAlunos ? (
                    <div className="flex min-h-11 items-center rounded-lg border border-border bg-muted/30 px-4 text-sm text-muted-foreground">
                      Carregando alunos...
                    </div>
                  ) : (
                    <select
                      id="plan-student"
                      className="flex h-11 w-full rounded-lg border border-input bg-card px-4 py-2.5 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-invalid={errors.alunoId ? true : undefined}
                      aria-describedby={errors.alunoId ? 'plan-student-error' : undefined}
                      {...register('alunoId')}
                    >
                      <option value="">Selecione um aluno</option>
                      {alunos.map((aluno) => (
                        <option key={aluno.id} value={aluno.id}>
                          {aluno.user.profile.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {errors.alunoId && (
                    <p id="plan-student-error" className="text-sm text-destructive">
                      {errors.alunoId.message}
                    </p>
                  )}
                  {alunosError && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{alunosError}</span>
                    </div>
                  )}
                </div>

                <Input
                  label="Nome do plano"
                  placeholder="Ex.: Preparação para Maratona de São Paulo"
                  error={errors.name?.message}
                  required
                  {...register('name')}
                />

                <div className="space-y-2">
                  <label htmlFor="plan-description" className="text-sm font-medium text-foreground">
                    Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <textarea
                    id="plan-description"
                    className="min-h-[120px] w-full resize-y rounded-lg border border-input bg-card px-4 py-3 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="Registre o objetivo do ciclo, prioridades e observações úteis para a montagem do treino."
                    aria-invalid={errors.description ? true : undefined}
                    aria-describedby={errors.description ? 'plan-description-error' : undefined}
                    {...register('description')}
                  />
                  {errors.description && (
                    <p id="plan-description-error" className="text-sm text-destructive">
                      {errors.description.message}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Período do plano</CardTitle>
                <CardDescription>Defina as datas que delimitam este ciclo de treinamento.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Data de início"
                    type="date"
                    error={errors.startDate?.message}
                    required
                    {...register('startDate')}
                  />

                  <Input
                    label="Data de término"
                    type="date"
                    error={errors.endDate?.message}
                    required
                    {...register('endDate')}
                  />
                </div>

                {duration > 0 && (
                  <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4" aria-live="polite">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Duração estimada: {durationLabel}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        As semanas serão geradas automaticamente depois que o plano for criado.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-6" aria-label="Resumo da criação do plano">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resumo do plano</CardTitle>
                <CardDescription>Confira o contexto antes de salvar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aluno</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {selectedAluno?.user.profile.name || (hasStudentContext ? 'Aluno selecionado' : 'Ainda não selecionado')}
                  </p>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período</p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {duration > 0 ? durationLabel : 'Defina as datas do plano'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-sm font-semibold text-foreground">Depois de criar</p>
              <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>A estrutura básica e as semanas do plano serão criadas automaticamente.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>Você poderá montar as sessões de treino de cada semana na etapa seguinte.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>O plano ficará vinculado ao aluno escolhido para acompanhamento posterior.</span>
                </li>
              </ul>
            </div>
          </aside>
        </div>

        {submitError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(returnPath)}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button type="submit" isLoading={loading} className="w-full sm:w-auto">
            {isEditMode ? 'Atualizar plano' : 'Criar plano'}
          </Button>
        </div>
      </form>
    </div>
  );
}
