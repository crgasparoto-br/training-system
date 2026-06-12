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
          name: segmentedSummary.assessments.latest.title || 'Avaliação registrada',
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
  const todayStatusTitle = todaySessions.length
    ? 'Treino planejado para hoje'
    : activePlan
      ? 'Sem sessão planejada para hoje'
      : 'Sem treino liberado hoje';
  const todayStatusDescription = todaySessions.length
    ? 'Use as orientacoes abaixo para acompanhar a execucao operacional do aluno.'
    : activePlan
      ? 'Existe plano ativo, mas nenhuma sessao do plano cai na data de hoje.'
      : 'Nenhum plano ativo foi encontrado para a data de hoje.';

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
            Leitura rapida separando o que veio do cadastro, o que foi registrado por professores e o que esta operando no acompanhamento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cadastro do aluno</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">{displayName}</div>
              <div className="text-xs text-muted-foreground">
                {aluno.age} anos • {displayEmail}
              </div>
              {displayPhone && (
                <div className="mt-1 text-xs text-muted-foreground">{displayPhone}</div>
              )}
              <div className="mt-3 text-xs text-muted-foreground">
                Ultima atualizacao do cadastro: {formatDateBR(displayUpdatedAt)}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avaliacoes profissionais</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {latestAssessment ? formatDateBR(latestAssessment.assessmentDate) : 'Nenhuma avaliacao registrada'}
              </div>
              <div className="text-xs text-muted-foreground">
                {latestAssessment?.type?.name || 'Aguardando primeira avaliacao'}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Proxima prevista: {upcomingAssessment?.nextDueDate ? formatDateBR(upcomingAssessment.nextDueDate) : 'Sem previsao'}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contrato e financeiro</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {contractForDisplay?.contract.title || 'Sem contrato ativo'}
              </div>
              <div className="text-xs text-muted-foreground">
                {contractForDisplay
                  ? studentContractStatusLabel[contractForDisplay.status] || contractForDisplay.status
                  : 'Verifique a aba Financeiro'}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Servico: {displayServiceName || 'Nao informado'}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Treino em andamento</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {activePlan?.name || 'Nenhum plano ativo'}
              </div>
              <div className="text-xs text-muted-foreground">
                {activePlan
                  ? `${formatDateBR(activePlan.startDate)} ate ${formatDateBR(activePlan.endDate)}`
                  : 'Cadastre ou ative um plano de treino'}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saude inicial</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {displayIntakeDate ? formatDateBR(displayIntakeDate) : 'Sem intake inicial'}
              </div>
              <div className="text-xs text-muted-foreground">
                Objetivo declarado: {displayMainGoal || 'Nao informado'}
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-gray-300 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integracoes e apps</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {segmentedSummary?.integrations.totalAccounts
                  ? `${segmentedSummary.integrations.totalAccounts} conta(s) conectada(s)`
                  : 'Base preparada para dados externos'}
              </div>
              <div className="text-xs text-muted-foreground">
                {segmentedSummary?.integrations.lastSyncAt
                  ? `Ultima sincronizacao em ${formatDateBR(segmentedSummary.integrations.lastSyncAt)}.`
                  : 'Esta area separa futuras sincronizacoes, como Strava, do cadastro e das avaliacoes.'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
