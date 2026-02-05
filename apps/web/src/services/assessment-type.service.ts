import api from './api';

export type AssessmentScheduleType = 'fixed_interval' | 'after_type';

export interface AssessmentType {
  id: string;
  contractId: string;
  name: string;
  code: string;
  description?: string | null;
  scheduleType: AssessmentScheduleType;
  intervalMonths?: number | null;
  afterTypeId?: string | null;
  offsetMonths?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssessmentTypeDTO {
  name: string;
  code: string;
  description?: string;
  scheduleType: AssessmentScheduleType;
  intervalMonths?: number;
  afterTypeId?: string;
  offsetMonths?: number;
  isActive?: boolean;
}

export interface UpdateAssessmentTypeDTO {
  name?: string;
  code?: string;
  description?: string | null;
  scheduleType?: AssessmentScheduleType;
  intervalMonths?: number | null;
  afterTypeId?: string | null;
  offsetMonths?: number | null;
  isActive?: boolean;
}

export const assessmentTypeService = {
  async list(): Promise<AssessmentType[]> {
    const response = await api.get<{ success: boolean; data: AssessmentType[] }>(
      '/assessment-types'
    );
    return response.data.data;
  },

  async create(data: CreateAssessmentTypeDTO): Promise<AssessmentType> {
    const response = await api.post<{ success: boolean; data: AssessmentType }>(
      '/assessment-types',
      data
    );
    return response.data.data;
  },

  async update(id: string, data: UpdateAssessmentTypeDTO): Promise<AssessmentType> {
    const response = await api.put<{ success: boolean; data: AssessmentType }>(
      `/assessment-types/${id}`,
      data
    );
    return response.data.data;
  },

  async remove(id: string): Promise<AssessmentType> {
    const response = await api.delete<{ success: boolean; data: AssessmentType }>(
      `/assessment-types/${id}`
    );
    return response.data.data;
  },
};

