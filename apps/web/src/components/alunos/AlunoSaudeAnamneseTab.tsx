import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { formatDateBR } from '../../utils/date';
import type { Aluno, StudentSegmentedIntake } from '../../services/aluno.service';

type AlunoSaudeAnamneseTabProps = {
  aluno: Aluno;
  parqPositiveCount: number;
  segmentedIntake?: StudentSegmentedIntake | null;
};

const parqQuestionLabels: Record<string, string> = {
  q1: 'PAR-Q 1',
  q2: 'PAR-Q 2',
  q3: 'PAR-Q 3',
  q4: 'PAR-Q 4',
  q5: 'PAR-Q 5',
  q6: 'PAR-Q 6',
  q7: 'PAR-Q 7',
  q8: 'Declaração final',
};

const sourceTypeLabels: Record<string, string> = {
  student: 'Aluno',
  professional: 'Profissional',
  integration: 'Integração',
  system: 'Sistema',
};

const countPositiveAhaAnswers = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return 0;
  }

  return Object.values(value as Record<string, unknown>).filter((answer) => answer === 'yes').length;
};

const getLegacyRawFormResponses = (aluno: Aluno) => {
  const responses = aluno.intakeForm?.formResponses;
  if (!responses || typeof responses !== 'object') {
    return {} as Record<string, unknown>;
  }

  return responses as Record<string, unknown>;
};

const hasText = (value?: string | null) => Boolean(value?.trim());

const formatNullableDate = (value?: string | null) => (value ? formatDateBR(value) : 'Não informada');

