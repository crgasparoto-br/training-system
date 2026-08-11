import { Prisma, PrismaClient } from '@prisma/client';
import type {
  CapacityPrescriptionParameters,
  OperationalExerciseSnapshot,
  TechnicalExerciseOperationalMapping,
} from '@corrida/types';
import { CapacityPrescriptionDomainError } from './capacity-prescription.service.js';

const prisma = new PrismaClient();
const MAPPING_METADATA_KEY = 'operationalExerciseMapping';

export interface CapacityExerciseMappingContext {
  contractId: string;
  actorProfessorId: string;
}

interface PersistedMappingMetadata {
  exerciseLibraryId: string;
  exerciseSnapshot: OperationalExerciseSnapshot;
  mappingRevision: number;
  mappedAt: string;
  mappedByProfessorId: string;
  origin: 'capacity_technical_catalog';
}

function invalid(message: string): never {
  throw new CapacityPrescriptionDomainError('INVALID_INPUT', message);
}

function conflict(message: string): never {
  throw new CapacityPrescriptionDomainError('CONFLICT', message);
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...(value as Record<string, unknown>) };
}

function exerciseSnapshot(exercise: {
  id: string;
  name: string;
  videoUrl: string | null;
  loadType: string | null;
  movementType: string | null;
  countingType: string | null;
  category: string | null;
  muscleGroup: string | null;
  notes: string | null;
  updatedAt: Date;
}): OperationalExerciseSnapshot {
  return {
    id: exercise.id,
    name: exercise.name,
    videoUrl: exercise.videoUrl,
    loadType: exercise.loadType,
    movementType: exercise.movementType,
    countingType: exercise.countingType,
    category: exercise.category,
    muscleGroup: exercise.muscleGroup,
    notes: exercise.notes,
    updatedAt: exercise.updatedAt.toISOString(),
  };
}

export function readPersistedExerciseMapping(metadata: unknown): PersistedMappingMetadata | null {
  const root = jsonObject(metadata);
  const candidate = jsonObject(root[MAPPING_METADATA_KEY]);
  if (
    typeof candidate.exerciseLibraryId !== 'string' ||
    typeof candidate.mappingRevision !== 'number' ||
    typeof candidate.mappedAt !== 'string' ||
    typeof candidate.mappedByProfessorId !== 'string'
  ) {
    return null;
  }
  const snapshot = jsonObject(candidate.exerciseSnapshot);
  if (typeof snapshot.id !== 'string' || typeof snapshot.name !== 'string') return null;
  return candidate as unknown as PersistedMappingMetadata;
}

export function mergePersistedExerciseMapping(
  metadata: unknown,
  mapping: PersistedMappingMetadata
): Record<string, unknown> {
  return {
    ...jsonObject(metadata),
    [MAPPING_METADATA_KEY]: mapping,
  };
}

export async function validateResistedTechnicalExerciseRefs(
  contractId: string,
  parameters: CapacityPrescriptionParameters | null | undefined,
  client: PrismaClient = prisma
) {
  if (!parameters || parameters.type !== 'resisted') return;
  const ids = parameters.resisted.exerciseTechnicalCatalogItemIds ?? [];
  if (!ids.length) return;
  if (ids.some((id) => !id.trim()) || new Set(ids).size !== ids.length) {
    invalid('As referências técnicas de exercícios devem usar IDs únicos e válidos');
  }

  const items = await client.capacityTechnicalCatalogItem.findMany({
    where: {
      id: { in: ids },
      contractId,
      category: 'exercise',
      isCurrent: true,
    },
    select: { id: true },
  });
  if (items.length !== ids.length) {
    invalid('Uma ou mais referências técnicas de exercícios são inválidas para este contrato');
  }
}

