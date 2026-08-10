import api from './api';
import type { FixedScheduleSlotInput } from './agenda.service';
import type { ParqAdministrativeSummaryDTO } from '@corrida/types';

export interface Aluno {
  id: string;
  userId: string;
  professorId: string;
  serviceId?: string;
  schedulePlan: 'free' | 'fixed';
  systolicPressure?: number;
  diastolicPressure?: number;
  age: number;
  weight?: number | null;
  height?: number | null;
  bodyFatPercentage?: number | null;
  vo2Max?: number | null;
  anaerobicThreshold?: number | null;
  maxHeartRate?: number | null;
  restingHeartRate?: number | null;
  user: {
    email: string;
    isActive?: boolean;
    profile: {
      name: string;
      phone?: string;
      avatar?: string;
      birthDate?: string;
      gender?: 'male' | 'female' | 'other';
    };
  };
  professor?: {
    id: string;
    user?: {
      profile?: {
        name?: string;
      };
    };
  };
  service?: {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
  };
  macronutrients?: {
    carbohydratesPercentage: number;
    proteinsPercentage: number;
    lipidsPercentage: number;
    dailyCalories?: number;
  };
  parq?: ParqAdministrativeSummaryDTO;
  intakeForm?: {
    assessmentDate?: string;
    mainGoal?: string;
    medicalHistory?: string;
    currentMedications?: string;
    injuriesHistory?: string;
    trainingBackground?: string;
    observations?: string;
    parqResponses?: {
      q1: boolean;
      q2: boolean;
      q3: boolean;
      q4: boolean;
      q5: boolean;
      q6: boolean;
      q7: boolean;
      q8: boolean;
    };
    formResponses?: Record<string, unknown>;
  };
  lastPasswordResetAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlunoResult {
  aluno: Aluno;
  tempPassword: string;
}

export interface AlunoAssessmentPrefill {
  name?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
  age?: number;
  weight?: number;
  height?: number;
  bodyFatPercentage?: number;
  vo2Max?: number;
  anaerobicThreshold?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  systolicPressure?: number;
  diastolicPressure?: number;
  macronutrients?: {
    carbohydratesPercentage?: number;
    proteinsPercentage?: number;
    lipidsPercentage?: number;
    dailyCalories?: number;
  };
  intakeForm?: {
    assessmentDate?: string;
    trainingBackground?: string;
    observations?: string;
  };
  extractedPreview?: {
    parseOk: boolean;
    sourceName?: string;
    sourceAssessmentDate?: string;
  };
}

export interface CreateAlunoDTO {
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  serviceId?: string;
  schedulePlan: 'free' | 'fixed';
  fixedScheduleSlots?: FixedScheduleSlotInput[];
  confirmKeepFutureBookings?: boolean;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
  age: number;
  weight?: number;
  height?: number;
  bodyFatPercentage?: number;
  vo2Max?: number;
  anaerobicThreshold?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  systolicPressure?: number;
  diastolicPressure?: number;
  macronutrients?: {
    carbohydratesPercentage?: number;
    proteinsPercentage?: number;
    lipidsPercentage?: number;
    dailyCalories?: number;
  };
  intakeForm?: {
    assessmentDate?: string;
    mainGoal?: string;
    medicalHistory?: string;
    currentMedications?: string;
    injuriesHistory?: string;
    trainingBackground?: string;
    observations?: string;
    parqResponses?: {
      q1: boolean;
      q2: boolean;
      q3: boolean;
      q4: boolean;
      q5: boolean;
      q6: boolean;
      q7: boolean;
      q8: boolean;
    };
    formResponses?: Record<string, unknown>;
  };
}

export interface UpdateAlunoDTO {
  avatar?: string;
  serviceId?: string;
  schedulePlan?: 'free' | 'fixed';
  fixedScheduleSlots?: FixedScheduleSlotInput[];
  confirmKeepFutureBookings?: boolean;
  birthDate?: string;
  gender?: 'male' | 'female' | 'other';
  age?: number;
  weight?: number;
  height?: number;
  bodyFatPercentage?: number;
  vo2Max?: number;
  anaerobicThreshold?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  systolicPressure?: number;
  diastolicPressure?: number;
  professorId?: string;
  macronutrients?: {
    carbohydratesPercentage?: number;
    proteinsPercentage?: number;
    lipidsPercentage?: number;
    dailyCalories?: number;
  };
  intakeForm?: {
    assessmentDate?: string;
    mainGoal?: string;
    medicalHistory?: string;
    currentMedications?: string;
    injuriesHistory?: string;
    trainingBackground?: string;
    observations?: string;
    parqResponses?: {
      q1: boolean;
      q2: boolean;
      q3: boolean;
      q4: boolean;
      q5: boolean;
      q6: boolean;
      q7: boolean;
      q8: boolean;
    };
    formResponses?: Record<string, unknown>;
  };
}

export interface AlunosResponse {
  alunos: Aluno[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export type ProfileReviewStatus =
  | 'pending'
  | 'completed_no_changes'
  | 'completed_with_changes'
  | 'expired'
  | 'canceled';

export interface ProfileReviewChangedField {
  path: string;
  before: unknown;
  after: unknown;
  requiresApproval: boolean;
  status: 'applied' | 'pending_approval' | 'approved' | 'rejected';
}

export interface ProfileReviewApproval {
  requiresApproval: boolean;
  hasPendingApproval: boolean;
  approvedAt?: string | null;
  approvedByUserId?: string | null;
  rejectedAt?: string | null;
  rejectedByUserId?: string | null;
  rejectionReason?: string | null;
}

export interface AlunoProfileReview {
  id: string;
  status: ProfileReviewStatus;
  requestedAt: string;
  dueAt?: string | null;
  completedAt?: string | null;
  changedFields: ProfileReviewChangedField[];
  approval: ProfileReviewApproval;
}

export interface AlunoProfileReviewSettings {
  id: string;
  alunoId: string;
  reviewPeriodMonths?: number | null;
  nextReviewAt?: string | null;
  isReviewRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AlunoProfileReviewPolicy {
  id: string;
  contractId: string;
  defaultReviewPeriodMonths: number;
  sections: string[];
  reminderBeforeDays?: number | null;
  reminderAfterDays?: number | null;
  isActive: boolean;
}

export interface AlunoProfileReviewSettingsResponse {
  alunoId: string;
  settings: AlunoProfileReviewSettings | null;
  policy: AlunoProfileReviewPolicy | null;
  effective: {
    reviewPeriodMonths: number;
    nextReviewAt?: string | null;
    isReviewRequired: boolean;
    sectionsRequested: string[];
  };
}

export interface CreateProfileReviewDTO {
  dueAt?: string;
  sectionsRequested?: string[];
}

export interface UpdateProfileReviewSettingsDTO {
  reviewPeriodMonths?: number | null;
  nextReviewAt?: string | null;
  isReviewRequired?: boolean;
}

export type AlunoAssessmentPlanStatus =
  | 'em_dia'
  | 'pendente'
  | 'vencida'
  | 'sem_planejamento';

export interface AlunoAssessmentPlanType {
  id: string;
  name: string;
  code: string;
  scheduleType: 'fixed_interval' | 'after_type';
  intervalMonths?: number | null;
  afterTypeId?: string | null;
  offsetMonths?: number | null;
}

export interface AlunoAssessmentPlanItem {
  id: string | null;
  alunoId: string;
  assessmentTypeId: string;
  isActive: boolean;
  isRequired: boolean;
  cadenceMonths: number | null;
  effectiveCadenceMonths: number | null;
  startDate: string | null;
  nextDueDate: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  assessmentType: AlunoAssessmentPlanType;
  summary: {
    lastAssessmentDate: string | null;
    nextDueDate: string | null;
    status: AlunoAssessmentPlanStatus;
  };
}

export interface AlunoAssessmentPlan {
  alunoId: string;
  generatedAt: string;
  items: AlunoAssessmentPlanItem[];
}

export interface SaveAlunoAssessmentPlanDTO {
  items: Array<{
    assessmentTypeId: string;
    isActive: boolean;
    isRequired?: boolean;
    cadenceMonths?: number | null;
    startDate?: string | null;
    nextDueDate?: string | null;
    notes?: string | null;
  }>;
}

export type StudentContractStatus =
  | 'draft'
  | 'pending_signature'
  | 'active'
  | 'expired'
  | 'canceled'
  | 'terminated';

export interface StudentContractLink {
  id: string;
  alunoId: string;
  contractId: string;
  serviceId?: string | null;
  status: StudentContractStatus;
  startDate?: string | null;
  endDate?: string | null;
  signedAt?: string | null;
  canceledAt?: string | null;
  cancellationReason?: string | null;
  amount?: number | null;
  paymentDay?: number | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  contract: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
    signedAt?: string | null;
    cancelledAt?: string | null;
    companyContractId: string;
    serviceId?: string | null;
  };
  service?: {
    id: string;
    name: string;
    code?: string | null;
    description?: string | null;
    monthlyPrice?: number | null;
    isActive?: boolean;
  } | null;
}

export interface AlunoContractsResponse {
  alunoId: string;
  activeContract: StudentContractLink | null;
  contracts: StudentContractLink[];
}

export interface LinkStudentContractDTO {
  contractId: string;
  serviceId?: string | null;
  status?: StudentContractStatus;
  startDate?: string | null;
  endDate?: string | null;
  amount?: number | null;
  paymentDay?: number | null;
  notes?: string | null;
}

export interface UpdateStudentContractDTO {
  serviceId?: string | null;
  status?: StudentContractStatus;
  startDate?: string | null;
  endDate?: string | null;
  signedAt?: string | null;
  canceledAt?: string | null;
  cancellationReason?: string | null;
  amount?: number | null;
  paymentDay?: number | null;
  notes?: string | null;
}

export type StudentDomainSourceType = 'student' | 'professional' | 'integration' | 'system';

export interface StudentDomainSource {
  type: StudentDomainSourceType;
  reference?: string | null;
  recordedByUserId?: string | null;
}

export interface StudentSegmentedProfile {
  alunoId: string;
  source: StudentDomainSource;
  identification: Record<string, unknown>;
  preferences: Record<string, unknown> | null;
  objectives: Record<string, unknown> | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  legacyProfileId?: string | null;
}

export interface StudentSegmentedIntake {
  alunoId: string;
  source: StudentDomainSource;
  status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  version?: number;
  currentStep?: string | null;
  assessmentDate?: string | null;
  questionnaires: {
    parq?: Record<string, unknown> | null;
    american?: Record<string, unknown> | null;
  };
  clinicalHistory?: Record<string, unknown> | null;
  medications?: Record<string, unknown> | null;
  injuries?: Record<string, unknown> | null;
  allergies?: Record<string, unknown> | null;
  rawFormResponses?: Record<string, unknown> | null;
  observations?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
  legacyIntakeId?: string | null;
  migratedFromLegacy?: boolean;
  migrationReviewRequired?: boolean;
  migrationStatus?: string | null;
}

export interface StudentAssessmentMeasurement {
  id: string;
  metricKey: string;
  metricLabel?: string | null;
  valueType: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
  valueJson?: Record<string, unknown> | null;
  unit?: string | null;
  notes?: string | null;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StudentSegmentedAssessmentRecord {
  id: string;
  category: string;
  code?: string | null;
  title?: string | null;
  performedAt: string;
  status: string;
  source: StudentDomainSource;
  summary?: Record<string, unknown> | null;
  notes?: string | null;
  measurements: StudentAssessmentMeasurement[];
  createdAt?: string;
  updatedAt?: string;
  legacyAssessmentId?: string;
}

export interface StudentSegmentedAssessmentResponse {
  alunoId: string;
  items: StudentSegmentedAssessmentRecord[];
  total: number;
  hasSegmentedRecords: boolean;
  hasLegacyRecords: boolean;
}

export interface StudentSegmentedFinancialProfile {
  alunoId: string;
  source: StudentDomainSource;
  currentServiceName?: string | null;
  specialCondition?: string | null;
  monthlyAmount?: number | null;
  discountPercentage?: number | null;
  paymentDay?: number | null;
  contractStartDate?: string | null;
  contractDueDate?: string | null;
  cameFromReferral?: boolean | null;
  referralPerson?: string | null;
  notes?: string | null;
  activeContract?: StudentContractLink | null;
  contracts: StudentContractLink[];
  rawFinancialForm?: Record<string, unknown> | null;
  updatedAt?: string | null;
  createdAt?: string | null;
}

export interface StudentSegmentedExternalAccount {
  id: string;
  provider: string;
  externalUserId?: string | null;
  connectionStatus: string;
  lastSyncAt?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
  source: StudentDomainSource;
}

export interface StudentSegmentedIntegrations {
  alunoId: string;
  accounts: StudentSegmentedExternalAccount[];
  total: number;
  lastSyncAt?: string | null;
}

export interface StudentSegmentedActivity {
  id: string;
  provider: string;
  externalActivityId: string;
  activityType?: string | null;
  startedAt: string;
  endedAt?: string | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  paceSecondsPerKm?: number | null;
  averageHeartRate?: number | null;
  maxHeartRate?: number | null;
  calories?: number | null;
  elevationGainMeters?: number | null;
  rawPayload?: Record<string, unknown> | null;
  importedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  source: StudentDomainSource;
}

export interface StudentSegmentedActivities {
  alunoId: string;
  activities: StudentSegmentedActivity[];
  total: number;
  hasImportedActivities: boolean;
}

export interface StudentSegmentedSummary {
  alunoId: string;
  status: {
    isActive: boolean;
    schedulePlan: 'free' | 'fixed';
  };
  overview: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    mainGoal?: string | null;
    currentServiceName?: string | null;
    professorResponsible?: string | null;
  };
  profile: StudentSegmentedProfile;
  intake: StudentSegmentedIntake;
  financial: StudentSegmentedFinancialProfile;
  integrations: {
    totalAccounts: number;
    lastSyncAt?: string | null;
    accounts: StudentSegmentedExternalAccount[];
  };
  assessments: {
    total: number;
    latest?: StudentSegmentedAssessmentRecord | null;
  };
  activities: {
    total: number;
    latest?: StudentSegmentedActivity | null;
  };
  updatedAt?: string | null;
}

export interface StudentTimelineEvent {
  id: string;
  type: string;
  title: string;
  occurredAt: string;
  source: StudentDomainSource;
  details?: Record<string, unknown> | null;
}

export interface StudentSegmentedTimeline {
  alunoId: string;
  items: StudentTimelineEvent[];
  total: number;
}

export const alunoService = {
  /**
   * Criar novo aluno
   */
  async create(data: CreateAlunoDTO): Promise<CreateAlunoResult> {
    const response = await api.post<{ success: boolean; data: CreateAlunoResult }>(
      '/alunos',
      data
    );
    return response.data.data;
  },

  /**
   * Listar alunos
   */
  async list(
    page: number = 1,
    limit: number = 10,
    professorId?: string,
    status: 'active' | 'inactive' | 'all' = 'active'
  ): Promise<AlunosResponse> {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      status,
    });

    if (professorId) {
      params.set('professorId', professorId);
    }

    const response = await api.get<{ success: boolean; data: AlunosResponse }>(
      `/alunos?${params.toString()}`
    );
    return response.data.data;
  },

