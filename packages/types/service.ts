import type { ContractInfo } from './auth.js';

export interface ServiceOption {
  id: string;
  contractId: string;
  name: string;
  code: string;
  description?: string | null;
  parentServiceId?: string | null;
  parentService?: {
    id: string;
    name: string;
  } | null;
  monthlyPrice?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive: boolean;
  isSystem: boolean;
  contract?: ContractInfo;
  createdAt: string;
  updatedAt: string;
}

export interface CreateServiceRequest {
  name: string;
  description?: string;
  parentServiceId?: string;
  monthlyPrice?: number;
  validFrom?: string;
  validUntil?: string;
  isActive?: boolean;
}

export interface UpdateServiceRequest {
  name?: string;
  description?: string | null;
  parentServiceId?: string | null;
  monthlyPrice?: number | null;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive?: boolean;
}
