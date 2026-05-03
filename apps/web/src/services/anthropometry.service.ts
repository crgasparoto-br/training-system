import api from './api';
import type {
  AnthropometryAssessment,
  AnthropometryAssessmentValue,
  AnthropometryObservation,
  AnthropometrySegment,
  AnthropometrySegmentPayload,
} from '../types/anthropometry';

const unwrap = <T>(response: { data: { data: T } }) => response.data.data;

export const anthropometryService = {
  async listSegments(): Promise<AnthropometrySegment[]> {
    return unwrap(await api.get('/anthropometry/segments'));
  },

  async listActiveSegments(sex?: 'male' | 'female' | 'other'): Promise<AnthropometrySegment[]> {
    const params = sex ? `?sex=${sex}` : '';
    return unwrap(await api.get(`/anthropometry/segments/active${params}`));
  },

  async createSegment(data: AnthropometrySegmentPayload): Promise<AnthropometrySegment> {
    return unwrap(await api.post('/anthropometry/segments', data));
  },

  async updateSegment(id: string, data: Partial<AnthropometrySegmentPayload>): Promise<AnthropometrySegment> {
    return unwrap(await api.put(`/anthropometry/segments/${id}`, data));
  },

  async reorderSegments(segmentIds: string[]): Promise<AnthropometrySegment[]> {
    return unwrap(await api.post('/anthropometry/segments/reorder', { segmentIds }));
  },

  async listAssessments(alunoId: string): Promise<AnthropometryAssessment[]> {
    return unwrap(await api.get(`/anthropometry/alunos/${alunoId}/assessments`));
  },

  async getLastAssessment(alunoId: string): Promise<AnthropometryAssessment | null> {
    return unwrap(await api.get(`/anthropometry/alunos/${alunoId}/assessments/last`));
  },

  async createAssessment(
    alunoId: string,
    data: { assessmentDate?: string; professorId?: string | null; notes?: string | null; copyPrevious?: boolean }
  ): Promise<AnthropometryAssessment> {
    return unwrap(await api.post(`/anthropometry/alunos/${alunoId}/assessments`, data));
  },

  async updateAssessment(
    id: string,
    data: { assessmentDate?: string; professorId?: string | null; notes?: string | null }
  ): Promise<AnthropometryAssessment> {
    return unwrap(await api.put(`/anthropometry/assessments/${id}`, data));
  },

  async saveValues(
    id: string,
    values: Array<Pick<AnthropometryAssessmentValue, 'segmentId' | 'value' | 'unit' | 'observation'>>
  ): Promise<AnthropometryAssessment> {
    return unwrap(await api.put(`/anthropometry/assessments/${id}/values`, { values }));
  },

  async saveObservations(
    id: string,
    observations: Array<Pick<AnthropometryObservation, 'segmentId' | 'text' | 'importable'>>
  ): Promise<AnthropometryAssessment> {
    return unwrap(await api.put(`/anthropometry/assessments/${id}/observations`, { observations }));
  },

  async compare(alunoId: string, assessmentIds?: string[]): Promise<AnthropometryAssessment[]> {
    const query = assessmentIds?.length ? `?assessmentIds=${assessmentIds.join(',')}` : '';
    return unwrap(await api.get(`/anthropometry/alunos/${alunoId}/compare${query}`));
  },
};
