import { ResistanceStructureValidationError } from './resistance-structure.domain.js';

export const CYCLIC_STAGE_KINDS = ['warmup', 'work', 'recovery', 'cooldown', 'repeat'] as const;
export const CYCLIC_TARGET_KINDS = ['pace_min_per_km', 'speed_kmh', 'heart_rate_bpm', 'zone', 'pse'] as const;
export type CyclicStageKind = typeof CYCLIC_STAGE_KINDS[number];
export type CyclicTargetKind = typeof CYCLIC_TARGET_KINDS[number];
export interface CyclicStageInput {
  position: number;
  kind: CyclicStageKind;
  durationUnit?: 'seconds' | 'meters';
  durationValue?: number;
  targetKind?: CyclicTargetKind;
  targetValue?: number;
  targetMin?: number;
  targetMax?: number;
  repeatCount?: number;
  inclinePercent?: number;
  cadenceSpm?: number;
  notes?: string;
  children?: CyclicStageInput[];
}
const ALLOWED = new Set([
  'position', 'kind', 'durationUnit', 'durationValue', 'targetKind',
  'targetValue', 'targetMin', 'targetMax', 'repeatCount',
  'inclinePercent', 'cadenceSpm', 'notes', 'children',
]);
const TARGET_LIMITS: Record<CyclicTargetKind, { min: number; max: number; integer?: boolean }> = {
  pace_min_per_km: { min: 0.01, max: 60 },
  speed_kmh: { min: 0.01, max: 100 },
  heart_rate_bpm: { min: 30, max: 250, integer: true },
  zone: { min: 1, max: 5, integer: true },
  pse: { min: 0, max: 10 },
};
function invalid(message: string): never {
  throw new ResistanceStructureValidationError(message);
}
function numeric(row: Record<string, unknown>, key: string, min: number, max: number, integer = false): number | undefined {
  const value = row[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max
    || (integer && !Number.isInteger(value))) return invalid(`Valor de ${key} inválido.`);
  return value;
}
function parseStage(value: unknown, position: number, withinRepeat: boolean): CyclicStageInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('Etapa cíclica inválida.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !ALLOWED.has(key))) return invalid('Campo não permitido na etapa cíclica.');
  if (row.position !== position || !CYCLIC_STAGE_KINDS.includes(row.kind as CyclicStageKind)
    || (withinRepeat && row.kind === 'repeat')) return invalid('Tipo ou ordem de etapa cíclica inválidos.');
  const kind = row.kind as CyclicStageKind;
  const notes = row.notes;
  if (notes !== undefined && notes !== null
    && (typeof notes !== 'string' || notes.length > 500)) return invalid('Orientação da etapa inválida.');
  const base = { position, kind, ...(typeof notes === 'string' ? { notes } : {}) };
  if (kind === 'repeat') {
    if (withinRepeat || (row.durationUnit !== undefined && row.durationUnit !== null)
      || (row.durationValue !== undefined && row.durationValue !== null)
      || (row.targetKind !== undefined && row.targetKind !== null)
      || (row.targetValue !== undefined && row.targetValue !== null)
      || (row.targetMin !== undefined && row.targetMin !== null)
      || (row.targetMax !== undefined && row.targetMax !== null)
      || (row.inclinePercent !== undefined && row.inclinePercent !== null)
      || (row.cadenceSpm !== undefined && row.cadenceSpm !== null)) {
      return invalid('Repetição deve conter somente quantidade e subetapas.');
    }
    const repeatCount = numeric(row, 'repeatCount', 2, 100, true);
    if (!repeatCount || !Array.isArray(row.children) || row.children.length < 2 || row.children.length > 20) {
      return invalid('Repetição exige de 2 a 100 voltas e de 2 a 20 subetapas.');
    }
    const children = row.children.map((item, i) => parseStage(item, i + 1, true));
    if (!children.some((item) => item.kind === 'work') || !children.some((item) => item.kind === 'recovery')) {
      return invalid('Repetição exige trabalho e recuperação explícitos.');
    }
    return { ...base, repeatCount, children };
  }
  if (row.repeatCount !== undefined && row.repeatCount !== null || row.children !== undefined && row.children !== null) {
    return invalid('Somente grupos de repetição aceitam subetapas.');
  }
  if (row.durationUnit !== 'seconds' && row.durationUnit !== 'meters') return invalid('Unidade de duração inválida.');
  const durationValue = numeric(row, 'durationValue', 0.001, row.durationUnit === 'seconds' ? 86400 : 1000000);
  if (durationValue === undefined) return invalid('Informe a duração da etapa.');
  const targetKind = row.targetKind;
  if (targetKind !== undefined && targetKind !== null
    && !CYCLIC_TARGET_KINDS.includes(targetKind as CyclicTargetKind)) return invalid('Tipo de alvo inválido.');
  const bound = targetKind ? TARGET_LIMITS[targetKind as CyclicTargetKind] : undefined;
  const targetValue = bound && numeric(row, 'targetValue', bound.min, bound.max, bound.integer);
  const targetMin = bound && numeric(row, 'targetMin', bound.min, bound.max, bound.integer);
  const targetMax = bound && numeric(row, 'targetMax', bound.min, bound.max, bound.integer);
  if (!bound && [row.targetValue, row.targetMin, row.targetMax].some((item) => item !== undefined && item !== null)) {
    return invalid('Informe o tipo de alvo antes do valor.');
  }
  if (bound && targetValue === undefined && targetMin === undefined && targetMax === undefined) {
    return invalid('Informe ao menos um valor de alvo.');
  }
  if (targetMin !== undefined && targetMax !== undefined && targetMin > targetMax) {
    return invalid('Faixa de alvo invertida.');
  }
  if (targetValue !== undefined && (targetMin !== undefined || targetMax !== undefined)) {
    return invalid('Escolha valor único ou faixa de alvo.');
  }
  const inclinePercent = numeric(row, 'inclinePercent', -30, 30);
  const cadenceSpm = numeric(row, 'cadenceSpm', 1, 300, true);
  return {
    ...base, durationUnit: row.durationUnit, durationValue,
    ...(bound ? { targetKind: targetKind as CyclicTargetKind } : {}),
    ...(targetValue !== undefined ? { targetValue } : {}),
    ...(targetMin !== undefined ? { targetMin } : {}),
    ...(targetMax !== undefined ? { targetMax } : {}),
    ...(inclinePercent !== undefined ? { inclinePercent } : {}),
    ...(cadenceSpm !== undefined ? { cadenceSpm } : {}),
  };
}
/** Undefined means legacy planning; [] deliberately clears an editable structured session. */
export function normalizeCyclicStages(input: unknown): CyclicStageInput[] {
  if (!Array.isArray(input) || input.length > 40) return invalid('Informe até 40 etapas cíclicas.');
  return input.map((item, i) => parseStage(item, i + 1, false));
}
export const cyclicStageInclude = {
  where: { parentStageId: null },
  orderBy: { position: 'asc' as const },
  include: { children: { orderBy: { position: 'asc' as const } } },
};
export function nestedCyclicStages(stages: CyclicStageInput[], workoutDayId: string) {
  return stages.map((s) => ({
    workoutDayId, position: s.position, kind: s.kind,
    durationUnit: s.durationUnit, durationValue: s.durationValue,
    targetKind: s.targetKind, targetValue: s.targetValue,
    targetMin: s.targetMin, targetMax: s.targetMax,
    repeatCount: s.repeatCount, inclinePercent: s.inclinePercent,
    cadenceSpm: s.cadenceSpm, notes: s.notes,
    ...(s.children ? { children: { create: nestedCyclicStages(s.children, workoutDayId) } } : {}),
  }));
}
function comparable(stage: CyclicStageInput): object {
  return {
    position: stage.position, kind: stage.kind,
    durationUnit: stage.durationUnit ?? null, durationValue: stage.durationValue ?? null,
    targetKind: stage.targetKind ?? null, targetValue: stage.targetValue ?? null,
    targetMin: stage.targetMin ?? null, targetMax: stage.targetMax ?? null,
    repeatCount: stage.repeatCount ?? null, inclinePercent: stage.inclinePercent ?? null,
    cadenceSpm: stage.cadenceSpm ?? null, notes: stage.notes ?? null,
    children: (stage.children ?? []).map(comparable),
  };
}
export async function replaceCyclicStagesInTransaction(
  tx: { workoutCyclicStage: {
    findMany: (args: any) => Promise<any[]>;
    deleteMany: (args: any) => Promise<any>;
    create: (args: any) => Promise<any>;
  } },
  workoutDayId: string, input: unknown,
) {
  const stages = normalizeCyclicStages(input);
  const current = await tx.workoutCyclicStage.findMany({
    where: { workoutDayId, parentStageId: null }, ...cyclicStageInclude,
  });
  const present = current.map((stage) => ({
    ...stage, children: stage.children ?? [],
  }));
  if (JSON.stringify(present.map(comparable)) === JSON.stringify(stages.map(comparable))) return current;
  await tx.workoutCyclicStage.deleteMany({ where: { workoutDayId } });
  for (const stage of nestedCyclicStages(stages, workoutDayId)) {
    await tx.workoutCyclicStage.create({ data: stage });
  }
  return tx.workoutCyclicStage.findMany({ where: { workoutDayId, parentStageId: null }, ...cyclicStageInclude });
}
