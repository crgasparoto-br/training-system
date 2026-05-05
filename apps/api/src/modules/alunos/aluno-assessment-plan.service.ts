import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type UpsertAssessmentPlanItemDTO = {
  assessmentTypeId: string;
  isActive?: boolean;
  isRequired?: boolean;
  cadenceMonths?: number | null;
  startDate?: Date | null;
  nextDueDate?: Date | null;
  notes?: string | null;
};

type UpsertAlunoAssessmentPlanDTO = {
  alunoId: string;
  contractId: string;
  items: UpsertAssessmentPlanItemDTO[];
};

type RecalculateAlunoAssessmentPlanDTO = {
  alunoId: string;
  contractId: string;
};

const addMonths = (source: Date, months: number) => {
  const date = new Date(source);
  date.setMonth(date.getMonth() + months);
  return date;
};

const toStartOfDay = (value: Date) =>
  new Date(value.getFullYear(), value.getMonth(), value.getDate());

const effectiveCadenceMonths = (itemCadence: number | null, scheduleType: string, intervalMonths: number | null) => {
  if (itemCadence && itemCadence > 0) {
    return itemCadence;
  }

  if (scheduleType === 'fixed_interval' && intervalMonths && intervalMonths > 0) {
    return intervalMonths;
  }

  return null;
};

const computeNextDueDate = (
  lastAssessmentDate: Date | null,
  cadenceMonths: number | null,
  startDate: Date | null,
  currentNextDueDate: Date | null
) => {
  if (lastAssessmentDate && cadenceMonths) {
    return addMonths(lastAssessmentDate, cadenceMonths);
  }

  if (!lastAssessmentDate && startDate) {
    return startDate;
  }

  return currentNextDueDate;
};

const computeStatus = (
  hasPlan: boolean,
  isActive: boolean,
  nextDueDate: Date | null
) => {
  if (!hasPlan || !isActive) {
    return 'sem_planejamento';
  }

  if (!nextDueDate) {
    return 'pendente';
  }

  const today = toStartOfDay(new Date());
  const dueDate = toStartOfDay(nextDueDate);

  if (dueDate < today) {
    return 'vencida';
  }

  return 'em_dia';
};

const getLastAssessmentByType = async (alunoId: string, typeIds: string[]) => {
  if (typeIds.length === 0) {
    return new Map<string, Date>();
  }

  const grouped = await prisma.assessment.groupBy({
    by: ['typeId'],
    where: {
      alunoId,
      typeId: {
        in: typeIds,
      },
    },
    _max: {
      assessmentDate: true,
    },
  });

  return new Map(
    grouped
      .filter((item) => item._max.assessmentDate)
      .map((item) => [item.typeId, item._max.assessmentDate as Date])
  );
};

const buildAssessmentPlanView = async (alunoId: string, contractId: string) => {
  const assessmentTypes = await prisma.assessmentType.findMany({
    where: {
      contractId,
      isActive: true,
    },
    orderBy: {
      name: 'asc',
    },
  });

  const typeIds = assessmentTypes.map((item) => item.id);
  const planItems = await prisma.alunoAssessmentPlanItem.findMany({
    where: {
      alunoId,
      assessmentTypeId: {
        in: typeIds,
      },
    },
  });

  const planItemByType = new Map(planItems.map((item) => [item.assessmentTypeId, item]));
  const lastByType = await getLastAssessmentByType(
    alunoId,
    typeIds
  );

  const now = new Date();

  const items = assessmentTypes.map((assessmentType) => {
    const planItem = planItemByType.get(assessmentType.id);
    const hasPlan = Boolean(planItem);
    const isActive = planItem?.isActive ?? false;
    const cadence = effectiveCadenceMonths(
      planItem?.cadenceMonths ?? null,
      assessmentType.scheduleType,
      assessmentType.intervalMonths
    );
    const lastAssessmentDate = lastByType.get(assessmentType.id) ?? null;
    const predictedNextDueDate = hasPlan
      ? computeNextDueDate(
          lastAssessmentDate,
          cadence,
          planItem?.startDate ?? null,
          planItem?.nextDueDate ?? null
        )
      : null;

    return {
      id: planItem?.id ?? null,
      alunoId,
      assessmentTypeId: assessmentType.id,
      isActive,
      isRequired: planItem?.isRequired ?? false,
      cadenceMonths: planItem?.cadenceMonths ?? assessmentType.intervalMonths ?? null,
      effectiveCadenceMonths: cadence,
      startDate: planItem?.startDate ?? null,
      nextDueDate: planItem?.nextDueDate ?? null,
      notes: planItem?.notes ?? null,
      createdAt: planItem?.createdAt ?? null,
      updatedAt: planItem?.updatedAt ?? null,
      assessmentType: {
        id: assessmentType.id,
        name: assessmentType.name,
        code: assessmentType.code,
        scheduleType: assessmentType.scheduleType,
        intervalMonths: assessmentType.intervalMonths,
        afterTypeId: assessmentType.afterTypeId,
        offsetMonths: assessmentType.offsetMonths,
      },
      summary: {
        lastAssessmentDate,
        nextDueDate: predictedNextDueDate,
        status: computeStatus(hasPlan, isActive, predictedNextDueDate),
      },
    };
  });

  return {
    alunoId,
    generatedAt: now,
    items,
  };
};

