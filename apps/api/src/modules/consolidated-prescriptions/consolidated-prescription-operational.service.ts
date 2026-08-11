import { PrismaClient } from '@prisma/client';
import type {
  CapacityPrescriptionParameters,
  ConsolidatedExerciseSubstitutionResult,
  ConsolidatedOperationalProjection,
  ConsolidatedOperationalProjectionItem,
  ConsolidatedPrescriptionDataRef,
  ConsolidatedPrescriptionDataRefInput,
  CreateConsolidatedExerciseSubstitutionCommand,
  OperationalExerciseSnapshot,
  PrepareConsolidatedOperationalProjectionCommand,
  PrepareConsolidatedOperationalProjectionResult,
  SetTechnicalExerciseOperationalMappingCommand,
  TechnicalExerciseOperationalMapping,
} from '@corrida/types';
import { capacityExerciseMappingService } from '../capacity-prescriptions/capacity-exercise-mapping.service.js';
import {
  ConsolidatedPrescriptionDomainError,
  consolidatedPrescriptionService,
  type ConsolidatedPrescriptionContext,
} from './consolidated-prescription.service.js';

const prisma = new PrismaClient();

export const CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN =
  'consolidated_operational_projection_v1';
export const CONSOLIDATED_EXERCISE_SUBSTITUTION_ORIGIN =
  'consolidated_exercise_substitution_v1';

const RESERVED_OPERATIONAL_ORIGINS = new Set([
  CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN,
  CONSOLIDATED_EXERCISE_SUBSTITUTION_ORIGIN,
]);

type CapacityVersionRow = {
  id: string;
  capacity: string;
  parameters: unknown;
};

type SubstitutionSnapshot = {
  originalTechnicalCatalogItemId: string;
  originalExerciseLibraryId: string;
  substituteExerciseLibraryId: string;
  substituteExerciseSnapshot: OperationalExerciseSnapshot;
  recordedAt: string;
  recordedByProfessorId: string;
};

function invalid(message: string): never {
  throw new ConsolidatedPrescriptionDomainError('INVALID_INPUT', message);
}

function notFound(): never {
  throw new ConsolidatedPrescriptionDomainError('NOT_FOUND', 'Recurso não encontrado');
}

