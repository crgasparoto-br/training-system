import { PrismaClient } from '@prisma/client';
import { studentContractService } from '../student-contracts/student-contract.service.js';

const prisma = new PrismaClient();

type StudentDomainQueryOptions = {
  companyContractId?: string;
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
  source: buildSource(null, 'integration', account.id),
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
  source: buildSource(null, 'integration', activity.externalActivityId),
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

export const studentDomainService = {
  async loadAlunoDomainSnapshot(alunoId: string) {
    return prisma.aluno.findUnique({
      where: { id: alunoId },
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
  },

  async getProfile(alunoId: string) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId);
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

  async getHealthIntake(alunoId: string) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId);
    if (!aluno) {
      return null;
    }

    const fallback = buildHealthIntakeFallback(aluno);
    const intake = aluno.studentHealthIntake;

    return {
      alunoId: aluno.id,
      source: buildSource(intake, 'student', aluno.intakeForm?.id ?? aluno.id),
      assessmentDate: intake?.assessmentDate ?? fallback.assessmentDate,
      questionnaires: {
        parq: intake?.questionnaireParq ?? fallback.questionnaires.parq,
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
    };
  },

  async listAssessmentRecords(alunoId: string) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId);
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
    const [aluno, contracts] = await Promise.all([
      this.loadAlunoDomainSnapshot(alunoId),
      studentContractService.listByAluno(alunoId, {
        companyContractId: options.companyContractId,
      }),
    ]);

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

  async getIntegrations(alunoId: string) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId);
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

  async listExternalActivities(alunoId: string) {
    const aluno = await this.loadAlunoDomainSnapshot(alunoId);
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
    const [aluno, profile, intake, assessments, financial, integrations, activities] = await Promise.all([
      this.loadAlunoDomainSnapshot(alunoId),
      this.getProfile(alunoId),
      this.getHealthIntake(alunoId),
      this.listAssessmentRecords(alunoId),
      this.getFinancialProfile(alunoId, options),
      this.getIntegrations(alunoId),
      this.listExternalActivities(alunoId),
    ]);

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

  async getTimeline(alunoId: string, options: StudentDomainQueryOptions = {}) {
    const [aluno, profile, intake, assessments, financial, integrations, activities] = await Promise.all([
      this.loadAlunoDomainSnapshot(alunoId),
      this.getProfile(alunoId),
      this.getHealthIntake(alunoId),
      this.listAssessmentRecords(alunoId),
      this.getFinancialProfile(alunoId, options),
      this.getIntegrations(alunoId),
      this.listExternalActivities(alunoId),
    ]);

    if (!aluno || !profile || !intake || !assessments || !financial || !integrations || !activities) {
      return null;
    }

    const items = buildTimeline({
      aluno,
      profile,
      intake,
      assessments: assessments.items,
      financial,
      integrations,
      activities,
    });

    return {
      alunoId: aluno.id,
      items,
      total: items.length,
    };
  },
};
