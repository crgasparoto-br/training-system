import type { ContractInfo, UserAccessPermission } from './auth.js';

export interface CollaboratorFunctionOption {
  id: string;
  contractId: string;
  name: string;
  code: string;
  isActive: boolean;
  isSystem: boolean;
  contract?: ContractInfo;
  accessPermissions?: UserAccessPermission[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateCollaboratorFunctionRequest {
  name: string;
  isActive?: boolean;
  permissions?: {
    screens: string[];
    blocks: string[];
  };
}

export interface UpdateCollaboratorFunctionRequest {
  name?: string;
  isActive?: boolean;
  permissions?: {
    screens: string[];
    blocks: string[];
  };
}
