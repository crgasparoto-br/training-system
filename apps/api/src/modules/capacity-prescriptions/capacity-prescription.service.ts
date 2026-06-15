import {
  CAPACITY_PRESCRIPTION_STATUSES,
  PHYSICAL_CAPACITY_TYPES,
  type CapacityPrescriptionDraft,
  type CapacityPrescriptionSourceRef,
  type CapacityPrescriptionStatus,
  type CreateCapacityPrescriptionDraftPayload,
  type PhysicalCapacityType,
} from '@corrida/types';

const physicalCapacitySet = new Set<string>(PHYSICAL_CAPACITY_TYPES);
const statusSet = new Set<string>(CAPACITY_PRESCRIPTION_STATUSES);

function assertNonEmpty(value: string | undefined | null, field: string) {
  if (!value?.trim()) {
    throw new Error(`${field} é obrigatório`);
  }
}

function assertCapacity(value: PhysicalCapacityType) {
  if (!physicalCapacitySet.has(value)) {
    throw new Error('Capacidade física inválida');
  }
}

function assertStatus(value: CapacityPrescriptionStatus) {
  if (!statusSet.has(value)) {
    throw new Error('Status de capacidade inválido');
  }
}

function normalizeSourceRef(sourceRef: CapacityPrescriptionSourceRef) {
  assertNonEmpty(sourceRef.id, 'Origem da capacidade');
  assertNonEmpty(sourceRef.label, 'Rótulo da origem');

  return {
    ...sourceRef,
    label: sourceRef.label.trim(),
    origin: sourceRef.origin?.trim() || null,
    assessedAt: sourceRef.assessedAt || null,
    version: sourceRef.version ?? null,
    responsibleProfessorId: sourceRef.responsibleProfessorId ?? null,
  };
}

export const capacityPrescriptionService = {
  createDraft(payload: CreateCapacityPrescriptionDraftPayload, now = new Date()): CapacityPrescriptionDraft {
    assertNonEmpty(payload.alunoId, 'Aluno');
    assertNonEmpty(payload.contractId, 'Contrato');
    assertNonEmpty(payload.responsibleProfessorId, 'Responsável técnico');
    assertNonEmpty(payload.technicalJustification, 'Justificativa técnica');
    assertNonEmpty(payload.professorSummary, 'Resumo do professor');
    assertCapacity(payload.capacity);

    const status = payload.status ?? 'planned';
    assertStatus(status);

    if (!payload.sourceRefs.length) {
      throw new Error('Ao menos uma origem técnica deve ser informada');
    }

    const linkedProntuarioGoalIds = Array.from(
      new Set((payload.linkedProntuarioGoalIds ?? []).map((goalId) => goalId.trim()).filter(Boolean))
    );

    return {
      alunoId: payload.alunoId,
      contractId: payload.contractId,
      responsibleProfessorId: payload.responsibleProfessorId,
      capacity: payload.capacity,
      status,
      version: payload.version ?? 1,
      sourceRefs: payload.sourceRefs.map(normalizeSourceRef),
      linkedProntuarioGoalIds,
      technicalJustification: payload.technicalJustification.trim(),
      professorSummary: payload.professorSummary.trim(),
      studentMessage: payload.studentMessage?.trim() || null,
      alerts: payload.alerts ?? [],
      parameters: payload.parameters ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      publishesTodayWorkout: false,
    };
  },

  assertDoesNotPublishWorkout(draft: Pick<CapacityPrescriptionDraft, 'publishesTodayWorkout'>) {
    if (draft.publishesTodayWorkout !== false) {
      throw new Error('Capacidade física não pode publicar Treino de hoje diretamente');
    }
  },
};
