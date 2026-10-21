export const RESISTANCE_BLOCK_KINDS = [
  'aquecimento', 'principal', 'tecnica', 'complementar', 'finalizacao',
] as const;
export type ResistanceBlockKind = (typeof RESISTANCE_BLOCK_KINDS)[number];
export interface ResistancePlannedSetInput {
  position: number;
  repsMin?: number | null;
  repsMax?: number | null;
  loadKg?: number | null;
  loadPercent?: number | null;
  rir?: number | null;
  rpe?: number | null;
  tempo?: string | null;
  restSec?: number | null;
  notes?: string | null;
}
export interface ResistanceBlockInput {
  position: number;
  kind: ResistanceBlockKind;
  notes?: string | null;
  plannedSets: ResistancePlannedSetInput[];
}
export class ResistanceStructureNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'RESISTANCE_DAY_NOT_FOUND';

  constructor() {
    super('Treino não encontrado.');
  }
}

export class ResistanceStructureValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'INVALID_RESISTANCE_STRUCTURE';
}
const numberField = (item: Record<string, unknown>, key: string, path: string, max: number, integer = false) => {
  const value = item[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) {
    throw new ResistanceStructureValidationError(`${path}.${key} inválido.`);
  }
  return value;
};
const textField = (value: unknown, path: string, maxLength: number) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new ResistanceStructureValidationError(`${path} inválido.`);
  }
  return value;
};
/** Ausência da estrutura mantém treino legado; [] remove blocos estruturados explicitamente. */
export function normalizeResistanceBlocks(value: unknown): ResistanceBlockInput[] {
  if (!Array.isArray(value) || value.length > 12) {
    throw new ResistanceStructureValidationError('Informe uma lista de até 12 blocos.');
  }
  return value.map((rawBlock, i) => {
    const path = `blocos[${i}]`;
    if (!rawBlock || typeof rawBlock !== 'object' || Array.isArray(rawBlock)) {
      throw new ResistanceStructureValidationError(`${path} inválido.`);
    }
    const b = rawBlock as Record<string, unknown>;
    if (b.position !== i + 1 || !RESISTANCE_BLOCK_KINDS.includes(b.kind as ResistanceBlockKind)) {
      throw new ResistanceStructureValidationError(`${path}: tipo ou ordem inválidos.`);
    }
    if (!Array.isArray(b.plannedSets) || !b.plannedSets.length || b.plannedSets.length > 30) {
      throw new ResistanceStructureValidationError(`${path}: informe de 1 a 30 séries.`);
    }
    return {
      position: i + 1, kind: b.kind as ResistanceBlockKind, notes: textField(b.notes, `${path}.notes`, 1000),
      plannedSets: b.plannedSets.map((rawSet, j) => {
        const setPath = `${path}.series[${j}]`;
        if (!rawSet || typeof rawSet !== 'object' || Array.isArray(rawSet)) {
          throw new ResistanceStructureValidationError(`${setPath} inválida.`);
        }
        const s = rawSet as Record<string, unknown>;
        if (s.position !== j + 1) throw new ResistanceStructureValidationError(`${setPath}: ordem inválida.`);
        const repsMin = numberField(s, 'repsMin', setPath, 999, true);
        const repsMax = numberField(s, 'repsMax', setPath, 999, true);
        if (repsMin !== null && repsMax !== null && repsMin > repsMax) {
          throw new ResistanceStructureValidationError(`${setPath}: faixa de repetições invertida.`);
        }
        return {
          position: j + 1, repsMin, repsMax,
          loadKg: numberField(s, 'loadKg', setPath, 99999),
          loadPercent: numberField(s, 'loadPercent', setPath, 999),
          rir: numberField(s, 'rir', setPath, 10),
          rpe: numberField(s, 'rpe', setPath, 10),
          tempo: textField(s.tempo, `${setPath}.tempo`, 64),
          restSec: numberField(s, 'restSec', setPath, 86400, true),
          notes: textField(s.notes, `${setPath}.notes`, 1000),
        };
      }),
    };
  });
}


/**
 * Resolve stable workout row identities before any mutation. Explicit ids take
 * precedence; unsaved legacy clients may match an existing exercise by its
 * library id and section without taking a row reserved by another input.
 */
export function matchResistanceExerciseRows(
  existing: ReadonlyArray<{ id: string; exerciseId: string; section: string }>,
  requested: ReadonlyArray<{ workoutExerciseId?: string; exerciseId: string; section: string }>,
): Array<string | null> {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const reserved = new Set<string>();
  for (const input of requested) {
    if (input.workoutExerciseId === undefined) continue;
    const row = byId.get(input.workoutExerciseId);
    if (!row || row.exerciseId !== input.exerciseId || reserved.has(row.id)) {
      throw new ResistanceStructureValidationError('Identidade de exercício inválida ou duplicada.');
    }
    reserved.add(row.id);
  }
  const assigned = new Set<string>();
  return requested.map((input) => {
    if (input.workoutExerciseId !== undefined) {
      assigned.add(input.workoutExerciseId);
      return input.workoutExerciseId;
    }
    const compatible = existing.find((row) =>
      row.exerciseId === input.exerciseId
      && row.section === input.section
      && !reserved.has(row.id)
      && !assigned.has(row.id));
    if (!compatible) return null;
    assigned.add(compatible.id);
    return compatible.id;
  });
}

/**
 * A persisted template/day belongs to its canonical parent. Updating an
 * existing row must never silently re-home it to another plan or template
 * (and potentially another contract), even if the caller can edit the source.
 * Reject explicit identity fields rather than ignoring an unsafe request.
 */
export function assertWorkoutParentIsImmutable(
  data: unknown,
  parentField: 'planId' | 'templateId',
): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ResistanceStructureValidationError('Dados de treino inválidos.');
  }
  const relationField = parentField === 'planId' ? 'plan' : 'template';
  if (Object.prototype.hasOwnProperty.call(data, parentField)
    || Object.prototype.hasOwnProperty.call(data, relationField)) {
    throw new ResistanceStructureValidationError('Não é permitido transferir um treino para outro plano ou semana.');
  }
}

/** Prevent raw Prisma/SQL error details from crossing the public API boundary. */
export function classifyResistanceWriteError(error: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  const code = error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : undefined;
  if (code === 'INVALID_RESISTANCE_STRUCTURE') {
    return { status: 400, body: { code, error: 'Revise os blocos e as séries informados.' } };
  }
  if (code === 'RESISTANCE_DAY_NOT_FOUND') {
    return { status: 404, body: { code, error: 'Treino não encontrado.' } };
  }
  if (code === 'WORKOUT_PLANNING_LOCKED_AFTER_EXECUTION_START') {
    return { status: 409, body: { code, error: 'Este treino possui histórico ou já foi liberado e não pode ser alterado.' } };
  }
  return { status: 500, body: { code: 'WORKOUT_SAVE_FAILED', error: 'Não foi possível salvar os exercícios.' } };
}
