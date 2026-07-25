import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { isDateWithinRange, formatDateBR } from '../../utils/date';
import type { Aluno, StudentContractLink, StudentSegmentedSummary } from '../../services/aluno.service';
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
  actionLabel?: string;
  actionTo?: string;
};

type PrntTechnicalItem = {
  label: string;
  value: string;
  tone: SummaryCardTone;
  empty?: boolean;
};

type AssessmentHistoryItem = {
  id: string;
  title: string;
  typeName: string;
  performedAt: string;
  responsibleName: string;
  origin: string;
  status: string;
};

const safeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeText = (value?: string | null) => {
  const normalizedValue = value?.trim();
  return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
};

const normalizeUnknownText = (value: unknown) => {
  if (typeof value === 'string') return normalizeText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const getRecordText = (record: Record<string, unknown> | null | undefined, keys: string[]) => {
  if (!record || typeof record !== 'object') return null;

  for (const key of keys) {
    const value = normalizeUnknownText(record[key]);
    if (value) return value;
  }

  return null;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const isSameDay = (left: Date, right: Date) =>
  startOfDay(left).getTime() === startOfDay(right).getTime();

const formatDuration = (minutes?: number | null) => {
  if (!minutes) return 'Tempo não informado';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
};

const formatNullableDate = (value?: string | null) => (value ? formatDateBR(value) : 'Não informada');

const sessionTypeLabels: Record<string, string> = {
  easy_run: 'Corrida leve',
  tempo_run: 'Corrida tempo',
  interval: 'Intervalado',
  long_run: 'Corrida longa',
  recovery: 'Recuperação',
  strength: 'Fortalecimento',
  rest: 'Descanso',
};

const dayLabels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const studentContractStatusLabel: Record<string, string> = {
  draft: 'Rascunho',
  pending_signature: 'Pendente de assinatura',
  active: 'Ativo',
  expired: 'Expirado',
  canceled: 'Cancelado',
  terminated: 'Encerrado',
};

const assessmentStatusLabel: Record<string, string> = {
  completed: 'Concluída',
  complete: 'Concluída',
  done: 'Concluída',
  draft: 'Rascunho',
  pending: 'Pendente',
  canceled: 'Cancelada',
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
  sessionTypeLabels[session.sessionType] || 'Sessão de treino';

const formatSessionTarget = (session: Microcycle) => {
  const details = [formatDuration(session.durationMinutes)];

  if (session.distanceKm) details.push(`${session.distanceKm.toLocaleString('pt-BR')} km`);
  if (session.intensityPercentage) details.push(`${session.intensityPercentage}% intensidade`);
  if (session.heartRateZone) details.push(`Zona ${session.heartRateZone}`);

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
            sessions.push({ plan, session, date: sessionDate, mesocycleFocus: mesocycle.focus });
          }
        });
      });
    });
  });

  return sessions.sort((left, right) => left.date.getTime() - right.date.getTime());
};

const getAssessmentResponsibleName = (assessment: Assessment) =>
  normalizeText(assessment.professional?.user?.profile?.name) ?? 'Responsável não informado';

const getAssessmentOrigin = (assessment: Assessment) =>
  assessment.extractedData?.parseOk ? 'Arquivo interpretado' : assessment.originalFileName ? 'Arquivo anexado' : 'Registro manual/sistema';

const getAssessmentStatusLabel = (status?: string | null) =>
  status ? assessmentStatusLabel[status] || status : 'Registrada';

