import type { ProfessorRole, ContractInfo } from './auth';

export interface CreateProfessorRequest {
  name: string;
  email: string;
  password: string;
}

export interface UpdateProfessorRequest {
  name?: string;
  email?: string;
  password?: string;
}

export interface ProfessorSummary {
  id: string;
  role: ProfessorRole;
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

