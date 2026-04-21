import type {
  CollaboratorFunctionInfo,
  ContractInfo,
  ProfessorManagerInfo,
  ProfessorRole,
} from './auth';

export interface CreateProfessorRequest {
  name: string;
  email: string;
  password: string;
  collaboratorFunctionId: string;
  responsibleManagerId?: string;
}

export interface UpdateProfessorRequest {
  name?: string;
  email?: string;
  password?: string;
  collaboratorFunctionId?: string;
  responsibleManagerId?: string;
}

export interface ProfessorSummary {
  id: string;
  role: ProfessorRole;
  collaboratorFunction: CollaboratorFunctionInfo;
  responsibleManager?: ProfessorManagerInfo | null;
  user: {
    id: string;
    email: string;
    isActive?: boolean;
    lastLoginAt?: string | null;
    profile: {
      name: string;
      phone?: string | null;
    };
  };
  contract: ContractInfo;
  createdAt: string;
}
