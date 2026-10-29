import { normalizeCyclicStages } from './cyclic-stages.domain.js';
import { normalizeResistanceGroups, parseResistanceGroupBaseUpdatedAt } from './resistance-groups.domain.js';

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
export class WorkoutPlanningVersionConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'WORKOUT_PLANNING_VERSION_CONFLICT';

  constructor() {
    super('O treino foi alterado em outra sessão. Recarregue os dados antes de salvar novamente.');
  }
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
  if (code === 'WORKOUT_PLANNING_VERSION_CONFLICT') {
    return { status: 409, body: { code, error: 'O treino foi alterado em outra sessão. Recarregue os dados antes de salvar novamente.' } };
  }
  return { status: 500, body: { code: 'WORKOUT_SAVE_FAILED', error: 'Não foi possível salvar os exercícios.' } };
}

/** AUD-399-14: never forward untrusted Prisma relation writes from legacy DTOs. */
type WorkoutInputKind = 'template' | 'day' | 'exercise';
type FieldType = 'text' | 'number' | 'boolean' | 'date' | 'blocks';
const FIELDS: Record<WorkoutInputKind, Record<string, FieldType>> = {
  template: {
    planId:'text', mesocycleNumber:'number', weekNumber:'number', weekStartDate:'date',
    cyclicFrequency:'number', totalVolumeMin:'number', totalVolumeKm:'number',
    resistanceFrequency:'number', loadPercentage:'number', repZone:'number', repReserve:'number',
    trainingMethod:'text', trainingDivision:'text', alunoGoal:'text', coachGoal:'text',
    observation1:'text', observation2:'text',
  },
  day: {
    templateId:'text', dayOfWeek:'number', workoutDate:'date', sessionDurationMin:'number',
    stimulusDurationMin:'number', cyclicTimeMin:'number', resistanceTimeMin:'number',
    paceMin:'number', paceMax:'number', location:'text', method:'text', intensity1:'number',
    intensity2:'number', numSessions:'number', numSets:'number', sessionTime:'number',
    restTime:'number', vo2maxIntervalPct:'number', iextIintTime:'number', vo2maxPct:'number',
    targetHrMin:'text', targetHrMax:'text', targetSpeedMin:'text', targetSpeedMax:'text',
    detailNotes:'text', complementNotes:'text', generalGuidelines:'text',
  },
  exercise: {
    workoutExerciseId:'text', workoutDayId:'text', exerciseId:'text', section:'text',
    exerciseOrder:'number', system:'text', groupBreakBefore:'boolean', sets:'number',
    reps:'number', intervalSec:'number', cParam:'number', eParam:'number', load:'number',
    exerciseNotes:'text', resistanceBlocks:'blocks',
  },
};
const ID_FIELDS = new Set(['planId','templateId','workoutDayId','workoutExerciseId','exerciseId','section']);
const REQUIRED_FIELDS: Record<WorkoutInputKind, ReadonlySet<string>> = {
  template: new Set(['planId', 'mesocycleNumber', 'weekNumber', 'weekStartDate']),
  day: new Set(['templateId', 'dayOfWeek', 'workoutDate']),
  exercise: new Set(['workoutDayId', 'exerciseId', 'section', 'exerciseOrder']),
};
const BLOCK_FIELDS = new Set(['position','kind','notes','plannedSets']);
const SET_FIELDS = new Set(['position','repsMin','repsMax','loadKg','loadPercent','rir','rpe','tempo','restSec','notes']);
const ISO_DATE_TIME_PREFIX = /^(\d{4})-(\d{2})-(\d{2})T/;
function isValidWorkoutDate(value: unknown): boolean {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== 'string') return false;
  const match = value.match(ISO_DATE_TIME_PREFIX);
  if (!match || Number.isNaN(Date.parse(value))) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1];
}
export function assertAllowedKeys(value: unknown, fields: ReadonlySet<string>): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !fields.has(key))) {
    throw new ResistanceStructureValidationError('Estrutura de treino inválida ou campo não permitido.');
  }
}

