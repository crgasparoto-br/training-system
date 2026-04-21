import type { ContractInfo } from './auth';

export interface CollaboratorFunctionOption {
  id: string;
  contractId: string;
  name: string;
  code: string;
  isActive: boolean;
  isSystem: boolean;
  contract?: ContractInfo;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollaboratorFunctionRequest {
  name: string;
  isActive?: boolean;
}

export interface UpdateCollaboratorFunctionRequest {
  name?: string;
  isActive?: boolean;
}