import type { PrismaClient } from '@prisma/client';
import { matchResistanceExerciseRows, normalizeResistanceBlocks, sanitizeWorkoutMutation, validateWorkoutWeekEnvelope, ResistanceStructureNotFoundError, ResistanceStructureValidationError, WorkoutPlanningVersionConflictError } from './resistance-structure.domain.js';
import { assertDayContract, comparableResistanceBlocks, nestedResistanceBlocks, normalizeWorkoutTemplateUpdateData, resistanceBlockInclude, serializeWorkoutTemplate, touchWorkoutTemplateRevision, withWorkoutDayPlanningMutation, withWorkoutTemplatePlanningMutation, workoutDateInTargetWeek, WorkoutPlanningLockedError } from './workout-planning.helpers.js';
import { cyclicStageInclude, replaceCyclicStagesInTransaction } from './cyclic-stages.domain.js';
import type { CreateWorkoutExerciseDTO, SaveWorkoutWeekDTO } from './workout.service.js';

export async function saveTemplateWeek(prisma: PrismaClient, id: string, data: SaveWorkoutWeekDTO, contractId?: string) {
  if (!data || typeof data !== 'object') {
    throw new ResistanceStructureValidationError('Snapshot semanal inválido.');
  }

  validateWorkoutWeekEnvelope(data);

  return withWorkoutTemplatePlanningMutation(prisma, id, async (tx) => {
    const template = await tx.workoutTemplate.findUnique({
      where: { id },
      select: { id: true, planId: true, weekStartDate: true, updatedAt: true },
    });
    if (!template) throw new ResistanceStructureNotFoundError();
    if (data.baseUpdatedAt !== undefined) {
      const expectedUpdatedAt = new Date(data.baseUpdatedAt);
      if (!Number.isFinite(expectedUpdatedAt.getTime())
        || expectedUpdatedAt.getTime() !== template.updatedAt.getTime()) {
        throw new WorkoutPlanningVersionConflictError();
      }
    }
    if (contractId) {
      const owned = await tx.workoutTemplate.findFirst({
        where: { id, plan: { aluno: { contractId } } },
        select: { id: true },
      });
      if (!owned) throw new ResistanceStructureNotFoundError();
    }

    const templateInput = sanitizeWorkoutMutation(data.template ?? {}, 'template');
    let childGraphChanged = false;
    const requestedWeekStartDate = (templateInput as { weekStartDate?: Date | string }).weekStartDate;
    const nextWeekStartDate = requestedWeekStartDate === undefined
      ? template.weekStartDate
      : requestedWeekStartDate instanceof Date
        ? requestedWeekStartDate
        : new Date(requestedWeekStartDate);
    if (!Number.isFinite(nextWeekStartDate.getTime())) {
      throw new ResistanceStructureValidationError('Âncora semanal inválida.');
    }
    if (Object.keys(templateInput).length > 0) {
      await tx.workoutTemplate.update({
        where: { id },
        data: normalizeWorkoutTemplateUpdateData(templateInput),
      });
    }

    const daysByWeekday = new Map<number, { id: string }>();
    const seenDayOfWeeks = new Set<number>();
    const rawDays = data.workoutDays ?? [];
    if (!Array.isArray(rawDays) || rawDays.length > 7) {
      throw new ResistanceStructureValidationError('Dias do snapshot inválidos.');
    }
    if (rawDays.length > 0) childGraphChanged = true;

    for (const rawDay of rawDays) {
      if (!rawDay || typeof rawDay !== 'object') {
        throw new ResistanceStructureValidationError('Dia do snapshot inválido.');
      }
      const sanitizedDay = sanitizeWorkoutMutation({
        ...rawDay,
        templateId: id,
        workoutDate: rawDay.workoutDate ?? template.weekStartDate,
      }, 'day', 'create') as any;
      if (!Number.isInteger(sanitizedDay.dayOfWeek) || sanitizedDay.dayOfWeek < 1 || sanitizedDay.dayOfWeek > 7) {
        throw new ResistanceStructureValidationError('Dia do snapshot inválido.');
      }
      if (seenDayOfWeeks.has(sanitizedDay.dayOfWeek)) {
        throw new ResistanceStructureValidationError('O snapshot contém dias duplicados.');
      }
      seenDayOfWeeks.add(sanitizedDay.dayOfWeek);
      const canonicalDate = workoutDateInTargetWeek(nextWeekStartDate, sanitizedDay.dayOfWeek);
      const dayData = { ...sanitizedDay, workoutDate: canonicalDate };
      const { templateId: _templateId, ...updateData } = dayData;
      const day = await tx.workoutDay.upsert({
        where: {
          templateId_dayOfWeek: {
            templateId: id,
            dayOfWeek: sanitizedDay.dayOfWeek,
          },
        },
        create: dayData,
        update: updateData,
        select: { id: true },
      });
      daysByWeekday.set(sanitizedDay.dayOfWeek, day);
    }

    const existingDays = await tx.workoutDay.findMany({
      where: { templateId: id },
      select: { id: true, dayOfWeek: true },
    });
    if (nextWeekStartDate.getTime() !== template.weekStartDate.getTime()) {
      for (const existingDay of existingDays) {
        await tx.workoutDay.update({
          where: { id: existingDay.id },
          data: { workoutDate: workoutDateInTargetWeek(nextWeekStartDate, existingDay.dayOfWeek) },
        });
      }
    }
    for (const day of existingDays) daysByWeekday.set(day.dayOfWeek, { id: day.id });

    // Omitted day keys preserve legacy text and existing structured steps.
    // Explicit [] removes only the cyclic structure, within the week transaction.
    if (data.cyclicStages !== undefined) {
      childGraphChanged = true;
      for (const [dayKey, stages] of Object.entries(data.cyclicStages)) {
        const dayOfWeek = Number(dayKey);
        let targetDay = daysByWeekday.get(dayOfWeek);
        if (!targetDay) {
          targetDay = await tx.workoutDay.create({
            data: { templateId: id, dayOfWeek, workoutDate: workoutDateInTargetWeek(nextWeekStartDate, dayOfWeek) },
            select: { id: true },
          });
          daysByWeekday.set(dayOfWeek, targetDay);
        }
        if (contractId) await assertDayContract(tx, targetDay.id, contractId);
        await replaceCyclicStagesInTransaction(tx, targetDay.id, stages);
      }
    }

    const resisted = data.resistedExercises;
    if (resisted !== undefined) {
      childGraphChanged = true;
      if (!resisted || typeof resisted !== 'object' || Array.isArray(resisted)) {
        throw new ResistanceStructureValidationError('Estrutura resistida semanal inválida.');
      }
      for (const [dayKey, sections] of Object.entries(resisted)) {
        const dayOfWeek = Number(dayKey);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7
          || !sections || typeof sections !== 'object' || Array.isArray(sections)) {
          throw new ResistanceStructureValidationError('Dia resistido inválido.');
        }
        let targetDay = daysByWeekday.get(dayOfWeek);
        if (!targetDay) {
          const created = await tx.workoutDay.create({
            data: {
              templateId: id,
              dayOfWeek,
              workoutDate: workoutDateInTargetWeek(nextWeekStartDate, dayOfWeek),
            },
            select: { id: true },
          });
          targetDay = created;
          daysByWeekday.set(dayOfWeek, created);
        }
        const resolvedTargetDay = targetDay;
        if (contractId) await assertDayContract(tx, resolvedTargetDay.id, contractId);

        const sectionNames = ['mobilidade', 'sessao', 'resfriamento'] as const;
        const rawExercises = sectionNames.flatMap((section) => {
          const values = (sections as Record<string, unknown>)[section];
          if (values === undefined) return [];
          if (!Array.isArray(values)) throw new ResistanceStructureValidationError('Exercícios resistidos inválidos.');
          return values.map((exercise) => ({
            ...(exercise as Record<string, unknown>),
            workoutDayId: resolvedTargetDay.id,
            section,
          }));
        });
        if (rawExercises.length > 200) throw new ResistanceStructureValidationError('Lista de exercícios inválida.');

        const perSection = new Map<string, number>();
        const prepared = rawExercises.map((rawInput) => {
          const input: any = sanitizeWorkoutMutation(rawInput, 'exercise', 'create') as any;
          if (!input || typeof input.exerciseId !== 'string' || !input.exerciseId.trim()
            || input.workoutDayId !== resolvedTargetDay.id
            || (input.workoutExerciseId !== undefined
              && (typeof input.workoutExerciseId !== 'string' || !input.workoutExerciseId.trim()))) {
            throw new ResistanceStructureValidationError('Exercício inválido.');
          }
          const expected = (perSection.get(input.section) ?? 0) + 1;
          if (input.exerciseOrder !== expected) throw new ResistanceStructureValidationError('Ordem de exercício inválida.');
          perSection.set(input.section, expected);
          const { resistanceBlocks, workoutExerciseId, workoutDayId: _dayId, ...exercise } = input;
          return {
            workoutExerciseId,
            exercise,
            blocks: resistanceBlocks === undefined ? undefined : normalizeResistanceBlocks(resistanceBlocks),
          };
        });

        if (contractId) {
          const libraryIds = [...new Set(prepared.map((item) => item.exercise.exerciseId))];
          const available = await tx.exerciseLibrary.count({ where: { id: { in: libraryIds }, contractId } });
          if (available !== libraryIds.length) throw new ResistanceStructureValidationError('Exercício fora do contrato.');
        }

        const current = await tx.workoutExercise.findMany({
          where: { workoutDayId: resolvedTargetDay.id },
          include: {
            resistanceBlocks: resistanceBlockInclude,
            _count: { select: { executions: true, executionItems: true } },
          },
          orderBy: [{ section: 'asc' }, { exerciseOrder: 'asc' }],
        });
        const identity = matchResistanceExerciseRows(current, prepared.map((item) => ({
          workoutExerciseId: item.workoutExerciseId,
          exerciseId: item.exercise.exerciseId,
          section: item.exercise.section,
        })));
        const preserved = new Set(identity.filter((value): value is string => value !== null));
        for (const prior of current) {
          if (!preserved.has(prior.id)
            && (prior._count.executions > 0 || prior._count.executionItems > 0)) {
            throw new WorkoutPlanningLockedError();
          }
        }

        for (let index = 0; index < prepared.length; index += 1) {
          const input = prepared[index];
          const rowId = identity[index];
          if (!rowId) {
            await tx.workoutExercise.create({
              data: {
                ...(input.exercise as any),
                ...(input.blocks ? { resistanceBlocks: nestedResistanceBlocks(input.blocks) } : {}),
              },
            });
            continue;
          }
          const prior = current.find((row) => row.id === rowId)!;
          const changedColumns = Object.entries(input.exercise).some(([key, value]) =>
            value !== undefined && value !== prior[key as keyof typeof prior]);
          const blocksChanged = input.blocks !== undefined
            && comparableResistanceBlocks(prior.resistanceBlocks) !== comparableResistanceBlocks(input.blocks);
          if ((prior._count.executions > 0 || prior._count.executionItems > 0)
            && (changedColumns || blocksChanged)) {
            throw new WorkoutPlanningLockedError();
          }
          if (!changedColumns && !blocksChanged) continue;
          await tx.workoutExercise.update({
            where: { id: rowId },
            data: {
              ...(input.exercise as any),
              ...(blocksChanged && input.blocks
                ? { resistanceBlocks: { deleteMany: {}, ...nestedResistanceBlocks(input.blocks) } }
                : {}),
            },
          });
        }
        for (const prior of current) {
          if (!preserved.has(prior.id)) await tx.workoutExercise.delete({ where: { id: prior.id } });
        }
      }
    }

    if (childGraphChanged && Object.keys(templateInput).length === 0) {
      await touchWorkoutTemplateRevision(tx, id);
    }

    const saved = await tx.workoutTemplate.findUnique({
      where: { id },
      include: {
        plan: true,
        workoutDays: {
          include: { cyclicStages: cyclicStageInclude, exercises: { include: { exercise: true, resistanceBlocks: resistanceBlockInclude } } },
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });
    return serializeWorkoutTemplate(saved);
  });
}

export async function replaceDayResistanceExercises(prisma: PrismaClient, workoutDayId: string, exercises: CreateWorkoutExerciseDTO[], contractId?: string) {
  if (!Array.isArray(exercises) || exercises.length > 200) {
    throw new ResistanceStructureValidationError('Lista de exercícios inválida.');
  }
  const perSection = new Map<string, number>();
  const prepared = exercises.map((rawInput) => {
    const input = sanitizeWorkoutMutation(rawInput, 'exercise', 'create');
    if (!input || typeof input.exerciseId !== 'string' || !input.exerciseId.trim()
      || input.workoutDayId !== workoutDayId
      || (input.workoutExerciseId !== undefined
        && (typeof input.workoutExerciseId !== 'string' || !input.workoutExerciseId.trim()))
      || !['mobilidade', 'sessao', 'resfriamento'].includes(input.section)) {
      throw new ResistanceStructureValidationError('Exercício inválido.');
    }
    const expected = (perSection.get(input.section) ?? 0) + 1;
    if (input.exerciseOrder !== expected) throw new ResistanceStructureValidationError('Ordem de exercício inválida.');
    perSection.set(input.section, expected);
    const { resistanceBlocks, workoutExerciseId, ...exercise } = input;
    const blocks = resistanceBlocks === undefined ? undefined : normalizeResistanceBlocks(resistanceBlocks);
    return { workoutExerciseId, exercise, blocks };
  });

  // The public route requires an active professor and supplies their contract.
  // Preflight avoids revealing frozen/started state for a foreign day.
  if (contractId !== undefined) {
    if (!contractId.trim()) throw new ResistanceStructureNotFoundError();
    const owned = await prisma.workoutDay.findFirst({
      where: { id: workoutDayId, template: { plan: { aluno: { contractId } } } },
      select: { id: true },
    });
    if (!owned) throw new ResistanceStructureNotFoundError();
  }

  return withWorkoutDayPlanningMutation(prisma, workoutDayId, async (tx) => {
    if (contractId !== undefined) {
      const owned = await tx.workoutDay.findFirst({
        where: { id: workoutDayId, template: { plan: { aluno: { contractId } } } },
        select: { id: true },
      });
      if (!owned) throw new ResistanceStructureNotFoundError();
      const libraryIds = [...new Set(prepared.map((item) => item.exercise.exerciseId))];
      const available = await tx.exerciseLibrary.count({
        where: { id: { in: libraryIds }, contractId },
      });
      if (available !== libraryIds.length) {
        throw new ResistanceStructureValidationError('Exercício fora do contrato.');
      }
    }
    const current = await tx.workoutExercise.findMany({
      where: { workoutDayId },
      include: {
        resistanceBlocks: resistanceBlockInclude,
        _count: { select: { executions: true, executionItems: true } },
      },
      orderBy: [{ section: 'asc' }, { exerciseOrder: 'asc' }],
    });
    const identity = matchResistanceExerciseRows(current, prepared.map((item) => ({
      workoutExerciseId: item.workoutExerciseId,
      exerciseId: item.exercise.exerciseId,
      section: item.exercise.section,
    })));
    const preserved = new Set(identity.filter((id): id is string => id !== null));

    // Validate removals before any writes to protect historical execution rows.
    for (const prior of current) {
      if (!preserved.has(prior.id)
        && (prior._count.executions > 0 || prior._count.executionItems > 0)) {
        throw new WorkoutPlanningLockedError();
      }
    }
    for (let index = 0; index < prepared.length; index += 1) {
      const input = prepared[index];
      const rowId = identity[index];
      if (!rowId) {
        await tx.workoutExercise.create({
          data: {
            ...input.exercise,
            ...(input.blocks ? { resistanceBlocks: nestedResistanceBlocks(input.blocks) } : {}),
          },
        });
        continue;
      }
      const prior = current.find((row) => row.id === rowId)!;
      const changedColumns = Object.entries(input.exercise).some(([key, value]) =>
        value !== undefined && value !== prior[key as keyof typeof prior]);
      const blocksChanged = input.blocks !== undefined
        && comparableResistanceBlocks(prior.resistanceBlocks) !== comparableResistanceBlocks(input.blocks);
      if ((prior._count.executions > 0 || prior._count.executionItems > 0)
        && (changedColumns || blocksChanged)) {
        throw new WorkoutPlanningLockedError();
      }
      if (!changedColumns && !blocksChanged) continue;
      await tx.workoutExercise.update({
        where: { id: rowId },
        data: {
          ...input.exercise,
          ...(blocksChanged && input.blocks
            ? { resistanceBlocks: { deleteMany: {}, ...nestedResistanceBlocks(input.blocks) } }
            : {}),
        },
      });
    }
    for (const prior of current) {
      if (!preserved.has(prior.id)) {
        await tx.workoutExercise.delete({ where: { id: prior.id } });
      }
    }
    return tx.workoutExercise.findMany({
      where: { workoutDayId },
      include: { exercise: true, resistanceBlocks: resistanceBlockInclude },
      orderBy: [{ section: 'asc' }, { exerciseOrder: 'asc' }],
    });
  });
}