const SAVE_WEEK_FIELDS = new Set(['baseUpdatedAt', 'template', 'workoutDays', 'resistedExercises', 'cyclicStages', 'resistanceGroups']);
const SAVE_WEEK_DAY_FIELDS = new Set(Object.keys(FIELDS.day).filter((key) => key !== 'templateId'));
const SAVE_WEEK_EXERCISE_FIELDS = new Set(Object.keys(FIELDS.exercise));
const RESISTED_SECTION_FIELDS = new Set(['mobilidade', 'sessao', 'resfriamento']);

/** Validate the complete weekly command before nested values are consumed. */
export function validateWorkoutWeekEnvelope(value: unknown): asserts value is {
  baseUpdatedAt?: string;
  template?: Record<string, unknown>;
  workoutDays?: Array<Record<string, unknown>>;
  resistedExercises?: Record<string, Record<string, Array<Record<string, unknown>>>>;
  cyclicStages?: Record<string, unknown[]>;
  resistanceGroups?: Record<string, unknown[]>;
} {
  assertAllowedKeys(value, SAVE_WEEK_FIELDS);
  const envelope = value as Record<string, unknown>;
  if (envelope.baseUpdatedAt !== undefined && typeof envelope.baseUpdatedAt !== 'string') {
    throw new ResistanceStructureValidationError('Versão base do treino inválida.');
  }
  if (envelope.template !== undefined) sanitizeWorkoutMutation(envelope.template, 'template');

  if (envelope.workoutDays !== undefined) {
    if (!Array.isArray(envelope.workoutDays)) {
      throw new ResistanceStructureValidationError('Dias do snapshot inválidos.');
    }
    for (const day of envelope.workoutDays) {
      assertAllowedKeys(day, SAVE_WEEK_DAY_FIELDS);
      sanitizeWorkoutMutation(day, 'day');
    }
  }

  if (envelope.resistedExercises !== undefined) {
    const resisted = envelope.resistedExercises;
    if (!resisted || typeof resisted !== 'object' || Array.isArray(resisted)) {
      throw new ResistanceStructureValidationError('Estrutura resistida semanal inválida.');
    }
    for (const [dayKey, sections] of Object.entries(resisted as Record<string, unknown>)) {
      const dayOfWeek = Number(dayKey);
      if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
        throw new ResistanceStructureValidationError('Dia resistido inválido.');
      }
      assertAllowedKeys(sections, RESISTED_SECTION_FIELDS);
      for (const exercises of Object.values(sections as Record<string, unknown>)) {
        if (!Array.isArray(exercises)) {
          throw new ResistanceStructureValidationError('Exercícios resistidos inválidos.');
        }
        for (const exercise of exercises) {
          assertAllowedKeys(exercise, SAVE_WEEK_EXERCISE_FIELDS);
          sanitizeWorkoutMutation(exercise, 'exercise');
        }
      }
    }
  }
  if (envelope.resistanceGroups !== undefined) {
    parseResistanceGroupBaseUpdatedAt(envelope.baseUpdatedAt);
    if (!envelope.resistanceGroups || typeof envelope.resistanceGroups !== 'object'
      || Array.isArray(envelope.resistanceGroups)) {
      throw new ResistanceStructureValidationError('Agrupamentos resistidos semanais inválidos.');
    }
    for (const [dayKey, groups] of Object.entries(envelope.resistanceGroups as Record<string, unknown>)) {
      if (!/^[1-7]$/.test(dayKey)) throw new ResistanceStructureValidationError('Dia de agrupamento inválido.');
      normalizeResistanceGroups(groups);
    }
  }
  if (envelope.cyclicStages !== undefined) {
    if (!envelope.cyclicStages || typeof envelope.cyclicStages !== 'object'
      || Array.isArray(envelope.cyclicStages)) {
      throw new ResistanceStructureValidationError('Etapas cíclicas semanais inválidas.');
    }
    for (const [dayKey, stages] of Object.entries(envelope.cyclicStages as Record<string, unknown>)) {
      const weekday = Number(dayKey);
      if (!/^[1-7]$/.test(dayKey) || !Number.isInteger(weekday)) {
        throw new ResistanceStructureValidationError('Dia cíclico inválido.');
      }
      normalizeCyclicStages(stages);
    }
  }
}

