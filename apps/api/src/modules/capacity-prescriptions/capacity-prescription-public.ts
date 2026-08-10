import type {
  CapacityPrescriptionAlert,
  CapacityPrescriptionSourceRef,
  CapacityPrescriptionVersionView,
} from '@corrida/types';

function iso(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function deriveCapacityAlerts(
  sourceRefs: CapacityPrescriptionSourceRef[] = []
): CapacityPrescriptionAlert[] {
  const derived = sourceRefs.flatMap<CapacityPrescriptionAlert>((source) => {
    if (source.type === 'prontuario_alert') {
      return [{
        code: 'PRNT_CONDITION',
        message: `Condição do prontuário a considerar: ${source.label}`,
        severity: 'warning',
        sourceRefId: source.id,
      }];
    }

    if (source.type === 'student_preference') {
      return [{
        code: 'STUDENT_PREFERENCE',
        message: `Preferência ou restrição declarada pelo aluno: ${source.label}`,
        severity: 'info',
        sourceRefId: source.id,
      }];
    }

    if (
      source.type === 'physical_assessment' ||
      source.type === 'anthropometry' ||
      source.type === 'adipometry' ||
      source.type === 'bioimpedance' ||
      source.type === 'ultrasound' ||
      source.type === 'ventilometry' ||
      source.type === 'flexibility_assessment'
    ) {
      return [{
        code: 'ASSESSMENT_CONTEXT',
        message: `Dado de avaliação utilizado como contexto técnico: ${source.label}`,
        severity: 'info',
        sourceRefId: source.id,
      }];
    }

    return [];
  });

  return Array.from(
    new Map(
      derived.map((alert) => [
        `${alert.code}:${alert.sourceRefId ?? ''}:${alert.message}`,
        alert,
      ])
    ).values()
  );
}

export function mergeCapacityAlerts(
  explicit: CapacityPrescriptionAlert[] = [],
  derived: CapacityPrescriptionAlert[] = []
): CapacityPrescriptionAlert[] {
  return Array.from(
    new Map(
      [...explicit, ...derived].map((alert) => [
        `${alert.code}:${alert.sourceRefId ?? ''}:${alert.message}`,
        alert,
      ])
    ).values()
  );
}

export function serializeCapacityVersion(raw: Record<string, any>): CapacityPrescriptionVersionView {
  const { sources = [], goals = [], alerts = [], ...version } = raw;
  return {
    ...version,
    createdAt: iso(version.createdAt) as string,
    publishesTodayWorkout: false,
    sourceRefs: sources.map((source: Record<string, any>) => ({
      type: source.sourceType,
      id: source.sourceId,
      label: source.label,
      assessedAt: iso(source.assessedAt) as string | null,
      origin: source.origin ?? null,
      version: source.sourceVersion ?? null,
      responsibleProfessorId: source.responsibleProfessorId ?? null,
    })),
    linkedProntuarioGoalIds: goals.map((goal: Record<string, any>) => goal.goalId),
    alerts: alerts.map((alert: Record<string, any>) => ({
      code: alert.code,
      message: alert.message,
      severity: alert.severity,
      sourceRefId: alert.sourceRefId ?? null,
    })),
  } as CapacityPrescriptionVersionView;
}

function serializePrescription(raw: Record<string, any>) {
  return {
    ...raw,
    createdAt: iso(raw.createdAt),
    updatedAt: iso(raw.updatedAt),
    publishesTodayWorkout: false,
    latestVersion: raw.latestVersion ? serializeCapacityVersion(raw.latestVersion) : null,
  };
}

export function serializeCapacityApiData(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeCapacityApiData);
  if (!value || typeof value !== 'object') return value;

  const item = value as Record<string, any>;
  if (item.prescriptionId && item.version && (item.sources || item.sourceRefs)) {
    return item.sourceRefs ? item : serializeCapacityVersion(item);
  }
  if (item.currentVersion !== undefined && item.capacity && 'latestVersion' in item) {
    return serializePrescription(item);
  }

  return Object.fromEntries(
    Object.entries(item).map(([key, child]) => [key, serializeCapacityApiData(child)])
  );
}
