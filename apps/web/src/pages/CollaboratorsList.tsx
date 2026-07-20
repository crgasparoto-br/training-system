import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Edit3, Eye, Plus, RotateCcw, Search, Users } from 'lucide-react';
import type { CollaboratorFunctionOption, ProfessorSummary } from '@corrida/types';
import { professorService } from '../services/professor.service';
import { collaboratorFunctionService } from '../services/collaborator-function.service';
import { useAuthStore } from '../stores/useAuthStore';
import { canAccessScreen, getDataScopeForScreen } from '../access/access-control';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card';
import { getLegalFinancialStatus } from '../features/collaborators/collaborator-model';
import { canCreateCollaborator, canWriteCollaborator } from '../features/collaborators/collaborator-access';
import { resolveAssetUrl } from '../utils/assetUrl';

const linkButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover';
const outlineLinkButtonClassName = 'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent';
const selectClassName = 'flex h-11 rounded-lg border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function normalize(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function CollaboratorsList() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<ProfessorSummary[]>([]);
  const [functions, setFunctions] = useState<CollaboratorFunctionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [functionId, setFunctionId] = useState('all');
  const [contractStatus, setContractStatus] = useState<'all' | 'signed' | 'pending'>('all');
  const [legalStatus, setLegalStatus] = useState<'all' | 'validated' | 'pending' | 'missing'>('all');
  const hasRegistrationAccess = canAccessScreen(user, 'collaborators.registration');
  const registrationScope = getDataScopeForScreen(user, 'collaborators.registration');
  const actorProfessorId = user?.professor?.id;
  const canCreate = hasRegistrationAccess && canCreateCollaborator(registrationScope);

  useEffect(() => {
    let active = true;
    Promise.all([professorService.list(), collaboratorFunctionService.list()])
      .then(([professors, collaboratorFunctions]) => {
        if (!active) return;
        setItems(professors);
        setFunctions(collaboratorFunctions);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os colaboradores.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filteredItems = useMemo(() => {
    const term = normalize(search.trim());
    return items.filter((item) => {
      const profile = item.user.profile;
      const legal = getLegalFinancialStatus(item);
      const matchesSearch = !term || [
        profile.name,
        item.user.email,
        profile.phone,
        profile.cpf,
        profile.cref,
        profile.instagramHandle,
        item.collaboratorFunction.name,
        item.currentStatus,
        item.responsibleManager?.user.profile.name,
      ].some((value) => normalize(value).includes(term));
      const matchesStatus = status === 'all' || (status === 'active' ? item.user.isActive !== false : item.user.isActive === false);
      const matchesFunction = functionId === 'all' || item.collaboratorFunction.id === functionId;
      const matchesContract = contractStatus === 'all' || (contractStatus === 'signed' ? item.hasSignedContract : !item.hasSignedContract);
      const matchesLegal = legalStatus === 'all'
        || (legalStatus === 'validated' && legal === 'Validado')
        || (legalStatus === 'pending' && legal === 'Pendente de validação')
        || (legalStatus === 'missing' && legal === 'Não informado');
      return matchesSearch && matchesStatus && matchesFunction && matchesContract && matchesLegal;
    });
  }, [contractStatus, functionId, items, legalStatus, search, status]);

  const hasFilters = search.trim() || status !== 'all' || functionId !== 'all' || contractStatus !== 'all' || legalStatus !== 'all';
  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setFunctionId('all');
    setContractStatus('all');
    setLegalStatus('all');
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Users size={22} /></div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Consultar colaboradores</h1>
            <p className="text-sm text-muted-foreground">Pesquise, filtre e abra o cadastro individual em modo de consulta.</p>
          </div>
        </div>
        {canCreate ? <Link className={linkButtonClassName} to="/professores/new"><Plus size={17} /> Novo colaborador</Link> : null}
      </header>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Filtros</CardTitle>
              <CardDescription>A consulta permanece somente leitura; edições são abertas em rota própria.</CardDescription>
            </div>
            {hasFilters ? <Button type="button" variant="outline" size="sm" onClick={clearFilters}><RotateCcw size={15} /> Limpar filtros</Button> : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="relative xl:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-3.5 z-10 text-muted-foreground" size={17} />
              <Input aria-label="Pesquisar colaboradores" className="pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail, contato, documento, função ou gestor" />
            </div>
            <select aria-label="Filtrar por situação" className={selectClassName} value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="all">Todas as situações</option><option value="active">Ativos</option><option value="inactive">Inativos</option>
            </select>
            <select aria-label="Filtrar por função" className={selectClassName} value={functionId} onChange={(event) => setFunctionId(event.target.value)}>
              <option value="all">Todas as funções</option>{functions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select aria-label="Filtrar por contrato" className={selectClassName} value={contractStatus} onChange={(event) => setContractStatus(event.target.value as typeof contractStatus)}>
              <option value="all">Todos os contratos</option><option value="signed">Contrato assinado</option><option value="pending">Contrato pendente</option>
            </select>
            <select aria-label="Filtrar dados jurídicos e financeiros" className={selectClassName} value={legalStatus} onChange={(event) => setLegalStatus(event.target.value as typeof legalStatus)}>
              <option value="all">Todos os dados financeiros</option><option value="validated">Validados</option><option value="pending">Pendentes</option><option value="missing">Não informados</option>
            </select>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{filteredItems.length} de {items.length} colaboradores exibidos.</p>
        </CardContent>
      </Card>

      {error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}
      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Carregando colaboradores...</div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium text-foreground">Nenhum colaborador encontrado</p>
          <p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros para ampliar a consulta.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredItems.map((item) => {
            const profile = item.user.profile;
            const avatarUrl = resolveAssetUrl(profile.avatar);
            const canEditRecord = hasRegistrationAccess
              && canWriteCollaborator(actorProfessorId, item, registrationScope);
            return (
              <article key={item.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted font-semibold text-foreground">
                    {avatarUrl ? <img src={avatarUrl} alt={profile.name} className="h-full w-full object-cover" /> : profile.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div><h2 className="truncate text-lg font-semibold text-foreground">{profile.name}</h2><p className="truncate text-sm text-muted-foreground">{item.user.email}</p></div>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.user.isActive === false ? 'bg-destructive/10 text-destructive' : 'bg-emerald-100 text-emerald-700'}`}>{item.user.isActive === false ? 'Inativo' : 'Ativo'}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{item.collaboratorFunction.name}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{item.hasSignedContract ? 'Contrato assinado' : 'Contrato pendente'}</span>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{getLegalFinancialStatus(item)}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                  <Link className={outlineLinkButtonClassName} to={`/consultas/colaboradores/${item.id}`}><Eye size={16} /> Consultar</Link>
                  {canEditRecord ? <Link className={linkButtonClassName} to={`/consultas/colaboradores/${item.id}/edit`}><Edit3 size={16} /> Editar</Link> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
