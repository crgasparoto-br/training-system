import type { PrismaClient } from '@prisma/client';
import { ResistanceStructureNotFoundError, ResistanceStructureValidationError } from './resistance-structure.domain.js';
import { lockWorkoutTemplatePlanningMutable, nestedResistanceBlocks, resistanceBlockInclude, serializeWorkoutTemplate, withTemplateCopyRetry, workoutDateInTargetWeek } from './workout-planning.helpers.js';

export async function copyTemplateSections(
  prisma: PrismaClient,
  id: string,
  targetWeekNumber: number,
  targetWeekStartDate: Date,
  mode: 'cyclic' | 'resistance',
) {
  if (!Number.isInteger(targetWeekNumber) || targetWeekNumber <= 0
    || !(targetWeekStartDate instanceof Date) || !Number.isFinite(targetWeekStartDate.getTime())
    || (mode !== 'cyclic' && mode !== 'resistance')) {
    throw new ResistanceStructureValidationError('Dados de cópia inválidos.');
  }

  return withTemplateCopyRetry(() => prisma.$transaction(async (tx) => {
    const source = await tx.workoutTemplate.findUnique({
      where: { id },
      include: {
        workoutDays: {
          include: { exercises: { include: { resistanceBlocks: resistanceBlockInclude } } },
        },
      },
    });
    if (!source) throw new ResistanceStructureNotFoundError();
    if (source.weekNumber === targetWeekNumber) {
      throw new ResistanceStructureValidationError('A semana de destino deve ser diferente da origem.');
    }

    const existingTarget = await tx.workoutTemplate.findUnique({
      where: {
        planId_mesocycleNumber_weekNumber: {
          planId: source.planId,
          mesocycleNumber: source.mesocycleNumber,
          weekNumber: targetWeekNumber,
        },
      },
      select: { id: true },
    });
    const target = existingTarget
      ? (await tx.workoutTemplate.findUniqueOrThrow({ where: { id: existingTarget.id } }))
      : await tx.workoutTemplate.create({
        data: {
          planId: source.planId,
          mesocycleNumber: source.mesocycleNumber,
          weekNumber: targetWeekNumber,
          weekStartDate: targetWeekStartDate,
        },
      });

    if (existingTarget) await lockWorkoutTemplatePlanningMutable(tx, target.id);
    await tx.workoutTemplate.update({
      where: { id: target.id },
      data: mode === 'cyclic'
        ? {
            weekStartDate: targetWeekStartDate,
            cyclicFrequency: source.cyclicFrequency,
            totalVolumeMin: source.totalVolumeMin,
            totalVolumeKm: source.totalVolumeKm,
          }
        : {
            weekStartDate: targetWeekStartDate,
            resistanceFrequency: source.resistanceFrequency,
            loadPercentage: source.loadPercentage,
            repZone: source.repZone,
            repReserve: source.repReserve,
            trainingMethod: source.trainingMethod,
            trainingDivision: source.trainingDivision,
            studentGoal: source.studentGoal,
            coachGoal: source.coachGoal,
            observation1: source.observation1,
            observation2: source.observation2,
          },
    });

    const sourceDays = new Map(source.workoutDays.map((day) => [day.dayOfWeek, day]));
    const partialCopyDate = (dayOfWeek: number) => workoutDateInTargetWeek(targetWeekStartDate, dayOfWeek);
    for (const [dayOfWeek, sourceDay] of sourceDays) {
      const targetDay = await tx.workoutDay.findUnique({
        where: { templateId_dayOfWeek: { templateId: target.id, dayOfWeek } },
        select: { id: true },
      }) ?? await tx.workoutDay.create({
        data: {
          templateId: target.id,
          dayOfWeek,
          workoutDate: partialCopyDate(dayOfWeek),
        },
          select: { id: true },
        });

      if (mode === 'cyclic') {
        await tx.workoutDay.update({
          where: { id: targetDay.id },
          data: {
            workoutDate: partialCopyDate(dayOfWeek),
            sessionDurationMin: sourceDay.sessionDurationMin,
            cyclicTimeMin: sourceDay.cyclicTimeMin,
            stimulusDurationMin: sourceDay.stimulusDurationMin,
            location: sourceDay.location,
            method: sourceDay.method,
            intensity1: sourceDay.intensity1,
            intensity2: sourceDay.intensity2,
            numSessions: sourceDay.numSessions,
            numSets: sourceDay.numSets,
            sessionTime: sourceDay.sessionTime,
            restTime: sourceDay.restTime,
            vo2maxIntervalPct: sourceDay.vo2maxIntervalPct,
            iextIintTime: sourceDay.iextIintTime,
            vo2maxPct: sourceDay.vo2maxPct,
            targetHrMin: sourceDay.targetHrMin,
            targetHrMax: sourceDay.targetHrMax,
            targetSpeedMin: sourceDay.targetSpeedMin,
            targetSpeedMax: sourceDay.targetSpeedMax,
            detailNotes: sourceDay.detailNotes,
            complementNotes: sourceDay.complementNotes,
            generalGuidelines: sourceDay.generalGuidelines,
          },
        });
        continue;
      }

      await tx.workoutDay.update({
        where: { id: targetDay.id },
        data: {
          workoutDate: partialCopyDate(dayOfWeek),
          resistanceTimeMin: sourceDay.resistanceTimeMin,
        },
      });
      await tx.workoutExercise.deleteMany({ where: { workoutDayId: targetDay.id } });
      for (const exercise of sourceDay.exercises) {
        await tx.workoutExercise.create({
          data: {
            workoutDayId: targetDay.id,
            exerciseId: exercise.exerciseId,
            section: exercise.section,
            exerciseOrder: exercise.exerciseOrder,
            system: exercise.system,
            groupBreakBefore: exercise.groupBreakBefore,
            sets: exercise.sets,
            reps: exercise.reps,
            intervalSec: exercise.intervalSec,
            cParam: exercise.cParam,
            eParam: exercise.eParam,
            load: exercise.load,
            exerciseNotes: exercise.exerciseNotes,
            resistanceBlocks: nestedResistanceBlocks(exercise.resistanceBlocks.map((block) => ({
              position: block.position,
              kind: block.kind,
              notes: block.notes,
              plannedSets: block.plannedSets.map((set) => ({
                position: set.position,
                repsMin: set.repsMin,
                repsMax: set.repsMax,
                loadKg: set.loadKg,
                loadPercent: set.loadPercent,
                rir: set.rir,
                rpe: set.rpe,
                tempo: set.tempo,
                restSec: set.restSec,
                notes: set.notes,
              })),
            }))),
          },
        });
      }
    }

    const targetDays = await tx.workoutDay.findMany({
      where: { templateId: target.id },
      select: { id: true, dayOfWeek: true, workoutDate: true },
    });
    for (const targetDay of targetDays) {
      const canonicalDate = workoutDateInTargetWeek(targetWeekStartDate, targetDay.dayOfWeek);
      if (targetDay.workoutDate.getTime() !== canonicalDate.getTime()) {
        await tx.workoutDay.update({
          where: { id: targetDay.id },
          data: { workoutDate: canonicalDate },
        });
      }
    }

    const copiedTemplate = await tx.workoutTemplate.findUnique({
      where: { id: target.id },
      include: {
        plan: true,
        workoutDays: {
          include: {
            exercises: { include: { exercise: true, resistanceBlocks: resistanceBlockInclude } },
          },
          orderBy: { dayOfWeek: 'asc' },
        },
      },
    });
    return serializeWorkoutTemplate(copiedTemplate);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 }));
}

