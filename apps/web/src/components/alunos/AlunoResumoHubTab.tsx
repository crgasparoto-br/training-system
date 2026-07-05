import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { isDateWithinRange, formatDateBR } from '../../utils/date';
import type {
  Aluno,
  StudentContractLink,
  StudentSegmentedSummary,
} from '../../services/aluno.service';
import type { Microcycle, TrainingPlan } from '../../services/plan.service';
import type { Assessment, AssessmentSummary } from '../../services/assessment.service';

type AlunoResumoHubTabProps = {
  aluno: Aluno;
  assessments: Assessment[];
  assessmentSummary: AssessmentSummary[];
  plans: TrainingPlan[];
  activeStudentContract?: StudentContractLink | null;
  segmentedSummary?: StudentSegmentedSummary | null;
};

type ScheduledSession = {
  plan: TrainingPlan;
  session: Microcycle;
  date: Date;
  mesocycleFocus?: string | null;
};

type SummaryCardTone = 'ok' | 'pending' | 'attention' | 'neutral';

type SummaryStatusCardProps = {
  title: string;
  status: string;
  evidence: string;
  nextAction: string;
  tone: SummaryCardTone;
};

const safeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const isSameDay = (left: Date, right: Date) =>
  startOfDay(left).getTime() === startOfDay(right).getTime();

const formatDuration = (minutes?: number | null) => {
  if (!minutes) return 'Tempo nao informado';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
};

const sessionTypeLabels: Record<string, string> = {
  easy_run: 'Corrida leve',
  tempo_run: 'Corrida tempo',
  interval: 'Intervalado',
  long_run: 'Corrida longa',
  recovery: 'Recuperacao',
  strength: 'Fortalecimento',
  rest: 'Descanso',
};

const dayLabels = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

const studentContractStatusLabel: Record<string, string> = {
  draft: 'Rascunho',
  pending_signature: 'Pendente de assinatura',
  active: 'Ativo',
  expired: 'Expirado',
  canceled: 'Cancelado',
  terminated: 'Encerrado',
};

const summaryToneClass: Record<SummaryCardTone, string> = {
  ok: 'border-emerald-200 bg-emerald-50/50',
  pending: 'border-amber-200 bg-amber-50/60',
  attention: 'border-red-200 bg-red-50/60',
  neutral: 'border-border bg-muted/20',
};

const summaryToneBadgeClass: Record<SummaryCardTone, string> = {
  ok: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  pending: 'border-amber-200 bg-amber-100 text-amber-700',
  attention: 'border-red-200 bg-red-100 text-red-700',
  neutral: 'border-border bg-background text-muted-foreground',
};

const formatSessionTitle = (session: Microcycle) =>
  sessionTypeLabels[session.sessionType] || 'Sessao de treino';

const formatSessionTarget = (session: Microcycle) => {
  const details = [formatDuration(session.durationMinutes)];

  if (session.distanceKm) {
    details.push(`${session.distanceKm.toLocaleString('pt-BR')} km`);
  }

  if (session.intensityPercentage) {
    details.push(`${session.intensityPercentage}% intensidade`);
  }

  if (session.heartRateZone) {
    details.push(`Zona ${session.heartRateZone}`);
  }

  return details.join(' • ');
};

const buildScheduledSessions = (plans: TrainingPlan[]) => {
  const sessions: ScheduledSession[] = [];

  plans.forEach((plan) => {
    plan.macrocycles?.forEach((macrocycle) => {
      macrocycle.mesocycles?.forEach((mesocycle) => {
        const mesocycleStart = safeDate(mesocycle.startDate);
        const mesocycleEnd = safeDate(mesocycle.endDate);

        if (!mesocycleStart || !mesocycleEnd) return;

        mesocycle.microcycles?.forEach((session) => {
          const daysUntilSession = (session.dayOfWeek - mesocycleStart.getDay() + 7) % 7;
          const sessionDate = startOfDay(addDays(mesocycleStart, daysUntilSession));

          if (sessionDate <= startOfDay(mesocycleEnd)) {
            sessions.push({
              plan,
              session,
              date: sessionDate,
              mesocycleFocus: mesocycle.focus,
            });
          }
        });
      });
    });
  });

  return sessions.sort((left, right) => left.date.getTime() - right.date.getTime());
};

