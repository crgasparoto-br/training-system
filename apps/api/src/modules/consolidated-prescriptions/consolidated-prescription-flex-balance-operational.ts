import type { CapacityPrescriptionParameters } from '@corrida/types';

type FlexibilityParameters = Extract<
  CapacityPrescriptionParameters,
  { type: 'flexibility' }
>['flexibility'];

type BalanceParameters = Extract<
  CapacityPrescriptionParameters,
  { type: 'balance' }
>['balance'];

export const FLEX_BALANCE_OPERATIONAL_CONTRACT_VERSION = 1 as const;

export type WorkoutDayCapacityOperationalBlock = {
  contractVersion: typeof FLEX_BALANCE_OPERATIONAL_CONTRACT_VERSION;
  capacity: 'flexibility' | 'balance';
  capacityPrescriptionVersionId: string;
  parameters: Record<string, unknown>;
};

const PRIORITY_LABELS = {
  low: 'baixa',
  medium: 'média',
  high: 'alta',
} as const;

function text(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function isFlexibilityOperationallyRepresentable(parameters: FlexibilityParameters) {
  const articulations = parameters.articulations ?? [];
  if (!articulations.length) return false;
  return articulations.every(
    (articulation) => Boolean(text(articulation.name) && text(articulation.suggestedPrescription))
  );
}

export function isBalanceOperationallyRepresentable(parameters: BalanceParameters) {
  const focus = text(parameters.focus);
  const supports = parameters.supports ?? [];
  if (supports.some((value) => !text(value))) return false;
  return Boolean(focus && (supports.length > 0 || text(parameters.progressionNotes)));
}

export function buildFlexibilityWorkoutDayOperationalBlock(
  capacityPrescriptionVersionId: string,
  parameters: FlexibilityParameters
): WorkoutDayCapacityOperationalBlock | null {
  if (!isFlexibilityOperationallyRepresentable(parameters)) return null;
  return {
    contractVersion: FLEX_BALANCE_OPERATIONAL_CONTRACT_VERSION,
    capacity: 'flexibility',
    capacityPrescriptionVersionId,
    parameters: parameters as unknown as Record<string, unknown>,
  };
}

export function buildBalanceWorkoutDayOperationalBlock(
  capacityPrescriptionVersionId: string,
  parameters: BalanceParameters
): WorkoutDayCapacityOperationalBlock | null {
  if (!isBalanceOperationallyRepresentable(parameters)) return null;
  return {
    contractVersion: FLEX_BALANCE_OPERATIONAL_CONTRACT_VERSION,
    capacity: 'balance',
    capacityPrescriptionVersionId,
    parameters: parameters as unknown as Record<string, unknown>,
  };
}

export function formatFlexibilityWorkoutDayNote(parameters: FlexibilityParameters) {
  if (!isFlexibilityOperationallyRepresentable(parameters)) return null;

  const rendered: string[] = [];
  for (const articulation of parameters.articulations ?? []) {
    const name = text(articulation.name)!;
    const prescription = text(articulation.suggestedPrescription)!;
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
  if (!isBalanceOperationallyRepresentable(parameters)) return null;

  const focus = text(parameters.focus)!;
  const normalizedSupports = (parameters.supports ?? [])
    .map((value) => text(value))
    .filter(Boolean) as string[];
  const progression = text(parameters.progressionNotes);

  const parts = [`Foco: ${focus}.`];
  if (normalizedSupports.length) parts.push(`Apoios: ${normalizedSupports.join(', ')}.`);
  if (progression) parts.push(`Progressão: ${progression}.`);
  if (typeof parameters.expectedPse === 'number') {
    parts.push(`PSE esperada: ${parameters.expectedPse}.`);
  }
  return `Equilíbrio — ${parts.join(' ')}`;
}
