import { Prisma, PrismaClient } from '@prisma/client';
import { CapacityPrescriptionDomainError } from './capacity-prescription.service.js';

const prisma = new PrismaClient();

export interface CapacityResistedTechnicalExerciseVersionContext {
  contractId: string;
  actorProfessorId: string;
  alunoId: string;
}

function invalid(message: string): never {
  throw new CapacityPrescriptionDomainError('INVALID_INPUT', message);
}

function conflict(message: string): never {
  throw new CapacityPrescriptionDomainError('CONFLICT', message);
}

function notFound(): never {
  throw new CapacityPrescriptionDomainError('NOT_FOUND', 'Recurso não encontrado');
}

function prismaErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function resistedParameters(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const parameters = value as Record<string, unknown>;
  if (parameters.type !== 'resisted') return null;
  const resisted = parameters.resisted;
  if (!resisted || typeof resisted !== 'object' || Array.isArray(resisted)) return null;
  return {
    ...parameters,
    resisted: { ...(resisted as Record<string, unknown>) },
  };
}

export function createCapacityResistedTechnicalExerciseVersionService(
  client: PrismaClient = prisma
) {
  return {
    async versionTechnicalExercises(
      context: CapacityResistedTechnicalExerciseVersionContext,
      prescriptionId: string,
      expectedCurrentVersion: number,
      technicalCatalogItemIds: string[],
      now = new Date()
    ) {
      if (!prescriptionId.trim()) notFound();
      if (!Number.isInteger(expectedCurrentVersion) || expectedCurrentVersion < 0) {
        invalid('Versão atual esperada deve ser um número inteiro não negativo');
      }
      const normalizedTechnicalIds = technicalCatalogItemIds.map((id) => id.trim());
      if (
        !normalizedTechnicalIds.length ||
        normalizedTechnicalIds.some((id) => !id) ||
        new Set(normalizedTechnicalIds).size !== normalizedTechnicalIds.length
      ) {
        invalid('As referências técnicas de exercícios devem usar IDs únicos e válidos');
      }

      try {
        return await client.$transaction(
          async (tx) => {
            const actor = await tx.professor.findFirst({
              where: { id: context.actorProfessorId, contractId: context.contractId },
              select: { id: true },
            });
            if (!actor) notFound();

            const prescription = await tx.capacityPrescription.findFirst({
              where: {
                id: prescriptionId,
                contractId: context.contractId,
                alunoId: context.alunoId,
                capacity: 'resisted',
              },
            });
            if (!prescription) notFound();
            if (prescription.currentVersion !== expectedCurrentVersion) {
              conflict('A prescrição foi alterada; recarregue antes de continuar');
            }

            const previous = await tx.capacityPrescriptionVersion.findFirst({
              where: {
                prescriptionId: prescription.id,
                contractId: context.contractId,
                alunoId: context.alunoId,
                capacity: 'resisted',
                version: prescription.currentVersion,
              },
              include: {
                sources: { orderBy: { createdAt: 'asc' } },
                alerts: { orderBy: { createdAt: 'asc' } },
                goals: { orderBy: { createdAt: 'asc' } },
              },
            });
            if (!previous) notFound();

            const parameters = resistedParameters(previous.parameters);
            if (!parameters) {
              invalid('A prescrição resistida não possui parâmetros estruturados');
            }

            const technicalExercises = await tx.capacityTechnicalCatalogItem.findMany({
              where: {
                id: { in: normalizedTechnicalIds },
                contractId: context.contractId,
                category: 'exercise',
                isCurrent: true,
              },
              select: { id: true },
            });
            if (technicalExercises.length !== normalizedTechnicalIds.length) {
              invalid('Uma ou mais referências técnicas de exercícios são inválidas para este contrato');
            }

            const nextParameters = {
              ...parameters,
              resisted: {
                ...(parameters.resisted as Record<string, unknown>),
                exerciseTechnicalCatalogItemIds: normalizedTechnicalIds,
              },
            };
            const nextVersion = prescription.currentVersion + 1;
            const updateResult = await tx.capacityPrescription.updateMany({
              where: { id: prescription.id, currentVersion: prescription.currentVersion },
              data: {
                currentVersion: { increment: 1 },
                updatedByProfessorId: context.actorProfessorId,
                publishesTodayWorkout: false,
              },
            });
            if (updateResult.count !== 1) {
              conflict('A prescrição foi alterada por outro usuário');
            }

            const parameterSetIds = Array.isArray(previous.parameterSetIds)
              ? previous.parameterSetIds
              : [];
            const version = await tx.capacityPrescriptionVersion.create({
              data: {
                prescriptionId: prescription.id,
                contractId: context.contractId,
                alunoId: context.alunoId,
                responsibleProfessorId: previous.responsibleProfessorId,
                capacity: 'resisted',
                status: previous.status,
                version: nextVersion,
                technicalJustification: previous.technicalJustification,
                professorSummary: previous.professorSummary,
                studentMessage: previous.studentMessage,
                methodologyVersion: previous.methodologyVersion,
                parameterSetIds,
                parameters: nextParameters as Prisma.InputJsonValue,
                publishesTodayWorkout: false,
                createdAt: now,
                sources: {
                  create: previous.sources.map((source) => ({
                    sourceType: source.sourceType,
                    sourceId: source.sourceId,
                    label: source.label,
                    assessedAt: source.assessedAt,
                    origin: source.origin,
                    sourceVersion: source.sourceVersion,
                    responsibleProfessorId: source.responsibleProfessorId,
                  })),
                },
                alerts: {
                  create: previous.alerts.map((alert) => ({
                    code: alert.code,
                    message: alert.message,
                    severity: alert.severity,
                    sourceRefId: alert.sourceRefId,
                  })),
                },
                goals: {
                  create: previous.goals.map((goal) => ({ goalId: goal.goalId })),
                },
              },
              include: {
                sources: { orderBy: { createdAt: 'asc' } },
                alerts: { orderBy: { createdAt: 'asc' } },
                goals: { orderBy: { createdAt: 'asc' } },
              },
            });
            const updatedPrescription = await tx.capacityPrescription.findUniqueOrThrow({
              where: { id: prescription.id },
            });
            return { ...updatedPrescription, latestVersion: version };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (error instanceof CapacityPrescriptionDomainError) throw error;
        if (prismaErrorCode(error) === 'P2034') {
          conflict('A prescrição foi alterada concorrentemente; recarregue antes de continuar');
        }
        throw error;
      }
    },
  };
}

export const capacityResistedTechnicalExerciseVersionService =
  createCapacityResistedTechnicalExerciseVersionService();
