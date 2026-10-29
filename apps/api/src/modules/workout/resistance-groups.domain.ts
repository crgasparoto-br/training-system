import { Prisma, type PrismaClient } from '@prisma/client';
import { ResistanceStructureNotFoundError, ResistanceStructureValidationError } from './resistance-structure.domain.js';
import { assertDayContract, withWorkoutDayPlanningMutation } from './workout-planning.helpers.js';

/** Explicit execution arrangements, never inferred from free-text exercise.system. */
export const RESISTANCE_GROUP_KINDS = [
  'superserie', 'bi_set', 'tri_set', 'circuito', 'bloco_tecnico', 'mobilidade', 'finalizacao',
] as const;
export type ResistanceGroupKind = (typeof RESISTANCE_GROUP_KINDS)[number];
export type ResistanceGroupSection = 'mobilidade' | 'sessao' | 'resfriamento';

export interface ResistanceGroupMemberInput {
  position: number;
  section: ResistanceGroupSection;
  exerciseOrder: number;
}
export interface ResistanceGroupInput {
  position: number;
  kind: ResistanceGroupKind;
  rounds: number | null;
  restBetweenExercisesSec: number | null;
  restBetweenRoundsSec: number | null;
  notes: string | null;
  members: ResistanceGroupMemberInput[];
}

const GROUP_FIELDS = new Set(['position', 'kind', 'rounds', 'restBetweenExercisesSec', 'restBetweenRoundsSec', 'notes', 'members']);
const MEMBER_FIELDS = new Set(['position', 'section', 'exerciseOrder']);
const SECTIONS = new Set<ResistanceGroupSection>(['mobilidade', 'sessao', 'resfriamento']);
const memberLimits: Record<ResistanceGroupKind, readonly [number, number]> = {
  superserie: [2, 4],
  bi_set: [2, 2],
  tri_set: [3, 3],
  circuito: [2, 20],
  bloco_tecnico: [1, 20],
  mobilidade: [1, 20],
  finalizacao: [1, 20],
};
function record(value: unknown, allowed: Set<string>, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ResistanceStructureValidationError(`${context} inválido ou com campos não permitidos.`);
  }
  return value as Record<string, unknown>;
}
function optionalInt(value: unknown, name: string, min: number, max: number): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ResistanceStructureValidationError(`${name} deve estar entre ${min} e ${max}.`);
  }
  return value;
}
function position(value: unknown, expected: number, context: string) {
  if (value !== expected) {
    throw new ResistanceStructureValidationError(`${context}: ordem deve ser contínua a partir de 1.`);
  }
}

/** Normalize and validate the complete snapshot before any database mutation. */
export function normalizeResistanceGroups(value: unknown): ResistanceGroupInput[] {
  if (!Array.isArray(value) || value.length > 30) {
    throw new ResistanceStructureValidationError('A lista de agrupamentos deve conter no máximo 30 itens.');
  }
  const assigned = new Set<string>();
  return value.map((raw, groupIndex) => {
    const item = record(raw, GROUP_FIELDS, 'Agrupamento');
    position(item.position, groupIndex + 1, 'Agrupamentos');
    if (typeof item.kind !== 'string'
      || !RESISTANCE_GROUP_KINDS.includes(item.kind as ResistanceGroupKind)) {
      throw new ResistanceStructureValidationError('Selecione um tipo de agrupamento válido.');
    }
    const kind = item.kind as ResistanceGroupKind;
    if (!Array.isArray(item.members)) {
      throw new ResistanceStructureValidationError('Informe os exercícios participantes do agrupamento.');
    }
    const [min, max] = memberLimits[kind];
    if (item.members.length < min || item.members.length > max) {
      throw new ResistanceStructureValidationError(`O agrupamento ${kind} requer entre ${min} e ${max} exercícios.`);
    }
    const members = item.members.map((rawMember, index) => {
      const member = record(rawMember, MEMBER_FIELDS, 'Participante');
      position(member.position, index + 1, 'Participantes');
      if (!SECTIONS.has(member.section as ResistanceGroupSection)
        || !Number.isInteger(member.exerciseOrder) || (member.exerciseOrder as number) < 1
        || (member.exerciseOrder as number) > 200) {
        throw new ResistanceStructureValidationError('O participante deve apontar para um exercício e seção válidos.');
      }
      const key = `${member.section}:${member.exerciseOrder}`;
      if (assigned.has(key)) {
        throw new ResistanceStructureValidationError('Um exercício só pode pertencer a um agrupamento por dia.');
      }
      assigned.add(key);
      return {
        position: index + 1,
        section: member.section as ResistanceGroupSection,
        exerciseOrder: member.exerciseOrder as number,
      };
    });
    if (item.notes !== undefined && item.notes !== null
      && (typeof item.notes !== 'string' || item.notes.length > 500)) {
      throw new ResistanceStructureValidationError('Observações do agrupamento devem ter até 500 caracteres.');
    }
    return {
      position: groupIndex + 1,
      kind,
      rounds: optionalInt(item.rounds, 'Rodadas', 1, 100),
      restBetweenExercisesSec: optionalInt(item.restBetweenExercisesSec, 'Intervalo entre exercícios', 0, 86400),
      restBetweenRoundsSec: optionalInt(item.restBetweenRoundsSec, 'Intervalo entre rodadas', 0, 86400),
      notes: (item.notes ?? null) as string | null,
      members,
    };
  });
}

