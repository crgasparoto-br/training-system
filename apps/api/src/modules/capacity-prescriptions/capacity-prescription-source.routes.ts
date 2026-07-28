import { PrismaClient } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import type { CapacityPrescriptionSourceRef } from '@corrida/types';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  ADIPOMETRY_FORMULA_VERSION,
  calculateAdipometryComposition,
} from './capacity-prescription-formulas.js';
import { deriveCapacityAlerts, mergeCapacityAlerts } from './capacity-prescription-public.js';

const router: Router = Router();
const prisma = new PrismaClient();

type CapacitySourceActor = { contractId: string; professorId: string };
type CapacitySourceRequest = Request & { capacitySourceActor?: CapacitySourceActor };

type AssessmentSourceType = CapacityPrescriptionSourceRef['type'];

const assessmentSourceTypes: AssessmentSourceType[] = [
  'physical_assessment',
  'adipometry',
  'bioimpedance',
  'ultrasound',
  'ventilometry',
  'flexibility_assessment',
];

function mapAssessmentSourceType(category: string): AssessmentSourceType {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes('adip')) return 'adipometry';
  if (normalized.includes('bioimp')) return 'bioimpedance';
  if (normalized.includes('ultra')) return 'ultrasound';
  if (normalized.includes('ventil') || normalized.includes('metabolic')) return 'ventilometry';
  if (normalized.includes('flex')) return 'flexibility_assessment';
  return 'physical_assessment';
}

function decimalToNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const parsed = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type AssessmentMeasurementRecord = {
  metricKey: string;
  metricLabel: string | null;
  valueType: string;
  valueText: string | null;
  valueNumber: unknown;
  valueBoolean: boolean | null;
  unit: string | null;
};

function normalizedMetricKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

function measurementNumber(
  measurements: AssessmentMeasurementRecord[],
  aliases: string[]
): number | null {
  const aliasSet = new Set(aliases.map(normalizedMetricKey));
  const measurement = measurements.find((item) =>
    aliasSet.has(normalizedMetricKey(item.metricKey))
  );
  if (!measurement) return null;
  return decimalToNumber(measurement.valueNumber ?? measurement.valueText);
}

function measurementText(
  measurements: AssessmentMeasurementRecord[],
  aliases: string[]
): string | null {
  const aliasSet = new Set(aliases.map(normalizedMetricKey));
  const measurement = measurements.find((item) =>
    aliasSet.has(normalizedMetricKey(item.metricKey))
  );
  return measurement?.valueText?.trim() || null;
}

function derivedAdipometryDetails(category: string, measurements: AssessmentMeasurementRecord[]) {
  if (!normalizedMetricKey(category).includes('adip')) return [];

  const sexValue = measurementText(measurements, ['sex', 'gender', 'sexo', 'genero']);
  const normalizedSex = sexValue ? normalizedMetricKey(sexValue) : '';
  const sex = normalizedSex.startsWith('f')
    ? 'female'
    : normalizedSex.startsWith('m')
      ? 'male'
      : null;
  const weightKg = measurementNumber(measurements, ['weight', 'weight_kg', 'peso', 'peso_kg']);
  if (!sex || !weightKg) return [];

  try {
    const result = calculateAdipometryComposition({
      sex,
      weightKg,
      skinfoldsMm: {
        triceps: measurementNumber(measurements, ['triceps', 'tricipital']),
        subscapular: measurementNumber(measurements, ['subscapular']),
        suprailiac: measurementNumber(measurements, [
          'suprailiac',
          'supra_iliac',
          'suprailiaca',
          'supra_iliaca',
        ]),
        abdominal: measurementNumber(measurements, ['abdominal', 'abdomen']),
        thigh: measurementNumber(measurements, ['thigh', 'coxa']),
      },
    });

    return [
      { label: 'Total de dobras', value: result.totalSkinfoldsMm, unit: 'mm' },
      { label: '% Gordura', value: result.bodyFatPercentage, unit: '%' },
      { label: 'Gordura absoluta', value: result.fatMassKg, unit: 'kg' },
      { label: 'Massa magra', value: result.leanMassKg, unit: 'kg' },
      { label: 'Versão da fórmula', value: ADIPOMETRY_FORMULA_VERSION, unit: null },
    ];
  } catch {
    return [];
  }
}

function requireBlocks(...blockKeys: string[]) {
  return async (req: CapacitySourceRequest, res: Response, next: NextFunction) => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);

      const professor = await prisma.professor.findFirst({
        where: { id: professorId, contractId },
        include: { collaboratorFunction: true },
      });
      if (!professor) return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);

      for (const blockKey of blockKeys) {
        if (!(await canProfessorAccessBlock(professor, blockKey))) {
          return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
        }
      }

      req.capacitySourceActor = { contractId, professorId };
      return next();
    } catch (error) {
      console.error('Erro ao validar fontes da prescrição por capacidade:', error);
      return sendError(res, 'Erro ao verificar permissão', 500);
    }
  };
}

