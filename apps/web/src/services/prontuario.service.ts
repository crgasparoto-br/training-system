import api from './api';
import type {
  ProntuarioActivityHistory,
  ProntuarioDiscomfortEntry,
  ProntuarioDiscomfortSnapshot,
  ProntuarioGoal,
  ProntuarioMedicationProcedure,
  ProntuarioOverview,
  ProntuarioPainCase,
  ProntuarioRecord,
  ProntuarioRecordPayload,
  StudentParqSubmission,
} from '@corrida/types';

const unwrap = <T>(response: { data: { data: T } }) => response.data.data;

export const prontuarioService = {
  async overview(alunoId: string): Promise<ProntuarioOverview> {
    return unwrap(await api.get(`/prontuario/alunos/${alunoId}`));
  },

  async listParqSubmissions(alunoId: string): Promise<StudentParqSubmission[]> {
    return unwrap(await api.get(`/prontuario/alunos/${alunoId}/parq-submissions`));
  },

  async createParqSubmission(alunoId: string, responses: Record<string, boolean>, notes?: string | null): Promise<StudentParqSubmission> {
    return unwrap(await api.post(`/prontuario/alunos/${alunoId}/parq-submissions`, { responses, notes }));
  },

  async createRecord(alunoId: string, data: ProntuarioRecordPayload): Promise<ProntuarioRecord> {
    return unwrap(await api.post(`/prontuario/alunos/${alunoId}/records`, data));
  },

  async updateRecord(recordId: string, data: ProntuarioRecordPayload & { status?: 'open' | 'closed' | 'archived' }): Promise<ProntuarioRecord> {
    return unwrap(await api.put(`/prontuario/records/${recordId}`, data));
  },

  async saveGoals(recordId: string, goals: Array<Partial<ProntuarioGoal> & { title: string }>): Promise<ProntuarioRecord> {
    return unwrap(await api.put(`/prontuario/records/${recordId}/goals`, { goals }));
  },

  async saveAnamnesisFollowUps(recordId: string, items: ProntuarioRecord['anamnesisFollowUps']): Promise<ProntuarioRecord> {
    return unwrap(await api.put(`/prontuario/records/${recordId}/anamnesis-follow-ups`, { items }));
  },

  async closeAnamnesisFollowUp(followUpId: string): Promise<ProntuarioRecord> {
    return unwrap(await api.post(`/prontuario/anamnesis-follow-ups/${followUpId}/close`));
  },

  async saveActivityHistory(recordId: string, items: Array<Partial<ProntuarioActivityHistory> & { description: string }>): Promise<ProntuarioRecord> {
    return unwrap(await api.put(`/prontuario/records/${recordId}/activity-history`, { items }));
  },

  async saveMedicationsProcedures(recordId: string, items: Array<Partial<ProntuarioMedicationProcedure> & { type: ProntuarioMedicationProcedure['type']; name: string }>): Promise<ProntuarioRecord> {
    return unwrap(await api.put(`/prontuario/records/${recordId}/medications-procedures`, { items }));
  },

  async savePainCases(recordId: string, items: Array<Partial<ProntuarioPainCase> & { title: string }>): Promise<ProntuarioRecord> {
    return unwrap(await api.put(`/prontuario/records/${recordId}/pain-cases`, { items }));
  },

  async createDiscomfortSnapshot(recordId: string, data: { notes?: string | null; entries: ProntuarioDiscomfortEntry[] }): Promise<ProntuarioDiscomfortSnapshot> {
    return unwrap(await api.post(`/prontuario/records/${recordId}/discomfort-snapshots`, data));
  },
};
