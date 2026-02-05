import { PrismaClient, type AssessmentScheduleType } from '@prisma/client';

const prisma = new PrismaClient();

export interface CreateAssessmentDTO {
  athleteId: string;
  typeId: string;
  assessmentDate: Date;
  filePath: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  extractedData?: any;
}

export const assessmentService = {
  async listByAthlete(athleteId: string) {
    return prisma.assessment.findMany({
      where: { athleteId },
      include: {
        type: true,
      },
      orderBy: {
        assessmentDate: 'desc',
      },
    });
  },

  async getById(id: string) {
    return prisma.assessment.findUnique({
      where: { id },
      include: {
        type: true,
        athlete: true,
      },
    });
  },

  async create(data: CreateAssessmentDTO) {
    return prisma.assessment.create({
      data: {
        athleteId: data.athleteId,
        typeId: data.typeId,
        assessmentDate: data.assessmentDate,
        filePath: data.filePath,
        originalFileName: data.originalFileName,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        extractedData: data.extractedData ?? null,
      },
      include: {
        type: true,
      },
    });
  },

  async update(id: string, data: { assessmentDate?: Date; typeId?: string }) {
    return prisma.assessment.update({
      where: { id },
      data: {
        assessmentDate: data.assessmentDate,
        typeId: data.typeId,
      },
      include: {
        type: true,
      },
    });
  },

  async delete(id: string) {
    return prisma.assessment.delete({
      where: { id },
    });
  },

  async getSummaryByAthlete(athleteId: string, contractId: string) {
    const [types, assessments] = await Promise.all([
      prisma.assessmentType.findMany({
        where: { contractId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.assessment.findMany({
        where: { athleteId },
        orderBy: { assessmentDate: 'desc' },
        include: { type: true },
      }),
    ]);

    const lastByType = new Map<string, Date>();
    for (const item of assessments) {
      if (!lastByType.has(item.typeId)) {
        lastByType.set(item.typeId, item.assessmentDate);
      }
    }

    const getNextDate = (typeId: string, typeSchedule: AssessmentScheduleType, intervalMonths?: number | null, afterTypeId?: string | null, offsetMonths?: number | null) => {
      if (typeSchedule === 'fixed_interval') {
        const lastDate = lastByType.get(typeId);
        if (!lastDate || !intervalMonths || intervalMonths <= 0) return null;
        const next = new Date(lastDate);
        next.setMonth(next.getMonth() + intervalMonths);
        return next;
      }

      if (typeSchedule === 'after_type') {
        if (!afterTypeId) return null;
        const baseDate = lastByType.get(afterTypeId);
        if (!baseDate) return null;
        const offset = offsetMonths ?? 0;
        const next = new Date(baseDate);
        next.setMonth(next.getMonth() + offset);
        return next;
      }

      return null;
    };

    return types.map((type) => {
      const lastAssessmentDate = lastByType.get(type.id) ?? null;
      const nextDueDate = getNextDate(
        type.id,
        type.scheduleType,
        type.intervalMonths,
        type.afterTypeId,
        type.offsetMonths
      );

      return {
        typeId: type.id,
        typeName: type.name,
        scheduleType: type.scheduleType,
        intervalMonths: type.intervalMonths,
        afterTypeId: type.afterTypeId,
        offsetMonths: type.offsetMonths,
        lastAssessmentDate,
        nextDueDate,
      };
    });
  },
};
