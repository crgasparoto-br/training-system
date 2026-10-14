import { PARQ_CATALOG_VERSION, PARQ_LEGACY_CATALOG_VERSION } from '@corrida/types';
import { prismaRuntimeClient } from '../../common/prisma-runtime-client.js';
import { studentContractService } from '../student-contracts/student-contract.service.js';
import {
  NO_TIMELINE_DOMAIN_ACCESS,
  readClinicalTimeline,
  type TimelineDomainAccess,
  type TimelineEventKind,
} from './student-clinical-timeline.service.js';

const prisma = prismaRuntimeClient;

type StudentDomainQueryOptions = {
  companyContractId?: string;
  timelineCursor?: string;
  timelineLimit?: number;
  timelineAccess?: TimelineDomainAccess;
};

const toNumber = (value: unknown) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'object' && value !== null && 'toNumber' in value) {
    const decimalValue = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(decimalValue) ? decimalValue : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toRecord = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
};

const buildSource = (
  value:
    | {
        sourceType?: string | null;
        sourceReference?: string | null;
        recordedByUserId?: string | null;
      }
    | null
    | undefined,
  fallbackType: string,
  fallbackReference?: string | null
) => ({
  type: value?.sourceType ?? fallbackType,
  reference: value?.sourceReference ?? fallbackReference ?? null,
  recordedByUserId: value?.recordedByUserId ?? null,
});

const hasRecordContent = (value: unknown) => {
  const record = toRecord(value);
  if (!record) {
    return false;
  }

  return Object.values(record).some((item) => {
    if (item === null || item === undefined || item === '') {
      return false;
    }

    if (typeof item === 'object') {
      if (Array.isArray(item)) {
        return item.length > 0;
      }

      return Object.keys(item as Record<string, unknown>).length > 0;
    }

    return true;
  });
};

const areSameInstants = (left: unknown, right: unknown) => {
  if (!left || !right) {
    return false;
  }

  return new Date(String(left)).getTime() === new Date(String(right)).getTime();
};

const hasIntakeTimelineData = (intake: any) =>
  Boolean(
    intake?.legacyIntakeId ||
      intake?.status === 'COMPLETED' ||
      intake?.assessmentDate ||
      intake?.observations ||
      hasRecordContent(intake?.questionnaires?.parq) ||
      hasRecordContent(intake?.questionnaires?.american) ||
      hasRecordContent(intake?.clinicalHistory) ||
      hasRecordContent(intake?.medications) ||
      hasRecordContent(intake?.injuries) ||
      hasRecordContent(intake?.allergies) ||
      hasRecordContent(intake?.rawFormResponses)
  );

const buildProfileFallback = (aluno: any) => ({
  identification: {
    name: aluno.user?.profile?.name ?? null,
    email: aluno.user?.email ?? null,
    phone: aluno.user?.profile?.phone ?? null,
    avatar: aluno.user?.profile?.avatar ?? null,
    birthDate: aluno.user?.profile?.birthDate ?? null,
    gender: aluno.user?.profile?.gender ?? null,
    age: aluno.age ?? null,
    cpf: aluno.user?.profile?.cpf ?? null,
    rg: aluno.user?.profile?.rg ?? null,
    maritalStatus: aluno.user?.profile?.maritalStatus ?? null,
    address: {
      street: aluno.user?.profile?.addressStreet ?? null,
      number: aluno.user?.profile?.addressNumber ?? null,
      complement: aluno.user?.profile?.addressComplement ?? null,
      neighborhood: aluno.user?.profile?.addressNeighborhood ?? null,
      city: aluno.user?.profile?.addressCity ?? null,
      state: aluno.user?.profile?.addressState ?? null,
      zipCode: aluno.user?.profile?.addressZipCode ?? null,
    },
    schedulePlan: aluno.schedulePlan ?? null,
    isActive: aluno.user?.isActive ?? null,
  },
  preferences: toRecord(aluno.intakeForm?.formResponses)?.preferences ?? null,
  objectives: {
    mainGoal: aluno.intakeForm?.mainGoal ?? null,
    serviceInterest: aluno.service
      ? {
          id: aluno.service.id,
          name: aluno.service.name,
          code: aluno.service.code,
        }
      : null,
  },
});

const buildHealthIntakeFallback = (aluno: any) => ({
  assessmentDate: aluno.intakeForm?.assessmentDate ?? null,
  questionnaires: {
    parq: aluno.intakeForm?.parqResponses ?? null,
    american: toRecord(aluno.intakeForm?.formResponses)?.americanQuestionnaire ?? null,
  },
  clinicalHistory: {
    medicalHistory: aluno.intakeForm?.medicalHistory ?? null,
    trainingBackground: aluno.intakeForm?.trainingBackground ?? null,
  },
  medications: {
    currentMedications: aluno.intakeForm?.currentMedications ?? null,
  },
  injuries: {
    injuriesHistory: aluno.intakeForm?.injuriesHistory ?? null,
  },
  allergies: null,
  rawFormResponses: aluno.intakeForm?.formResponses ?? null,
  observations: aluno.intakeForm?.observations ?? null,
});

const matchesContractScope = (
  record: { contractId?: string | null } | null | undefined,
  companyContractId?: string
) => {
  if (!companyContractId || !record) {
    return true;
  }

  return !record.contractId || record.contractId === companyContractId;
};

const pickByContractScope = <T extends { contractId?: string | null }>(
  record: T | null | undefined,
  companyContractId?: string
): T | null => {
  if (!record || !matchesContractScope(record, companyContractId)) {
    return null;
  }

  return record;
};

const filterByContractScope = <T extends { contractId?: string | null }>(
  records: T[] | null | undefined,
  companyContractId?: string
): T[] => {
  if (!Array.isArray(records)) {
    return [];
  }

  return records.filter((record) => matchesContractScope(record, companyContractId));
};

