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
