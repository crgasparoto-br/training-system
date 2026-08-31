import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { planService, type TrainingPlan } from '../services/plan.service';
import {
  periodizationService,
  type PeriodizationMatrix,
} from '../services/periodization.service';
import { PeriodizationMatrixComponent } from '../components/PeriodizationMatrix';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { planDetailsCopy } from '../i18n/ptBR';
import { formatDateBR, parseDateOnly } from '../utils/date';
import {
  Activity,
  ArrowLeft,
  Calendar,
  ChevronRight,
  Dumbbell,
  Edit,
  Trash2,
} from 'lucide-react';

type PlanDetailsTab = 'assembly' | 'periodization';

type PlanWeek = {
  globalWeekNumber: number;
  startDate: Date;
  endDate: Date;
};

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function PlanDetails() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [matrix, setMatrix] = useState<PeriodizationMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PlanDetailsTab>('assembly');

  useEffect(() => {
    if (id) {
      void loadPlan(id);
    }
  }, [id]);

  const loadPlan = async (planId: string) => {
    setLoading(true);
    try {
      const data = await planService.getById(planId);
      setPlan(data);

      try {
        const periodization = await periodizationService.getMatrixByPlanId(planId);
        setMatrix(periodization);
      } catch (error) {
        console.error('Erro ao carregar periodização:', error);
        setMatrix(null);
      }
    } catch (error) {
      console.error('Erro ao carregar plano:', error);
      alert(planDetailsCopy.loadError);
      navigate('/plans');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm(planDetailsCopy.deleteConfirm)) {
      return;
    }

    try {
      await planService.delete(id);
      alert(planDetailsCopy.deleteSuccess);
      navigate('/plans');
    } catch (error) {
      console.error('Erro ao deletar plano:', error);
      alert(planDetailsCopy.deleteError);
    }
  };

  const planWeeks = useMemo<PlanWeek[]>(() => {
    if (!plan) return [];

    const planStart = parseDateOnly(plan.startDate);
    const planEnd = parseDateOnly(plan.endDate);
    if (!planStart || !planEnd) return [];

    const durationMs = Math.max(0, planEnd.getTime() - planStart.getTime());
    const totalWeeks = Math.max(1, Math.ceil(durationMs / MS_PER_WEEK));

    return Array.from({ length: totalWeeks }, (_, index) => {
      const startDate = new Date(planStart);
      startDate.setDate(planStart.getDate() + index * 7);

      const naturalEndDate = new Date(startDate);
      naturalEndDate.setDate(startDate.getDate() + 6);

      return {
        globalWeekNumber: index + 1,
        startDate,
        endDate: naturalEndDate > planEnd ? new Date(planEnd) : naturalEndDate,
      };
    });
  }, [plan]);

  const weeksPerMesocycle = matrix?.weeksPerMesocycle ?? 4;
  const totalMesocycles = matrix?.totalMesocycles ?? Math.max(1, Math.ceil(planWeeks.length / weeksPerMesocycle));

  const resolveBuilderPosition = (globalWeekNumber: number) => {
    const zeroBasedWeek = Math.max(0, globalWeekNumber - 1);
    return {
      mesocycleNumber: Math.floor(zeroBasedWeek / weeksPerMesocycle) + 1,
      weekNumber: (zeroBasedWeek % weeksPerMesocycle) + 1,
    };
  };

  const openWeekAssembly = (globalWeekNumber: number) => {
    if (!id) return;
    const { mesocycleNumber, weekNumber } = resolveBuilderPosition(globalWeekNumber);
    navigate(`/plans/${id}/workout-builder/${mesocycleNumber}/${weekNumber}`);
  };

  const formatDate = (date: string | Date) =>
    formatDateBR(typeof date === 'string' ? date : date.toISOString());

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-muted-foreground">{planDetailsCopy.loading}</p>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{planDetailsCopy.notFound}</p>
        <Button onClick={() => navigate('/plans')} className="mt-4">
          {planDetailsCopy.backToPlans}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/plans')}>
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{plan.name}</h1>
            <p className="text-muted-foreground mt-1">{plan.aluno.user.profile.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => openWeekAssembly(1)}>
            <Activity size={20} />
            Abrir Montagem
          </Button>
          <Button variant="outline" onClick={() => navigate(`/plans/${id}/edit`)}>
            <Edit size={20} />
            {planDetailsCopy.edit}
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 size={20} />
            {planDetailsCopy.delete}
          </Button>
        </div>
      </div>

      {plan.description && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">{plan.description}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Semanas do plano</CardDescription>
            <CardTitle className="text-3xl">{planWeeks.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Mesociclos</CardDescription>
            <CardTitle className="text-3xl">{totalMesocycles}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Semanas por mesociclo</CardDescription>
            <CardTitle className="text-3xl">{weeksPerMesocycle}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {planDetailsCopy.period}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">{planDetailsCopy.start}</p>
              <p className="font-bold">{formatDate(plan.startDate)}</p>
            </div>
            <div className="text-muted-foreground">→</div>
            <div>
              <p className="text-sm text-muted-foreground">{planDetailsCopy.end}</p>
              <p className="font-bold">{formatDate(plan.endDate)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-blue-200 bg-blue-50/30">
        <CardHeader>
          <CardTitle className="text-lg">Fluxo de montagem consolidado</CardTitle>
          <CardDescription>
            A periodização define os estímulos da semana. A Montagem combina Cíclico e Resistido no mesmo dia antes da liberação do treino.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('assembly')}
            className={`${
              activeTab === 'assembly'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
          >
            Montagem semanal
          </button>
          <button
            onClick={() => setActiveTab('periodization')}
            className={`${
              activeTab === 'periodization'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors`}
          >
            {planDetailsCopy.periodizationTab}
          </button>
        </nav>
      </div>

      {activeTab === 'assembly' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold">Semanas do Plano</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha uma semana para montar conjuntamente os blocos cíclicos e resistidos.
            </p>
          </div>

          {planWeeks.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {planWeeks.map((week) => {
                const { mesocycleNumber, weekNumber } = resolveBuilderPosition(
                  week.globalWeekNumber
                );
                const resistedStimulus = matrix?.resistedStimulus?.find(
                  (item) =>
                    item.mesocycleNumber === mesocycleNumber && item.weekNumber === weekNumber
                );
                const cyclicStimulus = matrix?.cyclicStimulus?.find(
                  (item) =>
                    item.mesocycleNumber === mesocycleNumber && item.weekNumber === weekNumber
                );

                return (
                  <Card key={week.globalWeekNumber}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-lg">Semana {week.globalWeekNumber}</CardTitle>
                          <CardDescription>
                            {formatDate(week.startDate)} - {formatDate(week.endDate)}
                          </CardDescription>
                        </div>
                        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                          Meso {mesocycleNumber} · Micro {weekNumber}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                            cyclicStimulus
                              ? 'border-blue-200 bg-blue-50 text-blue-700'
                              : 'border-border bg-muted/30 text-muted-foreground'
                          }`}
                        >
                          <Activity size={13} />
                          Cíclico {cyclicStimulus ? 'planejado' : 'a definir'}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                            resistedStimulus
                              ? 'border-violet-200 bg-violet-50 text-violet-700'
                              : 'border-border bg-muted/30 text-muted-foreground'
                          }`}
                        >
                          <Dumbbell size={13} />
                          Resistido {resistedStimulus ? 'planejado' : 'a definir'}
                        </span>
                      </div>

                      <Button
                        className="w-full justify-between"
                        onClick={() => openWeekAssembly(week.globalWeekNumber)}
                      >
                        Montar semana
                        <ChevronRight size={16} />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-semibold mb-2">{planDetailsCopy.emptyTitle}</h3>
                <p className="text-muted-foreground mb-4">
                  Defina o período do plano para gerar as semanas de montagem.
                </p>
                <Button onClick={() => navigate(`/plans/${id}/edit`)}>
                  <Edit size={20} />
                  Editar plano
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'periodization' && (
        <PeriodizationMatrixComponent
          planId={id!}
          startDate={plan.startDate}
          endDate={plan.endDate}
        />
      )}
    </div>
  );
}
