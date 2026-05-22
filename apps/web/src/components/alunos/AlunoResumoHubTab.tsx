import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { isDateWithinRange, formatDateBR } from '../../utils/date';
import type {
  Aluno,
  StudentContractLink,
  StudentSegmentedSummary,
} from '../../services/aluno.service';
import type { TrainingPlan } from '../../services/plan.service';
import type { Assessment, AssessmentSummary } from '../../services/assessment.service';

type AlunoResumoHubTabProps = {
  aluno: Aluno;
  assessments: Assessment[];
  assessmentSummary: AssessmentSummary[];
  plans: TrainingPlan[];
  activeStudentContract?: StudentContractLink | null;
  segmentedSummary?: StudentSegmentedSummary | null;
};

const safeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const studentContractStatusLabel: Record<string, string> = {
  draft: 'Rascunho',
  pending_signature: 'Pendente de assinatura',
  active: 'Ativo',
  expired: 'Expirado',
  canceled: 'Cancelado',
  terminated: 'Encerrado',
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
  const activePlan = plans.find((plan) => isDateWithinRange(now, plan.startDate, plan.endDate));
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Visão geral do aluno</CardTitle>
          <CardDescription>
            Leitura rápida separando o que veio do cadastro, o que foi registrado por professores e o que está operando no acompanhamento.
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
                Última atualização do cadastro: {formatDateBR(displayUpdatedAt)}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avaliações profissionais</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {latestAssessment ? formatDateBR(latestAssessment.assessmentDate) : 'Nenhuma avaliação registrada'}
              </div>
              <div className="text-xs text-muted-foreground">
                {latestAssessment?.type?.name || 'Aguardando primeira avaliação'}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Próxima prevista: {upcomingAssessment?.nextDueDate ? formatDateBR(upcomingAssessment.nextDueDate) : 'Sem previsão'}
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
                Serviço: {displayServiceName || 'Não informado'}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Treino em andamento</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {activePlan?.name || 'Nenhum plano ativo'}
              </div>
              <div className="text-xs text-muted-foreground">
                {activePlan
                  ? `${formatDateBR(activePlan.startDate)} até ${formatDateBR(activePlan.endDate)}`
                  : 'Cadastre ou ative um plano de treino'}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saúde inicial</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {displayIntakeDate ? formatDateBR(displayIntakeDate) : 'Sem intake inicial'}
              </div>
              <div className="text-xs text-muted-foreground">
                Objetivo declarado: {displayMainGoal || 'Não informado'}
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-gray-300 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integrações e apps</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {segmentedSummary?.integrations.totalAccounts
                  ? `${segmentedSummary.integrations.totalAccounts} conta(s) conectada(s)`
                  : 'Base preparada para dados externos'}
              </div>
              <div className="text-xs text-muted-foreground">
                {segmentedSummary?.integrations.lastSyncAt
                  ? `Última sincronização em ${formatDateBR(segmentedSummary.integrations.lastSyncAt)}.`
                  : 'Esta área passa a separar futuras sincronizações, como Strava, do cadastro e das avaliações.'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