async function assessmentProfessorId(
  contractId: string,
  performedByProfessorId: string | null,
  recordedByUserId: string | null
) {
  if (performedByProfessorId) return performedByProfessorId;
  if (!recordedByUserId) return null;
  return (
    (
      await prisma.professor.findFirst({
        where: { contractId, userId: recordedByUserId },
        select: { id: true },
      })
    )?.id ?? null
  );
}

async function canonicalizeCapacitySource(
  contractId: string,
  alunoId: string,
  actorProfessorId: string,
  source: CapacityPrescriptionSourceRef
): Promise<CapacityPrescriptionSourceRef> {
  if (source.type === 'anthropometry') {
    const assessment = await prisma.anthropometryAssessment.findFirst({
      where: { id: source.id, contractId, alunoId },
      select: {
        id: true,
        code: true,
        assessmentDate: true,
        updatedAt: true,
        professorId: true,
      },
    });
    if (!assessment) return source;
    return {
      type: 'anthropometry',
      id: assessment.id,
      label: `Antropometria ${assessment.code}`,
      assessedAt: assessment.assessmentDate.toISOString(),
      origin: assessment.code,
      version: assessment.updatedAt.toISOString(),
      responsibleProfessorId: assessment.professorId,
    };
  }

  if (assessmentSourceTypes.includes(source.type)) {
    const record = await prisma.studentAssessmentRecord.findFirst({
      where: { id: source.id, contractId, alunoId },
      select: {
        id: true,
        assessmentCategory: true,
        title: true,
        performedAt: true,
        sourceReference: true,
        sourceType: true,
        updatedAt: true,
        performedByProfessorId: true,
        recordedByUserId: true,
      },
    });
    if (!record) return source;
    return {
      type: mapAssessmentSourceType(record.assessmentCategory),
      id: record.id,
      label: record.title || `Avaliação ${record.assessmentCategory}`,
      assessedAt: record.performedAt.toISOString(),
      origin: record.sourceReference || record.sourceType || record.assessmentCategory,
      version: record.updatedAt.toISOString(),
      responsibleProfessorId: await assessmentProfessorId(
        contractId,
        record.performedByProfessorId,
        record.recordedByUserId
      ),
    };
  }

  if (source.type === 'professor_note') {
    const activity = await prisma.prontuarioActivityHistory.findFirst({
      where: { id: source.id, record: { contractId, alunoId } },
      select: {
        id: true,
        description: true,
        startedAt: true,
        createdAt: true,
        updatedAt: true,
        record: { select: { professorId: true } },
      },
    });
    if (activity) {
      return {
        type: 'professor_note',
        id: activity.id,
        label: `Histórico de atividade física: ${activity.description}`,
        assessedAt: (activity.startedAt ?? activity.createdAt).toISOString(),
        origin: 'PRNT - histórico de atividade física',
        version: activity.updatedAt.toISOString(),
        responsibleProfessorId: activity.record.professorId ?? actorProfessorId,
      };
    }

    return {
      type: 'professor_note',
      id: source.id,
      label: source.label,
      assessedAt: null,
      origin: 'Anotação técnica do professor',
      version: null,
      responsibleProfessorId: actorProfessorId,
    };
  }

  return source;
}

router.post(
  '/alunos/:alunoId',
  authMiddleware,
  professorMiddleware,
  requireBlocks('plans.capacityPrescriptions.manage'),
  async (req: CapacitySourceRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.capacitySourceActor!;
      const body = req.body as Record<string, unknown>;
      const sourceRefs = Array.isArray(body.sourceRefs)
        ? (body.sourceRefs as CapacityPrescriptionSourceRef[])
        : [];

      body.sourceRefs = await Promise.all(
        sourceRefs.map((source) =>
          canonicalizeCapacitySource(
            actor.contractId,
            req.params.alunoId,
            actor.professorId,
            source
          )
        )
      );
      body.alerts = mergeCapacityAlerts(
        Array.isArray(body.alerts) ? body.alerts : [],
        deriveCapacityAlerts(body.sourceRefs as CapacityPrescriptionSourceRef[])
      );

      const parameterSetIds = Array.isArray(body.parameterSetIds)
        ? body.parameterSetIds.filter(
            (id): id is string => typeof id === 'string' && Boolean(id.trim())
          )
        : [];

      if (parameterSetIds.length > 1) {
        return sendError(res, 'Selecione no máximo um conjunto versionado por capacidade', 400);
      }

      if (parameterSetIds.length === 0) {
        if (body.methodologyVersion) {
          return sendError(
            res,
            'Versão de metodologia só pode ser informada com um conjunto versionado',
            400
          );
        }
        return next();
      }

      if (typeof body.capacity !== 'string') return next();
      const parameterSet = await prisma.capacityPrescriptionParameterSet.findFirst({
        where: {
          id: parameterSetIds[0],
          contractId: actor.contractId,
          capacity: body.capacity,
        },
        select: { methodologyVersion: true },
      });

      // Conjunto inexistente, de outra capacidade ou de outro tenant segue para o
      // serviço, que devolve a resposta pública canônica sem ser mascarada pela
      // regra de exclusividade entre conjunto válido e configuração manual.
      if (!parameterSet) return next();

      if (body.parameters !== undefined && body.parameters !== null) {
        return sendError(
          res,
          'Conjunto versionado e parâmetros manuais não podem ser enviados na mesma versão',
          400
        );
      }

      body.methodologyVersion = parameterSet.methodologyVersion;
      return next();
    } catch (error) {
      console.error('Erro ao normalizar fontes da prescrição:', error);
      return sendError(res, 'Erro ao validar fontes técnicas', 500);
    }
  }
);

