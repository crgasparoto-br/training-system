import type { EducatorRole, ContractInfo } from './auth';

export interface CreateEducatorRequest {
  name: string;
  email: string;
  password: string;
}

export interface EducatorSummary {
  id: string;
  role: EducatorRole;
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
