import type {
  CreatePreRegistrationLeadDTO,
  PreRegistrationAdminConversionResultDTO,
  PreRegistrationAdminLeadDetailDTO,
  PreRegistrationAdminListQueryDTO,
  PreRegistrationAdminListResultDTO,
  PreRegistrationConfirmEnrollmentInputDTO,
  PreRegistrationConsolidationResultDTO,
  PreRegistrationDuplicateDecisionInputDTO,
  PreRegistrationEnrollmentResultDTO,
  PreRegistrationEnrollmentReviewDTO,
  PreRegistrationInviteCreationResultDTO,
  PreRegistrationInviteSummaryDTO,
  PreRegistrationGuardianAuthorizationAdminDTO,
  PreRegistrationLeadDuplicateCheckDTO,
  PreRegistrationReadyForEnrollmentInputDTO,
  UpdatePreRegistrationLeadCommercialDTO,
} from '@corrida/types';
import api from './api';

type ApiEnvelope<T> = { success: true; data: T };
type CreateLeadWithDecision = CreatePreRegistrationLeadDTO & {
  confirmedDuplicateReason?: string;
};

function listParams(query: PreRegistrationAdminListQueryDTO) {
  return { ...query, status: query.statuses?.join(','), statuses: undefined };
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
  async checkDuplicates(input: Pick<CreatePreRegistrationLeadDTO, 'name' | 'phone' | 'additionalPhone' | 'email' | 'additionalEmail' | 'cpf'>) {
    const response = await api.post<ApiEnvelope<PreRegistrationLeadDuplicateCheckDTO>>(
      '/pre-registration-admin/leads/duplicates',
      input
    );
    return response.data.data;
  },
  async create(input: CreateLeadWithDecision) {
    const response = await api.post<ApiEnvelope<PreRegistrationAdminLeadDetailDTO>>(
      '/pre-registration-admin/leads',
      input
    );
    return response.data.data;
  },
  async checkUpdateDuplicates(
    id: string,
    input: Pick<
      UpdatePreRegistrationLeadCommercialDTO,
      'name' | 'phone' | 'additionalPhone' | 'email' | 'additionalEmail' | 'cpf'
    >
  ) {
    const response = await api.post<ApiEnvelope<PreRegistrationLeadDuplicateCheckDTO>>(
      `/pre-registration-admin/leads/${id}/duplicates`,
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
  async getGuardianAuthorization(id: string) {
    const response = await api.get<ApiEnvelope<PreRegistrationGuardianAuthorizationAdminDTO | null>>(
      `/pre-registration-admin/leads/${id}/guardian-authorization`
    );
    return response.data.data;
  },
  async approveGuardianAuthorization(id: string) {
    const response = await api.post<ApiEnvelope<PreRegistrationGuardianAuthorizationAdminDTO>>(
      `/pre-registration-admin/leads/${id}/guardian-authorization/approve`,
      { confirmationAccepted: true }
    );
    return response.data.data;
  },
  async revokeGuardianAuthorization(id: string, reason: string) {
    const response = await api.post<ApiEnvelope<PreRegistrationGuardianAuthorizationAdminDTO>>(
      `/pre-registration-admin/leads/${id}/guardian-authorization/revoke`,
      { reason }
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
  async getEnrollmentReview(id: string) {
    const response = await api.get<ApiEnvelope<PreRegistrationEnrollmentReviewDTO>>(
      `/pre-registration-admin/leads/${id}/enrollment-review`
    );
    return response.data.data;
  },
  async decideDuplicate(id: string, input: PreRegistrationDuplicateDecisionInputDTO) {
    const response = await api.post<
      ApiEnvelope<PreRegistrationEnrollmentReviewDTO | PreRegistrationConsolidationResultDTO>
    >(`/pre-registration-admin/leads/${id}/duplicate-decision`, input);
    return response.data.data;
  },
  async reviewEnrollment(id: string, input: PreRegistrationReadyForEnrollmentInputDTO) {
    const response = await api.post<ApiEnvelope<PreRegistrationEnrollmentReviewDTO>>(
      `/pre-registration-admin/leads/${id}/review`,
      input
    );
    return response.data.data;
  },
  async confirmEnrollment(id: string, input: PreRegistrationConfirmEnrollmentInputDTO) {
    const response = await api.post<ApiEnvelope<PreRegistrationEnrollmentResultDTO>>(
      `/pre-registration-admin/leads/${id}/convert`,
      input
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
