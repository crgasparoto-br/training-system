import { Prisma, PrismaClient } from '@prisma/client';
import {
  CAPACITY_PRESCRIPTION_STATUSES,
  PHYSICAL_CAPACITY_TYPES,
  type CapacityPrescriptionDraft,
  type CapacityPrescriptionParameterSetPayload,
  type CapacityPrescriptionParameters,
  type CapacityPrescriptionSourceRef,
  type CapacityPrescriptionStatus,
  type CreateCapacityPrescriptionDraftPayload,
  type CyclicCapacityZone,
  type PhysicalCapacityType,
  type SaveCapacityPrescriptionPayload,
} from '@corrida/types';

const prisma = new PrismaClient();
const physicalCapacitySet = new Set<string>(PHYSICAL_CAPACITY_TYPES);
const statusSet = new Set<string>(CAPACITY_PRESCRIPTION_STATUSES);

const versionInclude = {
  sources: { orderBy: { createdAt: 'asc' as const } },
  alerts: { orderBy: { createdAt: 'asc' as const } },
  goals: { orderBy: { createdAt: 'asc' as const } },
} as const;

export type CapacityPrescriptionErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INVALID_INPUT'
  | 'INVALID_SOURCE';

export class CapacityPrescriptionDomainError extends Error {
  constructor(
    public readonly code: CapacityPrescriptionErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CapacityPrescriptionDomainError';
  }
}

function domainError(code: CapacityPrescriptionErrorCode, message: string): never {
  throw new CapacityPrescriptionDomainError(code, message);
}

function assertNonEmpty(value: string | undefined | null, field: string) {
  if (!value?.trim()) {
    domainError('INVALID_INPUT', `${field} é obrigatório`);
  }
}

function assertCapacity(value: PhysicalCapacityType) {
  if (!physicalCapacitySet.has(value)) {
    domainError('INVALID_INPUT', 'Capacidade física inválida');
  }
}

function assertStatus(value: CapacityPrescriptionStatus) {
  if (!statusSet.has(value)) {
    domainError('INVALID_INPUT', 'Status de capacidade inválido');
  }
}

function assertPositiveVersion(value: number | undefined, field = 'Versão') {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    domainError('INVALID_INPUT', `${field} deve ser um número inteiro não negativo`);
  }
}

function parseOptionalDate(value: string | null | undefined, field: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    domainError('INVALID_INPUT', `${field} possui data inválida`);
  }
  return parsed;
}

function normalizeSourceRef(sourceRef: CapacityPrescriptionSourceRef) {
  assertNonEmpty(sourceRef.id, 'Origem da capacidade');
  assertNonEmpty(sourceRef.label, 'Rótulo da origem');

  return {
    ...sourceRef,
    id: sourceRef.id.trim(),
    label: sourceRef.label.trim(),
    origin: sourceRef.origin?.trim() || null,
    assessedAt: sourceRef.assessedAt || null,
    version: sourceRef.version ?? null,
    responsibleProfessorId: sourceRef.responsibleProfessorId?.trim() || null,
  };
}

function expectedPse(parameters: CapacityPrescriptionParameters) {
  if (parameters.type === 'resisted') return parameters.resisted.expectedPse;
  if (parameters.type === 'cyclic') return parameters.cyclic.expectedPse;
  if (parameters.type === 'flexibility') return parameters.flexibility.expectedPse;
  return parameters.balance.expectedPse;
}