  /**
   * Buscar alunos por nome
   */
  async search(
    query: string,
    professorId?: string,
    status: 'active' | 'inactive' | 'all' = 'active'
  ): Promise<Aluno[]> {
    const params = new URLSearchParams({ q: query, status });
    if (professorId) {
      params.set('professorId', professorId);
    }

    const response = await api.get<{ success: boolean; data: Aluno[] }>(
      `/alunos/search?${params.toString()}`
    );
    return response.data.data;
  },

  /**
   * Obter aluno por ID
   */
  async getById(id: string): Promise<Aluno> {
    const response = await api.get<{ success: boolean; data: Aluno }>(`/alunos/${id}`);
    return response.data.data;
  },

  async uploadAvatar(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<{ success: boolean; data: { url: string } }>(
      '/alunos/avatar-upload',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.data.url;
  },

  /**
   * Atualizar aluno
   */
  async update(id: string, data: UpdateAlunoDTO): Promise<Aluno> {
    const response = await api.put<{ success: boolean; data: Aluno }>(`/alunos/${id}`, data);
    return response.data.data;
  },

  /**
   * Excluir aluno
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/alunos/${id}`);
  },

  /**
   * Inativar aluno
   */
  async deactivate(id: string): Promise<Aluno> {
    const response = await api.post<{ success: boolean; data: Aluno }>(
      `/alunos/${id}/deactivate`
    );
    return response.data.data;
  },

  /**
   * Reativar aluno
   */
  async activate(id: string): Promise<Aluno> {
    const response = await api.post<{ success: boolean; data: Aluno }>(
      `/alunos/${id}/activate`
    );
    return response.data.data;
  },

  /**
   * Resetar senha do aluno (gera senha temporaria)
   */
  async resetPassword(id: string): Promise<{ tempPassword: string }> {
    const response = await api.post<{ success: boolean; data: { tempPassword: string } }>(
      `/alunos/${id}/reset-password`
    );
    return response.data.data;
  },

  /**
   * Ler PDF de avaliacao e retornar pre-preenchimento do cadastro
   */
  async previewAssessmentPdf(file: File): Promise<AlunoAssessmentPrefill> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<{ success: boolean; data: AlunoAssessmentPrefill }>(
      '/alunos/assessment-prefill',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data.data;
  },

  async listProfileReviews(alunoId: string): Promise<AlunoProfileReview[]> {
    const response = await api.get<{ success: boolean; data: AlunoProfileReview[] }>(
      `/alunos/${alunoId}/profile-reviews`
    );
    return response.data.data;
  },

  async requestProfileReview(alunoId: string, data: CreateProfileReviewDTO = {}): Promise<AlunoProfileReview> {
    const response = await api.post<{ success: boolean; data: AlunoProfileReview }>(
      `/alunos/${alunoId}/profile-reviews`,
      data
    );
    return response.data.data;
  },

  async getProfileReviewSettings(alunoId: string): Promise<AlunoProfileReviewSettingsResponse> {
    const response = await api.get<{ success: boolean; data: AlunoProfileReviewSettingsResponse }>(
      `/alunos/${alunoId}/profile-review-settings`
    );
    return response.data.data;
  },

  async updateProfileReviewSettings(
    alunoId: string,
    data: UpdateProfileReviewSettingsDTO
  ): Promise<AlunoProfileReviewSettings> {
    const response = await api.put<{ success: boolean; data: AlunoProfileReviewSettings }>(
      `/alunos/${alunoId}/profile-review-settings`,
      data
    );
    return response.data.data;
  },

  async approveProfileReview(alunoId: string, reviewId: string): Promise<AlunoProfileReview> {
    const response = await api.post<{ success: boolean; data: AlunoProfileReview }>(
      `/alunos/${alunoId}/profile-reviews/${reviewId}/approve`
    );
    return response.data.data;
  },

  async rejectProfileReview(
    alunoId: string,
    reviewId: string,
    reason: string
  ): Promise<AlunoProfileReview> {
    const response = await api.post<{ success: boolean; data: AlunoProfileReview }>(
      `/alunos/${alunoId}/profile-reviews/${reviewId}/reject`,
      { reason }
    );
    return response.data.data;
  },

  async getAssessmentPlan(alunoId: string): Promise<AlunoAssessmentPlan> {
    const response = await api.get<{ success: boolean; data: AlunoAssessmentPlan }>(
      `/alunos/${alunoId}/assessment-plan`
    );
    return response.data.data;
  },

  async saveAssessmentPlan(
    alunoId: string,
    data: SaveAlunoAssessmentPlanDTO
  ): Promise<AlunoAssessmentPlan> {
    const response = await api.put<{ success: boolean; data: AlunoAssessmentPlan }>(
      `/alunos/${alunoId}/assessment-plan`,
      data
    );
    return response.data.data;
  },

  async recalculateAssessmentPlan(alunoId: string): Promise<AlunoAssessmentPlan> {
    const response = await api.post<{ success: boolean; data: AlunoAssessmentPlan }>(
      `/alunos/${alunoId}/assessment-plan/recalculate`
    );
    return response.data.data;
  },

  async listStudentContracts(alunoId: string): Promise<AlunoContractsResponse> {
    const response = await api.get<{ success: boolean; data: AlunoContractsResponse }>(
      `/alunos/${alunoId}/contracts`
    );
    return response.data.data;
  },

  async linkStudentContract(
    alunoId: string,
    data: LinkStudentContractDTO
  ): Promise<StudentContractLink> {
    const response = await api.post<{ success: boolean; data: StudentContractLink }>(
      `/alunos/${alunoId}/contracts`,
      data
    );
    return response.data.data;
  },

  async updateStudentContract(
    alunoId: string,
    studentContractId: string,
    data: UpdateStudentContractDTO
  ): Promise<StudentContractLink> {
    const response = await api.patch<{ success: boolean; data: StudentContractLink }>(
      `/alunos/${alunoId}/contracts/${studentContractId}`,
      data
    );
    return response.data.data;
  },

  async activateStudentContract(alunoId: string, studentContractId: string): Promise<StudentContractLink> {
    const response = await api.post<{ success: boolean; data: StudentContractLink }>(
      `/alunos/${alunoId}/contracts/${studentContractId}/activate`
    );
    return response.data.data;
  },

  async cancelStudentContract(
    alunoId: string,
    studentContractId: string,
    reason: string
  ): Promise<StudentContractLink> {
    const response = await api.post<{ success: boolean; data: StudentContractLink }>(
      `/alunos/${alunoId}/contracts/${studentContractId}/cancel`,
      { reason }
    );
    return response.data.data;
  },

  async getSegmentedSummary(alunoId: string): Promise<StudentSegmentedSummary> {
    const response = await api.get<{ success: boolean; data: StudentSegmentedSummary }>(
      `/alunos/${alunoId}/summary`
    );
    return response.data.data;
  },

  async getSegmentedProfile(alunoId: string): Promise<StudentSegmentedProfile> {
    const response = await api.get<{ success: boolean; data: StudentSegmentedProfile }>(
      `/alunos/${alunoId}/profile`
    );
    return response.data.data;
  },

  async getSegmentedIntake(alunoId: string): Promise<StudentSegmentedIntake> {
    const response = await api.get<{ success: boolean; data: StudentSegmentedIntake }>(
      `/alunos/${alunoId}/intake`
    );
    return response.data.data;
  },

  async listSegmentedAssessmentRecords(
    alunoId: string
  ): Promise<StudentSegmentedAssessmentResponse> {
    const response = await api.get<{ success: boolean; data: StudentSegmentedAssessmentResponse }>(
      `/alunos/${alunoId}/assessment-records`
    );
    return response.data.data;
  },

  async getSegmentedFinancialProfile(
    alunoId: string
  ): Promise<StudentSegmentedFinancialProfile> {
    const response = await api.get<{ success: boolean; data: StudentSegmentedFinancialProfile }>(
      `/alunos/${alunoId}/financial`
    );
    return response.data.data;
  },

  async getSegmentedIntegrations(alunoId: string): Promise<StudentSegmentedIntegrations> {
    const response = await api.get<{ success: boolean; data: StudentSegmentedIntegrations }>(
      `/alunos/${alunoId}/integrations`
    );
    return response.data.data;
  },

  async listSegmentedActivities(alunoId: string): Promise<StudentSegmentedActivities> {
    const response = await api.get<{ success: boolean; data: StudentSegmentedActivities }>(
      `/alunos/${alunoId}/activities`
    );
    return response.data.data;
  },

  async getSegmentedTimeline(alunoId: string): Promise<StudentSegmentedTimeline> {
    const response = await api.get<{ success: boolean; data: StudentSegmentedTimeline }>(
      `/alunos/${alunoId}/timeline`
    );
    return response.data.data;
  },

  /**
   * Calcular IMC
   */
  calculateBMI(weight: number, height: number): number {
    const heightInMeters = height / 100;
    return weight / (heightInMeters * heightInMeters);
  },

  /**
   * ClassificaÃ§Ã£o do IMC
   */
  getBMIClassification(bmi: number): string {
    if (bmi < 18.5) return 'Abaixo do peso';
    if (bmi < 25) return 'Peso normal';
    if (bmi < 30) return 'Sobrepeso';
    if (bmi < 35) return 'Obesidade Grau I';
    if (bmi < 40) return 'Obesidade Grau II';
    return 'Obesidade Grau III';
  },
};
