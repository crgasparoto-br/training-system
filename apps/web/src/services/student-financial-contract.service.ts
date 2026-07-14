import api from './api';
import type {
  Aluno,
  CreateAlunoDTO,
  CreateAlunoResult,
  LinkStudentContractDTO,
  StudentContractLink,
  UpdateAlunoDTO,
  UpdateStudentContractDTO,
} from './aluno.service';

export type AtomicStudentContractInput = LinkStudentContractDTO & {
  contractId: string;
};

export interface AtomicCreateAlunoContractResult extends CreateAlunoResult {
  studentContract: StudentContractLink;
}

export interface AtomicUpdateAlunoContractResult {
  aluno: Aluno;
  studentContract: StudentContractLink;
}

export const studentFinancialContractService = {
  async create(profile: CreateAlunoDTO, contract: AtomicStudentContractInput) {
    const response = await api.post<{
      success: boolean;
      data: AtomicCreateAlunoContractResult;
    }>('/alunos/financial-contract', { profile, contract });
    return response.data.data;
  },

  async update(
    alunoId: string,
    profile: UpdateAlunoDTO,
    contract: AtomicStudentContractInput | (UpdateStudentContractDTO & { contractId: string })
  ) {
    const response = await api.put<{
      success: boolean;
      data: AtomicUpdateAlunoContractResult;
    }>(`/alunos/${alunoId}/financial-contract`, { profile, contract });
    return response.data.data;
  },
};
