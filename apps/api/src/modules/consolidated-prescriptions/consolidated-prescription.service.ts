import {
  CONSOLIDATED_PRESCRIPTION_STATUSES,
  type ConsolidatedCapacityBlock,
  type ConsolidatedPrescriptionAssembly,
  type ConsolidatedPrescriptionConflict,
  type ConsolidatedPrescriptionDataRef,
  type ConsolidatedPrescriptionStatus,
  type CreateConsolidatedPrescriptionAssemblyPayload,
  type PhysicalCapacityType,
} from '@corrida/types';

const statusSet = new Set<string>(CONSOLIDATED_PRESCRIPTION_STATUSES);

function assertNonEmpty(value: string | undefined | null, field: string) {
  if (!value?.trim()) {
    throw new Error(`${field} é obrigatório`);
  }
}

function assertStatus(status: ConsolidatedPrescriptionStatus) {
  if (!statusSet.has(status)) {
    throw new Error('Status da montagem consolidada inválido');
  }
}

function ensureCapacityBlockScope(payload: CreateConsolidatedPrescriptionAssemblyPayload) {
  for (const block of payload.capacityBlocks) {
    if (block.draft.alunoId !== payload.alunoId || block.draft.contractId !== payload.contractId) {
      throw new Error('Bloco de capacidade fora do escopo de aluno ou contrato');
    }

    if (block.validationStatus !== 'validated') {
      throw new Error('Todos os blocos de capacidade precisam estar validados');
    }

    if (block.status !== 'active') {
      throw new Error('Montagem consolidada recebe apenas capacidades ativas');
    }
  }
}

function sourceRefsFromBlocks(blocks: ConsolidatedCapacityBlock[]): ConsolidatedPrescriptionDataRef[] {
  return blocks.flatMap((block) =>
    block.draft.sourceRefs.map((sourceRef) => ({
      ...sourceRef,
      role: 'capacity_source' as const,
    }))
  );
}

function includesAny(value: string, terms: string[]) {
  const normalized = value.toLocaleLowerCase('pt-BR');
  return terms.some((term) => normalized.includes(term));
}

function blockText(block: ConsolidatedCapacityBlock) {
  return [
    block.draft.technicalJustification,
    block.draft.professorSummary,
    block.draft.studentMessage,
    ...block.draft.alerts.map((alert) => alert.message),
  ]
    .filter(Boolean)
    .join(' ');
}

function detectBasicConflicts(blocks: ConsolidatedCapacityBlock[]): ConsolidatedPrescriptionConflict[] {
  const conflicts: ConsolidatedPrescriptionConflict[] = [];
  const capacitySet = new Set<PhysicalCapacityType>(blocks.map((block) => block.capacity));
  const combinedText = blocks.map(blockText).join(' ');
  const hasKneePain = includesAny(combinedText, ['joelho', 'dor relevante', 'dor intensa']);
  const hasLowerLimbIntensity = blocks.some(
    (block) => block.capacity === 'resisted' && includesAny(blockText(block), ['perna', 'membro inferior', 'agachamento'])
  );
  const hasStrongInterval = blocks.some(
    (block) => block.capacity === 'cyclic' && includesAny(blockText(block), ['intervalado', 'forte', 'alta intensidade'])
  );

  if (capacitySet.has('resisted') && capacitySet.has('cyclic') && hasKneePain && hasLowerLimbIntensity && hasStrongInterval) {
    conflicts.push({
      code: 'lower-limb-intensity-knee-pain',
      message: 'Conflito possível: estímulo intenso de membros inferiores, sessão cíclica forte e dor no joelho exigem revisão antes da liberação.',
      severity: 'critical',
      affectedCapacities: ['resisted', 'cyclic'],
      sourceRefIds: blocks.flatMap((block) => block.draft.sourceRefs.map((sourceRef) => sourceRef.id)),
    });
  }

  return conflicts;
}

function buildTraceability(blocks: ConsolidatedCapacityBlock[], dataRefs: ConsolidatedPrescriptionDataRef[]) {
  return {
    capacityCount: blocks.length,
    sourceRefIds: Array.from(new Set(dataRefs.map((sourceRef) => sourceRef.id))),
    capacityVersions: blocks.map((block) => ({
      capacity: block.capacity,
      version: block.capacityVersion,
    })),
  };
}

function canRelease(status: ConsolidatedPrescriptionStatus, conflicts: ConsolidatedPrescriptionConflict[], validatedByProfessorId?: string | null, validatedAt?: string | null) {
  const hasCriticalConflict = conflicts.some((conflict) => conflict.severity === 'critical');
  return (status === 'approved' || status === 'released') && Boolean(validatedByProfessorId && validatedAt) && !hasCriticalConflict;
}

export const consolidatedPrescriptionService = {
  createAssembly(payload: CreateConsolidatedPrescriptionAssemblyPayload, now = new Date()): ConsolidatedPrescriptionAssembly {
    assertNonEmpty(payload.alunoId, 'Aluno');
    assertNonEmpty(payload.contractId, 'Contrato');
    assertNonEmpty(payload.responsibleProfessorId, 'Responsável técnico');
    assertNonEmpty(payload.professorJustification, 'Justificativa do professor');

    const status = payload.status ?? 'draft';
    assertStatus(status);

    if (!payload.capacityBlocks.length) {
      throw new Error('Ao menos um bloco de capacidade deve compor a montagem');
    }

    ensureCapacityBlockScope(payload);

    const dataRefs = [...sourceRefsFromBlocks(payload.capacityBlocks), ...(payload.dataRefs ?? [])];
    const conflicts = detectBasicConflicts(payload.capacityBlocks);
    const validatedByProfessorId = payload.validatedByProfessorId ?? null;
    const validatedAt = payload.validatedAt ?? null;

    return {
      alunoId: payload.alunoId,
      contractId: payload.contractId,
      responsibleProfessorId: payload.responsibleProfessorId,
      version: payload.version ?? 1,
      status,
      capacityBlocks: payload.capacityBlocks,
      dataRefs,
      conflicts,
      technicalObservation: payload.technicalObservation?.trim() || null,
      professorJustification: payload.professorJustification.trim(),
      studentInstruction: payload.studentInstruction?.trim() || null,
      validatedByProfessorId,
      validatedAt,
      traceability: buildTraceability(payload.capacityBlocks, dataRefs),
      canReleaseOperationalWorkout: canRelease(status, conflicts, validatedByProfessorId, validatedAt),
      createsTodayWorkoutDirectly: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  },

  assertProfessorValidatedBeforeRelease(assembly: Pick<ConsolidatedPrescriptionAssembly, 'canReleaseOperationalWorkout' | 'validatedByProfessorId' | 'validatedAt'>) {
    if (!assembly.canReleaseOperationalWorkout || !assembly.validatedByProfessorId || !assembly.validatedAt) {
      throw new Error('Montagem consolidada precisa de validação do professor antes da liberação operacional');
    }
  },
};
