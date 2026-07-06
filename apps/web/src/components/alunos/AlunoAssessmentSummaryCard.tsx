import { Link } from 'react-router-dom';
import { formatDateBR } from '../../utils/date';
import type { Assessment, AssessmentSummary } from '../../services/assessment.service';
import type { Aluno, StudentSegmentedSummary } from '../../services/aluno.service';

type AlunoAssessmentSummaryCardProps = {
  aluno: Aluno;
  assessments: Assessment[];
  assessmentSummary: AssessmentSummary[];
  segmentedSummary?: StudentSegmentedSummary | null;
  actionPath?: string;
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

const formatNullableDate = (value?: string | null) => (value ? formatDateBR(value) : 'Não informada');

export function AlunoAssessmentSummaryCard({
  aluno,
  assessments,
  assessmentSummary,
  segmentedSummary,
  actionPath = `/central-do-aluno/${aluno.id}/avaliacoes`,
}: AlunoAssessmentSummaryCardProps) {
  const latestFromSummary = segmentedSummary?.assessments.latest;
  const latestAssessment = latestFromSummary
    ? {
        title: normalizeText(latestFromSummary.title) ?? 'Avaliação registrada',
        performedAt: latestFromSummary.performedAt,
        responsibleName: normalizeText(latestFromSummary.responsibleName),
      }
    : assessments[0]
      ? {
          title: normalizeText(assessments[0].type?.name) ?? 'Avaliação registrada',
          performedAt: assessments[0].assessmentDate,
          responsibleName: normalizeText(assessments[0].professional?.user?.profile?.name),
        }
      : null;

  const nextAssessment = [...assessmentSummary]
    .filter((item) => item.nextDueDate)
    .map((item) => ({ ...item, nextDate: safeDate(item.nextDueDate) }))
    .filter((item) => item.nextDate)
    .sort((left, right) => (left.nextDate as Date).getTime() - (right.nextDate as Date).getTime())[0];

  const hasAssessment = Boolean(latestAssessment);
  const hasNextDueDate = Boolean(nextAssessment?.nextDueDate);
  const statusLabel = hasAssessment ? 'Avaliação registrada' : 'Avaliação pendente';
  const evidence = hasAssessment
    ? `${latestAssessment?.title} em ${formatNullableDate(latestAssessment?.performedAt)}${latestAssessment?.responsibleName ? ` • ${latestAssessment.responsibleName}` : ''}`
    : 'Nenhuma avaliação física foi encontrada para este aluno.';
  const nextAction = hasAssessment
    ? hasNextDueDate
      ? `Próxima reavaliação prevista para ${formatNullableDate(nextAssessment?.nextDueDate)}.`
      : 'Definir próxima reavaliação para manter histórico evolutivo consistente.'
    : 'Iniciar avaliação física para criar a primeira linha de base do aluno.';
  const actionLabel = hasAssessment ? 'Abrir histórico de avaliações' : 'Iniciar avaliação';

  return (
    <div className={`rounded-lg border p-4 text-sm ${hasAssessment ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avaliações</div>
          <div className="mt-2 text-base font-semibold text-foreground">{statusLabel}</div>
          <p className="mt-1 text-sm text-muted-foreground">{evidence}</p>
        </div>
        <Link
          to={actionPath}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {actionLabel}
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-background/80 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Última avaliação</div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {hasAssessment ? formatNullableDate(latestAssessment?.performedAt) : 'Não encontrada'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasAssessment ? latestAssessment?.title : 'Sem linha de base registrada.'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background/80 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Próxima reavaliação</div>
          <div className="mt-1 text-sm font-semibold text-foreground">
            {hasNextDueDate ? formatNullableDate(nextAssessment?.nextDueDate) : 'Sem previsão'}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{nextAction}</p>
        </div>
        <div className="rounded-lg border border-border bg-background/80 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Histórico</div>
          <div className="mt-1 text-sm font-semibold text-foreground">{assessments.length} registro(s)</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Consulte por data e tipo antes de registrar nova medição.
          </p>
        </div>
      </div>
    </div>
  );
}