export async function copyTemplate(
  prisma: PrismaClient,
  id: string,
  targetWeekNumber: number,
  targetWeekStartDate: Date,
) {
  if (!Number.isInteger(targetWeekNumber) || targetWeekNumber <= 0 || !(targetWeekStartDate instanceof Date) || !Number.isFinite(targetWeekStartDate.getTime())) {
    throw new Error('Invalid targetWeekNumber');
  }
  return withTemplateCopyRetry(() => prisma.$transaction(async (tx) => {
    const source = await tx.workoutTemplate.findUnique({
    where: { id },
    include: {
      workoutDays: {
        include: {
          exercises: { include: { resistanceBlocks: resistanceBlockInclude } },
        },
      },
    },
  });

  if (!source) {
    throw new Error('Template not found');
  }

  if (source.weekNumber === targetWeekNumber) {
    throw new Error('Target week must be different from source week');
  }

  const existingTarget = await tx.workoutTemplate.findUnique({
    where: {
      planId_mesocycleNumber_weekNumber: {
        planId: source.planId,
        mesocycleNumber: source.mesocycleNumber,
        weekNumber: targetWeekNumber,
      },
    },
    select: { id: true },
  });

  if (existingTarget && existingTarget.id !== source.id) {
    await lockWorkoutTemplatePlanningMutable(tx, existingTarget.id);
    await tx.workoutTemplate.delete({ where: { id: existingTarget.id } });
  }

  // Criar novo template
  const newTemplate = await tx.workoutTemplate.create({
    data: {
      planId: source.planId,
      mesocycleNumber: source.mesocycleNumber,
      weekNumber: targetWeekNumber,
      weekStartDate: targetWeekStartDate,
      cyclicFrequency: source.cyclicFrequency,
      resistanceFrequency: source.resistanceFrequency,
      totalVolumeMin: source.totalVolumeMin,
      totalVolumeKm: source.totalVolumeKm,
      loadPercentage: source.loadPercentage,
      repZone: source.repZone,
      repReserve: source.repReserve,
      trainingMethod: source.trainingMethod,
      trainingDivision: source.trainingDivision,
      studentGoal: source.studentGoal,
      coachGoal: source.coachGoal,
      observation1: source.observation1,
      observation2: source.observation2,
    },
  });

  // Copiar dias e exercÃ­cios
  for (const day of source.workoutDays) {
    const newDay = await tx.workoutDay.create({
      data: {
        templateId: newTemplate.id,
        dayOfWeek: day.dayOfWeek,
        workoutDate: workoutDateInTargetWeek(targetWeekStartDate, day.dayOfWeek),
        sessionDurationMin: day.sessionDurationMin,
        cyclicTimeMin: day.cyclicTimeMin,
        resistanceTimeMin: day.resistanceTimeMin,
        stimulusDurationMin: day.stimulusDurationMin,
        location: day.location,
        method: day.method,
        intensity1: day.intensity1,
        intensity2: day.intensity2,
        numSessions: day.numSessions,
        numSets: day.numSets,
        sessionTime: day.sessionTime,
        restTime: day.restTime,
        vo2maxIntervalPct: day.vo2maxIntervalPct,
        iextIintTime: day.iextIintTime,
        vo2maxPct: day.vo2maxPct,
        targetHrMin: day.targetHrMin,
        targetHrMax: day.targetHrMax,
        targetSpeedMin: day.targetSpeedMin,
        targetSpeedMax: day.targetSpeedMax,
        detailNotes: day.detailNotes,
        complementNotes: day.complementNotes,
        generalGuidelines: day.generalGuidelines,
      },
    });

    for (const exercise of day.exercises) {
      await tx.workoutExercise.create({
        data: {
          workoutDayId: newDay.id,
          exerciseId: exercise.exerciseId,
          section: exercise.section,
          exerciseOrder: exercise.exerciseOrder,
          system: exercise.system,
          groupBreakBefore: exercise.groupBreakBefore,
          sets: exercise.sets,
          reps: exercise.reps,
          intervalSec: exercise.intervalSec,
          cParam: exercise.cParam,
          eParam: exercise.eParam,
          load: exercise.load,
          exerciseNotes: exercise.exerciseNotes,
          resistanceBlocks: nestedResistanceBlocks(exercise.resistanceBlocks.map((block) => ({
            position: block.position, kind: block.kind, notes: block.notes,
            plannedSets: block.plannedSets.map((set) => ({ position: set.position, repsMin: set.repsMin,
              repsMax: set.repsMax, loadKg: set.loadKg, loadPercent: set.loadPercent,
              rir: set.rir, rpe: set.rpe, tempo: set.tempo, restSec: set.restSec, notes: set.notes })),
          }))),
        },
      });
    }
  }

  const copiedTemplate = await tx.workoutTemplate.findUnique({
    where: { id: newTemplate.id },
    include: {
      plan: true,
      workoutDays: {
        include: {
          exercises: {
            include: {
              exercise: true,
              resistanceBlocks: resistanceBlockInclude,
            },
            orderBy: [
              { section: 'asc' },
              { exerciseOrder: 'asc' },
            ],
          },
        },
        orderBy: { dayOfWeek: 'asc' },
      },
    },
  });

  return serializeWorkoutTemplate(copiedTemplate);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 }));
}
