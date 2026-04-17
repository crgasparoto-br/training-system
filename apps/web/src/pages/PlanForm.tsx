import { useState, useEffect } from 'react';
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
import { ArrowLeft } from 'lucide-react';

const planSchema = z.object({
  alunoId: z.string().min(1, 'Selecione um aluno'),
  name: z.string().min(3, 'Nome deve ter no mÃ­nimo 3 caracteres'),
  description: z.string().optional(),
  startDate: z.string().min(1, 'Data de inÃ­cio Ã© obrigatÃ³ria'),
  endDate: z.string().min(1, 'Data de tÃ©rmino Ã© obrigatÃ³ria'),
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return end > start;
}, {
  message: 'Data de tÃ©rmino deve ser posterior Ã  data de inÃ­cio',
  path: ['endDate'],
});

type PlanFormData = z.infer<typeof planSchema>;

export function PlanForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id;
  const alunoIdParam = searchParams.get('alunoId') || '';
  const [loading, setLoading] = useState(false);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [loadingAlunos, setLoadingAlunos] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    reset,
    setValue,
  } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');

  // Calcular duraÃ§Ã£o em semanas
  const duration = startDate && endDate ? (() => {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end) return 0;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
    return diffWeeks;
  })() : 0;

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
    try {
      const data = await alunoService.list(1, 100);
      setAlunos(data.alunos);
      if (!isEditMode && alunoIdParam) {
        setValue('alunoId', alunoIdParam, { shouldValidate: true });
      }
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
    } finally {
      setLoadingAlunos(false);
    }
  };

  const onSubmit = async (data: PlanFormData) => {
    setLoading(true);
    try {
      if (isEditMode && id) {
        // Modo de ediÃ§Ã£o
        await planService.update(id, {
          ...data,
          startDate: toIsoDateAtNoonUTC(data.startDate),
          endDate: toIsoDateAtNoonUTC(data.endDate),
        });
        alert('Plano atualizado com sucesso!');
        navigate(`/plans/${id}`);
      } else {
        // Modo de criaÃ§Ã£o
        const plan = await planService.create({
          ...data,
          startDate: toIsoDateAtNoonUTC(data.startDate),
          endDate: toIsoDateAtNoonUTC(data.endDate),
        });

        // Gerar semanas automaticamente
        await planService.generateWeeks(plan.id);

        alert('Plano criado com sucesso!');
        navigate(`/plans/${plan.id}`);
      }
    } catch (error: any) {
      console.error(`Erro ao ${isEditMode ? 'atualizar' : 'criar'} plano:`, error);
      alert(error.response?.data?.error || `Erro ao ${isEditMode ? 'atualizar' : 'criar'} plano`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/plans')}>
          <ArrowLeft size={20} />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{isEditMode ? 'Editar Plano de Treino' : 'Novo Plano de Treino'}</h1>
          <p className="text-muted-foreground mt-2">
            {isEditMode ? 'Atualize as informaÃ§Ãµes do plano de treino' : 'Crie um plano de treino personalizado para seu aluno'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* InformaÃ§Ãµes BÃ¡sicas */}
        <Card>
          <CardHeader>
            <CardTitle>InformaÃ§Ãµes BÃ¡sicas</CardTitle>
            <CardDescription>Dados principais do plano de treino</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Aluno */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Aluno *</label>
              {loadingAlunos ? (
                <div className="text-sm text-muted-foreground">Carregando alunos...</div>
              ) : (
                <select
                  className="w-full p-2 border rounded-md"
                  {...register('alunoId')}
                  disabled={!isEditMode && !!alunoIdParam}
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
                <p className="text-sm text-red-500">{errors.alunoId.message}</p>
              )}
            </div>

            {/* Nome */}
            <Input
              label="Nome do Plano"
              placeholder="PreparaÃ§Ã£o para Maratona de SÃ£o Paulo"
              error={errors.name?.message}
              {...register('name')}
            />

            {/* DescriÃ§Ã£o */}
            <div className="space-y-2">
              <label className="text-sm font-medium">DescriÃ§Ã£o</label>
              <textarea
                className="w-full p-2 border rounded-md min-h-[100px]"
                placeholder="Descreva os objetivos e caracterÃ­sticas deste plano..."
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-red-500">{errors.description.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* PerÃ­odo */}
        <Card>
          <CardHeader>
            <CardTitle>PerÃ­odo do Plano</CardTitle>
            <CardDescription>Defina o perÃ­odo de duraÃ§Ã£o do plano</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Data de InÃ­cio"
                type="date"
                error={errors.startDate?.message}
                {...register('startDate')}
              />

              <Input
                label="Data de TÃ©rmino"
                type="date"
                error={errors.endDate?.message}
                {...register('endDate')}
              />
            </div>

            {duration > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">DuraÃ§Ã£o Calculada</p>
                <p className="text-2xl font-bold">{duration} semanas</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {Math.floor(duration / 4)} meses aproximadamente
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* InformaÃ§Ãµes Adicionais */}
        <Card>
          <CardHeader>
            <CardTitle>O Que Acontece ApÃ³s Criar?</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary">âœ“</span>
                <span>O plano serÃ¡ criado com a estrutura bÃ¡sica</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">âœ“</span>
                <span>As semanas serÃ£o geradas automaticamente</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">âœ“</span>
                <span>VocÃª poderÃ¡ adicionar sessÃµes de treino em cada semana</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">âœ“</span>
                <span>O aluno terÃ¡ acesso ao plano no app mobile</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 justify-start">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/plans')}
          >
            Cancelar
          </Button>
          <Button type="submit" isLoading={loading}>
            {isEditMode ? 'Atualizar Plano' : 'Criar Plano'}
          </Button>
        </div>
      </form>
    </div>
  );
}