const scopeAlunoDomainSnapshot = (aluno: any, companyContractId?: string) => {
  if (!aluno || !companyContractId) {
    return aluno;
  }

  return {
    ...aluno,
    contracts: Array.isArray(aluno.contracts)
      ? aluno.contracts.filter((contract: { companyContractId?: string | null }) => contract.companyContractId === companyContractId)
      : aluno.contracts,
    studentProfile: pickByContractScope(aluno.studentProfile, companyContractId),
    studentHealthIntake: pickByContractScope(aluno.studentHealthIntake, companyContractId),
    studentAssessmentRecords: filterByContractScope(aluno.studentAssessmentRecords, companyContractId),
    studentFinancialProfile: pickByContractScope(aluno.studentFinancialProfile, companyContractId),
    studentExternalAccounts: filterByContractScope(aluno.studentExternalAccounts, companyContractId),
    studentExternalActivities: filterByContractScope(aluno.studentExternalActivities, companyContractId),
  };
};

const mapMeasurement = (measurement: any) => ({
  id: measurement.id,
  metricKey: measurement.metricKey,
  metricLabel: measurement.metricLabel,
  valueType: measurement.valueType,
  valueText: measurement.valueText,
  valueNumber: toNumber(measurement.valueNumber),
  valueBoolean: measurement.valueBoolean,
  valueJson: measurement.valueJson,
  unit: measurement.unit,
  notes: measurement.notes,
  sortOrder: measurement.sortOrder,
  createdAt: measurement.createdAt,
  updatedAt: measurement.updatedAt,
});

const mapLegacyAssessment = (assessment: any) => ({
  id: `legacy-${assessment.id}`,
  category: assessment.type?.code ?? assessment.type?.name ?? 'legacy_assessment',
  code: assessment.type?.code ?? null,
  title: assessment.type?.name ?? 'Avaliação legada',
  performedAt: assessment.assessmentDate,
  status: 'completed',
  source: buildSource(null, 'professional', assessment.id),
  summary: {
    filePath: assessment.filePath,
    originalFileName: assessment.originalFileName,
    mimeType: assessment.mimeType,
    fileSize: assessment.fileSize,
    extractedData: assessment.extractedData ?? null,
  },
  measurements: [],
  createdAt: assessment.createdAt,
  updatedAt: assessment.updatedAt,
  legacyAssessmentId: assessment.id,
});