export function assertCapacityParameters(
  capacity: PhysicalCapacityType,
  parameters?: CapacityPrescriptionParameters | null
) {
  if (!parameters) return;
  if (parameters.type !== capacity) {
    domainError('INVALID_INPUT', 'Os parâmetros técnicos não correspondem à capacidade informada');
  }

  const pse = expectedPse(parameters);
  if (pse !== undefined && pse !== null && (!Number.isFinite(pse) || pse < 0 || pse > 10)) {
    domainError('INVALID_INPUT', 'PSE esperado deve estar entre 0 e 10');
  }

  if (parameters.type === 'resisted') {
    const { sets, exerciseTechnicalCatalogItemIds } = parameters.resisted;
    if (sets !== undefined && sets !== null && (!Number.isInteger(sets) || sets <= 0)) {
      domainError('INVALID_INPUT', 'Séries devem ser um inteiro positivo');
    }
    if (exerciseTechnicalCatalogItemIds !== undefined) {
      if (
        exerciseTechnicalCatalogItemIds.some((id) => !id.trim()) ||
        new Set(exerciseTechnicalCatalogItemIds).size !== exerciseTechnicalCatalogItemIds.length
      ) {
        domainError(
          'INVALID_INPUT',
          'As referências técnicas de exercícios devem usar IDs únicos e válidos'
        );
      }
    }
  }

  if (parameters.type === 'cyclic') {
    const { vo2MaxPercentage, zones = [] } = parameters.cyclic;
    if (
      vo2MaxPercentage !== undefined &&
      vo2MaxPercentage !== null &&
      (!Number.isFinite(vo2MaxPercentage) || vo2MaxPercentage <= 0 || vo2MaxPercentage > 200)
    ) {
      domainError('INVALID_INPUT', 'Percentual de VO2max deve ser maior que 0 e no máximo 200');
    }

    for (const zone of zones) {
      assertNonEmpty(zone.name, 'Nome da zona');
      if (
        zone.minPercent !== undefined &&
        zone.minPercent !== null &&
        (!Number.isFinite(zone.minPercent) || zone.minPercent < 0 || zone.minPercent > 100)
      ) {
        domainError('INVALID_INPUT', 'Percentual mínimo da zona deve estar entre 0 e 100');
      }
      if (
        zone.maxPercent !== undefined &&
        zone.maxPercent !== null &&
        (!Number.isFinite(zone.maxPercent) || zone.maxPercent < 0 || zone.maxPercent > 100)
      ) {
        domainError('INVALID_INPUT', 'Percentual máximo da zona deve estar entre 0 e 100');
      }
      if (
        zone.minPercent !== undefined &&
        zone.minPercent !== null &&
        zone.maxPercent !== undefined &&
        zone.maxPercent !== null &&
        zone.minPercent > zone.maxPercent
      ) {
        domainError('INVALID_INPUT', 'Percentual mínimo da zona não pode superar o máximo');
      }
    }
  }
}

function persistedResistedExerciseTechnicalCatalogItemIds(
  value: unknown
): string[] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as { type?: unknown; resisted?: unknown };
  if (candidate.type !== 'resisted' || !candidate.resisted || typeof candidate.resisted !== 'object') {
    return undefined;
  }
  const ids = (candidate.resisted as { exerciseTechnicalCatalogItemIds?: unknown })
    .exerciseTechnicalCatalogItemIds;
  if (!Array.isArray(ids) || !ids.every((id): id is string => typeof id === 'string')) {
    return undefined;
  }
  return ids;
}

export function preserveResistedExerciseTechnicalCatalogItemIds(
  parameters: CapacityPrescriptionParameters | null,
  previousParameters: unknown
): CapacityPrescriptionParameters | null {
  if (parameters?.type !== 'resisted') return parameters;
  if (parameters.resisted.exerciseTechnicalCatalogItemIds !== undefined) return parameters;
  const previousIds = persistedResistedExerciseTechnicalCatalogItemIds(previousParameters);
  if (previousIds === undefined) return parameters;
  return {
    ...parameters,
    resisted: {
      ...parameters.resisted,
      exerciseTechnicalCatalogItemIds: previousIds,
    },
  };
}

export function calculateCyclicHeartRateZones(input: {
  maxHeartRate: number;
  restingHeartRate?: number | null;
  basis?: 'max_hr' | 'heart_rate_reserve';
  zones: CyclicCapacityZone[];
}) {
  if (!Number.isFinite(input.maxHeartRate) || input.maxHeartRate <= 0) {
    domainError('INVALID_INPUT', 'Frequência cardíaca máxima inválida');
  }

  const useReserve =
    input.basis === 'heart_rate_reserve' &&
    input.restingHeartRate !== undefined &&
    input.restingHeartRate !== null &&
    Number.isFinite(input.restingHeartRate) &&
    input.restingHeartRate > 0 &&
    input.restingHeartRate < input.maxHeartRate;
  const reserve = useReserve ? input.maxHeartRate - input.restingHeartRate! : input.maxHeartRate;

  return input.zones.map((zone) => {
    if (zone.minPercent === undefined || zone.minPercent === null) return zone;
    if (zone.maxPercent === undefined || zone.maxPercent === null) return zone;

    const calculate = (percent: number) => {
      const base = reserve * (percent / 100);
      return Math.round(useReserve ? base + input.restingHeartRate! : base);
    };

    return {
      ...zone,
      targetHeartRate: `${calculate(zone.minPercent)}-${calculate(zone.maxPercent)} bpm`,
    };
  });
}

