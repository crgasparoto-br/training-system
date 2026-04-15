import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, BookOpen, Calendar, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { useAuthStore } from '../stores/useAuthStore';
import { athleteService, type Athlete } from '../services/athlete.service';
import { planService, type TrainingPlan } from '../services/plan.service';
import { executionsService, type WorkoutDayDetail } from '../services/executions.service';

type DashboardActivity = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
};

type UpcomingWorkout = {
  id: string;
  athleteName: string;
  date: string;
  status: WorkoutDayDetail['status'];
  duration: number | null;
};

export function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalAthletes: 0,
    activePlans: 0,
    weekWorkouts: 0,
    completionRate: 0,
  });
  const [recentActivities, setRecentActivities] = useState<DashboardActivity[]>([]);
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<UpcomingWorkout[]>([]);

  const formatDocument = (document: string) => {
    const digits = document.replace(/\D/g, '');

    if (digits.length === 14) {
      return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }

    if (digits.length === 11) {
      return digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
    }

    return document;
  };

  const formatLocalIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const getWeekRange = () => {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const start = new Date(now);
    start.setDate(now.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return {
      startDate: formatLocalIsoDate(start),
      endDate: formatLocalIsoDate(end),
    };
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      if (user?.type !== 'educator') {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { startDate, endDate } = getWeekRange();

        const [athletesResult, activePlansResult, recentPlansResult] = await Promise.all([
          athleteService.list(1, 500, undefined, 'active'),
          planService.list(1, 1, undefined, undefined, 'active'),
          planService.list(1, 20, undefined, undefined, 'all'),
        ]);

        const athletes = athletesResult.athletes;
        const athleteNameById = new Map(athletes.map((athlete) => [athlete.id, athlete.user.profile.name]));

        const workoutEntriesByAthlete = await Promise.all(
          athletes.map(async (athlete) => {
            try {
              const days = await executionsService.listWorkoutDaysForEducator(startDate, endDate, athlete.id);
              return days.map((day) => ({ day, athleteId: athlete.id }));
            } catch {
              return [] as Array<{ day: WorkoutDayDetail; athleteId: string }>;
            }
          })
        );

        const weekWorkoutEntries = workoutEntriesByAthlete.flat();
        const completedWorkouts = weekWorkoutEntries.filter((entry) => entry.day.status === 'completed').length;

        const completionRate = weekWorkoutEntries.length
          ? Math.round((completedWorkouts / weekWorkoutEntries.length) * 100)
          : 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const nextWorkouts: UpcomingWorkout[] = weekWorkoutEntries
          .filter((entry) => {
            const workoutDate = new Date(entry.day.workoutDate);
            workoutDate.setHours(0, 0, 0, 0);
            return workoutDate >= today && entry.day.status !== 'completed';
          })
          .sort((a, b) => new Date(a.day.workoutDate).getTime() - new Date(b.day.workoutDate).getTime())
          .slice(0, 5)
          .map((entry) => ({
            id: entry.day.id,
            athleteName: athleteNameById.get(entry.athleteId) || 'Aluno',
            date: entry.day.workoutDate,
            status: entry.day.status,
            duration: entry.day.sessionDurationMin ?? null,
          }));

        const athleteActivities: DashboardActivity[] = athletes
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 3)
          .map((athlete: Athlete) => ({
            id: `athlete-${athlete.id}`,
            title: 'Aluno cadastrado',
            description: athlete.user.profile.name,
            createdAt: athlete.createdAt,
          }));

        const planActivities: DashboardActivity[] = recentPlansResult.plans
          .slice()
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 3)
          .map((plan: TrainingPlan) => ({
            id: `plan-${plan.id}`,
            title: 'Plano criado',
            description: `${plan.name} - ${plan.athlete?.user?.profile?.name || 'Aluno'}`,
            createdAt: plan.createdAt,
          }));

        setStats({
          totalAthletes: athletesResult.pagination.total,
          activePlans: activePlansResult.pagination.total,
          weekWorkouts: weekWorkoutEntries.length,
          completionRate,
        });

        setRecentActivities(
          [...athleteActivities, ...planActivities]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 6)
        );

        setUpcomingWorkouts(nextWorkouts);
      } catch (err: any) {
        const message = err?.response?.data?.error || 'Nao foi possivel carregar os dados do dashboard.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();
  }, [user?.id, user?.type]);

  const dashboardStats = useMemo(
    () => [
      {
        title: 'Total de Alunos',
        value: String(stats.totalAthletes),
        description:
          stats.totalAthletes > 0 ? `${stats.totalAthletes} aluno(s) ativo(s)` : 'Nenhum aluno cadastrado ainda',
        icon: Users,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
      },
      {
        title: 'Planos Ativos',
        value: String(stats.activePlans),
        description: stats.activePlans > 0 ? `${stats.activePlans} plano(s) em andamento` : 'Nenhum plano ativo',
        icon: Calendar,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
      },
      {
        title: 'Treinos Esta Semana',
        value: String(stats.weekWorkouts),
        description:
          stats.weekWorkouts > 0
            ? `${stats.weekWorkouts} treino(s) previsto(s)`
            : 'Nenhum treino previsto nesta semana',
        icon: Activity,
        color: 'text-purple-600',
        bgColor: 'bg-purple-100',
      },
      {
        title: 'Taxa de Conclusao',
        value: `${stats.completionRate}%`,
        description:
          stats.weekWorkouts > 0 ? `${stats.completionRate}% dos treinos concluidos` : 'Sem dados suficientes',
        icon: TrendingUp,
        color: 'text-orange-600',
        bgColor: 'bg-orange-100',
      },
    ],
    [stats]
  );

  const getStatusLabel = (status?: WorkoutDayDetail['status']) => {
    if (status === 'completed') return 'Concluido';
    if (status === 'in_progress') return 'Em andamento';
    return 'Planejado';
  };

  const getStatusClassName = (status?: WorkoutDayDetail['status']) => {
    if (status === 'completed') return 'bg-green-100 text-green-700';
    if (status === 'in_progress') return 'bg-yellow-100 text-yellow-700';
    return 'bg-blue-100 text-blue-700';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-2">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Bem-vindo de volta, {user?.name}!</p>
      </div>

      {error && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {user?.educator?.contract && (
        <Card>
          <CardHeader>
            <CardTitle>Contrato</CardTitle>
            <CardDescription>Informacoes vinculadas ao seu acesso</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Tipo</p>
              <p className="font-semibold">{user.educator.contract.type === 'academy' ? 'Academia' : 'Personal'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Documento</p>
              <p className="font-semibold">{formatDocument(user.educator.contract.document)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Nome</p>
              <p className="font-semibold">{user.educator.contract.name || 'Nao informado'}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {dashboardStats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atividades Recentes</CardTitle>
            <CardDescription>Ultimas acoes no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma atividade recente</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="border rounded-md p-3">
                    <p className="text-sm font-medium">{activity.title}</p>
                    <p className="text-sm text-muted-foreground">{activity.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatDate(activity.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Proximos Treinos</CardTitle>
            <CardDescription>Treinos agendados para esta semana</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingWorkouts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhum treino agendado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingWorkouts.map((workout) => (
                  <div key={workout.id} className="border rounded-md p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{workout.athleteName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(workout.date)}
                          {workout.duration ? ` - ${workout.duration} min` : ''}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusClassName(workout.status)}`}>
                        {getStatusLabel(workout.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Acoes Rapidas</CardTitle>
          <CardDescription>Comece a usar o sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <button
              onClick={() => navigate('/athletes/new')}
              className="p-4 border rounded-lg hover:bg-accent transition-colors text-left"
            >
              <Users className="h-8 w-8 mb-2 text-primary" />
              <h3 className="font-semibold mb-1">Adicionar Aluno</h3>
              <p className="text-sm text-muted-foreground">Cadastre um novo aluno no sistema</p>
            </button>

            <button
              onClick={() => navigate('/plans/new')}
              className="p-4 border rounded-lg hover:bg-accent transition-colors text-left"
            >
              <Calendar className="h-8 w-8 mb-2 text-primary" />
              <h3 className="font-semibold mb-1">Criar Plano</h3>
              <p className="text-sm text-muted-foreground">Monte um novo plano de treino</p>
            </button>

            <button
              onClick={() => navigate('/library')}
              className="p-4 border rounded-lg hover:bg-accent transition-colors text-left"
            >
              <BookOpen className="h-8 w-8 mb-2 text-primary" />
              <h3 className="font-semibold mb-1">Biblioteca de Exercicios</h3>
              <p className="text-sm text-muted-foreground">Gerencie o catalogo de exercicios</p>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
