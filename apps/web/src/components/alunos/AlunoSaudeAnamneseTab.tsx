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
  const prontuarioHref = `/protocolo-avaliacao-fisica/prontuario-entrevista-acompanhamento?alunoId=${aluno.id}`;

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
            <div className="font-medium text-primary">Acompanhamento evolutivo agora fica no PRNT</div>
            <p className="mt-1 text-muted-foreground">
              Use o PRNT para registrar condutas, acompanhamentos, dores, desconfortos e observações profissionais posteriores ao cadastro inicial.
            </p>
            <div className="mt-3 flex justify-end">
              <Link
                to={prontuarioHref}
                className="inline-flex items-center rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
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
