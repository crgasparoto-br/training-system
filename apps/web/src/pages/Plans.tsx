import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { planService, type TrainingPlan } from '../services/plan.service';
import { athleteService, type Athlete } from '../services/athlete.service';
import { educatorService } from '../services/educator.service';
import type { EducatorSummary } from '@corrida/types';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { formatDateBR, isDateWithinRange, parseDateOnly } from '../utils/date';
import { Plus, Calendar, Eye, Edit, Trash2, User, LayoutGrid, List } from 'lucide-react';

const VIEW_STATE_STORAGE_KEY = 'plans.viewState';

type PlanStatusFilter = 'active' | 'finished' | 'all';

export function Plans() {
  const user = useAuthStore((state) => state.user);
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [educators, setEducators] = useState<EducatorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAthletes, setLoadingAthletes] = useState(false);
  const [loadingEducators, setLoadingEducators] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [athleteFilter, setAthleteFilter] = useState('');
  const [educatorFilter, setEducatorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<PlanStatusFilter>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>(() => {
    if (typeof window === 'undefined') return 'cards';
    try {
      const stored = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);
      if (!stored) return 'cards';
      const parsed = JSON.parse(stored) as { viewMode?: 'cards' | 'list' };
      return parsed.viewMode === 'list' || parsed.viewMode === 'cards' ? parsed.viewMode : 'cards';
    } catch {
      return 'cards';
    }
  });
  const [appliedFilters, setAppliedFilters] = useState<{
    searchQuery: string;
    athleteFilter: string;
    educatorFilter: string;
    statusFilter: PlanStatusFilter;
  }>(() => {
    if (typeof window === 'undefined') {
      return { searchQuery: '', athleteFilter: '', educatorFilter: '', statusFilter: 'all' };
    }
    try {
      const stored = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);
      if (!stored) {
        return { searchQuery: '', athleteFilter: '', educatorFilter: '', statusFilter: 'all' };
      }
      const parsed = JSON.parse(stored) as {
        searchQuery?: string;
        athleteFilter?: string;
        educatorFilter?: string;
        statusFilter?: PlanStatusFilter;
      };
      return {
        searchQuery: parsed.searchQuery || '',
        athleteFilter: parsed.athleteFilter || '',
        educatorFilter: parsed.educatorFilter || '',
        statusFilter: parsed.statusFilter || 'all',
      };
    } catch {
      return { searchQuery: '', athleteFilter: '', educatorFilter: '', statusFilter: 'all' };
    }
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const isEducator = user?.type === 'educator';
  const canManageEducators =
    user?.type === 'educator' &&
    user?.educator?.role === 'master' &&
    user?.educator?.contract?.type === 'academy';

  useEffect(() => {
    loadPlans();
  }, [page, appliedFilters, canManageEducators]);

  useEffect(() => {
    if (canManageEducators) {
      loadEducators();
    }
  }, [canManageEducators]);

  useEffect(() => {
    if (!isEducator) {
      return;
    }
    loadAthletes();
  }, [isEducator, educatorFilter, canManageEducators]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      viewMode,
      searchQuery,
      athleteFilter,
      educatorFilter,
      statusFilter,
    };
    window.localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(payload));
  }, [viewMode, searchQuery, athleteFilter, educatorFilter, statusFilter]);

  useEffect(() => {
    setSearchQuery(appliedFilters.searchQuery);
    setAthleteFilter(appliedFilters.athleteFilter);
    setEducatorFilter(appliedFilters.educatorFilter);
    setStatusFilter(appliedFilters.statusFilter);
  }, []);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await planService.list(
        page,
        10,
        appliedFilters.athleteFilter || undefined,
        canManageEducators ? appliedFilters.educatorFilter || undefined : undefined,
        appliedFilters.statusFilter,
        appliedFilters.searchQuery || undefined
      );
      setPlans(data.plans);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Erro ao carregar planos:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAthletes = async () => {
    setLoadingAthletes(true);
    try {
      const data = await athleteService.list(
        1,
        200,
        canManageEducators ? educatorFilter || undefined : undefined,
        'all'
      );
      setAthletes(data.athletes);
    } catch (error) {
      console.error('Erro ao carregar atletas:', error);
    } finally {
      setLoadingAthletes(false);
    }
  };

  const loadEducators = async () => {
    setLoadingEducators(true);
    try {
      const data = await educatorService.list();
      setEducators(data);
    } catch (error) {
      console.error('Erro ao carregar educadores:', error);
    } finally {
      setLoadingEducators(false);
    }
  };

  const handleAthleteFilterChange = (value: string) => {
    setAthleteFilter(value);
  };

  const handleEducatorFilterChange = (value: string) => {
    setEducatorFilter(value);
    setAthleteFilter('');
  };

  const handleStatusFilterChange = (value: PlanStatusFilter) => {
    setStatusFilter(value);
  };

  const handleSearch = () => {
    const normalizedQuery = searchQuery.trim();
    setAppliedFilters({
      searchQuery: normalizedQuery.length >= 2 ? normalizedQuery : '',
      athleteFilter,
      educatorFilter: canManageEducators ? educatorFilter : '',
      statusFilter,
    });
    setPage(1);
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

  const formatDate = (dateString: string) => formatDateBR(dateString);

  const calculateDuration = (startDate: string, endDate: string) => {
    const start = parseDateOnly(startDate);
    const end = parseDateOnly(endDate);
    if (!start || !end) return '0 semanas';
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
    return `${diffWeeks} semanas`;
  };

  const getStatusInfo = (startDate: string, endDate: string) => {
    const today = new Date();
    const start = parseDateOnly(startDate);
    if (!start) {
      return { label: 'Agendado', className: 'bg-blue-100 text-blue-700' };
    }
    if (today < start) {
      return { label: 'Agendado', className: 'bg-blue-100 text-blue-700' };
    }
    if (isDateWithinRange(today, startDate, endDate)) {
      return { label: 'Ativo', className: 'bg-green-100 text-green-700' };
    }
    return { label: 'Finalizado', className: 'bg-gray-100 text-gray-700' };
  };

  const getPhaseBadges = (plan: TrainingPlan) => {
    const phases = Array.from(
      new Set((plan.macrocycles || []).map((macro) => planService.translatePhase(macro.phase)))
    );
    return phases.slice(0, 2);
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

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Input
                placeholder="Buscar por plano ou atleta..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            {isEducator && (
              <div className="w-full lg:w-64">
                <label className="block text-sm font-medium mb-2">Atleta</label>
                <select
                  value={athleteFilter}
                  onChange={(e) => handleAthleteFilterChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loadingAthletes}
                >
                  <option value="">Todos atletas</option>
                  {athletes.map((athlete) => (
                    <option key={athlete.id} value={athlete.id}>
                      {athlete.user.profile.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="w-full lg:w-52">
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => handleStatusFilterChange(e.target.value as PlanStatusFilter)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="finished">Finalizados</option>
              </select>
            </div>
            {canManageEducators && (
              <div className="w-full lg:w-64">
                <label className="block text-sm font-medium mb-2">Educador</label>
                <select
                  value={educatorFilter}
                  onChange={(e) => handleEducatorFilterChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loadingEducators}
                >
                  <option value="">Todos educadores</option>
                  {educators.map((educator) => (
                    <option key={educator.id} value={educator.id}>
                      {educator.user?.profile?.name || 'Sem nome'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSearch}>
                Buscar
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'default' : 'outline'}
                onClick={() => setViewMode('cards')}
              >
                <LayoutGrid size={18} />
                Cards
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                onClick={() => setViewMode('list')}
              >
                <List size={18} />
                Lista
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

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
      ) : viewMode === 'cards' ? (
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
                      {canManageEducators && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {plan.educator?.user?.profile?.name || 'Educador'}
                        </div>
                      )}
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
                <div>
                  {(() => {
                    const status = getStatusInfo(plan.startDate, plan.endDate);
                    return (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${status.className}`}>
                        {status.label}
                      </span>
                    );
                  })()}
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
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground pb-3 border-b">
              <div className={canManageEducators ? 'col-span-3' : 'col-span-4'}>Plano</div>
              <div className={canManageEducators ? 'col-span-2' : 'col-span-3'}>Atleta</div>
              {canManageEducators && <div className="col-span-2">Educador</div>}
              <div className="col-span-1">Status</div>
              <div className="col-span-2">Fases</div>
              <div className="col-span-1">Periodo</div>
              <div className="col-span-1 text-right">Acoes</div>
            </div>
            <div className="divide-y">
              {plans.map((plan) => {
                const status = getStatusInfo(plan.startDate, plan.endDate);
                const phases = getPhaseBadges(plan);
                return (
                  <div key={plan.id} className="grid grid-cols-12 gap-2 py-3 items-center">
                    <div className={canManageEducators ? 'col-span-3' : 'col-span-4'}>
                      <p className="font-medium">{plan.name}</p>
                      {plan.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {plan.description}
                        </p>
                      )}
                    </div>
                    <div className={canManageEducators ? 'col-span-2 text-sm' : 'col-span-3 text-sm'}>
                      {plan.athlete.user.profile.name}
                    </div>
                    {canManageEducators && (
                      <div className="col-span-2 text-sm">
                        {plan.educator?.user?.profile?.name || 'Educador'}
                      </div>
                    )}
                    <div className="col-span-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${status.className}`}>
                        {status.label}
                      </span>
                    </div>
                    <div className="col-span-2 flex flex-wrap gap-1">
                      {phases.length > 0 ? (
                        phases.map((phase) => (
                          <span key={phase} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {phase}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </div>
                    <div className="col-span-1 text-xs text-muted-foreground">
                      <div className="text-sm text-foreground">
                        {formatDate(plan.startDate)}
                      </div>
                      <div>{calculateDuration(plan.startDate, plan.endDate)}</div>
                    </div>
                    <div className="col-span-1 flex justify-end gap-2">
                      <Link to={`/plans/${plan.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye size={16} />
                        </Button>
                      </Link>
                      <Link to={`/plans/${plan.id}/edit`}>
                        <Button variant="outline" size="sm">
                          <Edit size={16} />
                        </Button>
                      </Link>
                      <Button variant="destructive" size="sm" onClick={() => handleDelete(plan.id)}>
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
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
