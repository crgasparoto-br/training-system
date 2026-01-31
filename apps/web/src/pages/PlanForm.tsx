import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { planService } from '../services/plan.service';
import { athleteService, type Athlete } from '../services/athlete.service';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { ArrowLeft } from 'lucide-react';

const planSchema = z.object({
  athleteId: z.string().min(1, 'Selecione um atleta'),
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
  const [loading, setLoading] = useState(false);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');

  // Calcular duração em semanas
  const duration = startDate && endDate ? (() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
    return diffWeeks;
  })() : 0;

  useEffect(() => {
    loadAthletes();
  }, []);

  const loadAthletes = async () => {
    setLoadingAthletes(true);
    try {
      const data = await athleteService.list(1, 100);
      setAthletes(data.athletes);
    } catch (error) {
      console.error('Erro ao carregar atletas:', error);
    } finally {
      setLoadingAthletes(false);
    }
  };

  const onSubmit = async (data: PlanFormData) => {
    setLoading(true);
    try {
      const plan = await planService.create({
        ...data,
        startDate: new Date(data.startDate).toISOString(),
        endDate: new Date(data.endDate).toISOString(),
      });

      // Gerar semanas automaticamente
      await planService.generateWeeks(plan.id);

      alert('Plano criado com sucesso!');
      navigate(`/plans/${plan.id}`);
    } catch (error: any) {
      console.error('Erro ao criar plano:', error);
      alert(error.response?.data?.error || 'Erro ao criar plano');
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
          <h1 className="text-3xl font-bold">Novo Plano de Treino</h1>
          <p className="text-muted-foreground mt-2">
            Crie um plano de treino personalizado para seu atleta
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Informações Básicas */}
        <Card>
          <CardHeader>
            <CardTitle>Informações Básicas</CardTitle>
            <CardDescription>Dados principais do plano de treino</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Atleta */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Atleta *</label>
              {loadingAthletes ? (
                <div className="text-sm text-muted-foreground">Carregando atletas...</div>
              ) : (
                <select
                  className="w-full p-2 border rounded-md"
                  {...register('athleteId')}
                >
                  <option value="">Selecione um atleta</option>
                  {athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.user.profile.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.athleteId && (
                <p className="text-sm text-red-500">{errors.athleteId.message}</p>
              )}
            </div>

            {/* Nome */}
            <Input
              label="Nome do Plano"
              placeholder="Preparação para Maratona de São Paulo"
              error={errors.name?.message}
              {...register('name')}
            />

            {/* Descrição */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Descrição</label>
              <textarea
                className="w-full p-2 border rounded-md min-h-[100px]"
                placeholder="Descreva os objetivos e características deste plano..."
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-red-500">{errors.description.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Período */}
        <Card>
          <CardHeader>
            <CardTitle>Período do Plano</CardTitle>
            <CardDescription>Defina o período de duração do plano</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Data de Início"
                type="date"
                error={errors.startDate?.message}
                {...register('startDate')}
              />

              <Input
                label="Data de Término"
                type="date"
                error={errors.endDate?.message}
                {...register('endDate')}
              />
            </div>

            {duration > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm font-medium">Duração Calculada</p>
                <p className="text-2xl font-bold">{duration} semanas</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {Math.floor(duration / 4)} meses aproximadamente
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Informações Adicionais */}
        <Card>
          <CardHeader>
            <CardTitle>O Que Acontece Após Criar?</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span>
                <span>O plano será criado com a estrutura básica</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span>
                <span>As semanas serão geradas automaticamente</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span>
                <span>Você poderá adicionar sessões de treino em cada semana</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary">✓</span>
                <span>O atleta terá acesso ao plano no app mobile</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4 justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/plans')}
          >
            Cancelar
          </Button>
          <Button type="submit" isLoading={loading}>
            Criar Plano
          </Button>
        </div>
      </form>
    </div>
  );
}
