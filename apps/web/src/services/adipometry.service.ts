import type {
  AdipometryAssessmentDetail,
  AdipometryAssessmentSummary,
  AdipometryCalculationPreview,
  AdipometryCalculationPreviewRequest,
  AdipometryCorrectionCategory,
  AdipometryProtocolSummary,
  AdipometryResponsibleProfessor,
  CompleteAdipometryAssessmentInput,
  CreateAdipometryDraftInput,
  UpdateAdipometryDraftWithClearInput,
} from '@corrida/types';
import type { Aluno } from './aluno.service';
import api from './api';

const unwrap = <T>(response: { data: { data: T } }) => response.data.data;

function storedUserHasProfessorProfile(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem('user');
    if (!raw) return false;
    const user = JSON.parse(raw) as { professor?: { id?: string } | null };
    return Boolean(user.professor?.id);
  } catch {
    return false;
  }
}

async function listLegacyAccessibleStudents(): Promise<Aluno[]> {
  const legacy = await api.get<{
    success: boolean;
    data: { alunos: Aluno[] };
  }>('/alunos', {
    params: { page: 1, limit: 200, status: 'active' },
  });
  return legacy.data.data.alunos;
}

export interface AdipometryAnthropometryMeasurement {
  segmentId: string;
  segmentName: string;
  segmentType: string;
  technicalDescription: string | null;
  formulaHint: string | null;
  value: string | number | null;
  unit: string;
  observation: string | null;
}

export interface AdipometryAnthropometryAssessmentSupport {
  anthropometryAssessmentId: string;
  assessmentCode: string;
  assessmentDate: string;
  notes: string | null;
  measurements: AdipometryAnthropometryMeasurement[];
  observations: Array<{
    segmentId: string | null;
    text: string;
    importable: boolean;
  }>;
}

export interface AdipometryAnthropometrySupport {
  latestEligible: AdipometryAnthropometryAssessmentSupport | null;
  selected: AdipometryAnthropometryAssessmentSupport | null;
}

export interface AdipometryFinalizeResult {
  assessment: AdipometryAssessmentDetail;
  alreadyFinalized: boolean;
}

export const adipometryService = {
  async listAccessibleStudents(): Promise<Aluno[]> {
    // Preserve the existing authorized route for traditional Professor users.
    // A professional actor without its own Professor row uses the dedicated
    // ADPT boundary and is never authorized through the selected responsible.
    if (storedUserHasProfessorProfile()) {
      return listLegacyAccessibleStudents();
    }

    try {
      return unwrap(await api.get('/adipometry/accessible-students'));
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (status !== 404) throw error;
      return listLegacyAccessibleStudents();
    }
  },

  async listResponsibleProfessors(): Promise<AdipometryResponsibleProfessor[]> {
    return unwrap(await api.get('/adipometry/responsible-professors'));
  },

  async listProtocols(alunoId: string, assessmentDate: string): Promise<AdipometryProtocolSummary[]> {
    return unwrap(
      await api.get('/adipometry/protocols/available', {
        params: { alunoId, assessmentDate },
      })
    );
  },

  async listAssessments(alunoId: string): Promise<AdipometryAssessmentSummary[]> {
    return unwrap(await api.get(`/adipometry/alunos/${alunoId}/assessments`));
  },

  async getAssessment(assessmentId: string): Promise<AdipometryAssessmentDetail> {
    return unwrap(await api.get(`/adipometry/assessments/${assessmentId}`));
  },

  async getAnthropometrySupport(
    alunoId: string,
    assessmentDate: string,
    anthropometryAssessmentId?: string
  ): Promise<AdipometryAnthropometrySupport> {
    return unwrap(
      await api.get(`/adipometry/alunos/${alunoId}/anthropometry-support`, {
        params: {
          assessmentDate,
          ...(anthropometryAssessmentId ? { anthropometryAssessmentId } : {}),
        },
      })
    );
  },

  async createDraft(
    alunoId: string,
    payload: CreateAdipometryDraftInput,
    responsibleProfessorId: string
  ): Promise<AdipometryAssessmentDetail> {
    return unwrap(
      await api.post(`/adipometry/alunos/${alunoId}/assessments/with-responsible`, {
        ...payload,
        responsibleProfessorId,
      })
    );
  },

  async updateDraft(
    assessmentId: string,
    payload: UpdateAdipometryDraftWithClearInput
  ): Promise<AdipometryAssessmentDetail> {
    return unwrap(await api.put(`/adipometry/assessments/${assessmentId}/draft`, payload));
  },

  async calculate(
    assessmentId: string,
    payload: AdipometryCalculationPreviewRequest = {}
  ): Promise<AdipometryCalculationPreview> {
    return unwrap(await api.post(`/adipometry/assessments/${assessmentId}/calculate`, payload));
  },

  async finalize(
    assessmentId: string,
    payload: CompleteAdipometryAssessmentInput
  ): Promise<AdipometryFinalizeResult> {
    return unwrap(await api.post(`/adipometry/assessments/${assessmentId}/finalize`, payload));
  },

  async startCorrection(
    assessmentId: string,
    payload: { category: AdipometryCorrectionCategory; reason: string }
  ): Promise<AdipometryAssessmentDetail> {
    return unwrap(await api.post(`/adipometry/assessments/${assessmentId}/corrections`, payload));
  },

  async cancelCorrection(assessmentId: string, reason: string): Promise<AdipometryAssessmentDetail> {
    return unwrap(
      await api.post(`/adipometry/assessments/${assessmentId}/correction/cancel`, { reason })
    );
  },
};
