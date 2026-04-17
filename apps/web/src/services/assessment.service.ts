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
  alunoId: string;
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
  professorId: string;
  action: 'update' | 'delete';
  beforeData?: any;
  afterData?: any;
  createdAt: string;
  professor?: {
    user?: {
      profile?: {
        name?: string;
      };
    };
  };
}

export const assessmentService = {
  async listByAluno(alunoId: string): Promise<Assessment[]> {
    const response = await api.get<{ success: boolean; data: Assessment[] }>(
      `/alunos/${alunoId}/assessments`
    );
    return response.data.data;
  },

  async getSummary(alunoId: string): Promise<AssessmentSummary[]> {
    const response = await api.get<{ success: boolean; data: AssessmentSummary[] }>(
      `/alunos/${alunoId}/assessments/summary`
    );
    return response.data.data;
  },

  async uploadAssessment(alunoId: string, data: {
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
      `/alunos/${alunoId}/assessments`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return response.data.data;
  },

  async downloadFile(alunoId: string, assessmentId: string): Promise<Blob> {
    const response = await api.get(
      `/alunos/${alunoId}/assessments/${assessmentId}/file`,
      {
        responseType: 'blob',
      }
    );
    return response.data;
  },

  async updateAssessment(
    alunoId: string,
    assessmentId: string,
    data: {
      typeId?: string;
      assessmentDate?: string;
      variables?: Record<string, string | number | null>;
    }
  ): Promise<Assessment> {
    const response = await api.put<{ success: boolean; data: Assessment }>(
      `/alunos/${alunoId}/assessments/${assessmentId}`,
      data
    );
    return response.data.data;
  },

  async deleteAssessment(alunoId: string, assessmentId: string): Promise<void> {
    await api.delete(`/alunos/${alunoId}/assessments/${assessmentId}`);
  },

  async getLogs(alunoId: string, assessmentId: string): Promise<AssessmentAuditLog[]> {
    const response = await api.get<{ success: boolean; data: AssessmentAuditLog[] }>(
      `/alunos/${alunoId}/assessments/${assessmentId}/logs`
    );
    return response.data.data;
  },

  async reprocessAssessment(alunoId: string, assessmentId: string): Promise<Assessment> {
    const response = await api.post<{ success: boolean; data: Assessment }>(
      `/alunos/${alunoId}/assessments/${assessmentId}/reprocess`
    );
    return response.data.data;
  },
};