function conflict(expected: number, actual: number): never {
  throw new ConsolidatedPrescriptionDomainError(
    'CONFLICT',
    'A montagem foi alterada por outra operação; recarregue antes de continuar',
    { expectedCurrentVersion: expected, actualCurrentVersion: actual }
  );
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asParameters(value: unknown): CapacityPrescriptionParameters | null {
  const candidate = record(value);
  const type = candidate.type;
  if (!['resisted', 'cyclic', 'flexibility', 'balance'].includes(String(type))) return null;
  return candidate as unknown as CapacityPrescriptionParameters;
}

function parseIntegerText(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d+(?:\.\d+)?)\s*(?:min|mins|minuto|minutos)?$/i.exec(value.trim());
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function parseKilometers(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d+(?:\.\d+)?)\s*(?:km|quilometro|quilometros|quilômetro|quilômetros)?$/i.exec(
    value.trim()
  );
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

export function isReservedOperationalDataRef(
  ref: Pick<ConsolidatedPrescriptionDataRef, 'sourceType' | 'origin'> | ConsolidatedPrescriptionDataRefInput
) {
  return (
    ref.sourceType === 'manual_observation' &&
    typeof ref.origin === 'string' &&
    RESERVED_OPERATIONAL_ORIGINS.has(ref.origin)
  );
}

function toDataRefInput(ref: ConsolidatedPrescriptionDataRef): ConsolidatedPrescriptionDataRefInput {
  return {
    role: 'manual_observation',
    sourceType: 'manual_observation',
    sourceId: ref.sourceId,
    label: ref.label ?? null,
    assessedAt: ref.assessedAt ?? null,
    origin: ref.origin ?? null,
    sourceVersion: ref.sourceVersion ?? null,
    responsibleProfessorId: ref.responsibleProfessorId ?? null,
    context: ref.context ?? null,
  };
}

export async function mergeServerOwnedOperationalRefs<T extends { dataRefs?: ConsolidatedPrescriptionDataRefInput[] }>(
  context: ConsolidatedPrescriptionContext,
  payload: T
): Promise<T> {
  const incoming = (payload.dataRefs ?? []).filter((ref) => !isReservedOperationalDataRef(ref));
  const current = await consolidatedPrescriptionService.getCurrent(context);
  const internal = (current?.latestVersion.dataRefs ?? [])
    .filter(isReservedOperationalDataRef)
    .map(toDataRefInput);
  return { ...payload, dataRefs: [...incoming, ...internal] };
}

function substitutionSnapshots(dataRefs: ConsolidatedPrescriptionDataRef[]) {
  const byTechnicalItem = new Map<string, SubstitutionSnapshot>();
  for (const ref of dataRefs) {
    if (ref.origin !== CONSOLIDATED_EXERCISE_SUBSTITUTION_ORIGIN) continue;
    const context = record(ref.context);
    if (context.kind !== 'exercise_substitution_v1') continue;
    if (
      typeof context.originalTechnicalCatalogItemId !== 'string' ||
      typeof context.originalExerciseLibraryId !== 'string' ||
      typeof context.substituteExerciseLibraryId !== 'string' ||
      typeof context.recordedAt !== 'string' ||
      typeof context.recordedByProfessorId !== 'string'
    ) {
      continue;
    }
    const substitute = record(context.substituteExerciseSnapshot);
    if (typeof substitute.id !== 'string' || typeof substitute.name !== 'string') continue;
    const candidate: SubstitutionSnapshot = {
      originalTechnicalCatalogItemId: context.originalTechnicalCatalogItemId,
      originalExerciseLibraryId: context.originalExerciseLibraryId,
      substituteExerciseLibraryId: context.substituteExerciseLibraryId,
      substituteExerciseSnapshot: substitute as unknown as OperationalExerciseSnapshot,
      recordedAt: context.recordedAt,
      recordedByProfessorId: context.recordedByProfessorId,
    };
    const previous = byTechnicalItem.get(candidate.originalTechnicalCatalogItemId);
    if (!previous || previous.recordedAt < candidate.recordedAt) {
      byTechnicalItem.set(candidate.originalTechnicalCatalogItemId, candidate);
    }
  }
  return byTechnicalItem;
}

export function buildOperationalProjectionItems(
  capacityVersions: CapacityVersionRow[],
  mappings: Map<string, TechnicalExerciseOperationalMapping | null>,
  substitutions: Map<string, SubstitutionSnapshot> = new Map()
): ConsolidatedOperationalProjectionItem[] {
  const items: ConsolidatedOperationalProjectionItem[] = [];

  for (const version of capacityVersions) {
    const parameters = asParameters(version.parameters);
    if (!parameters) {
      items.push({
        key: `${version.id}:parameters`,
        capacity: version.capacity as ConsolidatedOperationalProjectionItem['capacity'],
        capacityPrescriptionVersionId: version.id,
        target: 'none',
        compatibility: 'incompatible',
        incompatibilityCode: 'capacity_parameters_unavailable',
        incompatibilityMessage: 'A versão da capacidade não possui parâmetros estruturados compatíveis.',
        proposedFields: {},
        unsupportedParameters: ['parameters'],
        sourceParameters: null,
      });
      continue;
    }

    if (parameters.type === 'resisted') {
      const resisted = parameters.resisted;
      const technicalIds = resisted.exerciseTechnicalCatalogItemIds ?? [];
      if (!technicalIds.length) {
        items.push({
          key: `${version.id}:resisted`,
          capacity: 'resisted',
          capacityPrescriptionVersionId: version.id,
          target: 'WorkoutExercise',
          compatibility: 'incompatible',
          incompatibilityCode: 'technical_exercise_reference_missing',
          incompatibilityMessage: 'A capacidade resistida não referencia exercício técnico por ID.',
          proposedFields: {},
          unsupportedParameters: ['exerciseTechnicalCatalogItemIds'],
          sourceParameters: resisted as unknown as Record<string, unknown>,
        });
        continue;
      }

      for (const technicalId of technicalIds) {
        const mapping = mappings.get(technicalId) ?? null;
        const substitution = substitutions.get(technicalId);
        const unsupported: string[] = [];
        const workoutTemplate: Record<string, unknown> = {};
        const workoutExercise: Record<string, unknown> = {};

        if (resisted.method) workoutTemplate.trainingMethod = resisted.method;
        if (resisted.split) workoutTemplate.trainingDivision = resisted.split;
        if (typeof resisted.sets === 'number') workoutExercise.sets = resisted.sets;
        const reps = parseIntegerText(resisted.repetitions);
        if (reps !== null) workoutExercise.reps = reps;
        else if (resisted.repetitions) unsupported.push('repetitions');
        const repReserve = parseIntegerText(resisted.repetitionReserve);
        if (repReserve !== null) workoutTemplate.repReserve = repReserve;
        else if (resisted.repetitionReserve) unsupported.push('repetitionReserve');
        if (resisted.load) unsupported.push('load');
        if (resisted.expectedPse !== null && resisted.expectedPse !== undefined) unsupported.push('expectedPse');
        if (resisted.muscleGroups?.length) unsupported.push('muscleGroups');
        if (resisted.restrictions?.length) unsupported.push('restrictions');

        const effectiveExerciseId = substitution?.substituteExerciseLibraryId ?? mapping?.exerciseLibraryId ?? null;
        const operationalSnapshot =
          substitution?.substituteExerciseSnapshot ?? mapping?.operationalExerciseSnapshot ?? null;
        const available = substitution ? true : Boolean(mapping?.currentExerciseAvailable);
        const incompatibilityCode = !mapping
          ? 'technical_exercise_unavailable'
          : !mapping.exerciseLibraryId
            ? 'exercise_mapping_missing'
            : !available
              ? 'operational_exercise_unavailable'
              : null;

        items.push({
          key: `${version.id}:${technicalId}`,
          capacity: 'resisted',
          capacityPrescriptionVersionId: version.id,
          target: 'WorkoutExercise',
          compatibility: incompatibilityCode ? 'incompatible' : 'mapped',
          incompatibilityCode,
          incompatibilityMessage:
            incompatibilityCode === 'technical_exercise_unavailable'
              ? 'O item técnico referenciado não está disponível neste contrato.'
              : incompatibilityCode === 'exercise_mapping_missing'
                ? 'O item técnico não possui vínculo explícito com a biblioteca operacional.'
                : incompatibilityCode === 'operational_exercise_unavailable'
                  ? 'O exercício operacional vinculado foi removido ou ficou inacessível.'
                  : null,
          technicalCatalogItemId: technicalId,
          mappingRevision: mapping?.mappingRevision ?? 0,
          mappedExerciseLibraryId: mapping?.exerciseLibraryId ?? null,
          effectiveExerciseLibraryId: effectiveExerciseId,
          substituted: Boolean(substitution),
          technicalSnapshot: mapping?.technicalSnapshot ?? null,
          operationalExerciseSnapshot: operationalSnapshot,
          proposedFields: {
            ...(Object.keys(workoutTemplate).length ? { WorkoutTemplate: workoutTemplate } : {}),
            ...(Object.keys(workoutExercise).length ? { WorkoutExercise: workoutExercise } : {}),
          },
          unsupportedParameters: unsupported,
          sourceParameters: resisted as unknown as Record<string, unknown>,
        });
      }
      continue;
    }

    if (parameters.type === 'cyclic') {
      const cyclic = parameters.cyclic;
      const workoutDay: Record<string, unknown> = {};
      const workoutTemplate: Record<string, unknown> = {};
      const unsupported: string[] = [];
      if (cyclic.category) workoutDay.method = cyclic.category;
      if (typeof cyclic.vo2MaxPercentage === 'number') workoutDay.vo2maxPct = cyclic.vo2MaxPercentage;
      const minutes = parseMinutes(cyclic.time);
      if (minutes !== null) workoutDay.stimulusDurationMin = minutes;
      else if (cyclic.time) unsupported.push('time');
      const kilometers = parseKilometers(cyclic.distance);
      if (kilometers !== null) workoutTemplate.totalVolumeKm = kilometers;
      else if (cyclic.distance) unsupported.push('distance');
      if (cyclic.reversibilityPrinciple) unsupported.push('reversibilityPrinciple');
      if (cyclic.zoneBasis) unsupported.push('zoneBasis');
      if (cyclic.zones?.length) unsupported.push('zones');
      if (cyclic.anaerobicThreshold) unsupported.push('anaerobicThreshold');
      if (cyclic.expectedPse !== null && cyclic.expectedPse !== undefined) unsupported.push('expectedPse');

      const hasSupported = Object.keys(workoutDay).length > 0 || Object.keys(workoutTemplate).length > 0;
      items.push({
        key: `${version.id}:cyclic`,
        capacity: 'cyclic',
        capacityPrescriptionVersionId: version.id,
        target: 'WorkoutDay',
        compatibility: hasSupported ? 'mapped' : 'incompatible',
        incompatibilityCode: hasSupported ? null : 'cyclic_operational_fields_unavailable',
        incompatibilityMessage: hasSupported
          ? null
          : 'Nenhum parâmetro cíclico possui representação operacional explícita nesta versão.',
        proposedFields: {
          ...(Object.keys(workoutTemplate).length ? { WorkoutTemplate: workoutTemplate } : {}),
          ...(Object.keys(workoutDay).length ? { WorkoutDay: workoutDay } : {}),
        },
        unsupportedParameters: unsupported,
        sourceParameters: cyclic as unknown as Record<string, unknown>,
      });
      continue;
    }

    const sourceParameters =
      parameters.type === 'flexibility' ? parameters.flexibility : parameters.balance;
    items.push({
      key: `${version.id}:${parameters.type}`,
      capacity: parameters.type,
      capacityPrescriptionVersionId: version.id,
      target: 'none',
      compatibility: 'incompatible',
      incompatibilityCode: 'operational_representation_unavailable',
      incompatibilityMessage:
        'A estrutura operacional atual não representa esta capacidade sem perder semântica técnica.',
      proposedFields: {},
      unsupportedParameters: Object.keys(sourceParameters),
      sourceParameters: sourceParameters as unknown as Record<string, unknown>,
    });
  }

  return items;
}

function projectionRefContext(ref: ConsolidatedPrescriptionDataRef) {
  if (ref.origin !== CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN) return null;
  const context = record(ref.context);
  return context.kind === 'operational_projection_v1' ? context : null;
}

function currentPreparedVersion(dataRefs: ConsolidatedPrescriptionDataRef[]) {
  let version: number | null = null;
  for (const ref of dataRefs) {
    const context = projectionRefContext(ref);
    if (!context || typeof context.preparedForAssemblyVersion !== 'number') continue;
    version = Math.max(version ?? 0, context.preparedForAssemblyVersion);
  }
  return version;
}

async function loadCapacityVersions(
  context: ConsolidatedPrescriptionContext,
  ids: string[],
  client: PrismaClient
): Promise<CapacityVersionRow[]> {
  const versions = await client.capacityPrescriptionVersion.findMany({
    where: { id: { in: ids }, contractId: context.contractId, alunoId: context.alunoId },
    select: { id: true, capacity: true, parameters: true },
  });
  const byId = new Map(versions.map((version) => [version.id, version]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as CapacityVersionRow[];
}

function cloneAdditionalRefs(dataRefs: ConsolidatedPrescriptionDataRef[], replaceProjection = false) {
  return dataRefs
    .filter((ref) => ref.role !== 'capacity_source')
    .filter((ref) => !(replaceProjection && ref.origin === CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN))
    .map(toDataRefInput);
}

export function createConsolidatedPrescriptionOperationalService(client: PrismaClient = prisma) {
  async function getProjection(
    context: ConsolidatedPrescriptionContext
  ): Promise<ConsolidatedOperationalProjection> {
    const assembly = await consolidatedPrescriptionService.getCurrent(context);
    if (!assembly) notFound();
    const versionIds = assembly.latestVersion.capacityBlocks.map(
      (block) => block.capacityPrescriptionVersionId
    );
    const capacityVersions = await loadCapacityVersions(context, versionIds, client);
    const technicalIds = Array.from(
      new Set(
        capacityVersions.flatMap((version) => {
          const parameters = asParameters(version.parameters);
          return parameters?.type === 'resisted'
            ? parameters.resisted.exerciseTechnicalCatalogItemIds ?? []
            : [];
        })
      )
    );
    const mappings = new Map<string, TechnicalExerciseOperationalMapping | null>();
    for (const technicalId of technicalIds) {
      mappings.set(
        technicalId,
        await capacityExerciseMappingService.resolveMapping(context.contractId, technicalId)
      );
    }
    const substitutions = substitutionSnapshots(assembly.latestVersion.dataRefs);
    const items = buildOperationalProjectionItems(capacityVersions, mappings, substitutions);
    const preparedSnapshotVersion = currentPreparedVersion(assembly.latestVersion.dataRefs);

    let mappingSnapshotIsStale = false;
    const preparedRefs = assembly.latestVersion.dataRefs
      .map(projectionRefContext)
      .filter(Boolean) as Record<string, unknown>[];
    for (const item of items) {
      if (!item.technicalCatalogItemId) continue;
      const prepared = preparedRefs.find(
        (candidate) => candidate.key === item.key
      );
      if (!prepared || prepared.mappingRevision !== item.mappingRevision) {
        mappingSnapshotIsStale = true;
        break;
      }
    }

    return {
      assemblyId: assembly.id,
      assemblyVersion: assembly.currentVersion,
      assemblyStatus: assembly.currentStatus,
      items,
      hasIncompatibilities: items.some((item) => item.compatibility === 'incompatible'),
      hasStalePreparedSnapshot:
        preparedSnapshotVersion !== assembly.currentVersion || mappingSnapshotIsStale,
      preparedSnapshotVersion,
      writesOperationalWorkout: false,
    };
  }

  return {
    getProjection,

    async listOperationalExercises(
      context: ConsolidatedPrescriptionContext,
      filters: { search?: string; category?: string; muscleGroup?: string }
    ) {
      const aluno = await client.aluno.findFirst({
        where: { id: context.alunoId, contractId: context.contractId },
        select: { id: true },
      });
      if (!aluno) notFound();
      const search = filters.search?.trim();
      return client.exerciseLibrary.findMany({
        where: {
          contractId: context.contractId,
          ...(filters.category ? { category: filters.category } : {}),
          ...(filters.muscleGroup ? { muscleGroup: filters.muscleGroup } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { muscleGroup: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          videoUrl: true,
          loadType: true,
          movementType: true,
          countingType: true,
          category: true,
          muscleGroup: true,
          notes: true,
          updatedAt: true,
        },
        orderBy: { name: 'asc' },
        take: 50,
      });
    },

    async setExerciseMapping(
      context: ConsolidatedPrescriptionContext,
      technicalCatalogItemId: string,
      command: SetTechnicalExerciseOperationalMappingCommand
    ) {
      const aluno = await client.aluno.findFirst({
        where: { id: context.alunoId, contractId: context.contractId },
        select: { id: true },
      });
      if (!aluno) notFound();
      try {
        return await capacityExerciseMappingService.setMapping(
          { contractId: context.contractId, actorProfessorId: context.actorProfessorId },
          technicalCatalogItemId,
          command.exerciseLibraryId,
          command.expectedMappingRevision
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'CapacityPrescriptionDomainError'
        ) {
          const capacityError = error as Error & { code?: string };
          if (capacityError.code === 'CONFLICT') {
            throw new ConsolidatedPrescriptionDomainError('CONFLICT', error.message);
          }
          throw new ConsolidatedPrescriptionDomainError('INVALID_INPUT', error.message);
        }
        throw error;
      }
    },

    async prepareProjection(
      context: ConsolidatedPrescriptionContext,
      command: PrepareConsolidatedOperationalProjectionCommand,
      now = new Date()
    ): Promise<PrepareConsolidatedOperationalProjectionResult> {
      const assembly = await consolidatedPrescriptionService.getCurrent(context);
      if (!assembly) notFound();
      if (assembly.currentVersion !== command.expectedCurrentVersion) {
        conflict(command.expectedCurrentVersion, assembly.currentVersion);
      }
      if (['approved', 'released', 'archived'].includes(assembly.currentStatus)) {
        invalid('Crie uma nova revisão antes de preparar integração operacional neste estado');
      }
      const projection = await getProjection(context);
      const nextVersion = assembly.currentVersion + 1;
      const preparedAt = now.toISOString();
      const dataRefs: ConsolidatedPrescriptionDataRefInput[] = [
        ...cloneAdditionalRefs(assembly.latestVersion.dataRefs, true),
        ...projection.items.map((item) => ({
          role: 'manual_observation' as const,
          sourceType: 'manual_observation' as const,
          sourceId: item.key,
          label: 'Projeção operacional da Montagem Consolidada',
          assessedAt: preparedAt,
          origin: CONSOLIDATED_OPERATIONAL_PROJECTION_ORIGIN,
          sourceVersion: nextVersion,
          responsibleProfessorId: context.actorProfessorId,
          context: {
            kind: 'operational_projection_v1',
            ...item,
            preparedFromAssemblyVersion: assembly.currentVersion,
            preparedForAssemblyVersion: nextVersion,
            preparedAt,
            preparedByProfessorId: context.actorProfessorId,
            writesOperationalWorkout: false,
          },
        })),
      ];
      const updated = await consolidatedPrescriptionService.updateComposition(
        context,
        {
          expectedCurrentVersion: command.expectedCurrentVersion,
          responsibleProfessorId: assembly.latestVersion.responsibleProfessorId,
          capacityBlocks: assembly.latestVersion.capacityBlocks.map((block) => ({
            capacityPrescriptionVersionId: block.capacityPrescriptionVersionId,
            position: block.position,
          })),
          dataRefs,
          technicalObservation: assembly.latestVersion.technicalObservation ?? null,
          professorJustification: assembly.latestVersion.professorJustification,
          studentInstruction: assembly.latestVersion.studentInstruction ?? null,
        },
        now
      );
      return { assembly: updated, projection: await getProjection(context) };
    },

    async createExerciseSubstitution(
      context: ConsolidatedPrescriptionContext,
      command: CreateConsolidatedExerciseSubstitutionCommand,
      now = new Date()
    ): Promise<ConsolidatedExerciseSubstitutionResult> {
      const assembly = await consolidatedPrescriptionService.getCurrent(context);
      if (!assembly) notFound();
      if (assembly.currentVersion !== command.expectedCurrentVersion) {
        conflict(command.expectedCurrentVersion, assembly.currentVersion);
      }
      if (['approved', 'released', 'archived'].includes(assembly.currentStatus)) {
        invalid('Crie uma nova revisão antes de registrar substituição neste estado');
      }
      if (!command.reason.trim() || !command.origin.trim()) {
        invalid('Motivo e origem da substituição são obrigatórios');
      }
      const projection = await getProjection(context);
      const original = projection.items.find(
        (item) => item.technicalCatalogItemId === command.originalTechnicalCatalogItemId
      );
      if (!original || !original.mappedExerciseLibraryId) {
        invalid('A substituição exige um exercício técnico com mapeamento operacional explícito');
      }
      const restrictions = Array.isArray(original.sourceParameters?.restrictions)
        ? original.sourceParameters?.restrictions
        : [];
      if (restrictions.length) {
        invalid(
          'A biblioteca atual não modela atributos suficientes para validar esta substituição contra as restrições estruturadas'
        );
      }
      if (original.mappedExerciseLibraryId === command.substituteExerciseLibraryId) {
        invalid('O exercício substituto deve ser diferente do exercício operacional original');
      }

      const substitute = await client.exerciseLibrary.findFirst({
        where: { id: command.substituteExerciseLibraryId, contractId: context.contractId },
      });
      if (!substitute) invalid('Exercício substituto inexistente ou fora do contrato');
      const recordedAt = now.toISOString();
      const nextVersion = assembly.currentVersion + 1;
      const substitutionRef: ConsolidatedPrescriptionDataRefInput = {
        role: 'manual_observation',
        sourceType: 'manual_observation',
        sourceId: `${command.originalTechnicalCatalogItemId}:${substitute.id}`,
        label: 'Substituição operacional rastreada',
        assessedAt: recordedAt,
        origin: CONSOLIDATED_EXERCISE_SUBSTITUTION_ORIGIN,
        sourceVersion: nextVersion,
        responsibleProfessorId: context.actorProfessorId,
        context: {
          kind: 'exercise_substitution_v1',
          assemblyId: assembly.id,
          baseAssemblyVersion: assembly.currentVersion,
          recordedForAssemblyVersion: nextVersion,
          capacityPrescriptionVersionId: original.capacityPrescriptionVersionId,
          originalTechnicalCatalogItemId: command.originalTechnicalCatalogItemId,
          originalExerciseLibraryId: original.mappedExerciseLibraryId,
          originalExerciseSnapshot: original.operationalExerciseSnapshot ?? null,
          substituteExerciseLibraryId: substitute.id,
          substituteExerciseSnapshot: exerciseSnapshot(substitute),
          reason: command.reason.trim(),
          origin: command.origin.trim(),
          recordedAt,
          recordedByProfessorId: context.actorProfessorId,
          textMatchingUsed: false,
          writesOperationalWorkout: false,
        },
      };

      const updated = await consolidatedPrescriptionService.updateComposition(
        context,
        {
          expectedCurrentVersion: command.expectedCurrentVersion,
          responsibleProfessorId: assembly.latestVersion.responsibleProfessorId,
          capacityBlocks: assembly.latestVersion.capacityBlocks.map((block) => ({
            capacityPrescriptionVersionId: block.capacityPrescriptionVersionId,
            position: block.position,
          })),
          dataRefs: [
            ...cloneAdditionalRefs(assembly.latestVersion.dataRefs),
            substitutionRef,
          ],
          technicalObservation: assembly.latestVersion.technicalObservation ?? null,
          professorJustification: assembly.latestVersion.professorJustification,
          studentInstruction: assembly.latestVersion.studentInstruction ?? null,
        },
        now
      );
      return {
        assembly: updated,
        originalTechnicalCatalogItemId: command.originalTechnicalCatalogItemId,
        originalExerciseLibraryId: original.mappedExerciseLibraryId,
        substituteExerciseLibraryId: substitute.id,
        recordedAt,
        recordedByProfessorId: context.actorProfessorId,
        writesOperationalWorkout: false,
      };
    },
  };
}

export const consolidatedPrescriptionOperationalService =
  createConsolidatedPrescriptionOperationalService();
