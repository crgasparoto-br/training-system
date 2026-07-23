import type {
  CreatePreRegistrationLeadDTO,
  PreRegistrationAdminConversionResultDTO,
  PreRegistrationAdminLeadDetailDTO,
  PreRegistrationAdminListQueryDTO,
  PreRegistrationAdminListResultDTO,
  PreRegistrationDuplicateCheckResultDTO,
  PreRegistrationInviteCreationResultDTO,
  PreRegistrationInviteSummaryDTO,
  UpdatePreRegistrationLeadCommercialDTO,
} from '@corrida/types';
import api from './api';

type ApiEnvelope<T> = { success: true; data: T };

function listParams(query: PreRegistrationAdminListQueryDTO) {
  return {
    ...query,
    status: query.statuses?.join(','),
    statuses: undefined,
  };
}

export const preRegistrationAdminService = {
  async list(query: PreRegistrationAdminListQueryDTO = {}) {
    const response = await api.get<ApiEnvelope<PreRegistrationAdminListResultDTO>>(
      '/pre-registration-admin/leads',
      { params: listParams(query) }
    );
    return response.data.data;
  },

  async get(id: string) {
    const response = await api.get<ApiEnvelope<PreRegistrationAdminLeadDetailDTO>>(
      `/pre-registration-admin/leads/${id}`
    );
    return response.data.data;
  },

  async checkDuplicates(
    input: Pick<
      CreatePreRegistrationLeadDTO,
      'phone' | 'additionalPhone' | 'email' | 'additionalEmail' | 'cpf'
    >
  ) {
    const response = await api.post<ApiEnvelope<PreRegistrationDuplicateCheckResultDTO>>(
      '/pre-registration-admin/leads/duplicates',
      input
    );
    return response.data.data;
  },

  async create(input: CreatePreRegistrationLeadDTO) {
    const response = await api.post<ApiEnvelope<PreRegistrationAdminLeadDetailDTO>>(
      '/pre-registration-admin/leads',
      input
    );
    return response.data.data;
  },

  async update(id: string, input: UpdatePreRegistrationLeadCommercialDTO) {
    const response = await api.patch<ApiEnvelope<PreRegistrationAdminLeadDetailDTO>>(
      `/pre-registration-admin/leads/${id}`,
      input
    );
    return response.data.data;
  },

  async generateInvite(id: string) {
    const response = await api.post<ApiEnvelope<PreRegistrationInviteCreationResultDTO>>(
      `/pre-registration-admin/leads/${id}/invites`
    );
    return response.data.data;
  },

  async revokeInvite(id: string, inviteId: string, reason: string) {
    const response = await api.post<ApiEnvelope<PreRegistrationInviteSummaryDTO>>(
      `/pre-registration-admin/leads/${id}/invites/revoke`,
      { inviteId, reason }
    );
    return response.data.data;
  },

  async discard(id: string, reason: string) {
    const response = await api.post<ApiEnvelope<PreRegistrationAdminLeadDetailDTO>>(
      `/pre-registration-admin/leads/${id}/discard`,
      { reason }
    );
    return response.data.data;
  },

  async reopen(id: string, reason: string) {
    const response = await api.post<ApiEnvelope<PreRegistrationAdminLeadDetailDTO>>(
      `/pre-registration-admin/leads/${id}/reopen`,
      { reason }
    );
    return response.data.data;
  },

  async convert(id: string, activationReference: string) {
    const response = await api.post<ApiEnvelope<PreRegistrationAdminConversionResultDTO>>(
      `/pre-registration-admin/leads/${id}/convert`,
      { activationReference }
    );
    return response.data.data;
  },

  async review(id: string, reviewReference: string, deduplicationReference: string) {
    const response = await api.post<ApiEnvelope<PreRegistrationAdminLeadDetailDTO>>(
      `/pre-registration-admin/leads/${id}/review`,
      { reviewReference, deduplicationReference }
    );
    return response.data.data;
  },
};
