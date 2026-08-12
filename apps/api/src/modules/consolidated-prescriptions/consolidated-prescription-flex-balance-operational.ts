import type { CapacityPrescriptionParameters } from '@corrida/types';

type FlexibilityParameters = Extract<
  CapacityPrescriptionParameters,
  { type: 'flexibility' }
>['flexibility'];

type BalanceParameters = Extract<
  CapacityPrescriptionParameters,
  { type: 'balance' }
>['balance'];

const PRIORITY_LABELS = {
  low: 'baixa',
  medium: 'média',
  high: 'alta',
} as const;

function text(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function formatFlexibilityWorkoutDayNote(parameters: FlexibilityParameters) {
  const articulations = parameters.articulations ?? [];
  if (!articulations.length) return null;

  const rendered: string[] = [];
  for (const articulation of articulations) {
    const name = text(articulation.name);
    const prescription = text(articulation.suggestedPrescription);
    if (!name || !prescription) return null;

    const details = [`prescrição: ${prescription}`];
    if (typeof articulation.angle === 'number') details.push(`ângulo: ${articulation.angle}°`);
    const deficit = text(articulation.deficit);
    if (deficit) details.push(`déficit: ${deficit}`);
    if (articulation.priority) {
      details.push(`prioridade: ${PRIORITY_LABELS[articulation.priority]}`);
    }
    rendered.push(`${name} (${details.join(', ')})`);
  }

  const pse =
    typeof parameters.expectedPse === 'number'
      ? ` PSE esperada: ${parameters.expectedPse}.`
      : '';
  return `Flexibilidade — ${rendered.join('; ')}.${pse}`;
}

export function formatBalanceWorkoutDayNote(parameters: BalanceParameters) {
  const focus = text(parameters.focus);
  const supports = (parameters.supports ?? []).map((value) => text(value));
  if (supports.some((value) => !value)) return null;
  const normalizedSupports = supports.filter(Boolean) as string[];
  const progression = text(parameters.progressionNotes);

  if (!focus || (!normalizedSupports.length && !progression)) return null;

  const parts = [`Foco: ${focus}.`];
  if (normalizedSupports.length) parts.push(`Apoios: ${normalizedSupports.join(', ')}.`);
  if (progression) parts.push(`Progressão: ${progression}.`);
  if (typeof parameters.expectedPse === 'number') {
    parts.push(`PSE esperada: ${parameters.expectedPse}.`);
  }
  return `Equilíbrio — ${parts.join(' ')}`;
}
