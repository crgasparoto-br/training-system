import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { planService, type TrainingPlan } from '../services/plan.service';
import { alunoService, type Aluno } from '../services/aluno.service';
import { professorService } from '../services/professor.service';
import type { ProfessorSummary } from '@corrida/types';
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
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [professores, setProfessores] = useState<ProfessorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAlunos, setLoadingAlunos] = useState(false);
  const [loadingProfessores, setLoadingProfessores] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [alunoFilter, setAlunoFilter] = useState('');
  const [professorFilter, setProfessorFilter] = useState('');
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
    alunoFilter: string;
    professorFilter: string;
    statusFilter: PlanStatusFilter;
  }>(() => {
    if (typeof window === 'undefined') {
      return { searchQuery: '', alunoFilter: '', professorFilter: '', statusFilter: 'all' };
    }
    try {
      const stored = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);
      if (!stored) {
        return { searchQuery: '', alunoFilter: '', professorFilter: '', statusFilter: 'all' };
      }
      const parsed = JSON.parse(stored) as {
        searchQuery?: string;
        alunoFilter?: string;
        professorFilter?: string;
        statusFilter?: PlanStatusFilter;
      };
      return {
        searchQuery: parsed.searchQuery || '',
        alunoFilter: parsed.alunoFilter || '',
        professorFilter: parsed.professorFilter || '',
        statusFilter: parsed.statusFilter || 'all',
      };
    } catch {
      return { searchQuery: '', alunoFilter: '', professorFilter: '', statusFilter: 'all' };
    }
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const isProfessor = user?.type === 'professor';
  const canManageProfessores =
    user?.type === 'professor' &&
    user?.professor?.role === 'master' &&
    user?.professor?.contract?.type === 'academy';

  useEffect(() => {
    loadPlans();
  }, [page, appliedFilters, canManageProfessores]);

  useEffect(() => {
    if (canManageProfessores) {
      loadProfessores();
    }
  }, [canManageProfessores]);

  useEffect(() => {
    if (!isProfessor) {
      return;
    }
    loadAlunos();
  }, [isProfessor, professorFilter, canManageProfessores]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      viewMode,
      searchQuery,
      alunoFilter,
      professorFilter,
      statusFilter,
    };
    window.localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(payload));
  }, [viewMode, searchQuery, alunoFilter, professorFilter, statusFilter]);

  useEffect(() => {
    setSearchQuery(appliedFilters.searchQuery);
    setAlunoFilter(appliedFilters.alunoFilter);
    setProfessorFilter(appliedFilters.professorFilter);
    setStatusFilter(appliedFilters.statusFilter);
  }, []);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const data = await planService.list(
        page,
        10,
        appliedFilters.alunoFilter || undefined,
        canManageProfessores ? appliedFilters.professorFilter || undefined : undefined,
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

  const loadAlunos = async () => {
    setLoadingAlunos(true);
    try {
      const data = await alunoService.list(
        1,
        200,
        canManageProfessores ? professorFilter || undefined : undefined,
        'all'
      );
      setAlunos(data.alunos);
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
    } finally {
      setLoadingAlunos(false);
    }
  };

  const loadProfessores = async () => {
    setLoadingProfessores(true);
    try {
      const data = await professorService.list();
      setProfessores(data);
    } catch (error) {
      console.error('Erro ao carregar professores:', error);
    } finally {
      setLoadingProfessores(false);
    }
  };

  const handleAlunoFilterChange = (value: string) => {
    setAlunoFilter(value);
  };

  const handleProfessorFilterChange = (value: string) => {
    setProfessorFilter(value);
    setAlunoFilter('');
  };

  const handleStatusFilterChange = (value: PlanStatusFilter) => {
    setStatusFilter(value);
  };

  const handleSearch = () => {
    const normalizedQuery = searchQuery.trim();
    setAppliedFilters({
      searchQuery: normalizedQuery.length >= 2 ? normalizedQuery : '',
      alunoFilter,
      professorFilter: canManageProfessores ? professorFilter : '',
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
                placeholder="Buscar por plano ou aluno..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            {isProfessor && (
              <div className="w-full lg:w-64">
                <label className="block text-sm font-medium mb-2">Aluno</label>
                <select
                  value={alunoFilter}
                  onChange={(e) => handleAlunoFilterChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loadingAlunos}
                >
                  <option value="">Todos os alunos</option>
                  {alunos.map((aluno) => (
                    <option key={aluno.id} value={aluno.id}>
                      {aluno.user.profile.name}
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
            {canManageProfessores && (
              <div className="w-full lg:w-64">
                <label className="block text-sm font-medium mb-2">Professor</label>
                <select
                  value={professorFilter}
                  onChange={(e) => handleProfessorFilterChange(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={loadingProfessores}
                >
                  <option value="">Todos os professores</option>
                  {professores.map((professor) => (
                    <option key={professor.id} value={professor.id}>
                      {professor.user?.profile?.name || 'Sem nome'}
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
                        {plan.aluno.user.profile.name}
                      </div>
                      {canManageProfessores && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {plan.professor?.user?.profile?.name || 'Professor'}
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
                  DuraÃ§Ã£o: {calculateDuration(plan.startDate, plan.endDate)}
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
                      <p className="text-muted-foreground">SessÃµes</p>
                      <p className="font-bold">{plan.stats.totalMicrocycles}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">DistÃ¢ncia</p>
                      <p className="font-bold">{plan.stats.totalDistance.toFixed(0)} km</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">DuraÃ§Ã£o</p>
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
              <div className={canManageProfessores ? 'col-span-3' : 'col-span-4'}>Plano</div>
              <div className={canManageProfessores ? 'col-span-2' : 'col-span-3'}>Aluno</div>
              {canManageProfessores && <div className="col-span-2">Professor</div>}
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
                    <div className={canManageProfessores ? 'col-span-3' : 'col-span-4'}>
                      <p className="font-medium">{plan.name}</p>
                      {plan.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {plan.description}
                        </p>
                      )}
                    </div>
                    <div className={canManageProfessores ? 'col-span-2 text-sm' : 'col-span-3 text-sm'}>
                      {plan.aluno.user.profile.name}
                    </div>
                    {canManageProfessores && (
                      <div className="col-span-2 text-sm">
                        {plan.professor?.user?.profile?.name || 'Professor'}
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
                PÃ¡gina {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
              >
                PrÃ³xima
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