export function validateTemplateCopyEnvelope(value: unknown, sections = false): asserts value is Record<string, unknown> {
  const fields = sections
    ? new Set(['targetWeekNumber', 'targetWeekStartDate', 'mode'])
    : new Set(['targetWeekNumber', 'targetWeekStartDate']);
  assertAllowedKeys(value, fields);
  if (!sections) return;
  const body = value as Record<string, unknown>;
  if (!Number.isInteger(body.targetWeekNumber) || (body.targetWeekNumber as number) <= 0
    || typeof body.targetWeekStartDate !== 'string') {
    throw new ResistanceStructureValidationError('Dados de cópia inválidos.');
  }
  if (sections && body.mode !== 'cyclic' && body.mode !== 'resistance') {
    throw new ResistanceStructureValidationError('Dados de cópia inválidos.');
  }
}

export function validateReorderEnvelope(value: unknown): asserts value is Record<string, unknown> {
  assertAllowedKeys(value, new Set(['workoutDayId', 'section', 'exerciseIds']));
  const body = value as Record<string, unknown>;
  if (typeof body.workoutDayId !== 'string' || !body.workoutDayId.trim()
    || typeof body.section !== 'string' || !body.section.trim()
    || !Array.isArray(body.exerciseIds)
    || body.exerciseIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new ResistanceStructureValidationError('Dados de ordenação inválidos.');
  }
}

function safeBlocks(value: unknown): ResistanceBlockInput[] {
  if (!Array.isArray(value)) throw new ResistanceStructureValidationError('Blocos inválidos.');
  for (const block of value) {
    assertAllowedKeys(block, BLOCK_FIELDS);
    if (!Array.isArray(block.plannedSets)) throw new ResistanceStructureValidationError('Séries inválidas.');
    for (const set of block.plannedSets) assertAllowedKeys(set, SET_FIELDS);
  }
  return normalizeResistanceBlocks(value);
}
/** Validates and copies only explicit scalar metadata and prescribed block/set values. */
export function sanitizeWorkoutMutation<T>(value: T, kind: WorkoutInputKind, mode: 'create'|'update' = 'update'): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ResistanceStructureValidationError('Dados de treino inválidos.');
  }
  const clean: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    const type = FIELDS[kind][key];
    if (!type || (mode === 'update' && ((kind === 'template' && key === 'planId')
      || (kind === 'day' && key === 'templateId')))) {
      throw new ResistanceStructureValidationError('Campo de treino não permitido.');
    }
    if (fieldValue === undefined) continue;
    if (fieldValue === null) {
      if (type === 'blocks' || type === 'date' || type === 'boolean'
        || ID_FIELDS.has(key) || REQUIRED_FIELDS[kind].has(key)) {
        throw new ResistanceStructureValidationError('Campo de treino inválido.');
      }
      clean[key] = null;
      continue;
    }
    if (type === 'blocks') {
      clean[key] = safeBlocks(fieldValue);
      continue;
    }
    if (type === 'number') {
      if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
        throw new ResistanceStructureValidationError('Número de treino inválido.');
      }
      if (['dayOfWeek','exerciseOrder','mesocycleNumber','weekNumber'].includes(key)
        && (!Number.isInteger(fieldValue) || fieldValue < 1
          || (key === 'dayOfWeek' && fieldValue > 7))) {
        throw new ResistanceStructureValidationError('Ordem de treino inválida.');
      }
    } else if (type === 'text') {
      if (typeof fieldValue !== 'string' || (ID_FIELDS.has(key) && !fieldValue.trim())) {
        throw new ResistanceStructureValidationError('Texto de treino inválido.');
      }
    } else if (type === 'boolean') {
      if (typeof fieldValue !== 'boolean') throw new ResistanceStructureValidationError('Booleano inválido.');
    } else if (type === 'date') {
      if (!isValidWorkoutDate(fieldValue)) {
        throw new ResistanceStructureValidationError('Data de treino inválida.');
      }
    }
    clean[key] = fieldValue;
  }
  return clean as T;
}