function serializeSourceVersion(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function prismaErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

const genericAssessmentCategories: Partial<
  Record<CapacityPrescriptionSourceRef['type'], string[]>
> = {
  adipometry: ['adipometry', 'adipometria', 'adpt'],
  bioimpedance: ['bioimpedance', 'bioimpedanciometry', 'bioimpedanciometria'],
  ultrasound: ['ultrasound', 'ultrassonografia', 'ultrassom'],
  ventilometry: ['ventilometry', 'ventilometria', 'metabolic'],
  flexibility_assessment: ['flexibility', 'flexibilidade', 'flexibility_assessment'],
};

export const DEFAULT_CAPACITY_PARAMETER_SETS: CapacityPrescriptionParameterSetPayload[] = [
  {
    capacity: 'resisted',
    code: 'BASE_RESISTED',
    name: 'Base resistida - adaptação anatômica',
    methodologyVersion: 'acesso-resisted-v1',
    parameters: {
      type: 'resisted',
      resisted: {
        method: 'adaptacao_anatomica',
        split: 'full_body',
        sets: 3,
        repetitions: '8-12',
        repetitionReserve: '2-3',
        expectedPse: 6,
      },
    },
  },
  {
    capacity: 'cyclic',
    code: 'BASE_CYCLIC',
    name: 'Base cíclica - zonas por frequência cardíaca',
    methodologyVersion: 'acesso-cyclic-v1',
    parameters: {
      type: 'cyclic',
      cyclic: {
        category: 'base_aerobica',
        reversibilityPrinciple: 'progressao_gradual',
        zoneBasis: 'heart_rate_reserve',
        zones: [
          { name: 'Z1', minPercent: 50, maxPercent: 60 },
          { name: 'Z2', minPercent: 60, maxPercent: 70 },
          { name: 'Z3', minPercent: 70, maxPercent: 80 },
          { name: 'Z4', minPercent: 80, maxPercent: 90 },
          { name: 'Z5', minPercent: 90, maxPercent: 100 },
        ],
        expectedPse: 5,
      },
    },
  },
  {
    capacity: 'flexibility',
    code: 'BASE_FLEXIBILITY',
    name: 'Base de flexibilidade por articulação',
    methodologyVersion: 'acesso-flexibility-v1',
    parameters: {
      type: 'flexibility',
      flexibility: {
        articulations: [],
        expectedPse: 3,
      },
    },
  },
  {
    capacity: 'balance',
    code: 'BASE_BALANCE',
    name: 'Base de equilíbrio e estabilidade',
    methodologyVersion: 'acesso-balance-v1',
    parameters: {
      type: 'balance',
      balance: {
        focus: 'estabilidade_geral',
        supports: ['bipodal', 'unipodal'],
        progressionNotes:
          'Progredir apoio, amplitude e perturbação somente após validação do professor.',
        expectedPse: 4,
      },
    },
  },
];

export function createCapacityPrescriptionService(client: PrismaClient = prisma) {
  async function assertAlunoInContract(contractId: string, alunoId: string) {
    const aluno = await client.aluno.findFirst({
      where: { id: alunoId, contractId },
      select: {
        id: true,
        contractId: true,
        maxHeartRate: true,
        restingHeartRate: true,
        vo2Max: true,
        anaerobicThreshold: true,
      },
    });
    if (!aluno) domainError('NOT_FOUND', 'Recurso não encontrado');
    return aluno;
  }

  async function assertProfessorInContract(contractId: string, professorId: string) {
    const professor = await client.professor.findFirst({
      where: { id: professorId, contractId },
      select: { id: true },
    });
    if (!professor) domainError('NOT_FOUND', 'Recurso não encontrado');
    return professor;
  }

  async function validateProntuarioAlert(contractId: string, alunoId: string, sourceId: string) {
    const [painCase, followUp, medication, discomfort] = await Promise.all([
      client.prontuarioPainCase.findFirst({
        where: { id: sourceId, record: { contractId, alunoId } },
        select: { id: true },
      }),
      client.prontuarioAnamnesisFollowUp.findFirst({
        where: { id: sourceId, record: { contractId, alunoId } },
        select: { id: true },
      }),
      client.prontuarioMedicationProcedure.findFirst({
        where: { id: sourceId, record: { contractId, alunoId } },
        select: { id: true },
      }),
      client.prontuarioDiscomfortSnapshot.findFirst({
        where: { id: sourceId, contractId, alunoId },
        select: { id: true },
      }),
    ]);
    return Boolean(painCase || followUp || medication || discomfort);
  }

  async function validateSource(
    contractId: string,
    alunoId: string,
    actorProfessorId: string,
    source: ReturnType<typeof normalizeSourceRef>
  ) {
    let exists = false;

    if (source.responsibleProfessorId) {
      await assertProfessorInContract(contractId, source.responsibleProfessorId);
    }

    switch (source.type) {
      case 'prontuario_goal':
        exists = Boolean(
          await client.prontuarioGoal.findFirst({
            where: { id: source.id, record: { contractId, alunoId } },
            select: { id: true },
          })
        );
        break;
      case 'prontuario_alert':
        exists = await validateProntuarioAlert(contractId, alunoId, source.id);
        break;
      case 'anthropometry':
        exists = Boolean(
          await client.anthropometryAssessment.findFirst({
            where: { id: source.id, contractId, alunoId },
            select: { id: true },
          })
        );
        break;
      case 'physical_assessment':
        exists = Boolean(
          await client.studentAssessmentRecord.findFirst({
            where: { id: source.id, contractId, alunoId },
            select: { id: true },
          })
        );
        break;
      case 'adipometry':
      case 'bioimpedance':
      case 'ultrasound':
      case 'ventilometry':
      case 'flexibility_assessment':
        exists = Boolean(
          await client.studentAssessmentRecord.findFirst({
            where: {
              id: source.id,
              contractId,
              alunoId,
              assessmentCategory: { in: genericAssessmentCategories[source.type] ?? [] },
            },
            select: { id: true },
          })
        );
        break;
      case 'student_preference':
        exists = Boolean(
          await client.studentProfile.findFirst({
            where: { id: source.id, contractId, alunoId },
            select: { id: true },
          })
        );
        break;
      case 'professor_note':
        assertNonEmpty(source.origin, 'Origem da anotação do professor');
        if (source.responsibleProfessorId && source.responsibleProfessorId !== actorProfessorId) {
          await assertProfessorInContract(contractId, source.responsibleProfessorId);
        }
        exists = true;
        break;
      default:
        exists = false;
    }

    if (!exists) {
      domainError('INVALID_SOURCE', 'Origem técnica inválida ou fora do contrato do aluno');
    }
  }

  async function validateGoalLinks(contractId: string, alunoId: string, goalIds: string[]) {
    if (!goalIds.length) return;
    const goals = await client.prontuarioGoal.findMany({
      where: { id: { in: goalIds }, record: { contractId, alunoId } },
      select: { id: true },
    });
    if (goals.length !== goalIds.length) {
      domainError('INVALID_SOURCE', 'Objetivo do prontuário inválido ou fora do contrato do aluno');
    }
  }

  async function resolveParameterSets(
    contractId: string,
    capacity: PhysicalCapacityType,
    parameterSetIds: string[]
  ) {
    if (!parameterSetIds.length) return [];
    const parameterSets = await client.capacityPrescriptionParameterSet.findMany({
      where: { id: { in: parameterSetIds }, contractId, capacity },
      orderBy: { createdAt: 'asc' },
    });
    if (parameterSets.length !== parameterSetIds.length) {
      domainError('INVALID_INPUT', 'Parâmetro técnico inválido ou pertencente a outro contrato');
    }
    return parameterSets;
  }

  function resolveParameters(
    capacity: PhysicalCapacityType,
    explicitParameters: CapacityPrescriptionParameters | null | undefined,
    parameterSets: Array<{ parameters: Prisma.JsonValue }>,
    aluno: { maxHeartRate: number | null; restingHeartRate: number | null }
  ) {
    const selected =
      explicitParameters ??
      (parameterSets.length === 1
        ? (parameterSets[0].parameters as unknown as CapacityPrescriptionParameters)
        : null);
    assertCapacityParameters(capacity, selected);

    if (
      selected?.type === 'cyclic' &&
      selected.cyclic.zones?.length &&
      aluno.maxHeartRate &&
      selected.cyclic.zones.some(
        (zone) => !zone.targetHeartRate && zone.minPercent !== null && zone.minPercent !== undefined
      )
    ) {
      return {
        ...selected,
        cyclic: {
          ...selected.cyclic,
          zones: calculateCyclicHeartRateZones({
            maxHeartRate: aluno.maxHeartRate,
            restingHeartRate: aluno.restingHeartRate,
            basis:
              selected.cyclic.zoneBasis === 'heart_rate_reserve' ? 'heart_rate_reserve' : 'max_hr',
            zones: selected.cyclic.zones,
          }),
        },
      } satisfies CapacityPrescriptionParameters;
    }

    return selected;
  }

  function createDraft(
    payload: CreateCapacityPrescriptionDraftPayload,
    now = new Date()
  ): CapacityPrescriptionDraft {
    assertNonEmpty(payload.alunoId, 'Aluno');
    assertNonEmpty(payload.contractId, 'Contrato');
    assertNonEmpty(payload.responsibleProfessorId, 'Responsável técnico');
    assertNonEmpty(payload.technicalJustification, 'Justificativa técnica');
    assertNonEmpty(payload.professorSummary, 'Resumo do professor');
    assertCapacity(payload.capacity);
    assertPositiveVersion(payload.version);

    const status = payload.status ?? 'planned';
    assertStatus(status);
    assertCapacityParameters(payload.capacity, payload.parameters);

    if (!payload.sourceRefs.length) {
      domainError('INVALID_INPUT', 'Ao menos uma origem técnica deve ser informada');
    }

    const linkedProntuarioGoalIds = Array.from(
      new Set(
        (payload.linkedProntuarioGoalIds ?? []).map((goalId) => goalId.trim()).filter(Boolean)
      )
    );

    return {
      alunoId: payload.alunoId.trim(),
      contractId: payload.contractId.trim(),
      responsibleProfessorId: payload.responsibleProfessorId.trim(),
      capacity: payload.capacity,
      status,
      version: payload.version ?? 1,
      sourceRefs: payload.sourceRefs.map(normalizeSourceRef),
      linkedProntuarioGoalIds,
      technicalJustification: payload.technicalJustification.trim(),
      professorSummary: payload.professorSummary.trim(),
      studentMessage: payload.studentMessage?.trim() || null,
      alerts: (payload.alerts ?? []).map((alert) => ({
        ...alert,
        code: alert.code.trim(),
        message: alert.message.trim(),
        sourceRefId: alert.sourceRefId?.trim() || null,
      })),
      parameters: payload.parameters ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      publishesTodayWorkout: false,
    };
  }

  async function saveVersion(
    context: { contractId: string; actorProfessorId: string; alunoId: string },
    payload: SaveCapacityPrescriptionPayload,
    now = new Date()
  ) {
    assertCapacity(payload.capacity);
    assertPositiveVersion(payload.expectedCurrentVersion, 'Versão atual esperada');
    const aluno = await assertAlunoInContract(context.contractId, context.alunoId);
    await assertProfessorInContract(context.contractId, context.actorProfessorId);
    const responsibleProfessorId = payload.responsibleProfessorId || context.actorProfessorId;
    await assertProfessorInContract(context.contractId, responsibleProfessorId);

    const normalizedSources = payload.sourceRefs.map(normalizeSourceRef);
    const deduplicatedSources = Array.from(
      new Map(normalizedSources.map((source) => [`${source.type}:${source.id}`, source])).values()
    );
    if (!deduplicatedSources.length) {
      domainError('INVALID_INPUT', 'Ao menos uma origem técnica deve ser informada');
    }
    for (const source of deduplicatedSources) {
      await validateSource(context.contractId, context.alunoId, context.actorProfessorId, source);
    }

    const goalIds = Array.from(
      new Set(
        (payload.linkedProntuarioGoalIds ?? []).map((goalId) => goalId.trim()).filter(Boolean)
      )
    );
    await validateGoalLinks(context.contractId, context.alunoId, goalIds);

    const parameterSetIds = Array.from(
      new Set((payload.parameterSetIds ?? []).map((id) => id.trim()).filter(Boolean))
    );
    if (parameterSetIds.length > 1) {
      domainError('INVALID_INPUT', 'Selecione no máximo um conjunto versionado por capacidade');
    }

    const suppliedMethodologyVersion = payload.methodologyVersion?.trim() || null;
    if (!parameterSetIds.length && suppliedMethodologyVersion) {
      domainError(
        'INVALID_INPUT',
        'Versão de metodologia só pode ser informada com um conjunto versionado'
      );
    }

    const parameterSets = await resolveParameterSets(
      context.contractId,
      payload.capacity,
      parameterSetIds
    );
    if (parameterSets.length && payload.parameters !== undefined && payload.parameters !== null) {
      domainError(
        'INVALID_INPUT',
        'Conjunto versionado e parâmetros manuais não podem ser enviados na mesma versão'
      );
    }

    const methodologyVersion = parameterSets[0]?.methodologyVersion ?? null;
    if (suppliedMethodologyVersion && suppliedMethodologyVersion !== methodologyVersion) {
      domainError('INVALID_INPUT', 'Versão de metodologia divergente do conjunto versionado');
    }

    const resolvedParameters = resolveParameters(
      payload.capacity,
      payload.parameters,
      parameterSets,
      aluno
    );

    try {
      return await client.$transaction(async (tx) => {
        const existing = await tx.capacityPrescription.findUnique({
          where: {
            contractId_alunoId_capacity: {
              contractId: context.contractId,
              alunoId: context.alunoId,
              capacity: payload.capacity,
            },
          },
        });

        let versionParameters = resolvedParameters;
        if (
          existing &&
          payload.capacity === 'resisted' &&
          resolvedParameters?.type === 'resisted' &&
          resolvedParameters.resisted.exerciseTechnicalCatalogItemIds === undefined
        ) {
          const previousVersion = await tx.capacityPrescriptionVersion.findFirst({
            where: {
              prescriptionId: existing.id,
              contractId: context.contractId,
              version: existing.currentVersion,
            },
            select: { parameters: true },
          });
          versionParameters = preserveResistedExerciseTechnicalCatalogItemIds(
            resolvedParameters,
            previousVersion?.parameters
          );
        }

        if (versionParameters?.type === 'resisted') {
          const exerciseIds = versionParameters.resisted.exerciseTechnicalCatalogItemIds ?? [];
          if (exerciseIds.length) {
            const technicalExercises = await tx.capacityTechnicalCatalogItem.findMany({
              where: {
                id: { in: exerciseIds },
                contractId: context.contractId,
                category: 'exercise',
                isCurrent: true,
              },
              select: { id: true },
            });
            if (technicalExercises.length !== exerciseIds.length) {
              domainError(
                'INVALID_INPUT',
                'Uma ou mais referências técnicas de exercícios são inválidas para este contrato'
              );
            }
          }
        }

        let prescriptionId: string;
        let nextVersion: number;
        if (!existing) {
          if (
            payload.expectedCurrentVersion !== undefined &&
            payload.expectedCurrentVersion !== 0
          ) {
            domainError('CONFLICT', 'A prescrição foi alterada por outro usuário');
          }
          const created = await tx.capacityPrescription.create({
            data: {
              contractId: context.contractId,
              alunoId: context.alunoId,
              capacity: payload.capacity,
              status: payload.status ?? 'planned',
              currentVersion: 1,
              createdByProfessorId: context.actorProfessorId,
              updatedByProfessorId: context.actorProfessorId,
              publishesTodayWorkout: false,
            },
          });
          prescriptionId = created.id;
          nextVersion = 1;
        } else {
          if (
            payload.expectedCurrentVersion !== undefined &&
            payload.expectedCurrentVersion !== existing.currentVersion
          ) {
            domainError('CONFLICT', 'A prescrição foi alterada por outro usuário');
          }
          const updateResult = await tx.capacityPrescription.updateMany({
            where: { id: existing.id, currentVersion: existing.currentVersion },
            data: {
              currentVersion: { increment: 1 },
              status: payload.status ?? existing.status,
              updatedByProfessorId: context.actorProfessorId,
              publishesTodayWorkout: false,
            },
          });
          if (updateResult.count !== 1) {
            domainError('CONFLICT', 'A prescrição foi alterada por outro usuário');
          }
          prescriptionId = existing.id;
          nextVersion = existing.currentVersion + 1;
        }

        const draft = createDraft(
          {
            alunoId: context.alunoId,
            contractId: context.contractId,
            responsibleProfessorId,
            capacity: payload.capacity,
            status: payload.status,
            version: nextVersion,
            sourceRefs: deduplicatedSources,
            linkedProntuarioGoalIds: goalIds,
            technicalJustification: payload.technicalJustification,
            professorSummary: payload.professorSummary,
            studentMessage: payload.studentMessage,
            alerts: payload.alerts,
            parameters: versionParameters,
          },
          now
        );

        const version = await tx.capacityPrescriptionVersion.create({
          data: {
            prescriptionId,
            contractId: context.contractId,
            alunoId: context.alunoId,
            responsibleProfessorId,
            capacity: draft.capacity,
            status: draft.status,
            version: draft.version,
            technicalJustification: draft.technicalJustification,
            professorSummary: draft.professorSummary,
            studentMessage: draft.studentMessage,
            methodologyVersion,
            parameterSetIds,
            ...(draft.parameters
              ? { parameters: draft.parameters as unknown as Prisma.InputJsonValue }
              : {}),
            publishesTodayWorkout: false,
            createdAt: now,
            sources: {
              create: draft.sourceRefs.map((source) => ({
                sourceType: source.type,
                sourceId: source.id,
                label: source.label,
                assessedAt: parseOptionalDate(source.assessedAt, 'Data da origem'),
                origin: source.origin,
                sourceVersion: serializeSourceVersion(source.version),
                responsibleProfessorId: source.responsibleProfessorId,
              })),
            },
            alerts: {
              create: draft.alerts.map((alert) => ({
                code: alert.code,
                message: alert.message,
                severity: alert.severity,
                sourceRefId: alert.sourceRefId,
              })),
            },
            goals: {
              create: draft.linkedProntuarioGoalIds.map((goalId) => ({ goalId })),
            },
          },
          include: versionInclude,
        });

        const prescription = await tx.capacityPrescription.findUniqueOrThrow({
          where: { id: prescriptionId },
        });
        return { ...prescription, latestVersion: version };
      });
    } catch (error) {
      if (error instanceof CapacityPrescriptionDomainError) throw error;
      if (prismaErrorCode(error) === 'P2002') {
        domainError('CONFLICT', 'A prescrição foi alterada por outro usuário');
      }
      throw error;
    }
  }

  async function listByAluno(contractId: string, alunoId: string, capacity?: PhysicalCapacityType) {
    await assertAlunoInContract(contractId, alunoId);
    if (capacity) assertCapacity(capacity);
    const prescriptions = await client.capacityPrescription.findMany({
      where: { contractId, alunoId, ...(capacity ? { capacity } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: {
        versions: {
          take: 1,
          orderBy: { version: 'desc' },
          include: versionInclude,
        },
      },
    });
    return prescriptions.map(({ versions, ...prescription }) => ({
      ...prescription,
      latestVersion: versions[0] ?? null,
    }));
  }

  async function getById(contractId: string, id: string) {
    const prescription = await client.capacityPrescription.findFirst({
      where: { id, contractId },
      include: {
        versions: {
          take: 1,
          orderBy: { version: 'desc' },
          include: versionInclude,
        },
      },
    });
    if (!prescription) domainError('NOT_FOUND', 'Recurso não encontrado');
    const { versions, ...root } = prescription;
    return { ...root, latestVersion: versions[0] ?? null };
  }

  async function listHistory(contractId: string, id: string) {
    const prescription = await client.capacityPrescription.findFirst({
      where: { id, contractId },
      select: { id: true },
    });
    if (!prescription) domainError('NOT_FOUND', 'Recurso não encontrado');
    return client.capacityPrescriptionVersion.findMany({
      where: { prescriptionId: id, contractId },
      orderBy: { version: 'desc' },
      include: versionInclude,
    });
  }

  async function listParameterSets(
    contractId: string,
    capacity?: PhysicalCapacityType,
    includeHistory = false
  ) {
    if (capacity) assertCapacity(capacity);
    return client.capacityPrescriptionParameterSet.findMany({
      where: {
        contractId,
        ...(capacity ? { capacity } : {}),
        ...(includeHistory ? {} : { isCurrent: true }),
      },
      orderBy: [{ capacity: 'asc' }, { code: 'asc' }, { version: 'desc' }],
    });
  }

  async function saveParameterSet(
    context: { contractId: string; actorProfessorId: string },
    payload: CapacityPrescriptionParameterSetPayload
  ) {
    assertCapacity(payload.capacity);
    assertNonEmpty(payload.code, 'Código do parâmetro');
    assertNonEmpty(payload.name, 'Nome do parâmetro');
    assertNonEmpty(payload.methodologyVersion, 'Versão da metodologia');
    assertCapacityParameters(payload.capacity, payload.parameters);
    await assertProfessorInContract(context.contractId, context.actorProfessorId);

    try {
      return await client.$transaction(async (tx) => {
        const current = await tx.capacityPrescriptionParameterSet.findFirst({
          where: {
            contractId: context.contractId,
            capacity: payload.capacity,
            code: payload.code.trim().toUpperCase(),
            isCurrent: true,
          },
          orderBy: { version: 'desc' },
        });
        if (current) {
          await tx.capacityPrescriptionParameterSet.update({
            where: { id: current.id },
            data: { isCurrent: false },
          });
        }
        return tx.capacityPrescriptionParameterSet.create({
          data: {
            contractId: context.contractId,
            capacity: payload.capacity,
            code: payload.code.trim().toUpperCase(),
            name: payload.name.trim(),
            version: (current?.version ?? 0) + 1,
            methodologyVersion: payload.methodologyVersion.trim(),
            parameters: payload.parameters as unknown as Prisma.InputJsonValue,
            isCurrent: true,
            createdByProfessorId: context.actorProfessorId,
          },
        });
      });
    } catch (error) {
      if (error instanceof CapacityPrescriptionDomainError) throw error;
      if (prismaErrorCode(error) === 'P2002') {
        domainError('CONFLICT', 'O parâmetro foi alterado por outro usuário');
      }
      throw error;
    }
  }

  async function seedDefaultParameterSets(contractId: string, actorProfessorId: string) {
    await assertProfessorInContract(contractId, actorProfessorId);
    const results = [];
    for (const payload of DEFAULT_CAPACITY_PARAMETER_SETS) {
      const current = await client.capacityPrescriptionParameterSet.findFirst({
        where: {
          contractId,
          capacity: payload.capacity,
          code: payload.code,
          isCurrent: true,
        },
        select: { id: true, code: true },
      });
      if (current) {
        results.push({ code: payload.code, status: 'skipped' as const, id: current.id });
        continue;
      }
      const created = await saveParameterSet({ contractId, actorProfessorId }, payload);
      results.push({ code: payload.code, status: 'created' as const, id: created.id });
    }
    return results;
  }

  return {
    createDraft,
    assertDoesNotPublishWorkout(draft: Pick<CapacityPrescriptionDraft, 'publishesTodayWorkout'>) {
      if (draft.publishesTodayWorkout !== false) {
        domainError(
          'INVALID_INPUT',
          'Capacidade física não pode publicar Treino de hoje diretamente'
        );
      }
    },
    saveVersion,
    listByAluno,
    getById,
    listHistory,
    listParameterSets,
    saveParameterSet,
    seedDefaultParameterSets,
  };
}

export const capacityPrescriptionService = createCapacityPrescriptionService();
