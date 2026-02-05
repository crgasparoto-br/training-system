import api from './api';

export interface AssessmentSummary {
  typeId: string;
  typeName: string;
  scheduleType: 'fixed_interval' | 'after_type';
  intervalMonths?: number | null;
  afterTypeId?: string | null;
  offsetMonths?: number | null;
  lastAssessmentDate: string | null;
  nextDueDate: string | null;
}

export interface Assessment {
  id: string;
  athleteId: string;
  typeId: string;
  assessmentDate: string;
  filePath: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  extractedData?: {
    parseOk?: boolean;
    parseError?: string;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
  type?: {
    id: string;
    name: string;
    code: string;
  };
}

export interface AssessmentAuditLog {
  id: string;
  assessmentId: string;
  educatorId: string;
  action: 'update' | 'delete';
  beforeData?: any;
  afterData?: any;
  createdAt: string;
  educator?: {
    user?: {
      profile?: {
        name?: string;
      };
    };
  };
}

export const assessmentService = {
  async listByAthlete(athleteId: string): Promise<Assessment[]> {
    const response = await api.get<{ success: boolean; data: Assessment[] }>(
      `/athletes/${athleteId}/assessments`
    );
    return response.data.data;
  },

  async getSummary(athleteId: string): Promise<AssessmentSummary[]> {
    const response = await api.get<{ success: boolean; data: AssessmentSummary[] }>(
      `/athletes/${athleteId}/assessments/summary`
    );
    return response.data.data;
  },

  async uploadAssessment(athleteId: string, data: {
    typeId: string;
    assessmentDate?: string;
    file: File;
  }): Promise<Assessment> {
    const formData = new FormData();
    formData.append('typeId', data.typeId);
    if (data.assessmentDate) {
      formData.append('assessmentDate', data.assessmentDate);
    }
    formData.append('file', data.file);

    const response = await api.post<{ success: boolean; data: Assessment }>(
      `/athletes/${athleteId}/assessments`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data.data;
  },

  async downloadFile(athleteId: string, assessmentId: string): Promise<Blob> {
    const response = await api.get(
      `/athletes/${athleteId}/assessments/${assessmentId}/file`,
      {
        responseType: 'blob',
      }
    );
    return response.data;
  },

  async updateAssessment(
    athleteId: string,
    assessmentId: string,
    data: { typeId?: string; assessmentDate?: string; variables?: Record<string, number | null> }
  ): Promise<Assessment> {
    const response = await api.put<{ success: boolean; data: Assessment }>(
      `/athletes/${athleteId}/assessments/${assessmentId}`,
      data
    );
    return response.data.data;
  },

  async deleteAssessment(athleteId: string, assessmentId: string): Promise<void> {
    await api.delete(`/athletes/${athleteId}/assessments/${assessmentId}`);
  },

  async getLogs(athleteId: string, assessmentId: string): Promise<AssessmentAuditLog[]> {
    const response = await api.get<{ success: boolean; data: AssessmentAuditLog[] }>(
      `/athletes/${athleteId}/assessments/${assessmentId}/logs`
    );
    return response.data.data;
  },

  async reprocessAssessment(athleteId: string, assessmentId: string): Promise<Assessment> {
    const response = await api.post<{ success: boolean; data: Assessment }>(
      `/athletes/${athleteId}/assessments/${assessmentId}/reprocess`
    );
    return response.data.data;
  },
};
