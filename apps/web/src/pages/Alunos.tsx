import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { alunoService, type Aluno } from '../services/aluno.service';
import { professorService } from '../services/professor.service';
import type { ProfessorSummary } from '@corrida/types';
import { useAuthStore } from '../stores/useAuthStore';
import { canAccessBlock, canAccessScreen } from '../access/access-control';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Plus, Search, Edit, Eye, User, LayoutGrid, List, UserX, UserCheck, AlertCircle, RefreshCcw } from 'lucide-react';
import { alunosCopy } from '../i18n/ptBR';
import { resolveAssetUrl } from '../utils/assetUrl';

const VIEW_STATE_STORAGE_KEY = 'alunos.viewState';

function getAlunoErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.error || error?.message || fallback;
}

export function Alunos() {
  const user = useAuthStore((state) => state.user);
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [professores, setProfessores] = useState<ProfessorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProfessores, setLoadingProfessores] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const canCreateAluno = canAccessScreen(user, 'students.registration');
  const canViewAlunoDetails =
    canAccessScreen(user, 'students.details') ||
    canAccessScreen(user, 'students.consultation') ||
    canAccessScreen(user, 'students.registration');
  const canEditAluno =
    canAccessScreen(user, 'students.registration') &&
    canAccessBlock(user, 'students.actions.editProfile');
  const canToggleAlunoStatus = canEditAluno;
  const isSearchMode = searchQuery.trim().length >= 2;

  useEffect(() => {
    if (isSearchMode) {
      handleSearch();
      return;
    }

    loadAlunos();
  }, [page, professorFilter, statusFilter, isSearchMode]);

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

  useEffect(() => {
    if (!canManageProfessores && professorFilter) {
      setProfessorFilter('');
      setPage(1);
    }
  }, [canManageProfessores, professorFilter]);

  const loadAlunos = async (nextPage = page) => {
    setLoading(true);
    setLoadError(null);
    try {
      const scopedProfessorFilter = canManageProfessores ? professorFilter || undefined : undefined;
      const data = await alunoService.list(nextPage, 10, scopedProfessorFilter, statusFilter);
      const nextAlunos = Array.isArray(data?.alunos) ? data.alunos : [];
      const nextTotalPages =
        typeof data?.pagination?.totalPages === 'number' && data.pagination.totalPages > 0
          ? data.pagination.totalPages
          : 1;

      setAlunos(nextAlunos);
      setTotalPages(nextTotalPages);
    } catch (error) {
      console.error('Erro ao carregar alunos:', error);
      setAlunos([]);
      setTotalPages(1);
      setLoadError(getAlunoErrorMessage(error, 'Não foi possível carregar os alunos.'));
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    const trimmedQuery = searchQuery.trim();

    if (trimmedQuery.length < 2) {
      await loadAlunos(1);
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const scopedProfessorFilter = canManageProfessores ? professorFilter || undefined : undefined;
      const data = await alunoService.search(
        trimmedQuery,
        scopedProfessorFilter,
        statusFilter
      );
      setAlunos(Array.isArray(data) ? data : []);
      setTotalPages(1);
      setPage(1);
    } catch (error) {
      console.error('Erro ao buscar alunos:', error);
      setAlunos([]);
      setTotalPages(1);
      setLoadError(getAlunoErrorMessage(error, 'Não foi possível buscar alunos.'));
    } finally {
      setLoading(false);
    }
  };

  const reloadCurrentView = async () => {
    if (isSearchMode) {
      await handleSearch();
      return;
    }

    await loadAlunos(page);
  };

  const visibleAlunos = Array.isArray(alunos) ? alunos : [];

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

  const handleSearchQueryChange = (value: string) => {
    setSearchQuery(value);
    setPage(1);
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
      await reloadCurrentView();
    } catch (error) {
      console.error('Erro ao inativar aluno:', error);
      alert(getAlunoErrorMessage(error, alunosCopy.deactivateError));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await alunoService.activate(id);
      await reloadCurrentView();
    } catch (error) {
      console.error('Erro ao reativar aluno:', error);
      alert(getAlunoErrorMessage(error, alunosCopy.activateError));
    }
  };

  const renderAlunoActions = (aluno: Aluno, alunoActive: boolean, compact = false) => (
    <>
      {canViewAlunoDetails && (
        <Link to={`/alunos/${aluno.id}`} className={compact ? undefined : 'flex-1'}>
          <Button variant="outline" size="sm" className={compact ? undefined : 'w-full'}>
            <Eye size={16} />
            {!compact && alunosCopy.view}
          </Button>
        </Link>
      )}
      {canEditAluno && (
        <Link to={`/alunos/${aluno.id}/edit`} className={compact ? undefined : 'flex-1'}>
          <Button variant="outline" size="sm" className={compact ? undefined : 'w-full'}>
            <Edit size={16} />
            {!compact && alunosCopy.edit}
          </Button>
        </Link>
      )}
      {canToggleAlunoStatus && (
        !alunoActive ? (
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
        )
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="ts-page-heading">{alunosCopy.title}</h1>
          <p className="ts-page-description">
            {alunosCopy.description}
          </p>
        </div>
        {canCreateAluno && (
          <Link to="/alunos/new">
            <Button>
              <Plus size={20} />
              {alunosCopy.newAluno}
            </Button>
          </Link>
        )}
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Input
                placeholder={alunosCopy.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => handleSearchQueryChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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

      {loadError && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-destructive">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Falha ao carregar a consulta</p>
                <p className="text-sm text-muted-foreground">{loadError}</p>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={reloadCurrentView}>
              <RefreshCcw size={16} />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Alunos List */}
      {loading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-4 text-muted-foreground">{alunosCopy.loading}</p>
          </CardContent>
        </Card>
      ) : visibleAlunos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">{alunosCopy.emptyTitle}</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery ? alunosCopy.emptySearchHint : alunosCopy.emptyDefaultHint}
            </p>
            {!searchQuery && canCreateAluno && (
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
          {visibleAlunos.map((aluno) => {
            const weight = typeof aluno.weight === 'number' ? aluno.weight : undefined;
            const height = typeof aluno.height === 'number' ? aluno.height : undefined;
            const bmi = weight !== undefined && height !== undefined ? alunoService.calculateBMI(weight, height) : null;
            const alunoName = aluno.user?.profile?.name || 'Aluno sem nome';
            const alunoActive = aluno.user?.isActive !== false;
            const avatarUrl = resolveAssetUrl(aluno.user?.profile?.avatar);

            return (
              <Card key={aluno.id} className="transition-shadow hover:shadow-[var(--shadow-card)]">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={`Foto de ${alunoName}`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <User className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{alunoName}</CardTitle>
                        <CardDescription className="flex flex-wrap items-center gap-2">
                          {aluno.age} {alunosCopy.ageYears}
                          {canManageProfessores && (
                            <>
                              {' '}
                              • {aluno.professor?.user?.profile?.name || alunosCopy.professorLabel}
                            </>
                          )}
                          {!alunoActive && (
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
                    {renderAlunoActions(aluno, alunoActive)}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-12 gap-2 border-b pb-3 text-xs font-semibold text-muted-foreground">
                  <div className="col-span-4">{alunosCopy.studentColumn}</div>
                  <div className="col-span-2">{alunosCopy.weightColumn}</div>
                  <div className="col-span-2">{alunosCopy.heightColumn}</div>
                  <div className="col-span-1">IMC</div>
                  <div className="col-span-1">VO2</div>
                  <div className="col-span-2 text-right">{alunosCopy.actions}</div>
                </div>
                <div className="divide-y">
                  {visibleAlunos.map((aluno) => {
                    const weight = typeof aluno.weight === 'number' ? aluno.weight : undefined;
                    const height = typeof aluno.height === 'number' ? aluno.height : undefined;
                    const bmi = weight !== undefined && height !== undefined ? alunoService.calculateBMI(weight, height) : null;
                    const professorName = aluno.professor?.user?.profile?.name;
                    const alunoName = aluno.user?.profile?.name || 'Aluno sem nome';
                    const alunoActive = aluno.user?.isActive !== false;
                    const avatarUrl = resolveAssetUrl(aluno.user?.profile?.avatar);

                    return (
                      <div key={aluno.id} className="grid grid-cols-12 gap-2 py-3 items-center">
                        <div className="col-span-4 flex items-center gap-3">
                          <div className="h-10 w-10 overflow-hidden rounded-full bg-primary/10 flex items-center justify-center">
                            {avatarUrl ? (
                              <img
                                src={avatarUrl}
                                alt={`Foto de ${alunoName}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <User className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{alunoName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {aluno.age} {alunosCopy.ageYears}
                              {canManageProfessores && (
                                <>
                                  {' '}
                                  • {professorName || alunosCopy.professorLabel}
                                </>
                              )}
                              {!alunoActive && (
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
                          {renderAlunoActions(aluno, alunoActive, true)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {!isSearchMode && totalPages > 1 && (
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
