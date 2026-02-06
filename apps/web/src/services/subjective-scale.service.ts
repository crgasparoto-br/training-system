import api from './api';

export type SubjectiveScaleType = 'PSE' | 'PSR';

export interface SubjectiveScaleItem {
  id: string;
  contractId: string;
  type: SubjectiveScaleType;
  value: number;
  label?: string | null;
  order: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const subjectiveScaleService = {
  async list(type?: SubjectiveScaleType): Promise<SubjectiveScaleItem[]> {
    const response = await api.get<{ success: boolean; data: SubjectiveScaleItem[] }>(
      '/subjective-scales',
      {
        params: type ? { type } : undefined,
      }
    );
    return response.data.data;
  },
};
