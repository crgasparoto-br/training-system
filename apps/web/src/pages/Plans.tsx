import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { planService, type TrainingPlan } from '../services/plan.service';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Plus, Calendar, Eye, Edit, Trash2, User, TrendingUp } from 'lucide-react';

export function Plans() {
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadPlans();
  }, [page]);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await planService.list(page, 10);
      setPlans(data.plans);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Erro ao carregar planos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja deletar este plano?')) {
      return;
    }

    try {
      await planService.delete(id);
      loadPlans();
    } catch (error) {
      console.error('Erro ao deletar plano:', error);
      alert('Erro ao deletar plano');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const calculateDuration = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
    return `${diffWeeks} semanas`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Planos de Treino</h1>
          <p className="text-muted-foreground mt-2">
            Crie e gerencie planos de treino personalizados
          </p>
        </div>
        <Link to="/plans/new">
          <Button>
            <Plus size={20} />
            Novo Plano
          </Button>
        </Link>
      </div>

      {/* Plans List */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-muted-foreground">Carregando planos...</p>
          </CardContent>
        </Card>
      ) : plans.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Nenhum plano encontrado</h3>
            <p className="text-muted-foreground mb-4">
              Comece criando seu primeiro plano de treino
            </p>
            <Link to="/plans/new">
              <Button>
                <Plus size={20} />
                Criar Plano
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <CardDescription className="mt-1">
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {plan.athlete.user.profile.name}
                      </div>
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Dates */}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {formatDate(plan.startDate)} - {formatDate(plan.endDate)}
                  </span>
                </div>

                {/* Duration */}
                <div className="text-sm text-muted-foreground">
                  Duração: {calculateDuration(plan.startDate, plan.endDate)}
                </div>

                {/* Stats */}
                {plan.stats && (
                  <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
                    <div>
                      <p className="text-muted-foreground">Semanas</p>
                      <p className="font-bold">{plan.stats.totalMesocycles}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Sessões</p>
                      <p className="font-bold">{plan.stats.totalMicrocycles}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Distância</p>
                      <p className="font-bold">{plan.stats.totalDistance.toFixed(0)} km</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Duração</p>
                      <p className="font-bold">
                        {planService.formatDuration(plan.stats.totalDuration)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Macrocycles */}
                {plan.macrocycles && plan.macrocycles.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground mb-2">Fases:</p>
                    <div className="flex flex-wrap gap-1">
                      {plan.macrocycles.map((macro) => (
                        <span
                          key={macro.id}
                          className={`text-xs px-2 py-1 rounded-full text-white ${planService.getPhaseColor(
                            macro.phase
                          )}`}
                        >
                          {planService.translatePhase(macro.phase)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                {plan.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {plan.description}
                  </p>
                )}

                {/* Actions */}
                <div className="pt-4 border-t flex gap-2">
                  <Link to={`/plans/${plan.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <Eye size={16} />
                      Ver
                    </Button>
                  </Link>
                  <Link to={`/plans/${plan.id}/edit`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      <Edit size={16} />
                      Editar
                    </Button>
                  </Link>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(plan.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
              >
                Próxima
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
