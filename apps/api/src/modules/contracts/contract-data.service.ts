import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface CloneContractDataOptions {
  sourceContractId: string;
  targetContractId: string;
  professorId?: string | null;
  copyParameters?: boolean;
  copyExercises?: boolean;
  copyAssessmentTypes?: boolean;
}

export interface CloneResult {
  parametersCreated: number;
  parametersSkipped: number;
  exercisesCreated: number;
  exercisesSkipped: number;
  assessmentTypesCreated: number;
  assessmentTypesSkipped: number;
}

export async function cloneContractData(
  options: CloneContractDataOptions
): Promise<CloneResult> {
  const {
    sourceContractId,
    targetContractId,
    professorId,
    copyParameters = true,
    copyExercises = true,
    copyAssessmentTypes = true,
  } = options;

  if (sourceContractId === targetContractId) {
    return {
      parametersCreated: 0,
      parametersSkipped: 0,
      exercisesCreated: 0,
      exercisesSkipped: 0,
      assessmentTypesCreated: 0,
      assessmentTypesSkipped: 0,
    };
  }

  let parametersCreated = 0;
  let parametersSkipped = 0;
  let exercisesCreated = 0;
  let exercisesSkipped = 0;
  let assessmentTypesCreated = 0;
  let assessmentTypesSkipped = 0;

  if (copyParameters) {
    const parameters = await prisma.trainingParameter.findMany({
      where: { contractId: sourceContractId },
      select: {
        category: true,
        code: true,
        description: true,
        order: true,
        active: true,
      },
    });

    if (parameters.length > 0) {
      const created = await prisma.trainingParameter.createMany({
        data: parameters.map((parameter) => ({
          contractId: targetContractId,
          category: parameter.category,
          code: parameter.code,
          description: parameter.description,
          order: parameter.order,
          active: parameter.active,
        })),
        skipDuplicates: true,
      });

      parametersCreated = created.count;
      parametersSkipped = parameters.length - created.count;
    }
  }

  if (copyExercises) {
    const exercises = await prisma.exerciseLibrary.findMany({
      where: { contractId: sourceContractId },
      select: {
        name: true,
        videoUrl: true,
        loadType: true,
        movementType: true,
        countingType: true,
        category: true,
        muscleGroup: true,
        notes: true,
      },
    });

    if (exercises.length > 0) {
      const existingNames = new Set(
        (
          await prisma.exerciseLibrary.findMany({
            where: { contractId: targetContractId },
            select: { name: true },
          })
        ).map((item) => item.name)
      );

      const toCreate = exercises.filter((exercise) => !existingNames.has(exercise.name));

      if (toCreate.length > 0) {
        const created = await prisma.exerciseLibrary.createMany({
          data: toCreate.map((exercise) => ({
            contractId: targetContractId,
            name: exercise.name,
            videoUrl: exercise.videoUrl,
            loadType: exercise.loadType,
            movementType: exercise.movementType,
            countingType: exercise.countingType,
            category: exercise.category,
            muscleGroup: exercise.muscleGroup,
            notes: exercise.notes,
          })),
        });

        exercisesCreated = created.count;
        exercisesSkipped = exercises.length - created.count;
      } else {
        exercisesSkipped = exercises.length;
      }
    }
  }

  if (copyAssessmentTypes) {
    const sourceTypes = await prisma.assessmentType.findMany({
      where: { contractId: sourceContractId },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        scheduleType: true,
        intervalMonths: true,
        afterTypeId: true,
        offsetMonths: true,
        isActive: true,
      },
    });

    if (sourceTypes.length > 0) {
      const targetTypes = await prisma.assessmentType.findMany({
        where: { contractId: targetContractId },
        select: { id: true, code: true },
      });

      const targetByCode = new Map(targetTypes.map((type) => [type.code, type.id]));
      const createdTypes = new Map<string, string>();

      const toCreate = sourceTypes.filter((type) => !targetByCode.has(type.code));

      for (const item of toCreate) {
        const created = await prisma.assessmentType.create({
          data: {
            contractId: targetContractId,
            code: item.code,
            name: item.name,
            description: item.description,
            scheduleType: item.scheduleType,
            intervalMonths: item.scheduleType === 'fixed_interval' ? item.intervalMonths : null,
            afterTypeId: null,
            offsetMonths: item.scheduleType === 'after_type' ? item.offsetMonths ?? 0 : null,
            isActive: item.isActive,
          },
        });
        createdTypes.set(item.code, created.id);
        targetByCode.set(item.code, created.id);
        assessmentTypesCreated += 1;
      }

      for (const item of toCreate) {
        if (!item.afterTypeId || item.scheduleType !== 'after_type') continue;
        const sourceAfterType = sourceTypes.find((type) => type.id === item.afterTypeId);
        if (!sourceAfterType) continue;
        const targetAfterTypeId = targetByCode.get(sourceAfterType.code);
        if (!targetAfterTypeId) continue;

        const targetTypeId = targetByCode.get(item.code);
        if (!targetTypeId) continue;

        await prisma.assessmentType.update({
          where: { id: targetTypeId, contractId: targetContractId },
          data: {
            afterTypeId: targetAfterTypeId,
          },
        });
      }

      assessmentTypesSkipped = sourceTypes.length - assessmentTypesCreated;
    }
  }

  await prisma.contractDataCloneLog.create({
    data: {
      sourceContractId,
      targetContractId,
      professorId: professorId || null,
      parametersCreated,
      parametersSkipped,
      exercisesCreated,
      exercisesSkipped,
      assessmentTypesCreated,
      assessmentTypesSkipped,
    },
  });

  return {
    parametersCreated,
    parametersSkipped,
    exercisesCreated,
    exercisesSkipped,
    assessmentTypesCreated,
    assessmentTypesSkipped,
  };
}

