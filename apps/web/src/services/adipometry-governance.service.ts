import type {
  AdipometryGovernanceResponse,
  ApproveAdipometryProtocolInput,
  DesignateAdipometryClinicalResponsibleInput,
  RevokeAdipometryProtocolInput,
} from '@corrida/types';
import api from './api';

export const adipometryGovernanceService = {
  async get(): Promise<AdipometryGovernanceResponse> {
    const response = await api.get<{ success: boolean; data: AdipometryGovernanceResponse }>(
      '/contracts/adipometry-governance'
    );
    return response.data.data;
  },

  async designate(
    input: DesignateAdipometryClinicalResponsibleInput
  ): Promise<AdipometryGovernanceResponse> {
    const response = await api.put<{ success: boolean; data: AdipometryGovernanceResponse }>(
      '/contracts/adipometry-governance/responsible',
      input
    );
    return response.data.data;
  },

  async approve(
    code: string,
    version: number,
    input: ApproveAdipometryProtocolInput
  ): Promise<AdipometryGovernanceResponse> {
    const response = await api.post<{ success: boolean; data: AdipometryGovernanceResponse }>(
      `/contracts/adipometry-governance/protocols/${encodeURIComponent(code)}/${version}/approve`,
      input
    );
    return response.data.data;
  },

  async revoke(
    code: string,
    version: number,
    input: RevokeAdipometryProtocolInput
  ): Promise<AdipometryGovernanceResponse> {
    const response = await api.post<{ success: boolean; data: AdipometryGovernanceResponse }>(
      `/contracts/adipometry-governance/protocols/${encodeURIComponent(code)}/${version}/revoke`,
      input
    );
    return response.data.data;
  },
};