export function createCapacityExerciseMappingService(client: PrismaClient = prisma) {
  return {
    async setMapping(
      context: CapacityExerciseMappingContext,
      technicalCatalogItemId: string,
      exerciseLibraryId: string,
      expectedMappingRevision: number,
      now = new Date()
    ): Promise<TechnicalExerciseOperationalMapping> {
      if (!technicalCatalogItemId.trim() || !exerciseLibraryId.trim()) {
        invalid('Os identificadores técnico e operacional são obrigatórios');
      }
      if (!Number.isInteger(expectedMappingRevision) || expectedMappingRevision < 0) {
        invalid('A revisão esperada do mapeamento deve ser um inteiro não negativo');
      }

      try {
        return await client.$transaction(
          async (tx) => {
            const professor = await tx.professor.findFirst({
              where: { id: context.actorProfessorId, contractId: context.contractId },
              select: { id: true },
            });
            if (!professor) invalid('Professor responsável pelo mapeamento não pertence ao contrato');

            const technical = await tx.capacityTechnicalCatalogItem.findFirst({
              where: {
                id: technicalCatalogItemId,
                contractId: context.contractId,
                category: 'exercise',
                isCurrent: true,
              },
            });
            if (!technical) invalid('Item técnico de exercício inexistente, histórico ou fora do contrato');

            const exercise = await tx.exerciseLibrary.findFirst({
              where: { id: exerciseLibraryId, contractId: context.contractId },
            });
            if (!exercise) invalid('Exercício operacional inexistente ou fora do contrato');

            const currentMapping = readPersistedExerciseMapping(technical.metadata);
            const currentRevision = currentMapping?.mappingRevision ?? 0;
            if (currentRevision !== expectedMappingRevision) {
              conflict('O mapeamento técnico foi alterado por outra operação; recarregue antes de salvar');
            }

            const mappedAt = now.toISOString();
            const nextMapping: PersistedMappingMetadata = {
              exerciseLibraryId: exercise.id,
              exerciseSnapshot: exerciseSnapshot(exercise),
              mappingRevision: currentRevision + 1,
              mappedAt,
              mappedByProfessorId: context.actorProfessorId,
              origin: 'capacity_technical_catalog',
            };
            await tx.capacityTechnicalCatalogItem.update({
              where: { id: technical.id },
              data: {
                metadata: mergePersistedExerciseMapping(
                  technical.metadata,
                  nextMapping
                ) as Prisma.InputJsonValue,
              },
            });

            return {
              technicalCatalogItemId: technical.id,
              technicalSnapshot: {
                id: technical.id,
                code: technical.code,
                name: technical.name,
                version: technical.version,
              },
              exerciseLibraryId: exercise.id,
              operationalExerciseSnapshot: nextMapping.exerciseSnapshot,
              mappingRevision: nextMapping.mappingRevision,
              mappedAt,
              mappedByProfessorId: context.actorProfessorId,
              currentExerciseAvailable: true,
              curationStatus: 'not_modeled',
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
      } catch (error) {
        if (error instanceof CapacityPrescriptionDomainError) throw error;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          conflict('O mapeamento técnico foi alterado concorrentemente; recarregue antes de salvar');
        }
        throw error;
      }
    },

    async resolveMapping(
      contractId: string,
      technicalCatalogItemId: string
    ): Promise<TechnicalExerciseOperationalMapping | null> {
      const technical = await client.capacityTechnicalCatalogItem.findFirst({
        where: { id: technicalCatalogItemId, contractId, category: 'exercise' },
      });
      if (!technical) return null;
      const mapping = readPersistedExerciseMapping(technical.metadata);
      const liveExercise = mapping
        ? await client.exerciseLibrary.findFirst({
            where: { id: mapping.exerciseLibraryId, contractId },
          })
        : null;
      return {
        technicalCatalogItemId: technical.id,
        technicalSnapshot: {
          id: technical.id,
          code: technical.code,
          name: technical.name,
          version: technical.version,
        },
        exerciseLibraryId: mapping?.exerciseLibraryId ?? null,
        operationalExerciseSnapshot: mapping?.exerciseSnapshot ?? null,
        mappingRevision: mapping?.mappingRevision ?? 0,
        mappedAt: mapping?.mappedAt ?? null,
        mappedByProfessorId: mapping?.mappedByProfessorId ?? null,
        currentExerciseAvailable: Boolean(liveExercise),
        curationStatus: 'not_modeled',
      };
    },
  };
}

export const capacityExerciseMappingService = createCapacityExerciseMappingService();