/** A group belongs to the operational day, and each member resolves to a canonical exercise row. */
export const resistanceGroupInclude = {
  orderBy: { position: 'asc' as const },
  include: {
    members: {
      orderBy: { position: 'asc' as const },
      include: { workoutExercise: { select: { id: true, section: true, exerciseOrder: true } } },
    },
  },
};

type GroupRecord = Prisma.WorkoutResistanceGroupGetPayload<{
  include: { members: { include: { workoutExercise: { select: { id: true; section: true; exerciseOrder: true } } } } };
}>;

function persistedShape(groups: GroupRecord[]): ResistanceGroupInput[] {
  return groups.map((group) => ({
    position: group.position,
    kind: group.kind as ResistanceGroupKind,
    rounds: group.rounds,
    restBetweenExercisesSec: group.restBetweenExercisesSec,
    restBetweenRoundsSec: group.restBetweenRoundsSec,
    notes: group.notes,
    members: group.members.map((member) => ({
      position: member.position,
      section: member.workoutExercise.section as ResistanceGroupSection,
      exerciseOrder: member.workoutExercise.exerciseOrder,
    })),
  }));
}

export async function replaceResistanceGroupsInTransaction(
  tx: Prisma.TransactionClient,
  workoutDayId: string,
  input: unknown,
) {
  const groups = normalizeResistanceGroups(input);
  const exercises = await tx.workoutExercise.findMany({
    where: { workoutDayId },
    select: { id: true, section: true, exerciseOrder: true },
  });
  const slots = new Map(exercises.map((exercise) => [`${exercise.section}:${exercise.exerciseOrder}`, exercise.id]));
  for (const group of groups) {
    for (const member of group.members) {
      if (!slots.has(`${member.section}:${member.exerciseOrder}`)) {
        throw new ResistanceStructureValidationError('Um participante não pertence a este dia ou foi reordenado.');
      }
    }
  }

  const prior = await tx.workoutResistanceGroup.findMany({
    where: { workoutDayId }, ...resistanceGroupInclude,
  });
  // Identical replay never changes group IDs (used by future round/item execution).
  if (JSON.stringify(persistedShape(prior)) === JSON.stringify(groups)) return prior;

  await tx.workoutResistanceGroup.deleteMany({ where: { workoutDayId } });
  for (const group of groups) {
    await tx.workoutResistanceGroup.create({
      data: {
        workoutDay: { connect: { id: workoutDayId } },
        position: group.position,
        kind: group.kind,
        rounds: group.rounds,
        restBetweenExercisesSec: group.restBetweenExercisesSec,
        restBetweenRoundsSec: group.restBetweenRoundsSec,
        notes: group.notes,
        members: {
          create: group.members.map((member) => ({
            position: member.position,
            workoutExercise: { connect: { id: slots.get(`${member.section}:${member.exerciseOrder}`)! } },
          })),
        },
      },
    });
  }
  return tx.workoutResistanceGroup.findMany({ where: { workoutDayId }, ...resistanceGroupInclude });
}

export async function replaceDayResistanceGroups(
  prisma: PrismaClient,
  workoutDayId: string,
  groups: unknown,
  contractId: string,
) {
  if (!contractId?.trim()) throw new ResistanceStructureNotFoundError();
  normalizeResistanceGroups(groups);
  const owned = await prisma.workoutDay.findFirst({
    where: { id: workoutDayId, template: { plan: { aluno: { contractId } } } },
    select: { id: true },
  });
  if (!owned) throw new ResistanceStructureNotFoundError();
  return withWorkoutDayPlanningMutation(prisma, workoutDayId, async (tx) => {
    await assertDayContract(tx, workoutDayId, contractId);
    return replaceResistanceGroupsInTransaction(tx, workoutDayId, groups);
  });
}

export async function copyResistanceGroups(
  tx: Prisma.TransactionClient,
  targetDayId: string,
  sourceGroups: ReadonlyArray<{
    position: number; kind: string; rounds: number | null; restBetweenExercisesSec: number | null;
    restBetweenRoundsSec: number | null; notes: string | null;
    members: ReadonlyArray<{ position: number; workoutExerciseId: string }>;
  }>,
  exerciseIds: ReadonlyMap<string, string>,
) {
  for (const group of sourceGroups) {
    const members = group.members.map((member) => {
      const id = exerciseIds.get(member.workoutExerciseId);
      if (!id) throw new ResistanceStructureValidationError('Cópia de agrupamento com exercício ausente.');
      return { position: member.position, workoutExercise: { connect: { id } } };
    });
    await tx.workoutResistanceGroup.create({
      data: {
        workoutDay: { connect: { id: targetDayId } },
        position: group.position,
        kind: group.kind,
        rounds: group.rounds,
        restBetweenExercisesSec: group.restBetweenExercisesSec,
        restBetweenRoundsSec: group.restBetweenRoundsSec,
        notes: group.notes,
        members: { create: members },
      },
    });
  }
}
