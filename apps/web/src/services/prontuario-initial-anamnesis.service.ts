import type { StudentSegmentedIntake } from './aluno.service';
import api from './api';

export interface ProntuarioClinicalIdentity {
  alunoId: string;
  name: string | null;
  email: string | null;
}

const unwrap = <T>(response: { data: { data: T } }) => response.data.data;

export const prontuarioInitialAnamnesisService = {
  async identity(alunoId: string): Promise<ProntuarioClinicalIdentity> {
    return unwrap(await api.get(`/prontuario/alunos/${alunoId}/clinical-identity`));
  },

  async initialAnamnesis(alunoId: string): Promise<StudentSegmentedIntake> {
    return unwrap(await api.get(`/prontuario/alunos/${alunoId}/initial-anamnesis`));
  },
};
