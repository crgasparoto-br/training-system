import api from './api';
import type {
  ProntuarioActivityHistory,
  ProntuarioDiscomfortEntry,
  ProntuarioDiscomfortSnapshot,
  ProntuarioGoal,
  ProntuarioMedicationProcedure,
  ProntuarioOverview,
  ProntuarioOverviewSummary,
  ProntuarioPainCase,
  ProntuarioPainFollowUp,
  ProntuarioRecord,
  ProntuarioRecordPayload,
  StudentParqSubmission,
} from '@corrida/types';

const unwrap = <T>(response: { data: { data: T } }) => response.data.data;

const isForbidden = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status === 403;

type ProntuarioPainCasePayload = Omit<Partial<ProntuarioPainCase>, 'followUps'> & {
  title: string;
  followUps?: Array<Partial<ProntuarioPainFollowUp> & { followUpAt: string }>;
};

export const prontuarioService = {
  async overview(alunoId: string): Promise<ProntuarioOverview> {
    const summary = unwrap<ProntuarioOverviewSummary>(
      await api.get(`/prontuario/alunos/${alunoId}`)
    );

    let parqSubmissions: StudentParqSubmission[] = [];
    try {
      parqSubmissions = await this.listParqSubmissions(alunoId);
    } catch (error) {
      if (!isForbidden(error)) throw error;
    }

    return {
      ...summary,
      latestParqSubmission: parqSubmissions[0] ?? null,
      parqSubmissions,
      parqState: summary.parq.state,
      parqLegacy: summary.parq.legacy,
    };
  },

  async listParqSubmissions(alunoId: string): Promise<StudentParqSubmission[]> {
    return unwrap(await api.get(`/prontuario/alunos/${alunoId}/parq-submissions`));
  },

  async reviewParq(
    alunoId: string,
    reviewId: string,
    reviewNotes?: string | null
  ): Promise<ProntuarioOverview> {
    await api.post(`/prontuario/alunos/${alunoId}/parq-reviews/${reviewId}/review`, {
      reviewNotes,
    });
    return this.overview(alunoId);
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

  async saveAnamnesisFollowUps(
    recordId: string,
    items: Array<{
      id?: string;
      parqSubmissionId?: string | null;
      itemKey: string;
      itemLabel: string;
      status?: ProntuarioRecord['anamnesisFollowUps'][number]['status'];
      followUpNotes?: string | null;
      actionPlan?: string | null;
      closedAt?: string | null;
    }>
  ): Promise<ProntuarioRecord> {
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

  async savePainCases(recordId: string, items: ProntuarioPainCasePayload[]): Promise<ProntuarioRecord> {
    return unwrap(await api.put(`/prontuario/records/${recordId}/pain-cases`, { items }));
  },

  async createDiscomfortSnapshot(recordId: string, data: { notes?: string | null; entries: ProntuarioDiscomfortEntry[] }): Promise<ProntuarioDiscomfortSnapshot> {
    return unwrap(await api.post(`/prontuario/records/${recordId}/discomfort-snapshots`, data));
  },
};
