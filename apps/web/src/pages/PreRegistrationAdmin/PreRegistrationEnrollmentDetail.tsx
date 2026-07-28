import { useEffect, useMemo, useState } from 'react';
import type {
  PreRegistrationAdminLeadDetailDTO,
  PreRegistrationDuplicateCandidateDTO,
  PreRegistrationEnrollmentReviewDTO,
  PreRegistrationIdentityFieldDecision,
} from '@corrida/types';
import { AlertCircle, ArrowLeft, CheckCircle2, GitMerge, RefreshCcw, UserCheck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { preRegistrationAdminService } from '../../services/pre-registration-admin.service';
import { canAccessBlock, canAccessScreen } from '../../access/access-control';
import { useAuthStore } from '../../stores/useAuthStore';
import { PreRegistrationAdminDetail } from './PreRegistrationAdminDetail';
import { formatDate, ProgressState, STATUS_LABELS, statusClass } from './pre-registration-ui';

function candidateStatusLabel(status: PreRegistrationDuplicateCandidateDTO['status']) {
  return status === 'ACTIVE_STUDENT' ? 'Aluno ativo' : STATUS_LABELS[status];
}

function candidateStatusClass(status: PreRegistrationDuplicateCandidateDTO['status']) {
  return status === 'ACTIVE_STUDENT' ? 'ts-badge-success' : statusClass(status);
}

type Failure = { response?: { data?: { error?: string } }; message?: string };
type FieldDecisions = Record<string, PreRegistrationIdentityFieldDecision>;

const classificationLabel = {
  NONE: 'Nenhuma duplicidade encontrada',
  INFORMATIONAL: 'Semelhança informativa',
  REVIEW_REQUIRED: 'Revisão necessária',
  BLOCKING: 'Conflito bloqueante',
} as const;

function failureMessage(error: unknown) {
  const failure = error as Failure;
  return failure.response?.data?.error || failure.message || 'Não foi possível concluir a ação.';
}

function fieldKey(candidateId: string, field: string) {
  return `${candidateId}:${field}`;
}

function Candidate({
  candidate,
  selected,
  decisions,
  onSelect,
  onDecision,
}: {
  candidate: PreRegistrationDuplicateCandidateDTO;
  selected: boolean;
  decisions: FieldDecisions;
  onSelect: () => void;
  onDecision: (field: string, value: PreRegistrationIdentityFieldDecision) => void;
}) {
  return (
    <section className={`rounded-lg border p-4 ${selected ? 'border-primary ring-1 ring-primary/30' : ''}`}>
      <label className="flex cursor-pointer items-start gap-3">
        <input className="mt-1 h-4 w-4" type="radio" checked={selected} onChange={onSelect} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <strong>{candidate.maskedName}</strong>
            <span className={candidateStatusClass(candidate.status)}>
              {candidateStatusLabel(candidate.status)}
            </span>
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            Dados protegidos; apenas evidências necessárias para a decisão são exibidas.
          </span>
        </span>
      </label>
      <ul className="mt-3 space-y-1 text-sm">
        {candidate.signals.map((signal) => <li key={signal.code}>• {signal.label}</li>)}
      </ul>
      {selected && candidate.differences.length > 0 && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <p className="text-sm font-medium">Decisão explícita por campo</p>
          {candidate.differences.map((difference) => (
            <div key={difference.field} className="grid gap-2 rounded-md bg-muted/40 p-3 md:grid-cols-[1fr_1fr_230px] md:items-center">
              <div>
                <p className="text-sm font-medium">{difference.label}</p>
                {difference.sensitive && <p className="text-xs text-muted-foreground">Campo sensível</p>}
              </div>
              <div className="text-xs text-muted-foreground">
                <p>Pré-matrícula: {difference.sourceValueMasked || 'vazio'}</p>
                <p>Canônico: {difference.canonicalValueMasked || 'vazio'}</p>
              </div>
              <select
                aria-label={`Decisão para ${difference.label}`}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={decisions[fieldKey(candidate.candidateAlunoId, difference.field)] || ''}
                onChange={(event) => onDecision(
                  difference.field,
                  event.target.value as PreRegistrationIdentityFieldDecision
                )}
              >
                <option value="">Selecione</option>
                <option value="KEEP_CANONICAL">Manter valor canônico</option>
                {difference.canonicalEmpty && !difference.sourceEmpty && (
                  <option value="USE_SOURCE_IF_EMPTY">Preencher campo vazio</option>
                )}
              </select>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function PreRegistrationEnrollmentDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canOpenClinicalArea =
    canAccessScreen(user, 'physicalAssessment.protocol') &&
    (canAccessBlock(user, 'physicalAssessment.prnt.anamnesisFollowUp') ||
      canAccessBlock(user, 'physicalAssessment.prnt.parqSubmissions'));
  const [lead, setLead] = useState<PreRegistrationAdminLeadDetailDTO | null>(null);
  const [review, setReview] = useState<PreRegistrationEnrollmentReviewDTO | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');
  const [decisions, setDecisions] = useState<FieldDecisions>({});
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = useMemo(
    () => review?.candidates.find((candidate) => candidate.candidateAlunoId === selectedId),
    [review?.candidates, selectedId]
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const current = await preRegistrationAdminService.get(id);
      setLead(current);
      if (current.status === 'PRE_REGISTRATION_COMPLETED' || current.status === 'READY_FOR_ENROLLMENT') {
        const inspection = await preRegistrationAdminService.getEnrollmentReview(id);
        setReview(inspection);
        setSelectedId((value) => value || inspection.candidates[0]?.candidateAlunoId || '');
      } else {
        setReview(null);
      }
    } catch (loadError) {
      setError(failureMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id]);

  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (actionError) {
      setError(failureMessage(actionError));
      await load();
    } finally {
      setWorking(false);
    }
  };

  if (loading && !lead) {
    return <div className="py-20 text-center">Carregando revisão da pré-matrícula...</div>;
  }
  if (!lead) {
    return (
      <Card><CardContent className="py-12 text-center">
        <AlertCircle className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-semibold">Pré-matrícula indisponível</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error || 'Registro não encontrado.'}</p>
        <Button className="mt-4" variant="outline" onClick={load}>Tentar novamente</Button>
      </CardContent></Card>
    );
  }
  if (!review) return <PreRegistrationAdminDetail />;

  const restrictedCandidateCount = review.restrictedCandidateCount ?? 0;
  const allFieldsDecided = Boolean(selected && selected.differences.every(
    (difference) => decisions[fieldKey(selected.candidateAlunoId, difference.field)]
  ));
  const selectedFieldDecisions = selected
    ? Object.fromEntries(selected.differences.map((difference) => [
        difference.field,
        decisions[fieldKey(selected.candidateAlunoId, difference.field)],
      ]).filter((entry) => Boolean(entry[1])))
    : {};

  const decideDifferent = () => run(async () => {
    const result = await preRegistrationAdminService.decideDuplicate(id, {
      action: 'CONFIRM_DIFFERENT',
      candidateAlunoId: selectedId,
      reason: reason.trim(),
      expectedVersion: review.recordVersion,
      fingerprint: review.fingerprint,
    });
    if ('canonicalAlunoId' in result) return;
    setReview(result);
    setNotice('Decisão registrada e vinculada à versão atual dos dados.');
  });

  const useCanonical = () => run(async () => {
    const result = await preRegistrationAdminService.decideDuplicate(id, {
      action: 'USE_EXISTING_CANONICAL',
      candidateAlunoId: selectedId,
      reason: reason.trim(),
      expectedVersion: review.recordVersion,
      fingerprint: review.fingerprint,
      fieldDecisions: selectedFieldDecisions,
    });
    if ('canonicalAlunoId' in result) navigate(result.redirectTo, { replace: true });
  });

  const markReady = () => run(async () => {
    const updated = await preRegistrationAdminService.reviewEnrollment(id, {
      expectedVersion: review.recordVersion,
      fingerprint: review.fingerprint,
      reason: reason.trim() || 'Revisão administrativa concluída',
    });
    setReview(updated);
    setLead(await preRegistrationAdminService.get(id));
    setNotice('Revisão concluída. O mesmo registro está pronto para matrícula.');
  });

  const activate = () => run(async () => {
    const result = await preRegistrationAdminService.confirmEnrollment(id, {
      expectedVersion: review.recordVersion,
      fingerprint: review.fingerprint,
      confirmationAccepted: true,
    });
    navigate(result.redirectTo, { replace: true });
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link to="/pre-matriculas" className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Leads e pré-matrículas
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="ts-page-heading">Revisar {lead.name}</h1>
            <span className={statusClass(lead.status)}>{STATUS_LABELS[lead.status]}</span>
          </div>
          <p className="ts-page-description">Resolva identidade e ative este mesmo registro canônico.</p>
        </div>
        <Button variant="ghost" onClick={load} disabled={working}>
          <RefreshCcw className="h-4 w-4" aria-hidden="true" /> Atualizar
        </Button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm">{notice}</div>}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <main className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identificação e processo</CardTitle>
              <CardDescription>
                Dados cadastrais, comerciais e consentimento considerados nesta revisão.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Nome</dt>
                  <dd className="font-medium">{lead.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">CPF</dt>
                  <dd className="font-medium">{lead.contacts.cpf || 'Não informado'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Telefone</dt>
                  <dd className="font-medium">{lead.contacts.phone || 'Não informado'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">E-mail</dt>
                  <dd className="font-medium">{lead.contacts.email || 'Não informado'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Origem</dt>
                  <dd className="font-medium">{lead.origin}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Responsável comercial</dt>
                  <dd className="font-medium">{lead.responsible?.name || 'Não definido'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Unidade</dt>
                  <dd className="font-medium">{lead.commercial.unit || 'Não informada'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Validação</dt>
                  <dd className="font-medium">
                    {lead.contacts.masked
                      ? 'Valores protegidos conforme sua permissão'
                      : 'Identificadores normalizados pelo serviço canônico'}
                  </dd>
                </div>
              </dl>
              {lead.commercial.notes && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <p className="text-muted-foreground">Observações comerciais</p>
                  <p className="mt-1 whitespace-pre-wrap">{lead.commercial.notes}</p>
                </div>
              )}
              <dl className="grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Cadastro criado</dt>
                  <dd>{formatDate(lead.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Convite enviado</dt>
                  <dd>{formatDate(lead.invite?.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Preenchimento iniciado</dt>
                  <dd>{formatDate(lead.lifecycleProgress.startedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Preenchimento concluído</dt>
                  <dd>{formatDate(lead.lifecycleProgress.completedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Consentimento</dt>
                  <dd>{formatDate(lead.lifecycleProgress.privacyAcceptedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Versão do consentimento</dt>
                  <dd>{lead.lifecycleProgress.privacyNoticeVersion || 'Não informada'}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Identidade e duplicidades</CardTitle>
              <CardDescription>
                {classificationLabel[review.classification]}. CPF e conta incompatível bloqueiam; nome isolado é somente informativo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {review.candidates.length === 0 && restrictedCandidateCount === 0 ? (
                <p className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Nenhuma duplicidade exige decisão.
                </p>
              ) : review.candidates.map((candidate) => (
                <Candidate
                  key={candidate.candidateAlunoId}
                  candidate={candidate}
                  selected={candidate.candidateAlunoId === selectedId}
                  decisions={decisions}
                  onSelect={() => setSelectedId(candidate.candidateAlunoId)}
                  onDecision={(field, value) => setDecisions((current) => ({
                    ...current,
                    [fieldKey(candidate.candidateAlunoId, field)]: value,
                  }))}
                />
              ))}

              {restrictedCandidateCount > 0 && (
                <div role="status" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
                  Há {restrictedCandidateCount} cadastro(s) relacionado(s) fora do seu escopo. Nenhum dado foi exibido e a decisão deve ser concluída por um usuário com acesso a todos os registros.
                </div>
              )}
              {review.candidates.length > 0 && (
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Motivo obrigatório da decisão" />
              )}
              {review.currentDecision && (
                <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
                  Decisão vigente até {new Date(review.currentDecision.validUntil).toLocaleString('pt-BR')}.
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {review.canConfirmDifferentPeople && (
                  <Button variant="outline" isLoading={working} disabled={!selectedId || !reason.trim()} onClick={decideDifferent}>
                    Confirmar pessoas diferentes
                  </Button>
                )}
                {review.canUseExistingCanonical && (
                  <Button variant="outline" isLoading={working} disabled={!selectedId || !reason.trim() || !allFieldsDecided} onClick={useCanonical}>
                    <GitMerge className="h-4 w-4" aria-hidden="true" /> Usar cadastro existente
                  </Button>
                )}
                <Button variant="ghost" onClick={() => { setReason(''); setDecisions({}); }}>Cancelar decisão</Button>
              </div>
            </CardContent>
          </Card>

          {lead.status === 'PRE_REGISTRATION_COMPLETED' && (
            <Card className="border-primary/40">
              <CardHeader><CardTitle>Concluir revisão administrativa</CardTitle>
                <CardDescription>A revisão fica vinculada à versão {review.recordVersion} e será invalidada se a identidade mudar.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button isLoading={working} disabled={!review.canMarkReady} onClick={markReady}>
                  <UserCheck className="h-4 w-4" aria-hidden="true" /> Marcar como pronto para matrícula
                </Button>
              </CardContent>
            </Card>
          )}

          {lead.status === 'READY_FOR_ENROLLMENT' && (
            <Card className="border-success/40">
              <CardHeader><CardTitle>Confirmar matrícula</CardTitle>
                <CardDescription>Revalida duplicidades e concorrência no commit. Não cria contrato, plano, cobrança, professor ou agenda.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-start gap-3 text-sm">
                  <input className="mt-0.5 h-4 w-4" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                  <span>Confirmo a ativação deste mesmo registro canônico.</span>
                </label>
                <Button variant="success" isLoading={working} disabled={!review.canConfirmEnrollment || !confirmed} onClick={activate}>
                  Confirmar matrícula
                </Button>
              </CardContent>
            </Card>
          )}
        </main>

        <aside className="space-y-6">
          <Card><CardHeader><CardTitle>Progresso de saúde</CardTitle>
            <CardDescription>Somente status; respostas clínicas permanecem protegidas.</CardDescription>
          </CardHeader><CardContent className="space-y-3">
            <ProgressState label="Anamnese" status={review.health.healthModuleStatus} />
            <ProgressState label="PAR-Q" status={review.health.parqModuleStatus} />
            {review.health.parqRequiresProfessionalReview && <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">PAR-Q com alerta profissional. Não bloqueia nem é encerrado automaticamente.</p>}
            {canOpenClinicalArea && (
              <Link
                className="inline-flex text-sm font-medium text-primary hover:underline"
                to={`/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento?alunoId=${encodeURIComponent(id)}`}
              >
                Abrir área clínica
              </Link>
            )}
          </CardContent></Card>
          <Card>
            <CardHeader>
              <CardTitle>Histórico relevante</CardTitle>
              <CardDescription>Alterações de ciclo e convites preservadas no processo.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {lead.history.length === 0 ? (
                  <li className="text-muted-foreground">Nenhum evento registrado.</li>
                ) : lead.history.map((item) => (
                  <li key={`${item.type}:${item.id}`} className="border-l-2 border-border pl-3">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Após a matrícula</CardTitle></CardHeader>
            <CardContent><ul className="space-y-2 text-sm"><li>Contrato: não configurado</li><li>Plano e cobrança: não configurados</li><li>Professor: não configurado</li><li>Agenda: não configurada</li></ul></CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
