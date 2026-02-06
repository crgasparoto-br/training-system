import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { athleteService, type Athlete } from '../services/athlete.service';
import { educatorService } from '../services/educator.service';
import type { EducatorSummary } from '@corrida/types';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Plus, Search, Edit, Eye, User, LayoutGrid, List, UserX, UserCheck } from 'lucide-react';

const VIEW_STATE_STORAGE_KEY = 'athletes.viewState';

export function Athletes() {
  const user = useAuthStore((state) => state.user);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [educators, setEducators] = useState<EducatorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEducators, setLoadingEducators] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const stored = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);
      if (!stored) return '';
      const parsed = JSON.parse(stored) as { searchQuery?: string };
      return parsed.searchQuery || '';
    } catch {
      return '';
    }
  });
  const [educatorFilter, setEducatorFilter] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const stored = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);
      if (!stored) return '';
      const parsed = JSON.parse(stored) as { educatorFilter?: string };
      return parsed.educatorFilter || '';
    } catch {
      return '';
    }
  });
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>(() => {
    if (typeof window === 'undefined') return 'active';
    try {
      const stored = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);
      if (!stored) return 'active';
      const parsed = JSON.parse(stored) as { statusFilter?: 'active' | 'inactive' | 'all' };
      return parsed.statusFilter === 'inactive' || parsed.statusFilter === 'all'
        ? parsed.statusFilter
        : 'active';
    } catch {
      return 'active';
    }
  });
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
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const canManageEducators =
    user?.type === 'educator' &&
    user?.educator?.role === 'master' &&
    user?.educator?.contract?.type === 'academy';

  useEffect(() => {
    if (searchQuery.length >= 2) {
      handleSearch();
      return;
    }

    loadAthletes();
  }, [page, educatorFilter, statusFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      viewMode,
      searchQuery,
      educatorFilter,
      statusFilter,
    };
    window.localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(payload));
  }, [viewMode, searchQuery, educatorFilter, statusFilter]);

  useEffect(() => {
    if (canManageEducators) {
      loadEducators();
    }
  }, [canManageEducators]);

  const loadAthletes = async () => {
    setLoading(true);
    try {
      const data = await athleteService.list(page, 10, educatorFilter || undefined, statusFilter);
      setAthletes(data.athletes);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Erro ao carregar atletas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.length < 2) {
      loadAthletes();
      return;
    }

    setLoading(true);
    try {
      const data = await athleteService.search(
        searchQuery,
        educatorFilter || undefined,
        statusFilter
      );
      setAthletes(data);
    } catch (error) {
      console.error('Erro ao buscar atletas:', error);
    } finally {
      setLoading(false);
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

  const handleEducatorFilterChange = (value: string) => {
    setEducatorFilter(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: 'active' | 'inactive' | 'all') => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Tem certeza que deseja inativar este atleta?')) {
      return;
    }

    try {
      await athleteService.deactivate(id);
      loadAthletes();
    } catch (error) {
      console.error('Erro ao inativar atleta:', error);
      alert('Erro ao inativar atleta');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await athleteService.activate(id);
      loadAthletes();
    } catch (error) {
      console.error('Erro ao reativar atleta:', error);
      alert('Erro ao reativar atleta');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Atletas</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie seus atletas e acompanhe seu progresso
          </p>
        </div>
        <Link to="/athletes/new">
          <Button>
            <Plus size={20} />
            Novo Atleta
          </Button>
        </Link>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Input
                placeholder="Buscar atleta por nome..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="w-full lg:w-52">
              <label className="block text-sm font-medium mb-2">Status</label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  handleStatusFilterChange(e.target.value as 'active' | 'inactive' | 'all')
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
                <option value="all">Todos</option>
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
                <Search size={20} />
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

      {/* Athletes List */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-muted-foreground">Carregando atletas...</p>
          </CardContent>
        </Card>
      ) : athletes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Nenhum atleta encontrado</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? 'Tente buscar com outros termos' : 'Comece adicionando seu primeiro atleta'}
            </p>
            {!searchQuery && (
              <Link to="/athletes/new">
                <Button>
                  <Plus size={20} />
                  Adicionar Atleta
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {athletes.map((athlete) => {
            const bmi = athleteService.calculateBMI(athlete.weight, athlete.height);
            const bmiClass = athleteService.getBMIClassification(bmi);

            return (
              <Card key={athlete.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{athlete.user.profile.name}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-2">
                          {athlete.age} anos
                          {canManageEducators && (
                            <>
                              {' '}
                              • {athlete.educator?.user?.profile?.name || 'Educador'}
                            </>
                          )}
                          {athlete.user.isActive === false && (
                            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                              Inativo
                            </span>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Peso:</span>
                      <p className="font-medium">{athlete.weight} kg</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Altura:</span>
                      <p className="font-medium">{athlete.height} cm</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">IMC:</span>
                      <p className="font-medium">{bmi.toFixed(1)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">VO2 Max:</span>
                      <p className="font-medium">{athlete.vo2Max}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t flex gap-2">
                    <Link to={`/athletes/${athlete.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Eye size={16} />
                        Ver
                      </Button>
                    </Link>
                    <Link to={`/athletes/${athlete.id}/edit`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Edit size={16} />
                        Editar
                      </Button>
                    </Link>
                    {athlete.user.isActive === false ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleActivate(athlete.id)}
                      >
                        <UserCheck size={16} />
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeactivate(athlete.id)}
                      >
                        <UserX size={16} />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground pb-3 border-b">
              <div className="col-span-4">Atleta</div>
              <div className="col-span-2">Peso</div>
              <div className="col-span-2">Altura</div>
              <div className="col-span-1">IMC</div>
              <div className="col-span-1">VO2</div>
              <div className="col-span-2 text-right">Ações</div>
            </div>
            <div className="divide-y">
              {athletes.map((athlete) => {
                const bmi = athleteService.calculateBMI(athlete.weight, athlete.height);
                const educatorName = athlete.educator?.user?.profile?.name;

                return (
                  <div key={athlete.id} className="grid grid-cols-12 gap-2 py-3 items-center">
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{athlete.user.profile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {athlete.age} anos
                          {canManageEducators && (
                            <>
                              {' '}
                              • {educatorName || 'Educador'}
                            </>
                          )}
                          {athlete.user.isActive === false && (
                            <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                              Inativo
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-2 text-sm">{athlete.weight} kg</div>
                    <div className="col-span-2 text-sm">{athlete.height} cm</div>
                    <div className="col-span-1 text-sm">{bmi.toFixed(1)}</div>
                    <div className="col-span-1 text-sm">{athlete.vo2Max}</div>
                    <div className="col-span-2 flex justify-end gap-2">
                      <Link to={`/athletes/${athlete.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye size={16} />
                        </Button>
                      </Link>
                      <Link to={`/athletes/${athlete.id}/edit`}>
                        <Button variant="outline" size="sm">
                          <Edit size={16} />
                        </Button>
                      </Link>
                      {athlete.user.isActive === false ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleActivate(athlete.id)}
                        >
                          <UserCheck size={16} />
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeactivate(athlete.id)}
                        >
                          <UserX size={16} />
                        </Button>
                      )}
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
