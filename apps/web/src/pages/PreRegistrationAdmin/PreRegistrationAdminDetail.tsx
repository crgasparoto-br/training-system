import { useEffect, useState } from 'react';
import type { PreRegistrationAdminLeadDetailDTO } from '@corrida/types';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Edit3,
  GraduationCap,
  History,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { preRegistrationAdminService } from '../../services/pre-registration-admin.service';
import {
  PreRegistrationInviteCard,
  type InviteCopyState,
} from './PreRegistrationInviteCard';
import {
  formatDate,
  ProgressState,
  STATUS_LABELS,
  statusClass,
} from './pre-registration-ui';

type ApiFailure = {
  response?: {
    data?: {
      error?: string;
      code?: string;
      details?: { redirectTo?: string };
    };
  };
  message?: string;
};

type InviteHandoffState = {
  generatedInviteUrl?: string;
  inviteCopyState?: Exclude<InviteCopyState, 'idle'>;
};

function parseError(error: unknown) {
  const value = error as ApiFailure;
  return {
    message:
      value.response?.data?.error ||
      value.message ||
      'Não foi possível processar a ação.',
    code: value.response?.data?.code,
    redirectTo: value.response?.data?.details?.redirectTo,
  };
}

export function PreRegistrationAdminDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const inviteHandoff = (location.state || null) as InviteHandoffState | null;
  const [lead, setLead] = useState<PreRegistrationAdminLeadDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(
    inviteHandoff?.generatedInviteUrl || null
  );
  const [copyState, setCopyState] = useState<InviteCopyState>(
    inviteHandoff?.inviteCopyState || 'idle'
  );
  const [controlReason, setControlReason] = useState('');
  const [discardConfirmed, setDiscardConfirmed] = useState(false);
  const [reviewReference, setReviewReference] = useState('');
  const [deduplicationReference, setDeduplicationReference] = useState('');
  const [activationReference, setActivationReference] = useState('');
  const [conversionConfirmed, setConversionConfirmed] = useState(false);

  useEffect(() => {
    if (inviteHandoff?.generatedInviteUrl) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [inviteHandoff?.generatedInviteUrl, location.pathname, navigate]);

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timeout = setTimeout(() => setCopyState('idle'), 2500);
    return () => clearTimeout(timeout);
  }, [copyState]);

  const handleFailure = (failure: unknown) => {
    const parsed = parseError(failure);
    if (parsed.code === 'ACTIVE_STUDENT' && parsed.redirectTo) {
      navigate(parsed.redirectTo, { replace: true });
      return;
    }
    setError(parsed.message);
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setLead(await preRegistrationAdminService.get(id));
    } catch (loadError) {
      handleFailure(loadError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const refreshAfterConflict = async (message: string) => {
    try {
      setLead(await preRegistrationAdminService.get(id));
      setNotice(message);
    } catch (refreshError) {
      handleFailure(refreshError);
    }
  };

  const runAction = async (action: () => Promise<PreRegistrationAdminLeadDetailDTO>) => {
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      setLead(await action());
      setControlReason('');
      setDiscardConfirmed(false);
    } catch (actionError) {
      const parsed = parseError(actionError);
      if (
        parsed.code === 'CONCURRENT_MODIFICATION' ||
        parsed.code === 'ACTIVE_INVITE_EXISTS' ||
        parsed.code === 'INVALID_TRANSITION'
      ) {
        await refreshAfterConflict(
          'O registro foi alterado por outra operação. Os dados exibidos foram atualizados.'
        );
      } else {
        handleFailure(actionError);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const copyInvite = async (url = generatedUrl) => {
    if (!url) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API indisponível');
      await navigator.clipboard.writeText(url);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const generateInvite = async () => {
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await preRegistrationAdminService.generateInvite(id);
      setGeneratedUrl(result.url);
      setCopyState('idle');
      await copyInvite(result.url);
      setLead(await preRegistrationAdminService.get(id));
    } catch (actionError) {
      const parsed = parseError(actionError);
      if (
        parsed.code === 'CONCURRENT_MODIFICATION' ||
        parsed.code === 'ACTIVE_INVITE_EXISTS'
      ) {
        await refreshAfterConflict(
          'O convite foi alterado em outra sessão. O estado atual foi recarregado.'
        );
      } else {
        handleFailure(actionError);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const convertToStudent = async () => {
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await preRegistrationAdminService.convert(
        id,
        activationReference.trim()
      );
      navigate(result.redirectTo, { replace: true });
    } catch (actionError) {
      const parsed = parseError(actionError);
      if (
        parsed.code === 'CONCURRENT_MODIFICATION' ||
        parsed.code === 'INVALID_TRANSITION' ||
        parsed.code === 'PRECONDITION_FAILED'
      ) {
        await refreshAfterConflict(
          'A conversão não pôde ser concluída com o estado atual. Os dados foram atualizados.'
        );
      } else {
        handleFailure(actionError);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const revokeInvite = async (reason: string) => {
    if (!lead?.invite?.id || !reason) return;
    setActionLoading(true);
    setError(null);
    setNotice(null);
    try {
      await preRegistrationAdminService.revokeInvite(id, lead.invite.id, reason);
      setGeneratedUrl(null);
      setCopyState('idle');
      setLead(await preRegistrationAdminService.get(id));
    } catch (actionError) {
      const parsed = parseError(actionError);
      if (parsed.code === 'CONCURRENT_MODIFICATION') {
        await refreshAfterConflict(
          'O convite já havia sido alterado. O estado atual foi recarregado.'
        );
      } else {
        handleFailure(actionError);
      }
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !lead) {
    return (
      <div className="py-20 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Carregando pré-matrícula...</p>
      </div>
    );
  }

  if (!lead) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold">Pré-matrícula indisponível</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {error || 'O registro não foi encontrado no seu escopo.'}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCcw className="h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </Button>
            <Link to="/pre-matriculas">
              <Button>Voltar à lista</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            to="/pre-matriculas"
            className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Leads e pré-matrículas
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="ts-page-heading">{lead.name}</h1>
            <span className={statusClass(lead.status)}>{STATUS_LABELS[lead.status]}</span>
          </div>
          <p className="ts-page-description">
            Criado em {formatDate(lead.createdAt)} • Responsável:{' '}
            {lead.responsible?.name || 'não definido'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={load}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Atualizar
          </Button>
          {lead.allowedActions.canEditCommercialData && (
            <Link to={`/pre-matriculas/${lead.id}/editar`}>
              <Button variant="outline">
                <Edit3 className="h-4 w-4" aria-hidden="true" />
                Editar dados comerciais
              </Button>
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-lg border border-info/40 bg-info/10 px-4 py-3 text-sm text-foreground"
        >
          {notice}
        </div>
      )}

      <Card className={lead.nextAction.enabled ? 'border-primary/40' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
            Próxima ação
          </CardTitle>
          <CardDescription>{lead.nextAction.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-foreground">{lead.nextAction.label}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumo administrativo</CardTitle>
              <CardDescription>
                Dados de contato e contexto comercial. Respostas clínicas não são exibidas nesta tela.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="mt-1 font-medium">{lead.contacts.phone || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone adicional</p>
                <p className="mt-1 font-medium">{lead.contacts.additionalPhone || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">E-mail</p>
                <p className="mt-1 break-all font-medium">{lead.contacts.email || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">E-mail adicional</p>
                <p className="mt-1 break-all font-medium">{lead.contacts.additionalEmail || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">CPF</p>
                <p className="mt-1 font-medium">{lead.contacts.cpf || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Origem</p>
                <p className="mt-1 font-medium">{lead.origin}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unidade</p>
                <p className="mt-1 font-medium">{lead.commercial.unit || 'Não informada'}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">Observações comerciais</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">
                  {lead.commercial.notes || 'Nenhuma observação registrada.'}
                </p>
              </div>
              {lead.contacts.masked && (
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  Parte dos dados foi protegida porque seu perfil possui acesso somente de consulta.
                </p>
              )}
            </CardContent>
          </Card>

          <PreRegistrationInviteCard
            lead={lead}
            actionLoading={actionLoading}
            generatedUrl={generatedUrl}
            copyState={copyState}
            onGenerate={generateInvite}
            onCopy={() => copyInvite()}
            onRevoke={revokeInvite}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5" aria-hidden="true" />
                Histórico
              </CardTitle>
              <CardDescription>
                Eventos administrativos do ciclo e dos convites, do mais recente para o mais antigo.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lead.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
              ) : (
                <ol className="space-y-3">
                  {lead.history.map((item) => (
                    <li key={`${item.type}-${item.id}`} className="border-l-2 border-border pl-4">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Progresso</CardTitle>
              <CardDescription>
                {lead.progress.completedFields} de {lead.progress.totalFields} requisitos mínimos concluídos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProgressState label="Cadastro básico" status={lead.progress.basicRegistration} />
              <ProgressState label="Anamnese" status={lead.progress.healthModuleStatus} />
              <ProgressState label="PAR-Q" status={lead.progress.parqModuleStatus} />
              {lead.progress.parqRequiresProfessionalReview && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  <ShieldAlert
                    className="mt-0.5 h-4 w-4 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <span>
                    O PAR-Q possui alerta para análise profissional. Esta indicação não bloqueia a revisão comercial.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pendências para revisão</CardTitle>
              <CardDescription>
                Apenas os nomes das pendências são exibidos. O conteúdo das respostas permanece protegido.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lead.pendencies.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  Nenhuma pendência obrigatória.
                </p>
              ) : (
                <ul className="space-y-2">
                  {lead.pendencies.map((item) => (
                    <li
                      key={item.code}
                      className={
                        item.blocking
                          ? 'rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm'
                          : 'rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-sm'
                      }
                    >
                      {item.label}
                      {!item.blocking && (
                        <span className="ml-2 text-xs text-muted-foreground">Recomendação</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {lead.allowedActions.canReview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Concluir revisão</CardTitle>
                <CardDescription>
                  Registre as referências usadas para revisar o cadastro e a deduplicação.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={reviewReference}
                  onChange={(event) => setReviewReference(event.target.value)}
                  placeholder="Referência da revisão"
                />
                <Input
                  value={deduplicationReference}
                  onChange={(event) => setDeduplicationReference(event.target.value)}
                  placeholder="Referência da deduplicação"
                />
                <Button
                  type="button"
                  isLoading={actionLoading}
                  disabled={!reviewReference.trim() || !deduplicationReference.trim()}
                  onClick={() =>
                    runAction(() =>
                      preRegistrationAdminService.review(
                        id,
                        reviewReference,
                        deduplicationReference
                      )
                    )
                  }
                >
                  <UserCheck className="h-4 w-4" aria-hidden="true" />
                  Aprovar revisão
                </Button>
              </CardContent>
            </Card>
          )}

          {(lead.allowedActions.canDiscard || lead.allowedActions.canReopen) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Controle do lead</CardTitle>
                <CardDescription>
                  O motivo fica registrado no histórico. Descartar também invalida qualquer convite ativo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  value={controlReason}
                  onChange={(event) => setControlReason(event.target.value)}
                  placeholder="Motivo obrigatório"
                />
                {lead.allowedActions.canDiscard && (
                  <label className="flex items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={discardConfirmed}
                      onChange={(event) => setDiscardConfirmed(event.target.checked)}
                    />
                    <span>Confirmo o descarte e a invalidação do convite ativo.</span>
                  </label>
                )}
                {lead.allowedActions.canDiscard ? (
                  <Button
                    type="button"
                    variant="destructive"
                    isLoading={actionLoading}
                    disabled={!controlReason.trim() || !discardConfirmed}
                    onClick={() =>
                      runAction(() =>
                        preRegistrationAdminService.discard(id, controlReason.trim())
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Descartar lead
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    isLoading={actionLoading}
                    disabled={!controlReason.trim()}
                    onClick={() =>
                      runAction(() =>
                        preRegistrationAdminService.reopen(id, controlReason.trim())
                      )
                    }
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    Reabrir lead
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {lead.allowedActions.canConvert && (
            <Card className="border-success/40">
              <CardHeader>
                <CardTitle className="text-lg">Confirmar matrícula</CardTitle>
                <CardDescription>
                  A conversão ativa o mesmo registro canônico como aluno. A conta de acesso deve estar vinculada antes desta ação.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="space-y-2">
                  <span className="text-sm font-medium">Referência da ativação *</span>
                  <Input
                    value={activationReference}
                    onChange={(event) => setActivationReference(event.target.value)}
                    placeholder="Contrato, atendimento ou decisão que autoriza a matrícula"
                  />
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={conversionConfirmed}
                    onChange={(event) => setConversionConfirmed(event.target.checked)}
                  />
                  <span>Confirmo que a revisão administrativa foi concluída e que este registro deve se tornar um aluno ativo.</span>
                </label>
                <Button
                  type="button"
                  variant="success"
                  isLoading={actionLoading}
                  disabled={!activationReference.trim() || !conversionConfirmed}
                  onClick={convertToStudent}
                >
                  <GraduationCap className="h-4 w-4" aria-hidden="true" />
                  Confirmar matrícula
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
