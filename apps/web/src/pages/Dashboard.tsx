import { useAuthStore } from '../stores/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Activity, Users, Calendar, TrendingUp, BookOpen } from 'lucide-react';

export function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const stats = [
    {
      title: 'Total de Atletas',
      value: '0',
      description: 'Nenhum atleta cadastrado ainda',
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Planos Ativos',
      value: '0',
      description: 'Nenhum plano de treino ativo',
      icon: Calendar,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Treinos Esta Semana',
      value: '0',
      description: 'Nenhum treino registrado',
      icon: Activity,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Taxa de Conclusão',
      value: '0%',
      description: 'Sem dados suficientes',
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Bem-vindo de volta, {user?.name}! 👋
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
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

      {/* Recent Activity */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atividades Recentes</CardTitle>
            <CardDescription>Últimas ações no sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma atividade recente</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Próximos Treinos</CardTitle>
            <CardDescription>Treinos agendados para esta semana</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum treino agendado</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Ações Rápidas</CardTitle>
          <CardDescription>Comece a usar o sistema</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <button 
              onClick={() => navigate('/athletes/new')}
              className="p-4 border rounded-lg hover:bg-accent transition-colors text-left"
            >
              <Users className="h-8 w-8 mb-2 text-primary" />
              <h3 className="font-semibold mb-1">Adicionar Atleta</h3>
              <p className="text-sm text-muted-foreground">
                Cadastre um novo atleta no sistema
              </p>
            </button>

            <button 
              onClick={() => navigate('/plans/new')}
              className="p-4 border rounded-lg hover:bg-accent transition-colors text-left"
            >
              <Calendar className="h-8 w-8 mb-2 text-primary" />
              <h3 className="font-semibold mb-1">Criar Plano</h3>
              <p className="text-sm text-muted-foreground">
                Monte um novo plano de treino
              </p>
            </button>

            <button 
              onClick={() => navigate('/library')}
              className="p-4 border rounded-lg hover:bg-accent transition-colors text-left"
            >
              <BookOpen className="h-8 w-8 mb-2 text-primary" />
              <h3 className="font-semibold mb-1">Biblioteca de Exercícios</h3>
              <p className="text-sm text-muted-foreground">
                Gerencie o catálogo de exercícios
              </p>
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