function SummaryStatusCard({ title, status, evidence, nextAction, tone }: SummaryStatusCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${summaryToneClass[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="mt-2 text-sm font-semibold text-foreground">{status}</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${summaryToneBadgeClass[tone]}`}>
          {tone === 'ok' ? 'Em dia' : tone === 'attention' ? 'Atencao' : tone === 'pending' ? 'Pendente' : 'Info'}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{evidence}</p>
      <div className="mt-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs text-foreground">
        Proxima acao: {nextAction}
      </div>
    </div>
  );
}

export function AlunoResumoHubTab({
  aluno,
  assessments,
  assessmentSummary,
  plans,
  activeStudentContract,
  segmentedSummary,
}: AlunoResumoHubTabProps) {
  const now = new Date();
  const today = startOfDay(now);
  const activePlan = plans.find((plan) => isDateWithinRange(now, plan.startDate, plan.endDate));
  const scheduledSessions = buildScheduledSessions(plans);
  const todaySessions = scheduledSessions.filter((item) => isSameDay(item.date, today));
  const upcomingSessions = scheduledSessions
    .filter((item) => startOfDay(item.date).getTime() > today.getTime())
    .slice(0, 4);
  const latestAssessment = segmentedSummary?.assessments.latest
    ? {
        assessmentDate: segmentedSummary.assessments.latest.performedAt,
        type: {
          name: segmentedSummary.assessments.latest.title || 'Avaliacao registrada',
        },
      }
    : assessments[0];
  const upcomingAssessment = [...assessmentSummary]
    .filter((item) => item.nextDueDate)
    .map((item) => ({ ...item, nextDate: safeDate(item.nextDueDate) }))
    .filter((item) => item.nextDate)
    .sort((a, b) => (a.nextDate as Date).getTime() - (b.nextDate as Date).getTime())[0];
  const contractForDisplay = segmentedSummary?.financial.activeContract ?? activeStudentContract;
  const displayName = segmentedSummary?.overview.name ?? aluno.user.profile.name;
  const displayEmail = segmentedSummary?.overview.email ?? aluno.user.email;
  const displayPhone = segmentedSummary?.overview.phone ?? aluno.user.profile.phone ?? null;
  const displayUpdatedAt = segmentedSummary?.updatedAt ?? aluno.updatedAt;
  const displayMainGoal = segmentedSummary?.overview.mainGoal ?? aluno.intakeForm?.mainGoal ?? null;
  const displayServiceName =
    segmentedSummary?.overview.currentServiceName ??
    contractForDisplay?.service?.name ??
    aluno.service?.name ??
    null;
  const displayIntakeDate = segmentedSummary?.intake.assessmentDate ?? aluno.intakeForm?.assessmentDate ?? null;
  const hasCadastroEssentials = Boolean(displayName && displayEmail && aluno.age);
  const hasHealthAlert = Object.values(aluno.intakeForm?.parqResponses || {}).some(Boolean);
  const todayStatusTitle = todaySessions.length
    ? 'Treino planejado para hoje'
    : activePlan
      ? 'Sem sessao planejada para hoje'
      : 'Sem treino liberado hoje';
  const todayStatusDescription = todaySessions.length
    ? 'Use as orientacoes abaixo para acompanhar a execucao operacional do aluno.'
    : activePlan
      ? 'Existe plano ativo, mas nenhuma sessao do plano cai na data de hoje.'
      : 'Nenhum plano ativo foi encontrado para a data de hoje.';
  const summaryCards: SummaryStatusCardProps[] = [
    {
      title: 'Cadastro do aluno',
      status: hasCadastroEssentials ? 'Dados minimos disponiveis' : 'Cadastro incompleto',
      evidence: `${aluno.age || 'Idade nao informada'} anos • ${displayEmail || 'email pendente'}${displayPhone ? ` • ${displayPhone}` : ''}`,
      nextAction: hasCadastroEssentials
        ? `Revisar cadastro se houver mudanca desde ${formatDateBR(displayUpdatedAt)}.`
        : 'Completar dados basicos antes de evoluir para analises e prescricoes.',
      tone: hasCadastroEssentials ? 'ok' : 'pending',
    },
    {
      title: 'PRNT e anamnese',
      status: displayIntakeDate ? `Atualizado em ${formatDateBR(displayIntakeDate)}` : 'Sem intake inicial',
      evidence: displayMainGoal ? `Objetivo declarado: ${displayMainGoal}` : 'Objetivo principal ainda nao informado.',
      nextAction: displayIntakeDate
        ? 'Validar se o objetivo e as restricoes seguem atuais.'
        : 'Registrar PRNT/anamnese para orientar condutas e restricoes.',
      tone: displayIntakeDate ? (hasHealthAlert ? 'attention' : 'ok') : 'pending',
    },
    {
      title: 'Dores e restricoes',
      status: hasHealthAlert ? 'Ha respostas positivas no PAR-Q' : 'Sem alerta critico carregado',
      evidence: hasHealthAlert
        ? 'Revisar respostas positivas antes de prescrever ou intensificar treino.'
        : 'Nenhuma restricao critica foi identificada nas fontes carregadas.',
      nextAction: hasHealthAlert
        ? 'Abrir Saude/Anamnese e confirmar conduta segura.'
        : 'Manter acompanhamento e atualizar se houver dor, lesao ou medicacao.',
      tone: hasHealthAlert ? 'attention' : 'ok',
    },
    {
      title: 'Avaliacoes',
      status: latestAssessment ? formatDateBR(latestAssessment.assessmentDate) : 'Nenhuma avaliacao registrada',
      evidence: latestAssessment?.type?.name || 'Aguardando primeira avaliacao profissional.',
      nextAction: upcomingAssessment?.nextDueDate
        ? `Proxima prevista em ${formatDateBR(upcomingAssessment.nextDueDate)}.`
        : latestAssessment
          ? 'Definir ou revisar a proxima reavaliacao.'
          : 'Registrar avaliacao inicial para criar linha de base.',
      tone: latestAssessment ? (upcomingAssessment?.nextDueDate ? 'ok' : 'pending') : 'pending',
    },
    {
      title: 'Treinamento',
      status: activePlan?.name || 'Nenhum plano ativo',
      evidence: activePlan
        ? `${formatDateBR(activePlan.startDate)} ate ${formatDateBR(activePlan.endDate)}`
        : 'Nao ha plano ativo para a data de hoje.',
      nextAction: activePlan
        ? 'Acompanhar execucao e feedback do ciclo atual.'
        : 'Criar ou ativar plano de treino no contexto deste aluno.',
      tone: activePlan ? 'ok' : 'pending',
    },
    {
      title: 'Contrato e servico',
      status: contractForDisplay?.contract.title || 'Sem contrato ativo',
      evidence: contractForDisplay
        ? `${studentContractStatusLabel[contractForDisplay.status] || contractForDisplay.status} • Servico: ${displayServiceName || 'Nao informado'}`
        : `Servico: ${displayServiceName || 'Nao informado'}`,
      nextAction: contractForDisplay
        ? 'Conferir vigencia e condicoes na aba Financeiro.'
        : 'Verificar contrato, servico e condicoes comerciais permitidas.',
      tone: contractForDisplay?.status === 'active' ? 'ok' : contractForDisplay ? 'attention' : 'pending',
    },
    {
      title: 'Integracoes e apps',
      status: segmentedSummary?.integrations.totalAccounts
        ? `${segmentedSummary.integrations.totalAccounts} conta(s) conectada(s)`
        : 'Sem conta externa conectada',
      evidence: segmentedSummary?.integrations.lastSyncAt
        ? `Ultima sincronizacao em ${formatDateBR(segmentedSummary.integrations.lastSyncAt)}.`
        : 'Area preparada para separar dados externos do cadastro e das avaliacoes.',
      nextAction: segmentedSummary?.integrations.totalAccounts
        ? 'Conferir ultima sincronizacao e atividades importadas.'
        : 'Conectar integracoes quando fizer parte do acompanhamento.',
      tone: segmentedSummary?.integrations.totalAccounts ? 'ok' : 'neutral',
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Aluno selecionado</CardTitle>
          <CardDescription>
            Resumo operacional para navegar entre treino de hoje, prontuario, avaliacao, prescricao futura e historico sem perder o contexto do aluno.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Treino de hoje
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-foreground">{todayStatusTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{todayStatusDescription}</p>
                </div>
                <span className="inline-flex w-fit rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
                  {formatDateBR(now.toISOString())}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {todaySessions.length > 0 ? (
                  todaySessions.map(({ session, plan, mesocycleFocus }) => (
                    <div key={session.id} className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm font-semibold text-foreground">{formatSessionTitle(session)}</p>
                        <p className="text-xs text-muted-foreground">{plan.name}</p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{formatSessionTarget(session)}</p>
                      {mesocycleFocus && (
                        <p className="mt-2 text-xs text-muted-foreground">Objetivo do mesociclo: {mesocycleFocus}</p>
                      )}
                      {session.instructions && (
                        <p className="mt-2 text-sm text-foreground">{session.instructions}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                    A mensagem de indisponibilidade usa os planos carregados para este aluno. Quando a montagem consolidada existir, este bloco deve exibir somente treinos liberados e validados pelo professor.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Proximas sessoes
              </p>
              <div className="mt-3 space-y-3">
                {upcomingSessions.length > 0 ? (
                  upcomingSessions.map(({ session, plan, date }) => (
                    <div key={`${session.id}-${date.toISOString()}`} className="flex gap-3 rounded-lg border border-border bg-muted/20 p-3">
                      <div className="min-w-20 text-xs font-medium text-muted-foreground">
                        {dayLabels[date.getDay()]}
                        <br />
                        {formatDateBR(date.toISOString())}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{formatSessionTitle(session)}</p>
                        <p className="text-xs text-muted-foreground">{plan.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatSessionTarget(session)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Nenhuma sessao futura encontrada nos planos carregados deste aluno.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prontuario</p>
              <p className="mt-2 text-sm text-foreground">Objetivos, anamnese e alertas ficam antes da prescricao.</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avaliacao</p>
              <p className="mt-2 text-sm text-foreground">Historico e dados-base sustentam a decisao tecnica.</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prescricao</p>
              <p className="mt-2 text-sm text-foreground">Entrada preparada para capacidades futuras sem gerar treino direto.</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Historico</p>
              <p className="mt-2 text-sm text-foreground">Evolucao e auditoria preservam rastreabilidade do acompanhamento.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visao geral do aluno</CardTitle>
          <CardDescription>
            Leitura rapida com situacao atual, evidencia carregada e proxima acao recomendada para cada dominio da Central.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <SummaryStatusCard key={card.title} {...card} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