export const alunoAssessmentPlanService = {
  async getByAluno(alunoId: string, contractId: string) {
    return buildAssessmentPlanView(alunoId, contractId);
  },

  async upsertByAluno(data: UpsertAlunoAssessmentPlanDTO) {
    const assessmentTypeIds = data.items.map((item) => item.assessmentTypeId);

    const assessmentTypes = await prisma.assessmentType.findMany({
      where: {
        id: { in: assessmentTypeIds },
        contractId: data.contractId,
      },
      select: {
        id: true,
      },
    });

    if (assessmentTypes.length !== assessmentTypeIds.length) {
      throw new Error('Um ou mais tipos de avaliação não pertencem ao contrato do professor');
    }

    await prisma.$transaction(async (tx) => {
      for (const item of data.items) {
        const existing = await tx.alunoAssessmentPlanItem.findUnique({
          where: {
            alunoId_assessmentTypeId: {
              alunoId: data.alunoId,
              assessmentTypeId: item.assessmentTypeId,
            },
          },
        });

        if (existing) {
          await tx.alunoAssessmentPlanItem.update({
            where: { id: existing.id },
            data: {
              isActive: item.isActive ?? existing.isActive,
              isRequired: item.isRequired ?? existing.isRequired,
              cadenceMonths:
                item.cadenceMonths === undefined ? existing.cadenceMonths : item.cadenceMonths,
              startDate: item.startDate === undefined ? existing.startDate : item.startDate,
              nextDueDate: item.nextDueDate === undefined ? existing.nextDueDate : item.nextDueDate,
              notes: item.notes === undefined ? existing.notes : item.notes,
            },
          });
          continue;
        }

        await tx.alunoAssessmentPlanItem.create({
          data: {
            alunoId: data.alunoId,
            assessmentTypeId: item.assessmentTypeId,
            isActive: item.isActive ?? true,
            isRequired: item.isRequired ?? true,
            cadenceMonths: item.cadenceMonths ?? null,
            startDate: item.startDate ?? null,
            nextDueDate: item.nextDueDate ?? null,
            notes: item.notes ?? null,
          },
        });
      }
    });

    return buildAssessmentPlanView(data.alunoId, data.contractId);
  },

  async recalculateByAluno(data: RecalculateAlunoAssessmentPlanDTO) {
    const planItems = await prisma.alunoAssessmentPlanItem.findMany({
      where: { alunoId: data.alunoId },
      include: {
        assessmentType: {
          select: {
            id: true,
            contractId: true,
            scheduleType: true,
            intervalMonths: true,
          },
        },
      },
    });

    const scopedItems = planItems.filter((item) => item.assessmentType.contractId === data.contractId);
    const lastByType = await getLastAssessmentByType(
      data.alunoId,
      scopedItems.map((item) => item.assessmentTypeId)
    );

    const updates = scopedItems
      .filter((item) => item.isActive)
      .map((item) => {
        const cadence = effectiveCadenceMonths(
          item.cadenceMonths,
          item.assessmentType.scheduleType,
          item.assessmentType.intervalMonths
        );
        const lastAssessmentDate = lastByType.get(item.assessmentTypeId) ?? null;
        const nextDueDate = computeNextDueDate(
          lastAssessmentDate,
          cadence,
          item.startDate,
          item.nextDueDate
        );

        return prisma.alunoAssessmentPlanItem.update({
          where: { id: item.id },
          data: {
            nextDueDate,
          },
        });
      });

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }

    return buildAssessmentPlanView(data.alunoId, data.contractId);
  },
};
