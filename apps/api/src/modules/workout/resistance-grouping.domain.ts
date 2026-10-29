import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  ResistanceStructureValidationError,
  type ResistanceExerciseGroupType,
} from './resistance-structure.domain.js';
import { resistanceBlockInclude } from './workout-planning.helpers.js';

type GroupRow = {
  id: string;
  section: string;
  exerciseOrder: number;
  groupBreakBefore: boolean;
  groupId: string | null;
  groupType: ResistanceExerciseGroupType | null;
  groupPosition: number | null;
  groupRounds: number | null;
  resistanceBlocks: Array<{ plannedSets: Array<{ id: string }> }>;
};

export type ResistanceGroupDeclaration = ResistanceExerciseGroupType | null | undefined;

export type ResistanceGroupAssignment = {
  id: string;
  groupId: string | null;
  groupType: ResistanceExerciseGroupType | null;
  groupPosition: number | null;
  groupRounds: number | null;
};

const FIXED_GROUP_SIZE: Partial<Record<ResistanceExerciseGroupType, number>> = {
  superset: 2,
  biset: 2,
  triset: 3,
};

const setCount = (row: GroupRow) =>
  row.resistanceBlocks.reduce((total, block) => total + block.plannedSets.length, 0);

function assignChunk(rows: GroupRow[], type: ResistanceExerciseGroupType, result: Map<string, ResistanceGroupAssignment>) {
  const expected = FIXED_GROUP_SIZE[type];
  if (expected !== undefined && rows.length !== expected) {
    throw new ResistanceStructureValidationError(`Agrupamento ${type} exige ${expected} exercícios.`);
  }
  if (type === 'circuit' && rows.length < 2) {
    throw new ResistanceStructureValidationError('Circuito exige pelo menos dois exercícios.');
  }
  const rounds = setCount(rows[0]);
  if (rounds < 1 || rows.some((row) => setCount(row) !== rounds)) {
    throw new ResistanceStructureValidationError('Os exercícios agrupados devem possuir a mesma quantidade de séries estruturadas.');
  }
  const preservedId = rows[0].groupId
    && rows.every((row, index) => row.groupId === rows[0].groupId
      && row.groupType === type && row.groupPosition === index + 1 && row.groupRounds === rounds)
    ? rows[0].groupId : null;
  const groupId = preservedId ?? randomUUID();
  rows.forEach((row, index) => result.set(row.id, {
    id: row.id, groupId, groupType: type, groupPosition: index + 1, groupRounds: rounds,
  }));
}

export function deriveResistanceGroupAssignments(
  rows: GroupRow[],
  declarations: ReadonlyMap<string, ResistanceGroupDeclaration> = new Map(),
): ResistanceGroupAssignment[] {
  const sorted = [...rows].sort((a, b) =>
    a.section.localeCompare(b.section) || a.exerciseOrder - b.exerciseOrder || a.id.localeCompare(b.id));
  const result = new Map<string, ResistanceGroupAssignment>();
  const effectiveType = (row: GroupRow) =>
    declarations.has(row.id) ? declarations.get(row.id) ?? null : row.groupType;
  sorted.filter((row) => !effectiveType(row)).forEach((row) => result.set(row.id, {
    id: row.id, groupId: null, groupType: null, groupPosition: null, groupRounds: null,
  }));

  let index = 0;
  while (index < sorted.length) {
    const first = sorted[index];
    const type = effectiveType(first);
    if (!type) { index += 1; continue; }
    let end = index + 1;
    while (end < sorted.length && sorted[end].section === first.section
      && effectiveType(sorted[end]) === type && !sorted[end].groupBreakBefore) end += 1;
    const segment = sorted.slice(index, end);
    const fixedSize = FIXED_GROUP_SIZE[type];
    if (fixedSize) {
      if (segment.length % fixedSize !== 0) {
        throw new ResistanceStructureValidationError(`Agrupamento ${type} está incompleto.`);
      }
      for (let offset = 0; offset < segment.length; offset += fixedSize) {
        assignChunk(segment.slice(offset, offset + fixedSize), type, result);
      }
    } else {
      assignChunk(segment, type, result);
    }
    index = end;
  }
  return rows.map((row) => result.get(row.id)!);
}

export async function reconcileResistanceGroups(
  tx: Prisma.TransactionClient,
  workoutDayId: string,
  declarations: ReadonlyMap<string, ResistanceGroupDeclaration> = new Map(),
) {
  const rows = await tx.workoutExercise.findMany({
    where: { workoutDayId },
    include: { resistanceBlocks: resistanceBlockInclude },
    orderBy: [{ section: 'asc' }, { exerciseOrder: 'asc' }, { id: 'asc' }],
  });
  const assignments = deriveResistanceGroupAssignments(rows as GroupRow[], declarations);
  for (const assignment of assignments) {
    const current = rows.find((row) => row.id === assignment.id)!;
    if (current.groupId === assignment.groupId && current.groupType === assignment.groupType
      && current.groupPosition === assignment.groupPosition && current.groupRounds === assignment.groupRounds) continue;
    await tx.workoutExercise.update({
      where: { id: assignment.id },
      data: { groupId: assignment.groupId, groupType: assignment.groupType,
        groupPosition: assignment.groupPosition, groupRounds: assignment.groupRounds },
    });
  }
  return assignments;
}
