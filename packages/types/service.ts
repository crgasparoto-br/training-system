import type { ContractInfo } from './auth.js';

export interface ServiceOption {
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

export interface CreateServiceRequest {
  name: string;
  isActive?: boolean;
}

export interface UpdateServiceRequest {
  name?: string;
  isActive?: boolean;
}
