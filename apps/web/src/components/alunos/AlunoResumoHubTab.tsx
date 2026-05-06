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
          <CardTitle>Hub do Aluno</CardTitle>
          <CardDescription>Separação entre cadastro, saúde, finanças e governança das revisões.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Dados principais</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{aluno.user.profile.name}</div>
              <div className="text-xs text-muted-foreground">{aluno.age} anos • {aluno.user.email}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Último status cadastral</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                Atualizado em {formatDateBR(aluno.updatedAt)}
              </div>
              <div className="text-xs text-muted-foreground">
                {aluno.user.isActive === false ? 'Cadastro inativo' : 'Cadastro ativo'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Última avaliação</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {latestAssessment ? formatDateBR(latestAssessment.assessmentDate) : 'Não registrada'}
              </div>
              <div className="text-xs text-muted-foreground">
                {latestAssessment?.type?.name || 'Sem tipo registrado'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Próximas avaliações</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {upcomingAssessment?.nextDueDate
                  ? formatDateBR(upcomingAssessment.nextDueDate)
                  : 'Sem próxima data'}
              </div>
              <div className="text-xs text-muted-foreground">
                {upcomingAssessment?.typeName || 'Planejamento pendente'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Plano ativo</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {activePlan?.name || 'Nenhum plano ativo'}
              </div>
              <div className="text-xs text-muted-foreground">
                {activePlan
                  ? `${formatDateBR(activePlan.startDate)} até ${formatDateBR(activePlan.endDate)}`
                  : 'Cadastre ou ative um plano de treino'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Contrato ativo</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {activeStudentContract?.contract.title || 'Sem contrato ativo'}
              </div>
              <div className="text-xs text-muted-foreground">
                {activeStudentContract
                  ? studentContractStatusLabel[activeStudentContract.status] || activeStudentContract.status
                  : 'Vincule um contrato na aba Financeiro / Contrato'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
