import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, RefreshCcw, Search, User, UserPlus } from 'lucide-react';
import { canAccessScreen } from '../access/access-control';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { alunoService, type Aluno } from '../services/aluno.service';
import { useAuthStore } from '../stores/useAuthStore';
import { resolveAssetUrl } from '../utils/assetUrl';

type StudentStatusFilter = 'active' | 'inactive' | 'all';

function getAlunoErrorMessage(error: unknown, fallback: string) {
  const maybeError = error as { response?: { data?: { error?: string } }; message?: string };
  return maybeError?.response?.data?.error || maybeError?.message || fallback;
}

function getStudentName(aluno: Aluno) {
  return aluno.user?.profile?.name || 'Aluno sem nome';
}

function getStudentStatusLabel(aluno: Aluno) {
  return aluno.user?.isActive === false ? 'Inativo' : 'Ativo';
}

function getStudentContactSummary(aluno: Aluno) {
  const email = aluno.user?.email;
  const phone = aluno.user?.profile?.phone;

  if (email && phone) {
    return `${email} • ${phone}`;
  }

  return email || phone || 'Contato pendente';
}

function getSearchContextLabel(isSearchMode: boolean, searchQuery: string) {
  const query = searchQuery.trim();

  if (isSearchMode) {
    return `Busca atual: "${query}"`;
  }

  if (query.length === 1) {
    return 'Digite pelo menos 2 letras para iniciar a busca por nome.';
  }

  return 'Exibindo alunos recentes para acesso rapido.';
}

export function StudentCentral() {
  const user = useAuthStore((state) => state.user);
  const canCreateAluno = canAccessScreen(user, 'students.registration');
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StudentStatusFilter>('active');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);

  const trimmedSearchQuery = searchQuery.trim();
  const isSearchMode = trimmedSearchQuery.length >= 2;
  const visibleAlunos = useMemo(() => (Array.isArray(alunos) ? alunos : []), [alunos]);
  const searchContextLabel = getSearchContextLabel(isSearchMode, searchQuery);

  const runStudentRequest = async (
    request: () => Promise<Aluno[]>,
    fallbackErrorMessage: string
  ) => {
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;
    setLoading(true);
    setLoadError(null);

    try {
      const nextAlunos = await request();

      if (requestSequenceRef.current !== requestSequence) {
        return;
      }

      setAlunos(Array.isArray(nextAlunos) ? nextAlunos : []);
    } catch (error) {
      if (requestSequenceRef.current !== requestSequence) {
        return;
      }

      setAlunos([]);
      setLoadError(getAlunoErrorMessage(error, fallbackErrorMessage));
    } finally {
      if (requestSequenceRef.current === requestSequence) {
        setLoading(false);
      }
    }
  };

  const loadInitialStudents = async () => {
    await runStudentRequest(async () => {
      const response = await alunoService.list(1, 8, undefined, statusFilter);
      return response.alunos;
    }, 'Nao foi possivel carregar os alunos.');
  };

  const searchStudents = async () => {
    if (trimmedSearchQuery.length < 2) {
      await loadInitialStudents();
      return;
    }

    await runStudentRequest(
      () => alunoService.search(trimmedSearchQuery, undefined, statusFilter),
      'Nao foi possivel buscar alunos.'
    );
  };

  const reloadCurrentView = async () => {
    if (isSearchMode) {
      await searchStudents();
      return;
    }

    await loadInitialStudents();
  };

  useEffect(() => {
    if (isSearchMode) {
      const timeoutId = window.setTimeout(() => {
        searchStudents();
      }, 250);

      return () => window.clearTimeout(timeoutId);
    }

    loadInitialStudents();
  }, [searchQuery, statusFilter, isSearchMode]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">Atendimento do aluno</p>
          <h1 className="ts-page-heading">Central do Aluno</h1>
          <p className="ts-page-description">
            Pesquise um aluno, abra a ficha centralizada e trabalhe no contexto dele com resumo, historico e proximas acoes.
          </p>
        </div>
        {canCreateAluno && (
          <Link to="/alunos/new">
            <Button>
              <UserPlus size={18} />
              Novo aluno
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Buscar aluno</CardTitle>
          <CardDescription>
            Digite pelo menos 2 letras do nome para localizar e abrir a ficha centralizada. A estrutura deixa espaco para evoluir a busca por CPF, telefone ou matricula quando houver contrato de API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-medium">Nome do aluno</label>
              <Input
                placeholder="Buscar por nome..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && searchStudents()}
              />
              <p className="mt-2 text-xs text-muted-foreground">{searchContextLabel}</p>
            </div>
            <div className="w-full lg:w-52">
              <label className="mb-2 block text-sm font-medium">Status</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StudentStatusFilter)}
                className="ts-form-control"
              >
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
                <option value="all">Todos</option>
              </select>
            </div>
            <Button onClick={searchStudents}>
              <Search size={18} />
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {loadError && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-destructive">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Falha ao carregar a Central</p>
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

      <Card>
        <CardHeader>
          <CardTitle>{isSearchMode ? 'Resultados da busca' : 'Alunos recentes'}</CardTitle>
          <CardDescription>
            Selecione um aluno para abrir a Central e manter todas as secoes no mesmo contexto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-4 text-sm text-muted-foreground">Carregando alunos...</p>
            </div>
          ) : visibleAlunos.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <User className="mx-auto h-10 w-10 text-muted-foreground opacity-60" />
              <h2 className="mt-3 text-base font-semibold text-foreground">
                Nenhum aluno encontrado
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isSearchMode
                  ? 'Revise o nome buscado ou altere o filtro de status para encontrar a ficha correta.'
                  : 'Ainda nao ha alunos recentes para listar. Use a busca por nome ou cadastre um novo aluno, se permitido.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleAlunos.map((aluno) => {
                const alunoName = getStudentName(aluno);
                const avatarUrl = resolveAssetUrl(aluno.user?.profile?.avatar);
                const alunoActive = aluno.user?.isActive !== false;

                return (
                  <Link
                    key={aluno.id}
                    to={`/central-do-aluno/${aluno.id}`}
                    className="rounded-lg border border-border bg-background p-4 text-card-foreground transition hover:border-primary/40 hover:shadow-[var(--shadow-soft)]"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">{alunoName}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {getStudentContactSummary(aluno)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {aluno.age} anos
                              {aluno.professor?.user?.profile?.name
                                ? ` • ${aluno.professor.user.profile.name}`
                                : ''}
                            </p>
                          </div>
                          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className={alunoActive ? 'ts-badge-success' : 'ts-badge-danger'}>
                            {getStudentStatusLabel(aluno)}
                          </span>
                          <span>{aluno.service?.name || 'Servico pendente'}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