export function AlunoSaudeAnamneseTab({
  aluno,
  parqPositiveCount,
  segmentedIntake,
}: AlunoSaudeAnamneseTabProps) {
  const parqResponses =
    (segmentedIntake?.questionnaires.parq as Record<string, boolean | undefined> | undefined) ??
    aluno.intakeForm?.parqResponses ??
    {};
  const rawFormResponses = segmentedIntake?.rawFormResponses ?? getLegacyRawFormResponses(aluno);
  const ahaPositiveCount = countPositiveAhaAnswers(
    segmentedIntake?.questionnaires.american ?? (rawFormResponses as Record<string, unknown>).ahaResponses
  );
  const clinicalHistory =
    (segmentedIntake?.clinicalHistory as Record<string, unknown> | null | undefined) ?? null;
  const medications =
    (segmentedIntake?.medications as Record<string, unknown> | null | undefined) ?? null;
  const injuries =
    (segmentedIntake?.injuries as Record<string, unknown> | null | undefined) ?? null;
  const objective =
    (segmentedIntake?.rawFormResponses?.mainGoal as string | undefined) ??
    aluno.intakeForm?.mainGoal ??
    null;
  const trainingBackground =
    (clinicalHistory?.trainingBackground as string | undefined) ??
    aluno.intakeForm?.trainingBackground ??
    null;
  const medicalHistory =
    (clinicalHistory?.medicalHistory as string | undefined) ??
    aluno.intakeForm?.medicalHistory ??
    null;
  const currentMedications =
    (medications?.currentMedications as string | undefined) ??
    aluno.intakeForm?.currentMedications ??
    null;
  const injuriesHistory =
    (injuries?.injuriesHistory as string | undefined) ??
    aluno.intakeForm?.injuriesHistory ??
    null;
  const observations = segmentedIntake?.observations ?? aluno.intakeForm?.observations ?? null;
  const assessmentDate = segmentedIntake?.assessmentDate ?? aluno.intakeForm?.assessmentDate ?? null;
  const technicalSourceDate = assessmentDate ?? segmentedIntake?.createdAt ?? null;
  const sourceType = segmentedIntake?.source?.type;
  const sourceReference = segmentedIntake?.source?.reference ?? segmentedIntake?.legacyIntakeId ?? null;
  const technicalSourceLabel = sourceType ? sourceTypeLabels[sourceType] ?? 'Fonte técnica' : 'Cadastro inicial';
  const technicalAlertCount =
    parqPositiveCount +
    ahaPositiveCount +
    (hasText(currentMedications) ? 1 : 0) +
    (hasText(injuriesHistory) ? 1 : 0) +
    (hasText(medicalHistory) ? 1 : 0);
  const technicalSourceItems = [
    {
      label: 'Objetivo declarado',
      value: hasText(objective) ? 'Informado' : 'Pendente',
      description: objective || 'Registre o objetivo para orientar a prescrição futura.',
    },
    {
      label: 'Triagem PAR-Q/AHA',
      value: `${parqPositiveCount + ahaPositiveCount} alerta(s)`,
      description:
        parqPositiveCount + ahaPositiveCount > 0
          ? 'Respostas positivas devem ser revisadas antes de avançar para a prescrição.'
          : 'Sem respostas positivas registradas nos questionários disponíveis.',
    },
    {
      label: 'Histórico e restrições',
      value: technicalAlertCount > 0 ? 'Revisar' : 'Sem alerta ativo',
      description:
        technicalAlertCount > 0
          ? 'Histórico médico, medicações ou lesões possuem informação útil para o professor.'
          : 'Nenhum histórico sensível foi informado nesta entrada.',
    },
    {
      label: 'Dados-base versionados',
      value: formatNullableDate(technicalSourceDate),
      description: 'Esta data identifica a versão técnica usada como referência, sem sobrescrever avaliações antigas.',
    },
  ];
  const prontuarioPath = `/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento?alunoId=${aluno.id}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Anamnese inicial e questionários</CardTitle>
          <CardDescription>
            Esta aba reúne a anamnese inicial, PAR-Q e AHA da entrada do aluno, sem misturar avaliações profissionais de evolução.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-foreground">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">Acompanhamento profissional contínuo</p>
                <p className="mt-1 text-muted-foreground">
                  Use o PRNT para registrar evolução, dores, desconfortos corporais, condutas e snapshots posteriores à entrada do aluno.
                </p>
              </div>
              <Link
                to={prontuarioPath}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Abrir PRNT do aluno
              </Link>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Data da anamnese inicial</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {assessmentDate ? formatDateBR(assessmentDate) : 'Não informada'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Respostas positivas no PAR-Q</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{parqPositiveCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Respostas positivas no questionário AHA</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{ahaPositiveCount}</div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4 text-sm">
              <div className="text-xs text-muted-foreground">Objetivo principal declarado</div>
              <div className="mt-1 text-gray-900">{objective || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-sm">
              <div className="text-xs text-muted-foreground">Histórico de treino informado</div>
              <div className="mt-1 text-gray-900">{trainingBackground || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-sm">
              <div className="text-xs text-muted-foreground">Histórico médico</div>
              <div className="mt-1 text-gray-900">{medicalHistory || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-sm">
              <div className="text-xs text-muted-foreground">Medicações em uso</div>
              <div className="mt-1 text-gray-900">{currentMedications || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-sm md:col-span-2">
              <div className="text-xs text-muted-foreground">Lesões e restrições relatadas</div>
              <div className="mt-1 text-gray-900">{injuriesHistory || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-sm md:col-span-2">
              <div className="text-xs text-muted-foreground">Observações da anamnese</div>
              <div className="mt-1 text-gray-900">{observations || 'Não informado'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entrada técnica para prescrição futura</CardTitle>
          <CardDescription>
            Dados do prontuário e da anamnese ficam identificados por origem e data para apoiar a prescrição sem substituir histórico anterior.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Origem do dado-base</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{technicalSourceLabel}</div>
              {sourceReference && <div className="mt-1 text-xs text-muted-foreground">Referência: {sourceReference}</div>}
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Data-base técnica</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{formatNullableDate(technicalSourceDate)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Última atualização</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{formatNullableDate(segmentedIntake?.updatedAt)}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Pontos para revisar</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{technicalAlertCount}</div>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 text-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-gray-900">Seleção controlada antes da prescrição</p>
                <p className="mt-1 text-muted-foreground">
                  Estes dados estão prontos para revisão do professor. A prescrição futura deve selecionar o que será importado, mantendo origem, data, aluno, contrato e responsável.
                </p>
              </div>
              <Link
                to={prontuarioPath}
                className="inline-flex items-center justify-center rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10"
              >
                Revisar PRNT
              </Link>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {technicalSourceItems.map((item) => (
              <div key={item.label} className="rounded-lg border border-gray-200 p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-gray-900">{item.label}</div>
                    <p className="mt-1 text-muted-foreground">{item.description}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                    {item.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Questionário PAR-Q</CardTitle>
          <CardDescription>
            Registro das respostas de prontidão para atividade física preenchidas no cadastro inicial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Object.entries(parqQuestionLabels).map(([key, label]) => {
              const value = (parqResponses as Record<string, boolean | undefined>)[key];
              return (
                <div key={key} className="rounded-lg border border-gray-200 p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 text-sm font-semibold text-gray-900">{value ? 'Sim' : 'Não'}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Questionário American Heart Association</CardTitle>
          <CardDescription>
            Síntese do questionário AHA trazido na entrada do aluno para apoiar triagem e cuidado inicial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-900">
            {ahaPositiveCount > 0
              ? `${ahaPositiveCount} resposta(s) positiva(s) registradas no questionário AHA.`
              : 'Nenhuma resposta positiva registrada no questionário AHA.'}
          </div>
        </CardContent>
      </Card>

      {aluno.macronutrients && (
        <Card>
          <CardHeader>
            <CardTitle>Referência nutricional inicial</CardTitle>
            <CardDescription>
              Distribuição registrada na anamnese inicial quando houver informação nutricional declarada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-info/10 p-4 text-center">
                <p className="text-sm text-muted-foreground">Carboidratos</p>
                <p className="text-2xl font-bold text-info">{aluno.macronutrients.carbohydratesPercentage}%</p>
              </div>
              <div className="rounded-lg bg-success/10 p-4 text-center">
                <p className="text-sm text-muted-foreground">Proteínas</p>
                <p className="text-2xl font-bold text-success">{aluno.macronutrients.proteinsPercentage}%</p>
              </div>
              <div className="rounded-lg bg-warning/10 p-4 text-center">
                <p className="text-sm text-muted-foreground">Lipídios</p>
                <p className="text-2xl font-bold text-warning">{aluno.macronutrients.lipidsPercentage}%</p>
              </div>
            </div>
            {aluno.macronutrients.dailyCalories && (
              <div className="mt-4 text-center">
                <p className="text-sm text-muted-foreground">Calorias diárias</p>
                <p className="text-2xl font-bold">{aluno.macronutrients.dailyCalories} kcal</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
