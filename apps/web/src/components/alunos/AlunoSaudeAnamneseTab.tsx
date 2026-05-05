import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { formatDateBR } from '../../utils/date';
import type { Aluno } from '../../services/aluno.service';

type AlunoSaudeAnamneseTabProps = {
  aluno: Aluno;
  parqPositiveCount: number;
};

const parqQuestionLabels: Record<string, string> = {
  q1: 'PAR-Q 1',
  q2: 'PAR-Q 2',
  q3: 'PAR-Q 3',
  q4: 'PAR-Q 4',
  q5: 'PAR-Q 5',
  q6: 'PAR-Q 6',
  q7: 'PAR-Q 7',
  q8: 'PAR-Q 8',
};

export function AlunoSaudeAnamneseTab({ aluno, parqPositiveCount }: AlunoSaudeAnamneseTabProps) {
  const parqResponses = aluno.intakeForm?.parqResponses || {};

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Saúde e Anamnese</CardTitle>
          <CardDescription>Dados clínicos e operacionais do intake inicial do aluno.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Data da avaliação inicial</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {aluno.intakeForm?.assessmentDate ? formatDateBR(aluno.intakeForm.assessmentDate) : 'Não informada'}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Respostas positivas no PAR-Q</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">{parqPositiveCount}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4">
              <div className="text-xs text-muted-foreground">Pressão arterial</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                {aluno.systolicPressure && aluno.diastolicPressure
                  ? `${aluno.systolicPressure}/${aluno.diastolicPressure} mmHg`
                  : 'Não informada'}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-gray-200 p-4 text-sm">
              <div className="text-xs text-muted-foreground">Objetivo principal</div>
              <div className="mt-1 text-gray-900">{aluno.intakeForm?.mainGoal || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-sm">
              <div className="text-xs text-muted-foreground">Histórico de treino</div>
              <div className="mt-1 text-gray-900">{aluno.intakeForm?.trainingBackground || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-sm">
              <div className="text-xs text-muted-foreground">Histórico médico</div>
              <div className="mt-1 text-gray-900">{aluno.intakeForm?.medicalHistory || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-sm">
              <div className="text-xs text-muted-foreground">Medicamentos em uso</div>
              <div className="mt-1 text-gray-900">{aluno.intakeForm?.currentMedications || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-sm md:col-span-2">
              <div className="text-xs text-muted-foreground">Lesões e restrições</div>
              <div className="mt-1 text-gray-900">{aluno.intakeForm?.injuriesHistory || 'Não informado'}</div>
            </div>
            <div className="rounded-lg border border-gray-200 p-4 text-sm md:col-span-2">
              <div className="text-xs text-muted-foreground">Observações</div>
              <div className="mt-1 text-gray-900">{aluno.intakeForm?.observations || 'Não informado'}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>PAR-Q</CardTitle>
          <CardDescription>Registro das respostas do questionário de prontidão para atividade física.</CardDescription>
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

      {aluno.macronutrients && (
        <Card>
          <CardHeader>
            <CardTitle>Distribuição de Macronutrientes</CardTitle>
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
                <p className="text-sm text-muted-foreground">Calorias Diárias</p>
                <p className="text-2xl font-bold">{aluno.macronutrients.dailyCalories} kcal</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
