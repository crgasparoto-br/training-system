import { PrismaClient, type Prisma, type AssessmentScheduleType } from '@prisma/client';
import { PRODUCT_ASSESSMENT_TYPES } from '../../common/product-defaults.js';

const prisma = new PrismaClient();

export interface CreateAssessmentTypeDTO {
  contractId: string;
  name: string;
  code: string;
  description?: string;
  scheduleType: AssessmentScheduleType;
  intervalMonths?: number | null;
  afterTypeId?: string | null;
  offsetMonths?: number | null;
  isActive?: boolean;
}

export interface UpdateAssessmentTypeDTO {
  name?: string;
  code?: string;
  description?: string | null;
  scheduleType?: AssessmentScheduleType;
  intervalMonths?: number | null;
  afterTypeId?: string | null;
  offsetMonths?: number | null;
  isActive?: boolean;
}

export async function ensureDefaultAssessmentTypes(
  tx: Prisma.TransactionClient,
  contractId: string
) {
  const existing = await tx.assessmentType.findMany({
    where: { contractId },
    select: { code: true },
  });
  const existingCodes = new Set(existing.map((item) => item.code));
  const missing = PRODUCT_ASSESSMENT_TYPES.filter((item) => !existingCodes.has(item.code));

  if (missing.length === 0) {
    return {
      installed: 0,
      skipped: PRODUCT_ASSESSMENT_TYPES.length,
    };
  }

  const created = await tx.assessmentType.createMany({
    data: missing.map((item) => ({
      contractId,
      name: item.name,
      code: item.code,
      scheduleType: item.scheduleType,
      intervalMonths: item.intervalMonths,
      isActive: item.isActive,
    })),
    skipDuplicates: true,
  });

  return {
    installed: created.count,
    skipped: PRODUCT_ASSESSMENT_TYPES.length - created.count,
  };
}

export async function ensureDefaultAssessmentTypesForContract(contractId: string) {
  return prisma.$transaction(async (tx) => ensureDefaultAssessmentTypes(tx, contractId));
}

export const assessmentTypeService = {
  async listByContract(contractId: string) {
    return prisma.assessmentType.findMany({
      where: { contractId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  },

  async create(data: CreateAssessmentTypeDTO) {
    return prisma.assessmentType.create({
      data: {
        contractId: data.contractId,
        name: data.name.trim(),
        code: data.code.trim(),
        description: data.description?.trim() || null,
        scheduleType: data.scheduleType,
        intervalMonths: data.intervalMonths ?? null,
        afterTypeId: data.afterTypeId ?? null,
        offsetMonths: data.offsetMonths ?? null,
        isActive: data.isActive ?? true,
      },
    });
  },

  async update(id: string, contractId: string, data: UpdateAssessmentTypeDTO) {
    return prisma.assessmentType.update({
      where: { id, contractId },
      data: {
        name: data.name?.trim(),
        code: data.code?.trim(),
        description: data.description === undefined ? undefined : data.description?.trim() || null,
        scheduleType: data.scheduleType,
        intervalMonths: data.intervalMonths === undefined ? undefined : data.intervalMonths,
        afterTypeId: data.afterTypeId === undefined ? undefined : data.afterTypeId,
        offsetMonths: data.offsetMonths === undefined ? undefined : data.offsetMonths,
        isActive: data.isActive,
      },
    });
  },

  async delete(id: string, contractId: string) {
    const assessmentCount = await prisma.assessment.count({
      where: { typeId: id },
    });

    if (assessmentCount > 0) {
      return prisma.assessmentType.update({
        where: { id, contractId },
        data: { isActive: false },
      });
    }

    return prisma.assessmentType.delete({
      where: { id, contractId },
    });
  },
};
