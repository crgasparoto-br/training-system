import { useEffect, useState } from 'react';
import type { PreRegistrationAdminLeadDetailDTO } from '@corrida/types';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCopy,
  Edit3,
  ExternalLink,
  History,
  Link2,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { preRegistrationAdminService } from '../../services/pre-registration-admin.service';
import {
  formatDate,
  ProgressState,
  STATUS_LABELS,
  statusClass,
} from './pre-registration-ui';

function errorMessage(error: unknown) {
  const value = error as { response?: { data?: { error?: string } }; message?: string };
  return value.response?.data?.error || value.message || 'Não foi possível processar a ação.';
}

export function PreRegistrationAdminDetail() {
  const { id = '' } = useParams();
  const [lead, setLead] = useState<PreRegistrationAdminLeadDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reviewReference, setReviewReference] = useState('');
  const [deduplicationReference, setDeduplicationReference] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setLead(await preRegistrationAdminService.get(id));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const runAction = async (action: () => Promise<PreRegistrationAdminLeadDetailDTO>) => {
    setActionLoading(true);
    setError(null);
    try {
      setLead(await action());
      setReason('');
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setActionLoading(false);
    }
  };

  const generateInvite = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const result = await preRegistrationAdminService.generateInvite(id);
      setGeneratedUrl(result.url);
      await load();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setActionLoading(false);
    }
  };

  const revokeInvite = async () => {
    if (!lead?.invite?.id || !reason.trim()) {
      setError('Informe um motivo antes de revogar o convite.');
      return;
    }
    setActionLoading(true);
    setError(null);
    try {
      await preRegistrationAdminService.revokeInvite(id, lead.invite.id, reason.trim());
      setReason('');
      setGeneratedUrl(null);
      await load();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !lead) {
    return <div className="py-20 text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /><p className="mt-4 text-sm text-muted-foreground">Carregando pré-matrícula...</p></div>;
  }

  if (!lead) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-3 text-lg font-semibold">Pré-matrícula indisponível</h1>
          <p className="mt-1 text-sm text-muted-foreground">{error || 'O registro não foi encontrado no seu escopo.'}</p>
          <div className="mt-4 flex justify-center gap-2"><Button variant="outline" onClick={load}><RefreshCcw className="h-4 w-4" />Tentar novamente</Button><Link to="/pre-matriculas"><Button>Voltar à lista</Button></Link></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link to="/pre-matriculas" className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Leads e pré-matrículas</Link>
          <div className="flex flex-wrap items-center gap-3"><h1 className="ts-page-heading">{lead.name}</h1><span className={statusClass(lead.status)}>{STATUS_LABELS[lead.status]}</span></div>
          <p className="ts-page-description">Criado em {formatDate(lead.createdAt)} • Responsável: {lead.responsible?.name || 'não definido'}</p>
        </div>
        {lead.allowedActions.canEditCommercialData && (
          <Link to={`/pre-matriculas/${lead.id}/editar`}><Button variant="outline"><Edit3 className="h-4 w-4" />Editar dados comerciais</Button></Link>
        )}
      </div>

      {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <Card className={lead.nextAction.enabled ? 'border-primary/40' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><CheckCircle2 className="h-5 w-5 text-primary" />Próxima ação</CardTitle>
          <CardDescription>{lead.nextAction.description}</CardDescription>
        </CardHeader>
        <CardContent><p className="font-semibold text-foreground">{lead.nextAction.label}</p></CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Resumo administrativo</CardTitle><CardDescription>Dados de contato e contexto comercial. Respostas clínicas não são exibidas nesta tela.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">Telefone</p><p className="mt-1 font-medium">{lead.contacts.phone || 'Não informado'}</p></div>
              <div><p className="text-xs text-muted-foreground">E-mail</p><p className="mt-1 break-all font-medium">{lead.contacts.email || 'Não informado'}</p></div>
              <div><p className="text-xs text-muted-foreground">CPF</p><p className="mt-1 font-medium">{lead.contacts.cpf || 'Não informado'}</p></div>
              <div><p className="text-xs text-muted-foreground">Origem</p><p className="mt-1 font-medium">{lead.origin}</p></div>
              <div><p className="text-xs text-muted-foreground">Unidade</p><p className="mt-1 font-medium">{lead.commercial.unit || 'Não informada'}</p></div>
              <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">Observações comerciais</p><p className="mt-1 whitespace-pre-wrap text-sm">{lead.commercial.notes || 'Nenhuma observação registrada.'}</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Link2 className="h-5 w-5" />Convite de pré-cadastro</CardTitle><CardDescription>O link bruto aparece somente no momento da geração. Após sair desta página, gere um novo link se necessário.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="text-xs text-muted-foreground">Status</p><p className="mt-1 font-medium">{lead.invite?.status || 'Ainda não gerado'}</p></div>
                <div><p className="text-xs text-muted-foreground">Validade</p><p className="mt-1 font-medium">{formatDate(lead.invite?.expiresAt)}</p></div>
              </div>
              {generatedUrl && (
                <div className="rounded-xl border border-success/40 bg-success/10 p-4">
                  <p className="text-sm font-medium text-foreground">Novo link gerado</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">{generatedUrl}</p>
                  <Button type="button" size="sm" className="mt-3" onClick={() => navigator.clipboard.writeText(generatedUrl)}><ClipboardCopy className="h-4 w-4" />Copiar link</Button>
                </div>
              )}
              {(lead.allowedActions.canGenerateInvite || lead.allowedActions.canRegenerateInvite) && <Button type="button" isLoading={actionLoading} onClick={generateInvite}><Link2 className="h-4 w-4" />{lead.allowedActions.canRegenerateInvite ? 'Gerar novo link' : 'Gerar link'}</Button>}
              {lead.allowedActions.canRevokeInvite && (
                <div className="rounded-xl border border-border p-4">
                  <label className="space-y-2"><span className="text-sm font-medium">Motivo da revogação *</span><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explique por que o link será invalidado" /></label>
                  <Button type="button" variant="destructive" size="sm" className="mt-3" isLoading={actionLoading} onClick={revokeInvite}><Trash2 className="h-4 w-4" />Revogar convite</Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><History className="h-5 w-5" />Histórico</CardTitle><CardDescription>Eventos administrativos do ciclo e dos convites, do mais recente para o mais antigo.</CardDescription></CardHeader>
            <CardContent>
              {lead.history.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p> : <ol className="space-y-3">{lead.history.map((item) => <li key={`${item.type}-${item.id}`} className="border-l-2 border-border pl-4"><p className="text-sm font-medium text-foreground">{item.title}</p>{item.description && <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>}<p className="mt-1 text-xs text-muted-foreground">{formatDate(item.createdAt)}</p></li>)}</ol>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg">Progresso</CardTitle><CardDescription>{lead.progress.completedFields} de {lead.progress.totalFields} requisitos mínimos concluídos.</CardDescription></CardHeader>
            <CardContent className="space-y-3"><ProgressState label="Cadastro básico" status={lead.progress.basicRegistration} /><ProgressState label="Anamnese" status={lead.progress.healthModuleStatus} /><ProgressState label="PAR-Q" status={lead.progress.parqModuleStatus} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg">Pendências para revisão</CardTitle><CardDescription>Apenas nomes das pendências são exibidos. O conteúdo das respostas permanece protegido.</CardDescription></CardHeader>
            <CardContent>{lead.pendencies.length === 0 ? <p className="flex items-center gap-2 text-sm text-success"><ShieldCheck className="h-4 w-4" />Nenhuma pendência obrigatória.</p> : <ul className="space-y-2">{lead.pendencies.map((item) => <li key={item.code} className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{item.label}</li>)}</ul>}</CardContent>
          </Card>

          {lead.allowedActions.canReview && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Concluir revisão</CardTitle><CardDescription>Registre as referências usadas para revisar o cadastro e a deduplicação.</CardDescription></CardHeader>
              <CardContent className="space-y-3"><Input value={reviewReference} onChange={(event) => setReviewReference(event.target.value)} placeholder="Referência da revisão" /><Input value={deduplicationReference} onChange={(event) => setDeduplicationReference(event.target.value)} placeholder="Referência da deduplicação" /><Button type="button" isLoading={actionLoading} disabled={!reviewReference.trim() || !deduplicationReference.trim()} onClick={() => runAction(() => preRegistrationAdminService.review(id, reviewReference, deduplicationReference))}><UserCheck className="h-4 w-4" />Aprovar revisão</Button></CardContent>
            </Card>
          )}

          {(lead.allowedActions.canDiscard || lead.allowedActions.canReopen) && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Controle do lead</CardTitle><CardDescription>O motivo fica registrado no histórico. Descartar também invalida convite ativo.</CardDescription></CardHeader>
              <CardContent className="space-y-3"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo obrigatório" />{lead.allowedActions.canDiscard ? <Button type="button" variant="destructive" isLoading={actionLoading} disabled={!reason.trim()} onClick={() => runAction(() => preRegistrationAdminService.discard(id, reason))}><Trash2 className="h-4 w-4" />Descartar lead</Button> : <Button type="button" variant="outline" isLoading={actionLoading} disabled={!reason.trim()} onClick={() => runAction(() => preRegistrationAdminService.reopen(id, reason))}><RotateCcw className="h-4 w-4" />Reabrir lead</Button>}</CardContent>
            </Card>
          )}

          {lead.allowedActions.canConvert && (
            <Card className="border-success/40"><CardHeader><CardTitle className="text-lg">Pronto para matrícula</CardTitle><CardDescription>Abra a etapa seguinte para configurar contrato, serviço e ativação.</CardDescription></CardHeader><CardContent><Link to={`/alunos/${lead.id}/contracts`}><Button variant="success"><ExternalLink className="h-4 w-4" />Abrir fluxo de matrícula</Button></Link></CardContent></Card>
          )}
        </div>
      </div>
    </div>
  );
}
