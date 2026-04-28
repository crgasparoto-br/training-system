import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { alunoService, type Aluno } from '../services/aluno.service';
import { professorService } from '../services/professor.service';
import type { ProfessorSummary } from '@corrida/types';
import { useAuthStore } from '../stores/useAuthStore';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Plus, Search, Edit, Eye, User, LayoutGrid, List, UserX, UserCheck } from 'lucide-react';
import { alunosCopy } from '../i18n/ptBR';

const VIEW_STATE_STORAGE_KEY = 'alunos.viewState';

export function Alunos() {
  const user = useAuthStore((state) => state.user);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [professores, setProfessores] = useState<ProfessorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProfessores, setLoadingProfessores] = useState(false);
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
  const [professorFilter, setProfessorFilter] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      const stored = window.localStorage.getItem(VIEW_STATE_STORAGE_KEY);
      if (!stored) return '';
      const parsed = JSON.parse(stored) as { professorFilter?: string };
      return parsed.professorFilter || '';
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

  const canManageProfessores =
    user?.type === 'professor' &&
    user?.professor?.role === 'master' &&
    user?.professor?.contract?.type === 'academy';

  useEffect(() => {
    if (searchQuery.length >= 2) {
      handleSearch();
      return;
    }

    loadAlunos();
  }, [page, professorFilter, statusFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      viewMode,
      searchQuery,
      professorFilter,
      statusFilter,
    };
    window.localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(payload));
  }, [viewMode, searchQuery, professorFilter, statusFilter]);

  useEffect(() => {
    if (canManageProfessores) {
      loadProfessores();
    }
  }, [canManageProfessores]);

  const loadAlunos = async () => {
    setLoading(true);
    try {
      const data = await alunoService.list(page, 10, professorFilter || undefined, statusFilter);
      setAlunos(data.alunos);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.length < 2) {
      loadAlunos();
      return;
    }

    setLoading(true);
    try {
      const data = await alunoService.search(
        searchQuery,
        professorFilter || undefined,
        statusFilter
      );
      setAlunos(data);
    } catch (error) {
      console.error('Erro ao buscar alunos:', error);
    } finally {
      setLoading(false);
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

  const handleProfessorFilterChange = (value: string) => {
    setProfessorFilter(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: 'active' | 'inactive' | 'all') => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm(alunosCopy.deactivateConfirm)) {
      return;
    }

    try {
      await alunoService.deactivate(id);
      loadAlunos();
    } catch (error) {
      console.error('Erro ao inativar aluno:', error);
      alert(alunosCopy.deactivateError);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await alunoService.activate(id);
      loadAlunos();
    } catch (error) {
      console.error('Erro ao reativar aluno:', error);
      alert(alunosCopy.activateError);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="ts-page-heading">{alunosCopy.title}</h1>
          <p className="ts-page-description">
            {alunosCopy.description}
          </p>
        </div>
        <Link to="/alunos/new">
          <Button>
            <Plus size={20} />
            {alunosCopy.newAluno}
          </Button>
        </Link>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Input
                placeholder={alunosCopy.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="w-full lg:w-52">
              <label className="mb-2 block text-sm font-medium">{alunosCopy.statusLabel}</label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  handleStatusFilterChange(e.target.value as 'active' | 'inactive' | 'all')
                }
                className="ts-form-control"
              >
                <option value="active">{alunosCopy.statusActive}</option>
                <option value="inactive">{alunosCopy.statusInactive}</option>
                <option value="all">{alunosCopy.statusAll}</option>
              </select>
            </div>
            {canManageProfessores && (
              <div className="w-full lg:w-64">
                <label className="mb-2 block text-sm font-medium">{alunosCopy.professorLabel}</label>
                <select
                  value={professorFilter}
                  onChange={(e) => handleProfessorFilterChange(e.target.value)}
                  className="ts-form-control"
                  disabled={loadingProfessores}
                >
                  <option value="">{alunosCopy.allProfessores}</option>
                  {professores.map((professor) => (
                    <option key={professor.id} value={professor.id}>
                      {professor.user?.profile?.name || alunosCopy.unnamedProfessor}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSearch}>
                <Search size={20} />
                {alunosCopy.searchButton}
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'default' : 'outline'}
                onClick={() => setViewMode('cards')}
              >
                <LayoutGrid size={18} />
                {alunosCopy.cardsView}
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                onClick={() => setViewMode('list')}
              >
                <List size={18} />
                {alunosCopy.listView}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alunos List */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-muted-foreground">{alunosCopy.loading}</p>
          </CardContent>
        </Card>
      ) : alunos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">{alunosCopy.emptyTitle}</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? alunosCopy.emptySearchHint : alunosCopy.emptyDefaultHint}
            </p>
            {!searchQuery && (
              <Link to="/alunos/new">
                <Button>
                  <Plus size={20} />
                  {alunosCopy.addAluno}
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : viewMode === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {alunos.map((aluno) => {
            const weight = typeof aluno.weight === 'number' ? aluno.weight : undefined;
            const height = typeof aluno.height === 'number' ? aluno.height : undefined;
            const bmi = weight !== undefined && height !== undefined ? alunoService.calculateBMI(weight, height) : null;

            return (
              <Card key={aluno.id} className="transition-shadow hover:shadow-[var(--shadow-card)]">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{aluno.user.profile.name}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-2">
                          {aluno.age} {alunosCopy.ageYears}
                          {canManageProfessores && (
                            <>
                              {' '}
                              • {aluno.professor?.user?.profile?.name || alunosCopy.professorLabel}
                            </>
                          )}
                          {aluno.user.isActive === false && (
                            <span className="ts-badge-danger">
                              {alunosCopy.inactive}
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
                      <p className="font-medium">{weight !== undefined ? `${weight} kg` : 'Não informado'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Altura:</span>
                      <p className="font-medium">{height !== undefined ? `${height} cm` : 'Não informado'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">IMC:</span>
                      <p className="font-medium">{bmi !== null ? bmi.toFixed(1) : 'Não informado'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">VO2 Max:</span>
                      <p className="font-medium">{typeof aluno.vo2Max === 'number' ? aluno.vo2Max : 'Não informado'}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 border-t pt-4">
                    <Link to={`/alunos/${aluno.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Eye size={16} />
                        {alunosCopy.view}
                      </Button>
                    </Link>
                    <Link to={`/alunos/${aluno.id}/edit`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        <Edit size={16} />
                        {alunosCopy.edit}
                      </Button>
                    </Link>
                    {aluno.user.isActive === false ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleActivate(aluno.id)}
                      >
                        <UserCheck size={16} />
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeactivate(aluno.id)}
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
            <div className="grid grid-cols-12 gap-2 border-b pb-3 text-xs font-semibold text-muted-foreground">
              <div className="col-span-4">{alunosCopy.studentColumn}</div>
              <div className="col-span-2">{alunosCopy.weightColumn}</div>
              <div className="col-span-2">{alunosCopy.heightColumn}</div>
              <div className="col-span-1">IMC</div>
              <div className="col-span-1">VO2</div>
              <div className="col-span-2 text-right">{alunosCopy.actions}</div>
            </div>
            <div className="divide-y">
              {alunos.map((aluno) => {
                const weight = typeof aluno.weight === 'number' ? aluno.weight : undefined;
                const height = typeof aluno.height === 'number' ? aluno.height : undefined;
                const bmi = weight !== undefined && height !== undefined ? alunoService.calculateBMI(weight, height) : null;
                const professorName = aluno.professor?.user?.profile?.name;

                return (
                  <div key={aluno.id} className="grid grid-cols-12 gap-2 py-3 items-center">
                    <div className="col-span-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{aluno.user.profile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {aluno.age} {alunosCopy.ageYears}
                          {canManageProfessores && (
                            <>
                              {' '}
                              • {professorName || alunosCopy.professorLabel}
                            </>
                          )}
                          {aluno.user.isActive === false && (
                            <span className="ts-badge-danger ml-2">
                              {alunosCopy.inactive}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="col-span-2 text-sm">{weight !== undefined ? `${weight} kg` : 'Não informado'}</div>
                    <div className="col-span-2 text-sm">{height !== undefined ? `${height} cm` : 'Não informado'}</div>
                    <div className="col-span-1 text-sm">{bmi !== null ? bmi.toFixed(1) : '—'}</div>
                    <div className="col-span-1 text-sm">{typeof aluno.vo2Max === 'number' ? aluno.vo2Max : '—'}</div>
                    <div className="col-span-2 flex justify-end gap-2">
                      <Link to={`/alunos/${aluno.id}`}>
                        <Button variant="outline" size="sm">
                          <Eye size={16} />
                        </Button>
                      </Link>
                      <Link to={`/alunos/${aluno.id}/edit`}>
                        <Button variant="outline" size="sm">
                          <Edit size={16} />
                        </Button>
                      </Link>
                      {aluno.user.isActive === false ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleActivate(aluno.id)}
                        >
                          <UserCheck size={16} />
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeactivate(aluno.id)}
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
                {alunosCopy.previousPage}
              </Button>
              <span className="text-sm text-muted-foreground">
                {alunosCopy.pageLabel} {page} {alunosCopy.ofLabel} {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={page === totalPages}
              >
                {alunosCopy.nextPage}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