function SummaryStatusCard({ title, status, evidence, nextAction, tone, actionLabel, actionTo }: SummaryStatusCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${summaryToneClass[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
          <div className="mt-2 text-sm font-semibold text-foreground">{status}</div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${summaryToneBadgeClass[tone]}`}>
          {tone === 'ok' ? 'Em dia' : tone === 'attention' ? 'Atenção' : tone === 'pending' ? 'Pendente' : 'Info'}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{evidence}</p>
      <div className="mt-3 rounded-md border border-border/70 bg-background/70 px-3 py-2 text-xs text-foreground">
        Próxima ação: {nextAction}
      </div>
      {actionLabel && actionTo && (
        <div className="mt-3">
          <Link to={actionTo}>
            <Button variant="outline" size="sm" className="w-full justify-center">
              {actionLabel}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function PrntTechnicalItemCard({ label, value, tone, empty }: PrntTechnicalItem) {
  return (
    <div className={`rounded-lg border p-3 ${empty ? 'border-dashed border-border bg-muted/20' : summaryToneClass[tone]}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <p className="mt-2 line-clamp-3 text-sm text-foreground">{value}</p>
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
  const assessmentsByDate = [...assessments].sort((left, right) => {
    const leftDate = safeDate(left.assessmentDate)?.getTime() ?? 0;
    const rightDate = safeDate(right.assessmentDate)?.getTime() ?? 0;
    return rightDate - leftDate;
  });
  const latestLegacyAssessment = assessmentsByDate[0];
  const latestAssessment = segmentedSummary?.assessments.latest
    ? {
        assessmentDate: segmentedSummary.assessments.latest.performedAt,
        typeName: segmentedSummary.assessments.latest.title || 'Avaliação registrada',
        responsibleName: 'Responsável não informado',
      }
    : latestLegacyAssessment
      ? {
          assessmentDate: latestLegacyAssessment.assessmentDate,
          typeName: latestLegacyAssessment.type?.name || 'Avaliação registrada',
          responsibleName: getAssessmentResponsibleName(latestLegacyAssessment),
        }
      : null;
  const upcomingAssessment = [...assessmentSummary]
    .filter((item) => item.nextDueDate)
    .map((item) => ({ ...item, nextDate: safeDate(item.nextDueDate) }))
    .filter((item) => item.nextDate)
    .sort((a, b) => (a.nextDate as Date).getTime() - (b.nextDate as Date).getTime())[0];
  const assessmentHistoryItems: AssessmentHistoryItem[] = assessmentsByDate.length
    ? assessmentsByDate.slice(0, 4).map((assessment) => ({
        id: assessment.id,
        title: assessment.type?.name || 'Avaliação registrada',
        typeName: assessment.type?.name || 'Tipo não informado',
        performedAt: assessment.assessmentDate,
        responsibleName: getAssessmentResponsibleName(assessment),
        origin: getAssessmentOrigin(assessment),
        status: 'Registrada',
      }))
    : segmentedSummary?.assessments.latest
      ? [
          {
            id: segmentedSummary.assessments.latest.id,
            title: segmentedSummary.assessments.latest.title || 'Avaliação registrada',
            typeName: segmentedSummary.assessments.latest.category || segmentedSummary.assessments.latest.code || 'Tipo não informado',
            performedAt: segmentedSummary.assessments.latest.performedAt,
            responsibleName: 'Responsável não informado',
            origin: segmentedSummary.assessments.latest.source.reference || segmentedSummary.assessments.latest.source.type,
            status: getAssessmentStatusLabel(segmentedSummary.assessments.latest.status),
          },
        ]
      : [];
  const assessmentTotal = segmentedSummary?.assessments.total ?? assessments.length;
  const hasAssessmentHistory = assessmentHistoryItems.length > 0;
  const nextAssessmentDate = upcomingAssessment?.nextDueDate ?? null;
  const nextAssessmentDue = safeDate(nextAssessmentDate);
  const isAssessmentOverdue = Boolean(nextAssessmentDue && startOfDay(nextAssessmentDue).getTime() < today.getTime());
  const assessmentStatusLabel = !latestAssessment
    ? 'Avaliação pendente'
    : isAssessmentOverdue
      ? 'Reavaliação vencida'
      : nextAssessmentDate
        ? 'Avaliação em dia'
        : 'Reavaliação sem data definida';
  const assessmentTone: SummaryCardTone = !latestAssessment
    ? 'pending'
    : isAssessmentOverdue
      ? 'attention'
      : nextAssessmentDate
        ? 'ok'
        : 'pending';
  const canCompareAssessments = assessmentTotal >= 2;
  const contractForDisplay = segmentedSummary?.financial.activeContract ?? activeStudentContract;
  const displayName = normalizeText(segmentedSummary?.overview.name) ?? normalizeText(aluno.user.profile.name);
  const displayEmail = normalizeText(segmentedSummary?.overview.email) ?? normalizeText(aluno.user.email);
  const displayPhone = normalizeText(segmentedSummary?.overview.phone) ?? normalizeText(aluno.user.profile.phone);
  const displayUpdatedAt = segmentedSummary?.updatedAt ?? aluno.updatedAt;
  const intake = segmentedSummary?.intake;
  const rawFormResponses = intake?.rawFormResponses ?? aluno.intakeForm?.formResponses ?? null;
  const rawAssessmentDate = getRecordText(rawFormResponses, ['assessmentDate']);
  const rawMainGoal = getRecordText(rawFormResponses, ['mainGoal']);
  const displayMainGoal = normalizeText(segmentedSummary?.overview.mainGoal) ?? normalizeText(aluno.intakeForm?.mainGoal) ?? rawMainGoal;
  const displayServiceName =
    normalizeText(segmentedSummary?.overview.currentServiceName) ??
    normalizeText(contractForDisplay?.service?.name) ??
    normalizeText(aluno.service?.name);
  const displayIntakeDate = intake?.assessmentDate ?? aluno.intakeForm?.assessmentDate ?? rawAssessmentDate;
  const displayIntakeUpdatedAt = intake?.updatedAt ?? intake?.createdAt ?? displayIntakeDate;
  const trainingBackground =
    getRecordText(intake?.clinicalHistory, ['trainingBackground', 'physicalActivityHistory', 'activityHistory']) ??
    normalizeText(aluno.intakeForm?.trainingBackground);
  const medicalHistory =
    getRecordText(intake?.clinicalHistory, ['medicalHistory', 'history', 'description']) ??
    normalizeText(aluno.intakeForm?.medicalHistory);
  const currentMedications =
    getRecordText(intake?.medications, ['currentMedications', 'medications', 'description', 'notes']) ??
    normalizeText(aluno.intakeForm?.currentMedications);
  const injuriesHistory =
    getRecordText(intake?.injuries, ['injuriesHistory', 'injuries', 'restrictions', 'description', 'notes']) ??
    normalizeText(aluno.intakeForm?.injuriesHistory);
  const allergies = getRecordText(intake?.allergies, ['allergies', 'description', 'notes']);
  const observations = normalizeText(intake?.observations) ?? normalizeText(aluno.intakeForm?.observations);
  const hasCadastroEssentials = Boolean(displayName && displayEmail && aluno.age);
  const parqPositiveCount = aluno.parq?.latestSubmission?.positiveCount ?? 0;
  const hasHealthAlert = parqPositiveCount > 0;
  const hasPrntGoal = Boolean(displayMainGoal);
  const hasPrntIntake = Boolean(displayIntakeDate);
  const hasTechnicalDetails = Boolean(trainingBackground || medicalHistory || currentMedications || injuriesHistory || allergies || observations);
  const prntCompletedItems = [hasPrntIntake, hasPrntGoal, hasTechnicalDetails].filter(Boolean).length;
  const prntStatus = !hasPrntIntake && !hasPrntGoal && !hasTechnicalDetails
    ? 'pendente'
    : prntCompletedItems >= 3
      ? 'completo'
      : 'parcial';
  const prntStatusLabel = prntStatus === 'pendente' ? 'PRNT pendente' : prntStatus === 'completo' ? 'PRNT completo' : 'PRNT parcial';
  const centralEditPath = `/central-do-aluno/${aluno.id}/edit`;
  const prontuarioPath = `/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento?alunoId=${aluno.id}`;
  const anthropometryPath = `/protocolo-avaliacao-fisica/antropometria?alunoId=${aluno.id}`;
  const assessmentsPath = `/central-do-aluno/${aluno.id}?tab=avaliacoes-fisicas`;
  const prntTechnicalItems: PrntTechnicalItem[] = [
    {
      label: 'Objetivo ativo',
      value: displayMainGoal || 'Registre o objetivo principal para orientar avaliação, prescrição e acompanhamento.',
      tone: hasPrntGoal ? 'ok' : 'pending',
      empty: !hasPrntGoal,
    },
    {
      label: 'Histórico de atividade física',
      value: trainingBackground || 'Sem histórico de atividade física informado no prontuário.',
      tone: trainingBackground ? 'ok' : 'pending',
      empty: !trainingBackground,
    },
    {
      label: 'Medicações',
      value: currentMedications || 'Nenhuma medicação registrada nas fontes carregadas.',
      tone: currentMedications ? 'attention' : 'neutral',
      empty: !currentMedications,
    },
    {
      label: 'Restrições, dores ou lesões',
      value: injuriesHistory || 'Nenhuma restrição, dor ou lesão registrada nas fontes carregadas.',
      tone: injuriesHistory ? 'attention' : 'neutral',
      empty: !injuriesHistory,
    },
    {
      label: 'Histórico médico',
      value: medicalHistory || 'Sem histórico médico adicional informado.',
      tone: medicalHistory ? 'attention' : 'neutral',
      empty: !medicalHistory,
    },
    {
      label: 'Observações técnicas',
      value: observations || allergies || 'Sem observações técnicas categorizadas nas fontes carregadas.',
      tone: observations || allergies ? 'ok' : 'pending',
      empty: !observations && !allergies,
    },
  ];
  const todayStatusTitle = todaySessions.length
    ? 'Treino planejado para hoje'
    : activePlan
      ? 'Sem sessão planejada para hoje'
      : 'Sem treino liberado hoje';
  const todayStatusDescription = todaySessions.length
    ? 'Use as orientações abaixo para acompanhar a execução operacional do aluno.'
    : activePlan
      ? 'Existe plano ativo, mas nenhuma sessão do plano cai na data de hoje.'
      : 'Nenhum plano ativo foi encontrado para a data de hoje.';
  const prntEvidenceParts = [
    hasPrntIntake ? `Anamnese em ${formatDateBR(displayIntakeDate as string)}` : 'Anamnese pendente',
    hasPrntGoal ? `Objetivo: ${displayMainGoal}` : 'Objetivo pendente',
    hasHealthAlert ? `${parqPositiveCount} alerta(s) no PAR-Q/AHA` : 'Sem alerta crítico no PAR-Q/AHA carregado',
  ];
  const assessmentEvidence = latestAssessment
    ? `${latestAssessment.typeName} • ${formatDateBR(latestAssessment.assessmentDate)} • ${latestAssessment.responsibleName}`
    : 'Aguardando primeira avaliação profissional.';
  const summaryCards: SummaryStatusCardProps[] = [
    {
      title: 'Cadastro do aluno',
      status: hasCadastroEssentials ? 'Dados mínimos disponíveis' : 'Cadastro incompleto',
      evidence: `${aluno.age || 'Idade não informada'} anos • ${displayEmail || 'email pendente'}${displayPhone ? ` • ${displayPhone}` : ''}`,
      nextAction: hasCadastroEssentials
        ? `Revisar cadastro se houver mudança desde ${formatDateBR(displayUpdatedAt)}.`
        : 'Completar dados básicos antes de evoluir para análises e prescrições.',
      tone: hasCadastroEssentials ? 'ok' : 'pending',
      actionLabel: 'Editar dados da Central',
      actionTo: centralEditPath,
    },
    {
      title: 'PRNT técnico',
      status: prntStatusLabel,
      evidence: prntEvidenceParts.join(' • '),
      nextAction: hasHealthAlert
        ? 'Revisar alertas técnicos antes de prescrever ou intensificar treino.'
        : hasPrntIntake && hasPrntGoal
          ? 'Validar se objetivo, anamnese e restrições continuam atuais.'
          : 'Completar anamnese e objetivo principal para orientar condutas.',
      tone: hasHealthAlert ? 'attention' : hasPrntIntake && hasPrntGoal ? 'ok' : 'pending',
      actionLabel: hasPrntIntake ? 'Atualizar PRNT' : 'Iniciar PRNT',
      actionTo: prontuarioPath,
    },
    {
      title: 'Dores e restrições',
      status: hasHealthAlert || injuriesHistory ? 'Há pontos técnicos para revisar' : 'Sem alerta crítico carregado',
      evidence: hasHealthAlert
        ? `${parqPositiveCount} resposta(s) positiva(s) exigem revisão antes da próxima conduta.`
        : injuriesHistory || 'Nenhuma restrição crítica foi identificada nas fontes carregadas.',
      nextAction: hasHealthAlert || injuriesHistory
        ? 'Abrir Prontuário e confirmar conduta segura.'
        : 'Manter acompanhamento e atualizar se houver dor, lesão ou medicação.',
      tone: hasHealthAlert || injuriesHistory ? 'attention' : 'ok',
      actionLabel: 'Revisar PRNT',
      actionTo: prontuarioPath,
    },
    {
      title: 'Avaliações',
      status: assessmentStatusLabel,
      evidence: assessmentEvidence,
      nextAction: nextAssessmentDate
        ? `Próxima prevista em ${formatDateBR(nextAssessmentDate)}.`
        : latestAssessment
          ? 'Definir ou revisar a próxima reavaliação.'
          : 'Registrar avaliação inicial para criar linha de base.',
      tone: assessmentTone,
      actionLabel: latestAssessment ? 'Ver histórico de avaliações' : 'Iniciar antropometria',
      actionTo: latestAssessment ? assessmentsPath : anthropometryPath,
    },
    {
      title: 'Treinamento',
      status: activePlan?.name || 'Nenhum plano ativo',
      evidence: activePlan ? `${formatDateBR(activePlan.startDate)} até ${formatDateBR(activePlan.endDate)}` : 'Não há plano ativo para a data de hoje.',
      nextAction: activePlan ? 'Acompanhar execução e feedback do ciclo atual.' : 'Criar ou ativar plano de treino no contexto deste aluno.',
      tone: activePlan ? 'ok' : 'pending',
      actionLabel: activePlan ? 'Abrir plano ativo' : 'Criar plano de treino',
      actionTo: activePlan ? `/plans/${activePlan.id}` : `/plans/new?alunoId=${aluno.id}`,
    },
    {
      title: 'Contrato e serviço',
      status: contractForDisplay?.contract.title || 'Sem contrato ativo',
      evidence: contractForDisplay
        ? `${studentContractStatusLabel[contractForDisplay.status] || contractForDisplay.status} • Serviço: ${displayServiceName || 'Não informado'}`
        : `Serviço: ${displayServiceName || 'Não informado'}`,
      nextAction: contractForDisplay ? 'Conferir vigência e condições na aba Financeiro.' : 'Verificar contrato, serviço e condições comerciais permitidas.',
      tone: contractForDisplay?.status === 'active' ? 'ok' : contractForDisplay ? 'attention' : 'pending',
      actionLabel: 'Gerenciar contratos',
      actionTo: `/alunos/${aluno.id}/contracts`,
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Aluno selecionado</CardTitle>
          <CardDescription>
            Resumo operacional para navegar entre treino de hoje, prontuário, avaliação, prescrição futura e histórico sem perder o contexto do aluno.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Treino de hoje</p>
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
                      {mesocycleFocus && <p className="mt-2 text-xs text-muted-foreground">Objetivo do mesociclo: {mesocycleFocus}</p>}
                      {session.instructions && <p className="mt-2 text-sm text-foreground">{session.instructions}</p>}
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                    Quando a montagem consolidada existir, este bloco deve exibir somente treinos liberados e validados pelo professor.
                  </div>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próximas sessões</p>
              <div className="mt-3 space-y-3">
                {upcomingSessions.length > 0 ? (
                  upcomingSessions.map(({ session, plan, date }) => (
                    <div key={`${session.id}-${date.toISOString()}`} className="flex gap-3 rounded-lg border border-border bg-muted/20 p-3">
                      <div className="min-w-20 text-xs font-medium text-muted-foreground">
                        {dayLabels[date.getDay()]}<br />{formatDateBR(date.toISOString())}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{formatSessionTitle(session)}</p>
                        <p className="text-xs text-muted-foreground">{plan.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatSessionTarget(session)}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma sessão futura encontrada nos planos carregados deste aluno.</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>PRNT e histórico técnico</CardTitle>
              <CardDescription>
                Resumo vivo do prontuário dentro da Central do Aluno, com objetivo, dados sensíveis, origem, atualização e próxima ação sem sair da ficha.
              </CardDescription>
            </div>
            <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${summaryToneBadgeClass[hasHealthAlert ? 'attention' : prntStatus === 'pendente' ? 'pending' : 'ok']}`}>
              {prntStatusLabel}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Data-base do PRNT</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{formatNullableDate(displayIntakeDate)}</div>
              <p className="mt-1 text-xs text-muted-foreground">Referência usada para interpretar objetivo, anamnese e restrições.</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Última atualização</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{formatNullableDate(displayIntakeUpdatedAt)}</div>
              <p className="mt-1 text-xs text-muted-foreground">Use esta data para decidir se o prontuário precisa ser confirmado.</p>
            </div>
            <div className={`rounded-lg border p-4 ${hasHealthAlert ? summaryToneClass.attention : summaryToneClass.neutral}`}>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Alertas técnicos</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{parqPositiveCount} ponto(s)</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {hasHealthAlert ? 'Revise respostas positivas antes de prescrever ou intensificar treino.' : 'Sem alertas críticos carregados no PAR-Q/AHA.'}
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {prntTechnicalItems.map((item) => <PrntTechnicalItemCard key={item.label} {...item} />)}
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-foreground">Próxima ação no contexto do aluno</p>
                <p className="mt-1 text-muted-foreground">
                  {hasHealthAlert
                    ? 'Abra o PRNT para revisar alertas, dores, medicações e conduta antes de avançar para treino ou avaliação.'
                    : prntStatus === 'completo'
                      ? 'Confirme se objetivo e dados técnicos continuam atuais antes da próxima decisão.'
                      : 'Complete o PRNT para reduzir navegação entre telas e sustentar a decisão técnica.'}
                </p>
              </div>
              <Link to={prontuarioPath} className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                {prntStatus === 'pendente' ? 'Iniciar PRNT' : 'Abrir PRNT'}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <CardTitle>Avaliações e evolução física</CardTitle>
              <CardDescription>
                Histórico avaliativo do aluno dentro da Central, com última coleta, próxima reavaliação, responsável e ponto de entrada para antropometria guiada.
              </CardDescription>
            </div>
            <span className={`w-fit rounded-full border px-3 py-1 text-xs font-medium ${summaryToneBadgeClass[assessmentTone]}`}>
              {assessmentStatusLabel}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className={`rounded-lg border p-4 ${assessmentTone === 'ok' ? summaryToneClass.ok : summaryToneClass.pending}`}>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Última avaliação</div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {latestAssessment ? formatDateBR(latestAssessment.assessmentDate) : 'Não registrada'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {latestAssessment ? `${latestAssessment.typeName} • ${latestAssessment.responsibleName}` : 'Registre a primeira avaliação para criar uma linha de base.'}
              </p>
            </div>
            <div className={`rounded-lg border p-4 ${isAssessmentOverdue ? summaryToneClass.attention : summaryToneClass.neutral}`}>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Próxima reavaliação</div>
              <div className="mt-1 text-sm font-semibold text-foreground">{formatNullableDate(nextAssessmentDate)}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                {isAssessmentOverdue
                  ? 'A data planejada já passou; revisar prioridade da reavaliação.'
                  : nextAssessmentDate
                    ? 'Data carregada a partir do resumo/plano de avaliações.'
                    : 'Sem regra objetiva de vencimento definida para este aluno.'}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comparação evolutiva</div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {canCompareAssessments ? 'Base pronta para comparar' : 'Comparação pendente'}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {canCompareAssessments
                  ? `${assessmentTotal} avaliações encontradas para comparação futura.`
                  : 'São necessárias pelo menos duas avaliações para comparar evolução.'}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Histórico recente de avaliações</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Lista enxuta para consulta rápida por data, tipo, responsável, origem e status sem sair da Central.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link to={anthropometryPath}>
                  <Button size="sm">Nova antropometria</Button>
                </Link>
                <Link to={assessmentsPath}>
                  <Button variant="outline" size="sm">Ver histórico completo</Button>
                </Link>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {hasAssessmentHistory ? (
                assessmentHistoryItems.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateBR(item.performedAt)} • {item.typeName} • {item.responsibleName}
                        </p>
                      </div>
                      <span className="w-fit rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">Origem: {item.origin}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Nenhuma avaliação física carregada para este aluno. Use a ação de nova antropometria para iniciar o histórico evolutivo.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Visão geral do aluno</CardTitle>
          <CardDescription>
            Leitura rápida com situação atual, evidência carregada e próxima ação recomendada para cada domínio da Central.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => <SummaryStatusCard key={card.title} {...card} />)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
