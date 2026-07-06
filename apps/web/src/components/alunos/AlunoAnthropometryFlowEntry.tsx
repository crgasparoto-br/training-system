import { Link } from 'react-router-dom';
import type { Aluno } from '../../services/aluno.service';
import type { Assessment } from '../../services/assessment.service';
import { formatDateBR } from '../../utils/date';

type AlunoAnthropometryFlowEntryProps = {
  aluno: Aluno;
  assessments: Assessment[];
  actionPath?: string;
};

const normalizeText = (value?: string | null) => {
  const normalizedValue = value?.trim();
  return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
};

const isAnthropometryAssessment = (assessment: Assessment) => {
  const typeName = normalizeText(assessment.type?.name)?.toLowerCase() ?? '';
  return typeName.includes('antropometria') || typeName.includes('antropometrica') || typeName.includes('antropométrica');
};

export function AlunoAnthropometryFlowEntry({
  aluno,
  assessments,
  actionPath = `/central-do-aluno/${aluno.id}/avaliacoes/nova-antropometria`,
}: AlunoAnthropometryFlowEntryProps) {
  const latestAnthropometry = assessments.find(isAnthropometryAssessment);
  const hasAnthropometry = Boolean(latestAnthropometry);
  const latestDate = latestAnthropometry?.assessmentDate;
  const responsibleName = normalizeText(latestAnthropometry?.professional?.user?.profile?.name);
  const studentName = normalizeText(aluno.user?.profile?.name) ?? 'Aluno selecionado';

  const steps = [
    {
      title: 'Contexto do aluno',
      description: `Manter ${studentName}, contrato e professor responsável pré-selecionados durante todo o fluxo.`,
    },
    {
      title: 'Medidas guiadas',
      description: 'Coletar peso, estatura, circunferências, dobras e observações por etapa, com validação antes de avançar.',
    },
    {
      title: 'Revisão e comparação',
      description: hasAnthropometry
        ? 'Comparar com a última antropometria antes de salvar o novo registro.'
        : 'Criar a primeira linha de base para comparações futuras.',
    },
  ];

  return (
    <div className="rounded-lg border border-primary/20 bg-background p-4 text-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nova antropometria</div>
          <div className="mt-2 text-base font-semibold text-foreground">
            {hasAnthropometry ? 'Fluxo guiado com histórico' : 'Fluxo guiado inicial'}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasAnthropometry
              ? `Última antropometria em ${formatDateBR(latestDate as string)}${responsibleName ? ` por ${responsibleName}` : ''}.`
              : 'Nenhuma antropometria anterior foi encontrada para este aluno.'}
          </p>
        </div>
        <Link
          to={actionPath}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {hasAnthropometry ? 'Registrar nova antropometria' : 'Iniciar antropometria'}
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.title} className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Etapa {index + 1}</div>
            <div className="mt-1 text-sm font-semibold text-foreground">{step.title}</div>
            <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
