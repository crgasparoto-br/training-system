import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { isDateWithinRange, formatDateBR } from '../../utils/date';
import type { Aluno, StudentContractLink } from '../../services/aluno.service';
import type { TrainingPlan } from '../../services/plan.service';
import type { Assessment, AssessmentSummary } from '../../services/assessment.service';

type AlunoResumoHubTabProps = {
  aluno: Aluno;
  assessments: Assessment[];
  assessmentSummary: AssessmentSummary[];
  plans: TrainingPlan[];
  activeStudentContract?: StudentContractLink | null;
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
}: AlunoResumoHubTabProps) {
  const now = new Date();
  const activePlan = plans.find((plan) => isDateWithinRange(now, plan.startDate, plan.endDate));
  const latestAssessment = assessments[0];
  const upcomingAssessment = [...assessmentSummary]
    .filter((item) => item.nextDueDate)
    .map((item) => ({ ...item, nextDate: safeDate(item.nextDueDate) }))
    .filter((item) => item.nextDate)
    .sort((a, b) => (a.nextDate as Date).getTime() - (b.nextDate as Date).getTime())[0];

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
              <div className="mt-2 text-sm font-semibold text-gray-900">{aluno.user.profile.name}</div>
              <div className="text-xs text-muted-foreground">{aluno.age} anos • {aluno.user.email}</div>
              <div className="mt-3 text-xs text-muted-foreground">
                Última atualização do cadastro: {formatDateBR(aluno.updatedAt)}
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
                {activeStudentContract?.contract.title || 'Sem contrato ativo'}
              </div>
              <div className="text-xs text-muted-foreground">
                {activeStudentContract
                  ? studentContractStatusLabel[activeStudentContract.status] || activeStudentContract.status
                  : 'Verifique a aba Financeiro'}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Serviço: {activeStudentContract?.service?.name || aluno.service?.name || 'Não informado'}
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
                {aluno.intakeForm?.assessmentDate ? formatDateBR(aluno.intakeForm.assessmentDate) : 'Sem intake inicial'}
              </div>
              <div className="text-xs text-muted-foreground">
                Objetivo declarado: {aluno.intakeForm?.mainGoal || 'Não informado'}
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-gray-300 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integrações e apps</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">Base preparada para dados externos</div>
              <div className="text-xs text-muted-foreground">
                Esta área passa a separar futuras sincronizações, como Strava, do cadastro e das avaliações.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