router.get(
  '/alunos/:alunoId/assessment-sources',
  authMiddleware,
  professorMiddleware,
  requireBlocks('plans.capacityPrescriptions.view', 'students.details.assessments'),
  async (req: CapacitySourceRequest, res: Response) => {
    try {
      const actor = req.capacitySourceActor!;
      const aluno = await prisma.aluno.findFirst({
        where: { id: req.params.alunoId, contractId: actor.contractId },
        select: { id: true },
      });
      if (!aluno) return sendError(res, 'Recurso não encontrado', 404);

      const [records, anthropometries] = await Promise.all([
        prisma.studentAssessmentRecord.findMany({
          where: {
            contractId: actor.contractId,
            alunoId: aluno.id,
            status: { not: 'archived' },
          },
          orderBy: { performedAt: 'desc' },
          include: {
            measurements: {
              orderBy: { sortOrder: 'asc' },
              select: {
                metricKey: true,
                metricLabel: true,
                valueType: true,
                valueText: true,
                valueNumber: true,
                valueBoolean: true,
                unit: true,
              },
            },
          },
        }),
        prisma.anthropometryAssessment.findMany({
          where: { contractId: actor.contractId, alunoId: aluno.id },
          orderBy: { assessmentDate: 'desc' },
          include: {
            values: {
              orderBy: { createdAt: 'asc' },
              include: { segment: { select: { name: true } } },
            },
          },
        }),
      ]);

      const recordedByUserIds = Array.from(
        new Set(
          records.map((record) => record.recordedByUserId).filter((id): id is string => Boolean(id))
        )
      );
      const professorByUserId = new Map(
        (
          await prisma.professor.findMany({
            where: { contractId: actor.contractId, userId: { in: recordedByUserIds } },
            select: { id: true, userId: true },
          })
        ).map((professor) => [professor.userId, professor.id])
      );

      const segmentedSources = records.map((record) => ({
        ref: {
          type: mapAssessmentSourceType(record.assessmentCategory),
          id: record.id,
          label: record.title || `Avaliação ${record.assessmentCategory}`,
          assessedAt: record.performedAt.toISOString(),
          origin: record.sourceReference || record.sourceType,
          version: record.updatedAt.toISOString(),
          responsibleProfessorId:
            record.performedByProfessorId ||
            (record.recordedByUserId ? professorByUserId.get(record.recordedByUserId) : null) ||
            null,
        } satisfies CapacityPrescriptionSourceRef,
        category: record.assessmentCategory,
        status: record.status,
        details: [
          ...record.measurements.map((measurement) => ({
            label: measurement.metricLabel || measurement.metricKey,
            value:
              measurement.valueType === 'number'
                ? decimalToNumber(measurement.valueNumber)
                : measurement.valueType === 'boolean'
                  ? measurement.valueBoolean
                  : measurement.valueText,
            unit: measurement.unit,
          })),
          ...derivedAdipometryDetails(record.assessmentCategory, record.measurements),
        ],
      }));

      const anthropometrySources = anthropometries.map((assessment) => ({
        ref: {
          type: 'anthropometry' as const,
          id: assessment.id,
          label: `Antropometria ${assessment.code}`,
          assessedAt: assessment.assessmentDate.toISOString(),
          origin: assessment.code,
          version: assessment.updatedAt.toISOString(),
          responsibleProfessorId: assessment.professorId,
        } satisfies CapacityPrescriptionSourceRef,
        category: 'anthropometry',
        status: 'completed',
        details: assessment.values.map((value) => ({
          label: value.segment.name,
          value: value.value,
          unit: value.unit,
        })),
      }));

      return sendSuccess(
        res,
        [...anthropometrySources, ...segmentedSources],
        'Fontes de avaliação carregadas'
      );
    } catch (error) {
      console.error('Erro ao carregar fontes de avaliação:', error);
      return sendError(res, 'Erro ao carregar fontes de avaliação', 500);
    }
  }
);

export default router;
