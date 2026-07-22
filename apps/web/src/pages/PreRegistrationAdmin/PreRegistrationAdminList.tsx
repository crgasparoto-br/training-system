import { useEffect, useMemo, useState } from 'react';
import type {
  PreRegistrationAdminLeadSummaryDTO,
  PreRegistrationAdminListResultDTO,
  PreRegistrationAdminStatus,
  PreRegistrationAdminSort,
} from '@corrida/types';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  RefreshCcw,
  Search,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { canAccessBlock } from '../../access/access-control';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { preRegistrationAdminService } from '../../services/pre-registration-admin.service';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  contactLine,
  formatDate,
  STATUS_LABELS,
  STATUS_OPTIONS,
  statusClass,
} from './pre-registration-ui';

const EMPTY_RESULT: PreRegistrationAdminListResultDTO = {
  items: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  filterOptions: { origins: [], responsibleProfessors: [] },
};

function errorMessage(error: unknown) {
  const value = error as { response?: { data?: { error?: string } }; message?: string };
  return value.response?.data?.error || value.message || 'Não foi possível carregar as pré-matrículas.';
}

function LeadCard({ lead }: { lead: PreRegistrationAdminLeadSummaryDTO }) {
  return (
    <Link
      to={`/pre-matriculas/${lead.id}`}
      className="block rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] transition hover:border-primary/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-foreground">{lead.name}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{contactLine(lead)}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={statusClass(lead.status)}>{STATUS_LABELS[lead.status]}</span>
        <span className="ts-badge-secondary">{lead.origin}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Responsável</dt>
          <dd className="mt-1 font-medium text-foreground">{lead.responsible?.name || 'Não definido'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Próxima ação</dt>
          <dd className="mt-1 font-medium text-foreground">{lead.nextAction.label}</dd>
        </div>
      </dl>
    </Link>
  );
}

export function PreRegistrationAdminList() {
  const user = useAuthStore((state) => state.user);
  const canCreate = canAccessBlock(user, 'students.preRegistration.create');
  const [result, setResult] = useState(EMPTY_RESULT);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PreRegistrationAdminStatus | ''>('');
  const [origin, setOrigin] = useState('');
  const [responsible, setResponsible] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sort, setSort] = useState<PreRegistrationAdminSort>('lastActivityAt:desc');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeFilterCount = useMemo(
    () => [status, origin, responsible, createdFrom, createdTo].filter(Boolean).length,
    [status, origin, responsible, createdFrom, createdTo]
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await preRegistrationAdminService.list({
        page,
        pageSize: 20,
        search: search.trim() || undefined,
        statuses: status ? [status] : undefined,
        origin: origin || undefined,
        responsibleProfessorId: responsible || undefined,
        createdFrom: createdFrom || undefined,
        createdTo: createdTo || undefined,
        sort,
      });
      setResult(data);
    } catch (loadError) {
      setError(errorMessage(loadError));
      setResult((current) => ({ ...current, items: [] }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(load, search.trim() ? 300 : 0);
    return () => window.clearTimeout(timeout);
  }, [page, search, status, origin, responsible, createdFrom, createdTo, sort]);

  const clearFilters = () => {
    setStatus('');
    setOrigin('');
    setResponsible('');
    setCreatedFrom('');
    setCreatedTo('');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-sm font-medium text-muted-foreground">Funil de entrada</p>
          <h1 className="ts-page-heading">Leads e pré-matrículas</h1>
          <p className="ts-page-description">
            Acompanhe contatos desde a entrada até a revisão administrativa, com convite, progresso e próxima ação no mesmo fluxo.
          </p>
        </div>
        {canCreate && (
          <Link to="/pre-matriculas/nova">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo lead
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">Localizar e filtrar</CardTitle>
              <CardDescription>Busca e filtros são aplicados no servidor e respeitam seu escopo de dados.</CardDescription>
            </div>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-4 w-4" aria-hidden="true" />
              {activeFilterCount} filtro(s) ativo(s)
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-2 sm:col-span-2">
            <span className="text-sm font-medium">Buscar</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                placeholder="Nome, CPF, telefone ou e-mail"
              />
            </div>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Status</span>
            <select className="ts-form-control" value={status} onChange={(event) => { setStatus(event.target.value as PreRegistrationAdminStatus | ''); setPage(1); }}>
              <option value="">Todos</option>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Ordenação</span>
            <select className="ts-form-control" value={sort} onChange={(event) => { setSort(event.target.value as PreRegistrationAdminSort); setPage(1); }}>
              <option value="lastActivityAt:desc">Atividade mais recente</option>
              <option value="createdAt:desc">Criação mais recente</option>
              <option value="createdAt:asc">Criação mais antiga</option>
              <option value="name:asc">Nome A–Z</option>
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Origem</span>
            <select className="ts-form-control" value={origin} onChange={(event) => { setOrigin(event.target.value); setPage(1); }}>
              <option value="">Todas</option>
              {result.filterOptions.origins.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Responsável</span>
            <select className="ts-form-control" value={responsible} onChange={(event) => { setResponsible(event.target.value); setPage(1); }}>
              <option value="">Todos</option>
              {result.filterOptions.responsibleProfessors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Criado a partir de</span>
            <Input type="date" value={createdFrom} onChange={(event) => { setCreatedFrom(event.target.value); setPage(1); }} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Criado até</span>
            <Input type="date" value={createdTo} onChange={(event) => { setCreatedTo(event.target.value); setPage(1); }} />
          </label>
          {activeFilterCount > 0 && (
            <div className="sm:col-span-2 xl:col-span-4">
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>Limpar filtros</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 text-destructive">
              <AlertCircle className="mt-0.5 h-5 w-5" aria-hidden="true" />
              <div><p className="font-medium">Falha ao carregar</p><p className="text-sm text-muted-foreground">{error}</p></div>
            </div>
            <Button type="button" variant="outline" onClick={load}><RefreshCcw className="h-4 w-4" />Tentar novamente</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-lg">Registros</CardTitle>
              <CardDescription>{result.pagination.total} pessoa(s) encontrada(s)</CardDescription>
            </div>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              Página {result.pagination.page} de {result.pagination.totalPages}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-14 text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /><p className="mt-4 text-sm text-muted-foreground">Carregando registros...</p></div>
          ) : result.items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
              <Users className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <h2 className="mt-3 font-semibold text-foreground">Nenhum registro encontrado</h2>
              <p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros ou crie um novo lead para iniciar o acompanhamento.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:hidden">{result.items.map((lead) => <LeadCard key={lead.id} lead={lead} />)}</div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-3 py-3">Pessoa</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Origem</th><th className="px-3 py-3">Responsável</th><th className="px-3 py-3">Última atividade</th><th className="px-3 py-3">Próxima ação</th><th className="w-12 px-3 py-3"><span className="sr-only">Abrir</span></th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {result.items.map((lead) => (
                      <tr key={lead.id} className="hover:bg-muted/40">
                        <td className="px-3 py-3"><Link className="font-medium text-foreground hover:text-primary" to={`/pre-matriculas/${lead.id}`}>{lead.name}</Link><p className="mt-0.5 max-w-xs truncate text-xs text-muted-foreground">{contactLine(lead)}</p></td>
                        <td className="px-3 py-3"><span className={statusClass(lead.status)}>{STATUS_LABELS[lead.status]}</span></td>
                        <td className="px-3 py-3 text-muted-foreground">{lead.origin}</td>
                        <td className="px-3 py-3 text-muted-foreground">{lead.responsible?.name || 'Não definido'}</td>
                        <td className="px-3 py-3 text-muted-foreground">{formatDate(lead.lastActivityAt)}</td>
                        <td className="px-3 py-3"><span className="font-medium text-foreground">{lead.nextAction.label}</span><p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{lead.nextAction.description}</p></td>
                        <td className="px-3 py-3"><Link aria-label={`Abrir ${lead.name}`} to={`/pre-matriculas/${lead.id}`}><ArrowRight className="h-4 w-4 text-muted-foreground" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!loading && result.pagination.totalPages > 1 && (
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="h-4 w-4" />Anterior</Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= result.pagination.totalPages} onClick={() => setPage((current) => current + 1)}>Próxima<ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