const mapSegmentedAssessment = (record: any) => ({
  id: record.id,
  category: record.assessmentCategory,
  code: record.assessmentCode,
  title: record.title,
  performedAt: record.performedAt,
  status: record.status,
  source: buildSource(record, 'professional', record.id),
  summary: record.summaryData ?? null,
  notes: record.notes,
  measurements: Array.isArray(record.measurements)
    ? record.measurements.map(mapMeasurement)
    : [],
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

const mapExternalAccount = (account: any) => ({
  id: account.id,
  provider: account.provider,
  externalUserId: account.externalUserId ?? null,
  connectionStatus: account.connectionStatus,
  lastSyncAt: account.lastSyncAt ?? null,
  metadata: account.metadata ?? null,
  createdAt: account.createdAt,
  updatedAt: account.updatedAt,
  source: buildSource(account, 'integration', account.externalUserId ?? account.id),
});

const mapLegacyIntegration = (integration: any) => ({
  id: `legacy-${integration.id}`,
  provider: String(integration.type).toLowerCase(),
  externalUserId: null,
  connectionStatus: integration.accessToken ? 'connected' : 'pending',
  lastSyncAt: integration.lastSync ?? null,
  metadata: {
    legacyIntegrationId: integration.id,
    expiresAt: integration.expiresAt ?? null,
  },
  createdAt: integration.createdAt,
  updatedAt: integration.updatedAt,
  source: buildSource(null, 'integration', integration.id),
});

const mapExternalActivity = (activity: any) => ({
  id: activity.id,
  provider: activity.provider,
  externalActivityId: activity.externalActivityId,
  activityType: activity.activityType,
  startedAt: activity.startedAt,
  endedAt: activity.endedAt,
  distanceMeters: toNumber(activity.distanceMeters),
  durationSeconds: activity.durationSeconds,
  paceSecondsPerKm: toNumber(activity.paceSecondsPerKm),
  averageHeartRate: activity.averageHeartRate,
  maxHeartRate: activity.maxHeartRate,
  calories: toNumber(activity.calories),
  elevationGainMeters: toNumber(activity.elevationGainMeters),
  rawPayload: activity.rawPayload ?? null,
  importedAt: activity.importedAt,
  createdAt: activity.createdAt,
  updatedAt: activity.updatedAt,
  source: buildSource(activity, 'integration', activity.externalActivityId),
});

const buildContractTimelineEvents = (contracts: any[]) => {
  const events: Array<Record<string, unknown>> = [];

  for (const contract of contracts) {
    const source = buildSource(null, 'system', contract.id);
    const baseDetails = {
      status: contract.status,
      serviceName: contract.service?.name ?? null,
      generatedContractId: contract.contract?.id ?? contract.contractId ?? null,
    };

    events.push({
      id: `financial-contract-created-${contract.id}`,
      type: 'financial_contract_created',
      title: 'Contrato do aluno criado',
      occurredAt: contract.createdAt,
      source,
      details: baseDetails,
    });

    if (contract.signedAt) {
      events.push({
        id: `financial-contract-signed-${contract.id}`,
        type: 'financial_contract_signed',
        title: 'Contrato do aluno assinado',
        occurredAt: contract.signedAt,
        source,
        details: baseDetails,
      });
    }

    const startedAt =
      contract.startDate ??
      (contract.status === 'active' ? contract.signedAt ?? contract.createdAt : null);

    if (startedAt) {
      events.push({
        id: `financial-contract-started-${contract.id}`,
        type: 'financial_contract_started',
        title: 'Contrato do aluno iniciado',
        occurredAt: startedAt,
        source,
        details: baseDetails,
      });
    }

    const canceledAt = contract.canceledAt ?? contract.contract?.cancelledAt ?? null;
    if (canceledAt) {
      events.push({
        id: `financial-contract-canceled-${contract.id}`,
        type: 'financial_contract_canceled',
        title: 'Contrato do aluno cancelado',
        occurredAt: canceledAt,
        source,
        details: {
          ...baseDetails,
          cancellationReason: contract.cancellationReason ?? null,
        },
      });
    }
  }

  return events;
};

const buildTrainingTimelineEvents = (lifecycleEvents: any[]) => lifecycleEvents.flatMap((event) => {
  const metadata = toRecord(event.metadata);
  const domain = typeof metadata?.domain === 'string' ? metadata.domain : null;
  if (!['pre_workout_check_in', 'workout_session_execution', 'post_workout_feedback'].includes(domain ?? '')) {
    return [];
  }

  const action = typeof metadata?.action === 'string' ? metadata.action : null;
  const status = typeof metadata?.status === 'string' ? metadata.status : null;
  const source = {
    type: 'system',
    reference:
      typeof metadata?.eventKey === 'string'
        ? metadata.eventKey
        : `student-lifecycle-event:${event.id}`,
    recordedByUserId: event.actorUserId ?? null,
  };

  if (domain === 'pre_workout_check_in') {
    return [{
      id: `training-check-in-${event.id}`,
      type: action === 'updated' ? 'pre_workout_check_in_updated' : 'pre_workout_check_in_recorded',
      title: action === 'updated' ? 'Check-in pré-treino atualizado' : 'Check-in pré-treino registrado',
      occurredAt: event.createdAt,
      source,
      details: {
        workoutDayId: metadata?.workoutDayId ?? null,
      },
    }];
  }

  if (domain === 'post_workout_feedback') {
    return [{
      id: `training-feedback-${event.id}`,
      type: action === 'corrected' ? 'post_workout_feedback_corrected' : 'post_workout_feedback_recorded',
      title: action === 'corrected' ? 'Feedback pós-treino corrigido' : 'Feedback pós-treino registrado',
      occurredAt: event.createdAt,
      source,
      details: {
        workoutDayId: metadata?.workoutDayId ?? null,
        revisionNumber: metadata?.revisionNumber ?? null,
      },
    }];
  }

  const executionTypeByStatus: Record<string, string> = {
    in_progress: 'workout_execution_started',
    paused: 'workout_execution_paused',
    completed: 'workout_execution_completed',
    partial: 'workout_execution_partial',
    not_performed: 'workout_execution_not_performed',
  };
  const executionTitleByStatus: Record<string, string> = {
    in_progress: 'Treino iniciado',
    paused: 'Treino pausado',
    completed: 'Treino concluído',
    partial: 'Treino encerrado parcialmente',
    not_performed: 'Treino marcado como não realizado',
  };

  return [{
    id: `training-execution-${event.id}`,
    type: action === 'record_values' ? 'workout_execution_values_recorded' : executionTypeByStatus[status ?? ''] ?? 'workout_execution_updated',
    title: action === 'record_values' ? 'Execução do treino atualizada' : executionTitleByStatus[status ?? ''] ?? 'Execução do treino atualizada',
    occurredAt: event.createdAt,
    source,
    details: {
      workoutDayId: metadata?.workoutDayId ?? null,
      status: status ?? null,
      previousStatus: metadata?.previousStatus ?? null,
      version: metadata?.version ?? null,
    },
  }];
});

// A base64url cursor carries both tenant IDs and a canonical clinical source ID.
// Adipometry UUIDs and anthropometry revision IDs can exceed the old 256-character
// HTTP limit even though the generated cursor is valid. Keep a bounded limit.
export const STUDENT_TIMELINE_CURSOR_MAX_LENGTH = 512;
type TimelineCursor = { v: 1; alunoId: string; contractId: string | null; at: string; kind: TimelineEventKind; id: string };

const timelineTimestamp = (value: unknown) => new Date(String(value)).getTime();
const timelineKey = (event: unknown, kind: TimelineEventKind) => {
  const value = event as { id: string; occurredAt: unknown };
  return { at: timelineTimestamp(value.occurredAt), kind, id: String(value.id) };
};
const compareTimelineKeys = (
  a: { at: number; kind: TimelineEventKind; id: string },
  b: { at: number; kind: TimelineEventKind; id: string },
) => {
  const priority: Record<TimelineEventKind, number> = { legacy: 0, clinical: 1, training: 2 };
  return b.at - a.at || priority[a.kind] - priority[b.kind] || b.id.localeCompare(a.id);
};

const decodeTimelineCursor = (raw: string, alunoId: string, contractId?: string): TimelineCursor => {
  try {
    if (!raw || raw.length > STUDENT_TIMELINE_CURSOR_MAX_LENGTH || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('invalid');
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid');
    const data = parsed as Partial<TimelineCursor>;
    if (data.v !== 1 || data.alunoId !== alunoId || data.contractId !== (contractId ?? null) ||
        (data.kind !== 'legacy' && data.kind !== 'clinical' && data.kind !== 'training') ||
        typeof data.id !== 'string' || !data.id || data.id.length > 128 ||
        typeof data.at !== 'string' || !Number.isFinite(Date.parse(data.at)) ||
        new Date(data.at).toISOString() !== data.at) throw new Error('invalid');
    return data as TimelineCursor;
  } catch {
    throw new Error('INVALID_TIMELINE_CURSOR');
  }
};
const encodeTimelineCursor = (
  key: { at: number; kind: TimelineEventKind; id: string },
  alunoId: string, contractId?: string,
) => Buffer.from(JSON.stringify({
  v: 1, alunoId, contractId: contractId ?? null, at: new Date(key.at).toISOString(), kind: key.kind, id: key.id,
})).toString('base64url');

const buildTimeline = ({
  aluno,
  profile,
  intake,
  assessments,
  financial,
  integrations,
  activities,
}: {
  aluno: any;
  profile: any;
  intake: any;
  assessments: any[];
  financial: any;
  integrations: any;
  activities: any;
}) => {
  const events: Array<Record<string, unknown>> = [];

  events.push({
    id: `student-created-${aluno.id}`,
    type: 'student_created',
    title: 'Aluno cadastrado',
    occurredAt: aluno.createdAt,
    source: buildSource(null, 'system', aluno.id),
  });

  if (profile?.createdAt || profile?.updatedAt || profile?.legacyProfileId) {
    const profileWasUpdated =
      profile?.updatedAt && profile?.createdAt && !areSameInstants(profile.updatedAt, profile.createdAt);

    events.push({
      id: `${profileWasUpdated ? 'profile-updated' : 'profile-created'}-${aluno.id}`,
      type: profileWasUpdated ? 'profile_updated' : 'profile_created',
      title: profileWasUpdated ? 'Cadastro do aluno atualizado' : 'Cadastro do aluno registrado',
      occurredAt: profileWasUpdated ? profile.updatedAt : profile.createdAt ?? profile.updatedAt,
      source: profile.source,
    });
  }

  if (hasIntakeTimelineData(intake)) {
    const intakeWasUpdated =
      intake?.updatedAt &&
      intake?.createdAt &&
      !areSameInstants(intake.updatedAt, intake.createdAt) &&
      (!intake.assessmentDate ||
        new Date(String(intake.updatedAt)).getTime() > new Date(String(intake.assessmentDate)).getTime());

    events.push({
      id: `intake-${aluno.id}`,
      type: intakeWasUpdated ? 'intake_updated' : 'intake_recorded',
      title: intakeWasUpdated ? 'Anamnese inicial atualizada' : 'Anamnese inicial registrada',
      occurredAt:
        intakeWasUpdated
          ? intake.updatedAt
          : intake.assessmentDate ?? intake.createdAt ?? intake.updatedAt,
      source: intake.source,
    });
  }

  for (const assessment of assessments.slice(0, 10)) {
    events.push({
      id: `assessment-${assessment.id}`,
      type: 'assessment_recorded',
      title: assessment.title ?? 'Avaliação registrada',
      occurredAt: assessment.performedAt,
      source: assessment.source,
      details: {
        category: assessment.category,
        status: assessment.status,
      },
    });
  }

  events.push(...buildContractTimelineEvents(financial?.contracts ?? []));

  for (const account of integrations.accounts.slice(0, 5)) {
    events.push({
      id: `integration-connected-${account.id}`,
      type: 'integration_connected',
      title: `Integração ${account.provider} vinculada`,
      occurredAt: account.createdAt,
      source: account.source,
      details: {
        provider: account.provider,
        connectionStatus: account.connectionStatus,
        externalUserId: account.externalUserId,
      },
    });

    if (account.lastSyncAt && !areSameInstants(account.lastSyncAt, account.createdAt)) {
      events.push({
        id: `integration-synchronized-${account.id}`,
        type: 'integration_synchronized',
        title: `Integração ${account.provider} sincronizada`,
        occurredAt: account.lastSyncAt,
        source: account.source,
        details: {
          provider: account.provider,
          connectionStatus: account.connectionStatus,
        },
      });
    }
  }

  for (const activity of activities.activities.slice(0, 10)) {
    events.push({
      id: `activity-${activity.id}`,
      type: 'external_activity_imported',
      title: `Atividade ${activity.provider} importada`,
      occurredAt: activity.importedAt ?? activity.createdAt ?? activity.startedAt,
      source: activity.source,
      details: {
        provider: activity.provider,
        activityType: activity.activityType,
        startedAt: activity.startedAt,
        distanceMeters: activity.distanceMeters,
        durationSeconds: activity.durationSeconds,
      },
    });
  }

  return events
    .filter((event) => event.occurredAt)
    .sort((a, b) => new Date(String(b.occurredAt)).getTime() - new Date(String(a.occurredAt)).getTime());
};


/**
 * Reconstruct only authorized timeline domains when a broad compatibility
 * snapshot fails. Keep retries sequential to avoid exhausting the DB pool.
 */
async function loadDegradedTimelineSnapshot(
  alunoId: string, contractId: string, grants: TimelineDomainAccess,
): Promise<{ aluno: any; unavailableDomains: string[] }> {
  const where = { id: alunoId, contractId };
  const base = await prisma.aluno.findFirst({ where });
  if (!base) return { aluno: null, unavailableDomains: [] };
  const snapshot: any = {
    ...base, user: null, professor: null, studentProfile: null,
    intakeForm: null, studentHealthIntake: null, parqSubmissions: [],
    assessments: [], studentAssessmentRecords: [],
    studentFinancialProfile: null, service: null,
    integrations: [], studentExternalAccounts: [], studentExternalActivities: [],
  };
  const unavailableDomains: string[] = [];
  const readPart = async (
    domain: string, enabled: boolean, load: () => Promise<any>, keys: string[],
  ) => {
    if (!enabled) return;
    try {
      const row = await load();
      if (!row) {
        unavailableDomains.push(domain);
        return;
      }
      const scoped = scopeAlunoDomainSnapshot(row, contractId);
      for (const key of keys) snapshot[key] = scoped[key];
    } catch {
      unavailableDomains.push(domain);
    }
  };
  await readPart('Cadastro', grants.profile,
    () => prisma.aluno.findFirst({ where, include: {
      user: { include: { profile: true } },
      professor: { include: { user: { include: { profile: true } } } },
      studentProfile: true,
    } }), ['user', 'professor', 'studentProfile']);
  await readPart('Anamnese', grants.health && grants.clinical.intake,
    () => prisma.aluno.findFirst({ where, include: {
      intakeForm: true, studentHealthIntake: true,
      parqSubmissions: {
        where: { declarationAccepted: true,
          catalogVersion: { in: [PARQ_CATALOG_VERSION, PARQ_LEGACY_CATALOG_VERSION] } },
        orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
      },
    } }), ['intakeForm', 'studentHealthIntake', 'parqSubmissions']);
  await readPart('Avaliações', grants.assessments,
    () => prisma.aluno.findFirst({ where, include: {
      assessments: { include: { type: true }, orderBy: { assessmentDate: 'desc' }, take: 20 },
      studentAssessmentRecords: {
        include: { measurements: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { performedAt: 'desc' },
      },
    } }), ['assessments', 'studentAssessmentRecords']);
  await readPart('Financeiro', grants.financial,
    () => prisma.aluno.findFirst({ where, include: {
      studentFinancialProfile: true, service: true,
    } }), ['studentFinancialProfile', 'service']);
  await readPart('Integrações', grants.integrations,
    () => prisma.aluno.findFirst({ where, include: {
      integrations: { orderBy: { createdAt: 'desc' } },
      studentExternalAccounts: { orderBy: { createdAt: 'desc' } },
      studentExternalActivities: { orderBy: { startedAt: 'desc' }, take: 50 },
    } }), ['integrations', 'studentExternalAccounts', 'studentExternalActivities']);
  return { aluno: snapshot, unavailableDomains };
}

export const studentDomainService = {
  async loadAlunoDomainSnapshot(alunoId: string, options: StudentDomainQueryOptions = {}) {
    const aluno = await prisma.aluno.findFirst({
      where: {
        id: alunoId,
        ...(options.companyContractId ? { contractId: options.companyContractId } : {}),
      },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
        professor: {
          include: {
            user: {
              include: {
                profile: true,
              },
            },
          },
        },
        service: true,
        macronutrients: true,
        intakeForm: true,
        assessments: {
          include: {
            type: true,
          },
          orderBy: {
            assessmentDate: 'desc',
          },
          take: 20,
        },
        contracts: {
          select: {
            id: true,
            title: true,
            status: true,
            createdAt: true,
            signedAt: true,
            cancelledAt: true,
            serviceId: true,
            companyContractId: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 10,
        },
        integrations: {
          orderBy: {
            createdAt: 'desc',
          },
        },
        studentProfile: true,
        studentHealthIntake: true,
        parqSubmissions: {
          where: {
            declarationAccepted: true,
            catalogVersion: { in: [PARQ_CATALOG_VERSION, PARQ_LEGACY_CATALOG_VERSION] },
          },
          orderBy: [{ submittedAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
        studentAssessmentRecords: {
          include: {
            measurements: {
              orderBy: {
                sortOrder: 'asc',
              },
            },
          },
          orderBy: {
            performedAt: 'desc',
          },
        },
        studentFinancialProfile: true,
        studentExternalAccounts: {
          orderBy: {
            createdAt: 'desc',
          },
        },
        studentExternalActivities: {
          orderBy: {
            startedAt: 'desc',
          },
          take: 50,
        },
      },
    });

    return scopeAlunoDomainSnapshot(aluno, options.companyContractId);
  },

  async getProfile(alunoId: string, options: StudentDomainQueryOptions = {}) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId, options);
    return this.getProfileFromSnapshot(aluno);
  },

  getProfileFromSnapshot(aluno: any) {
    if (!aluno) {
      return null;
    }

    const fallback = buildProfileFallback(aluno);
    const profile = aluno.studentProfile;

    return {
      alunoId: aluno.id,
      source: buildSource(profile, 'student', aluno.id),
      identification: profile?.identificationData ?? fallback.identification,
      preferences: profile?.preferenceData ?? fallback.preferences,
      objectives: profile?.objectiveData ?? fallback.objectives,
      updatedAt: profile?.updatedAt ?? aluno.user?.profile?.updatedAt ?? aluno.updatedAt,
      createdAt: profile?.createdAt ?? aluno.createdAt,
      legacyProfileId: aluno.user?.profile?.id ?? null,
    };
  },

  async getHealthIntake(alunoId: string, options: StudentDomainQueryOptions = {}) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId, options);
    return this.getHealthIntakeFromSnapshot(aluno);
  },

  getHealthIntakeFromSnapshot(aluno: any) {
    if (!aluno) {
      return null;
    }

    const fallback = buildHealthIntakeFallback(aluno);
    const intake = aluno.studentHealthIntake;
    const latestParq = aluno.parqSubmissions?.[0] ?? null;

    return {
      alunoId: aluno.id,
      source: buildSource(intake, 'student', aluno.intakeForm?.id ?? aluno.id),
      assessmentDate: intake?.assessmentDate ?? fallback.assessmentDate,
      status: intake?.status ?? (intake ? 'IN_PROGRESS' : 'NOT_STARTED'),
      version: intake?.version ?? 1,
      currentStep: intake?.currentStep ?? null,
      questionnaires: {
        // PAR-Q possui ciclo próprio em StudentParqSubmission. O campo da
        // Anamnese permanece somente como compatibilidade histórica de leitura.
        parq: latestParq?.responses ?? intake?.questionnaireParq ?? fallback.questionnaires.parq,
        american: intake?.questionnaireAha ?? fallback.questionnaires.american,
      },
      clinicalHistory: intake?.clinicalHistoryData ?? fallback.clinicalHistory,
      medications: intake?.medicationData ?? fallback.medications,
      injuries: intake?.injuryData ?? fallback.injuries,
      allergies: intake?.allergyData ?? fallback.allergies,
      rawFormResponses: intake?.rawFormResponses ?? fallback.rawFormResponses,
      observations: intake?.observations ?? fallback.observations,
      updatedAt: intake?.updatedAt ?? aluno.intakeForm?.updatedAt ?? aluno.updatedAt,
      createdAt: intake?.createdAt ?? aluno.intakeForm?.createdAt ?? aluno.createdAt,
      legacyIntakeId: aluno.intakeForm?.id ?? null,
      migratedFromLegacy: Boolean(intake?.legacyIntakeId),
      migrationReviewRequired: intake?.migrationReviewRequired ?? false,
      migrationStatus: intake?.migrationStatus ?? null,
    };
  },

  async listAssessmentRecords(alunoId: string, options: StudentDomainQueryOptions = {}) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId, options);
    return this.listAssessmentRecordsFromSnapshot(aluno);
  },

  listAssessmentRecordsFromSnapshot(aluno: any) {
    if (!aluno) {
      return null;
    }

    const segmentedAssessments = aluno.studentAssessmentRecords.map(mapSegmentedAssessment);
    const legacyAssessments = aluno.assessments.map(mapLegacyAssessment);
    const items = [...segmentedAssessments, ...legacyAssessments].sort(
      (left, right) =>
        new Date(String(right.performedAt)).getTime() - new Date(String(left.performedAt)).getTime()
    );

    return {
      alunoId: aluno.id,
      items,
      total: items.length,
      hasSegmentedRecords: segmentedAssessments.length > 0,
      hasLegacyRecords: aluno.assessments.length > 0,
    };
  },

  async getFinancialProfile(alunoId: string, options: StudentDomainQueryOptions = {}) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId, options);
    if (!aluno) {
      return null;
    }
    const contracts = await studentContractService.listByAluno(alunoId, {
      companyContractId: options.companyContractId,
    });
    return this.getFinancialProfileFromSnapshot(aluno, contracts);
  },

  getFinancialProfileFromSnapshot(aluno: any, contracts: any[]) {
    if (!aluno) {
      return null;
    }

    const financial = aluno.studentFinancialProfile;
    const activeContract = contracts.find((item) => item.status === 'active') ?? null;
    const intakeFinancial = toRecord(aluno.intakeForm?.formResponses)?.financial ?? null;

    return {
      alunoId: aluno.id,
      source: buildSource(financial, 'student', aluno.id),
      currentServiceName:
        financial?.currentServiceName ?? activeContract?.service?.name ?? aluno.service?.name ?? null,
      specialCondition: financial?.specialCondition ?? null,
      monthlyAmount: financial?.monthlyAmount ? toNumber(financial.monthlyAmount) : activeContract?.amount ?? null,
      discountPercentage: toNumber(financial?.discountPercentage),
      paymentDay: financial?.paymentDay ?? activeContract?.paymentDay ?? null,
      contractStartDate: financial?.contractStartDate ?? activeContract?.startDate ?? null,
      contractDueDate: financial?.contractDueDate ?? activeContract?.endDate ?? null,
      cameFromReferral: financial?.cameFromReferral ?? null,
      referralPerson: financial?.referralPerson ?? null,
      notes: financial?.notes ?? activeContract?.notes ?? null,
      activeContract,
      contracts,
      rawFinancialForm: intakeFinancial,
      updatedAt: financial?.updatedAt ?? aluno.updatedAt,
      createdAt: financial?.createdAt ?? aluno.createdAt,
    };
  },

  async getIntegrations(alunoId: string, options: StudentDomainQueryOptions = {}) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId, options);
    return this.getIntegrationsFromSnapshot(aluno);
  },

  getIntegrationsFromSnapshot(aluno: any) {
    if (!aluno) {
      return null;
    }

    const segmentedAccounts = aluno.studentExternalAccounts.map(mapExternalAccount);
    const legacyAccounts = segmentedAccounts.length === 0 ? aluno.integrations.map(mapLegacyIntegration) : [];
    const accounts = [...segmentedAccounts, ...legacyAccounts];

    return {
      alunoId: aluno.id,
      accounts,
      total: accounts.length,
      lastSyncAt:
        accounts
          .map((account) => account.lastSyncAt)
          .filter(Boolean)
          .sort((left, right) => new Date(String(right)).getTime() - new Date(String(left)).getTime())[0] ??
        null,
    };
  },

  async listExternalActivities(alunoId: string, options: StudentDomainQueryOptions = {}) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId, options);
    return this.listExternalActivitiesFromSnapshot(aluno);
  },

  listExternalActivitiesFromSnapshot(aluno: any) {
    if (!aluno) {
      return null;
    }

    const activities = aluno.studentExternalActivities.map(mapExternalActivity);

    return {
      alunoId: aluno.id,
      activities,
      total: activities.length,
      hasImportedActivities: activities.length > 0,
    };
  },

  async getSummary(alunoId: string, options: StudentDomainQueryOptions = {}) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId, options);
    if (!aluno) {
      return null;
    }
    const contracts = await studentContractService.listByAluno(alunoId, {
      companyContractId: options.companyContractId,
    });
    const profile = this.getProfileFromSnapshot(aluno);
    const intake = this.getHealthIntakeFromSnapshot(aluno);
    const assessments = this.listAssessmentRecordsFromSnapshot(aluno);
    const financial = this.getFinancialProfileFromSnapshot(aluno, contracts);
    const integrations = this.getIntegrationsFromSnapshot(aluno);
    const activities = this.listExternalActivitiesFromSnapshot(aluno);

    if (!aluno || !profile || !intake || !assessments || !financial || !integrations || !activities) {
      return null;
    }

    const latestAssessment = assessments.items[0] ?? null;

    return {
      alunoId: aluno.id,
      status: {
        isActive: aluno.user?.isActive ?? false,
        schedulePlan: aluno.schedulePlan,
      },
      overview: {
        name: (profile.identification as Record<string, unknown>).name ?? null,
        email: (profile.identification as Record<string, unknown>).email ?? null,
        phone: (profile.identification as Record<string, unknown>).phone ?? null,
        mainGoal:
          ((profile.objectives as Record<string, unknown>)?.mainGoal as string | null | undefined) ?? null,
        currentServiceName: financial.currentServiceName,
        professorResponsible: aluno.professor?.user?.profile?.name ?? null,
      },
      profile,
      intake,
      financial,
      integrations: {
        totalAccounts: integrations.total,
        lastSyncAt: integrations.lastSyncAt,
        accounts: integrations.accounts.slice(0, 5),
      },
      assessments: {
        total: assessments.total,
        latest: latestAssessment,
      },
      activities: {
        total: activities.total,
        latest: activities.activities[0] ?? null,
      },
      updatedAt: [
        profile.updatedAt,
        intake.updatedAt,
        financial.updatedAt,
        latestAssessment?.updatedAt ?? latestAssessment?.performedAt ?? null,
        integrations.lastSyncAt,
        activities.activities[0]?.updatedAt ?? activities.activities[0]?.startedAt ?? null,
      ]
        .filter(Boolean)
        .sort((left, right) => new Date(String(right)).getTime() - new Date(String(left)).getTime())[0] ??
        aluno.updatedAt,
    };
  },

  /**
   * Read only the relationships required by the server-resolved timeline
   * grants. Audit access alone never queries clinical or financial relations.
   * This also prevents an inaccessible optional relation from breaking Audit.
   */
  async loadAlunoTimelineSnapshot(alunoId: string, options: StudentDomainQueryOptions = {}) {
    const grants = options.timelineAccess ?? NO_TIMELINE_DOMAIN_ACCESS;
    const canReadLegacyIntake = grants.health && grants.clinical.intake;
    const aluno = await prisma.aluno.findFirst({
      where: {
        id: alunoId,
        ...(options.companyContractId ? { contractId: options.companyContractId } : {}),
      },
      include: {
        ...(grants.profile ? {
          user: { include: { profile: true } },
          studentProfile: true,
        } : {}),
        ...(canReadLegacyIntake ? {
          intakeForm: true,
          studentHealthIntake: true,
          parqSubmissions: {
            where: {
              declarationAccepted: true,
              catalogVersion: { in: [PARQ_CATALOG_VERSION, PARQ_LEGACY_CATALOG_VERSION] },
            },
            orderBy: [{ submittedAt: 'desc' as const }, { createdAt: 'desc' as const }],
            take: 1,
          },
        } : {}),
        ...(grants.assessments ? {
          assessments: {
            include: { type: true },
            orderBy: { assessmentDate: 'desc' as const },
            take: 20,
          },
          studentAssessmentRecords: {
            include: { measurements: { orderBy: { sortOrder: 'asc' as const } } },
            orderBy: { performedAt: 'desc' as const },
          },
        } : {}),
        ...(grants.financial ? {
          service: true,
          studentFinancialProfile: true,
        } : {}),
        ...(grants.integrations ? {
          integrations: { orderBy: { createdAt: 'desc' as const } },
          studentExternalAccounts: { orderBy: { createdAt: 'desc' as const } },
          studentExternalActivities: { orderBy: { startedAt: 'desc' as const }, take: 50 },
        } : {}),
      },
    });
    if (!aluno) return null;
    // Stable fallback shape for existing projection helpers. No denied relation
    // is queried, rehydrated, or returned to the event builder.
    return scopeAlunoDomainSnapshot({
      ...aluno,
      user: grants.profile ? (aluno as any).user ?? null : null,
      professor: null,
      studentProfile: grants.profile ? (aluno as any).studentProfile ?? null : null,
      intakeForm: canReadLegacyIntake ? (aluno as any).intakeForm ?? null : null,
      studentHealthIntake: canReadLegacyIntake ? (aluno as any).studentHealthIntake ?? null : null,
      parqSubmissions: canReadLegacyIntake ? (aluno as any).parqSubmissions ?? [] : [],
      assessments: grants.assessments ? (aluno as any).assessments ?? [] : [],
      studentAssessmentRecords: grants.assessments ? (aluno as any).studentAssessmentRecords ?? [] : [],
      service: grants.financial ? (aluno as any).service ?? null : null,
      studentFinancialProfile: grants.financial ? (aluno as any).studentFinancialProfile ?? null : null,
      contracts: [],
      integrations: grants.integrations ? (aluno as any).integrations ?? [] : [],
      studentExternalAccounts: grants.integrations ? (aluno as any).studentExternalAccounts ?? [] : [],
      studentExternalActivities: grants.integrations ? (aluno as any).studentExternalActivities ?? [] : [],
    }, options.companyContractId);
  },

  async getTimeline(alunoId: string, options: StudentDomainQueryOptions = {}) {
    // The API route supplies server-resolved permission grants. Missing grants
    // fail closed: being allowed to view Audit is not permission to see health.
    const grants = options.timelineAccess ?? NO_TIMELINE_DOMAIN_ACCESS;
    const unavailableDomains: string[] = [];
    let aluno: any;
    try {
      aluno = await this.loadAlunoTimelineSnapshot(alunoId, options);
    } catch (error) {
      // A failing optional relation must not hide independent clinical sources.
      if (!options.companyContractId) throw error;
      const recovered = await loadDegradedTimelineSnapshot(
        alunoId, options.companyContractId, grants,
      );
      aluno = recovered.aluno;
      unavailableDomains.push(...recovered.unavailableDomains);
    }
    if (!aluno) return null;

    const cursor = options.timelineCursor
      ? decodeTimelineCursor(options.timelineCursor, alunoId, options.companyContractId)
      : null;
    const pageSize = Math.min(200, Math.max(1, options.timelineLimit ?? 100));
    const cursorKey = cursor
      ? { at: Date.parse(cursor.at), kind: cursor.kind, id: cursor.id }
      : null;

    let contracts: Awaited<ReturnType<typeof studentContractService.listByAluno>> = [];
    if (grants.financial) {
      try {
        contracts = await studentContractService.listByAluno(alunoId, {
          companyContractId: options.companyContractId,
        });
      } catch {
        unavailableDomains.push('Contratos');
      }
    }

    const profile = this.getProfileFromSnapshot(aluno);
    const intake = this.getHealthIntakeFromSnapshot(aluno);
    const assessments = this.listAssessmentRecordsFromSnapshot(aluno);
    const financial = this.getFinancialProfileFromSnapshot(aluno, contracts);
    const integrations = this.getIntegrationsFromSnapshot(aluno);
    const activities = this.listExternalActivitiesFromSnapshot(aluno);
    if (!profile || !intake || !assessments || !financial || !integrations || !activities) return null;

    const clinical = options.companyContractId
      ? await readClinicalTimeline(alunoId, options.companyContractId, grants.clinical, pageSize, cursor ?? undefined)
      : { items: [], unavailableDomains: [] };
    unavailableDomains.push(...clinical.unavailableDomains);

    // Canonical intake exists across the whole source, not only on this page.
    // An old legacy snapshot must not reappear when its revision is outside the cursor.
    const hasCanonicalOnPage = clinical.items.some((event) => event.type === 'prnt_intake_revision');
    // Unknown is not absent: never expose a legacy clinical event on failed lookup.
    let canonicalIntakeConfirmedAbsent = false;
    if (!hasCanonicalOnPage && grants.clinical.intake && options.companyContractId) {
      try {
        canonicalIntakeConfirmedAbsent = !(await prisma.studentHealthIntakeRevision.findFirst({
          where: { alunoId, contractId: options.companyContractId },
          select: { id: true },
        }));
      } catch {
        if (!unavailableDomains.includes('Anamnese')) unavailableDomains.push('Anamnese');
      }
    }
    const legacyItems = buildTimeline({
      aluno, profile, intake, assessments: assessments.items, financial, integrations, activities,
    }).filter((event) => {
      const type = String(event.type);
      if (type.startsWith('profile_')) return grants.profile;
      if (type.startsWith('intake_')) return grants.health
        && grants.clinical.intake && canonicalIntakeConfirmedAbsent;
      if (type.startsWith('assessment_')) return grants.assessments;
      if (type.startsWith('financial_')) return grants.financial;
      if (type.startsWith('integration_') || type.startsWith('external_activity_')) return grants.integrations;
      return type === 'student_created';
    });
    const legacy = legacyItems.map((event) => ({ event, key: timelineKey(event, 'legacy') }))
      .filter(({ key }) => !cursorKey || compareTimelineKeys(key, cursorKey) > 0);

    const clinicalEntries = clinical.items.map((event) => ({
      event, key: timelineKey(event, 'clinical'),
    })).filter(({ key }) => !cursorKey || compareTimelineKeys(key, cursorKey) > 0);

    const trainingDomains = ['pre_workout_check_in', 'workout_session_execution', 'post_workout_feedback'];
    const scopedDomain = { OR: trainingDomains.map((domain) => ({
      metadata: { path: ['domain'], equals: domain },
    })) };
    const trainingTimeFilter = cursor
      ? { OR: [
          { createdAt: { lt: new Date(cursor.at) } },
          ...(cursor.kind === 'training'
            ? [{ createdAt: new Date(cursor.at), id: { lt: cursor.id } }]
            : [{ createdAt: new Date(cursor.at) }]),
        ] }
      : {};
    const trainingRecords = grants.training
      ? await prisma.studentLifecycleEvent.findMany({
          where: {
            alunoId,
            ...(options.companyContractId ? { contractId: options.companyContractId } : {}),
            AND: [scopedDomain, trainingTimeFilter],
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: pageSize + 1,
        }).catch(() => {
          unavailableDomains.push('Treinamento');
          return [];
        })
      : [];
    const training = trainingRecords.flatMap((record) => buildTrainingTimelineEvents([record]).map((event) => ({
      event, key: { at: timelineTimestamp(event.occurredAt), kind: 'training' as const, id: record.id as string },
    })));

    const unique = new Map<string, typeof legacy[number] | typeof clinicalEntries[number] | typeof training[number]>();
    for (const item of [...legacy, ...clinicalEntries, ...training]) {
      const id = String(item.event.id);
      if (!unique.has(id)) unique.set(id, item);
    }
    const combined = [...unique.values()].sort((a, b) => compareTimelineKeys(a.key, b.key));
    const selected = combined.slice(0, pageSize);
    const hasMore = combined.length > pageSize
      || clinical.items.length > pageSize
      || trainingRecords.length > pageSize;
    const last = selected[selected.length - 1];
    return {
      alunoId: aluno.id,
      items: selected.map(({ event }) => {
        const data = event as Record<string, unknown>;
        const source = data.source as {
          type?: string; reference?: string | null; recordedByUserId?: string | null;
        } | undefined;
        return {
          ...data,
          id: String(data.id),
          type: String(data.type),
          title: String(data.title),
          occurredAt: data.occurredAt as string | Date,
          source: source ?? { type: 'system', reference: String(data.id), recordedByUserId: null },
          details: data.details as Record<string, unknown> | undefined,
          sourceType: typeof data.sourceType === 'string' ? data.sourceType : source?.type ?? 'system',
          sourceId: typeof data.sourceId === 'string' ? data.sourceId : source?.reference ?? String(data.id),
          contractId: options.companyContractId,
          actorUserId: typeof data.actorUserId === 'string' ? data.actorUserId
            : source?.recordedByUserId ?? null,
        };
      }),
      total: selected.length,
      nextCursor: hasMore && last ? encodeTimelineCursor(last.key, alunoId, options.companyContractId) : null,
      partial: unavailableDomains.length > 0,
      unavailableDomains,
    };
  }
};
