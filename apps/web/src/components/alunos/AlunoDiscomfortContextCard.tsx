import { Link } from 'react-router-dom';
import type { Aluno, StudentSegmentedIntake } from '../../services/aluno.service';

type AlunoDiscomfortContextCardProps = {
  aluno: Aluno;
  segmentedIntake?: StudentSegmentedIntake | null;
  prontuarioPath?: string;
};

const normalizeText = (value?: string | null) => {
  const normalizedValue = value?.trim();
  return normalizedValue && normalizedValue.length > 0 ? normalizedValue : null;
};

const readRecord = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return {} as Record<string, unknown>;
  }

  return value as Record<string, unknown>;
};

const getLegacyFormResponses = (aluno: Aluno) => readRecord(aluno.intakeForm?.formResponses);

export function AlunoDiscomfortContextCard({
  aluno,
  segmentedIntake,
  prontuarioPath = `/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento?alunoId=${aluno.id}`,
}: AlunoDiscomfortContextCardProps) {
  const rawFormResponses = segmentedIntake?.rawFormResponses ?? getLegacyFormResponses(aluno);
  const clinicalHistory = readRecord(segmentedIntake?.clinicalHistory);
  const injuries = readRecord(segmentedIntake?.injuries);
  const medications = readRecord(segmentedIntake?.medications);

  const injuriesHistory =
    normalizeText(injuries.injuriesHistory as string | undefined) ??
    normalizeText(rawFormResponses.injuriesHistory as string | undefined) ??
    normalizeText(aluno.intakeForm?.injuriesHistory);
  const medicalHistory =
    normalizeText(clinicalHistory.medicalHistory as string | undefined) ??
    normalizeText(rawFormResponses.medicalHistory as string | undefined) ??
    normalizeText(aluno.intakeForm?.medicalHistory);
  const currentMedications =
    normalizeText(medications.currentMedications as string | undefined) ??
    normalizeText(rawFormResponses.currentMedications as string | undefined) ??
    normalizeText(aluno.intakeForm?.currentMedications);
  const observations = normalizeText(segmentedIntake?.observations) ?? normalizeText(aluno.intakeForm?.observations);

  const activeItems = [
    injuriesHistory ? { label: 'Lesões/restrições', value: injuriesHistory } : null,
    medicalHistory ? { label: 'Histórico médico', value: medicalHistory } : null,
    currentMedications ? { label: 'Medicações', value: currentMedications } : null,
    observations ? { label: 'Observações', value: observations } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const hasActiveDiscomfort = activeItems.length > 0;
  const statusLabel = hasActiveDiscomfort ? 'Acompanhamento necessário' : 'Sem desconforto ativo';
  const evidence = hasActiveDiscomfort
    ? `${activeItems.length} ponto(s) precisam ser considerados antes de treino, avaliação ou prescrição.`
    : 'Nenhuma dor, desconforto, restrição, medicação ou observação crítica foi informada nas fontes carregadas.';
  const actionLabel = hasActiveDiscomfort ? 'Registrar acompanhamento' : 'Registrar desconforto';

  return (
    <div className={`rounded-lg border p-4 text-sm ${hasActiveDiscomfort ? 'border-red-200 bg-red-50/60' : 'border-border bg-muted/20'}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Desconfortos e restrições</div>
          <div className="mt-2 text-base font-semibold text-foreground">{statusLabel}</div>
          <p className="mt-1 text-sm text-muted-foreground">{evidence}</p>
        </div>
        <Link
          to={prontuarioPath}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {actionLabel}
        </Link>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {hasActiveDiscomfort ? (
          activeItems.map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-background/80 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</div>
              <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-border bg-background/80 p-3 md:col-span-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Próxima ação</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Manter acompanhamento e registrar qualquer novo desconforto sem sair da Central do Aluno.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
