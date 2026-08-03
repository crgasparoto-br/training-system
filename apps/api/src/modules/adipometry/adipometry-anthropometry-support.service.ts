import { PrismaClient } from '@prisma/client';
import { AdipometryServiceError } from './adipometry.service.js';

const prisma = new PrismaClient();

function dateOnly(value: string | Date): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new AdipometryServiceError(
        'A data da avaliação é inválida.',
        'ADIPOMETRY_INVALID_DATE'
      );
    }
    return value.toISOString().slice(0, 10);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new AdipometryServiceError(
      'A data da avaliação é inválida.',
      'ADIPOMETRY_INVALID_DATE'
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new AdipometryServiceError(
      'A data da avaliação é inválida.',
      'ADIPOMETRY_INVALID_DATE'
    );
  }
  return value;
}

function serializeAssessment(assessment: any) {
  return {
    anthropometryAssessmentId: assessment.id as string,
    assessmentCode: assessment.code as string,
    assessmentDate: dateOnly(assessment.assessmentDate),
    notes: assessment.notes ?? null,
    measurements: [...assessment.values]
      .sort((left: any, right: any) => left.segment.order - right.segment.order)
      .map((item: any) => ({
        segmentId: item.segmentId as string,
        segmentName: item.segment.name as string,
        segmentType: item.segment.type as string,
        technicalDescription: item.segment.technicalDescription ?? null,
        formulaHint: item.segment.formulaHint ?? null,
        value: item.value ?? null,
        unit: item.unit as string,
        observation: item.observation ?? null,
      })),
    observations: assessment.observations.map((item: any) => ({
      segmentId: item.segmentId ?? null,
      text: item.text as string,
      importable: item.importable as boolean,
    })),
  };
}

const includeSupportDetails = {
  values: {
    include: {
      segment: {
        select: {
          name: true,
          type: true,
          order: true,
          technicalDescription: true,
          formulaHint: true,
        },
      },
    },
  },
  observations: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      segmentId: true,
      text: true,
      importable: true,
    },
  },
} as const;

export const adipometryAnthropometrySupportService = {
  async getSupport(
    contractId: string,
    alunoId: string,
    assessmentDate: string,
    anthropometryAssessmentId?: string
  ) {
    const normalizedDate = dateOnly(assessmentDate);
    const aluno = await prisma.aluno.findFirst({
      where: { id: alunoId, contractId },
      select: { id: true },
    });
    if (!aluno) {
      throw new AdipometryServiceError(
        'Avaliação não encontrada.',
        'ADIPOMETRY_RESOURCE_NOT_FOUND',
        404
      );
    }

    const where = {
      contractId,
      alunoId,
      assessmentDate: { lte: new Date(`${normalizedDate}T00:00:00.000Z`) },
    } as const;

    const [latestEligible, selected] = await Promise.all([
      prisma.anthropometryAssessment.findFirst({
        where,
        orderBy: [{ assessmentDate: 'desc' }, { createdAt: 'desc' }],
        include: includeSupportDetails,
      }),
      anthropometryAssessmentId
        ? prisma.anthropometryAssessment.findFirst({
            where: { ...where, id: anthropometryAssessmentId },
            include: includeSupportDetails,
          })
        : Promise.resolve(null),
    ]);

    if (anthropometryAssessmentId && !selected) {
      throw new AdipometryServiceError(
        'A avaliação antropométrica de apoio não está disponível para este aluno e data.',
        'ADIPOMETRY_ANTHROPOMETRY_REFERENCE_NOT_FOUND',
        404
      );
    }

    return {
      latestEligible: latestEligible ? serializeAssessment(latestEligible) : null,
      selected: selected ? serializeAssessment(selected) : null,
    };
  },
};
