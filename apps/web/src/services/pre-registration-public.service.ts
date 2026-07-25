import api from './api';
import { useAuthStore } from '../stores/useAuthStore';
import { clearDraft } from '../pages/PublicPreRegistration/preRegistrationDraft';
import type {
  AuthResponse,
  CompletePreRegistrationDTO,
  ConfirmGuardianAuthorizationDTO,
  PreRegistrationAccountRegistrationDTO,
  PreRegistrationClaimDTO,
  PreRegistrationClaimResultDTO,
  PreRegistrationProcessSummaryDTO,
  PreRegistrationPublicLandingDTO,
  RequestGuardianAuthorizationResultDTO,
  PreRegistrationSessionDTO,
  SavePreRegistrationStepDTO,
} from '@corrida/types';

function extractData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function clearDraftAfterAuthoritativeDenial(error: unknown, alunoId: string) {
  const response = (error as {
    response?: {
      status?: number;
      data?: {
        code?: string;
        details?: { code?: string };
      };
    };
  }).response;
  const code = response?.data?.code || response?.data?.details?.code;
  if (
    response?.status === 404 ||
    code === 'NOT_FOUND' ||
    code === 'GUARDIAN_AUTHORIZATION_REQUIRED'
  ) {
    clearDraft(alunoId);
  }
}

export const preRegistrationPublicService = {
  async open(token: string): Promise<PreRegistrationPublicLandingDTO> {
    const response = await api.get(`/pre-cadastro/${encodeURIComponent(token)}`);
    return extractData<PreRegistrationPublicLandingDTO>(response.data);
  },

  async registerAndClaim(
    token: string,
    input: PreRegistrationAccountRegistrationDTO
  ): Promise<AuthResponse & PreRegistrationClaimResultDTO> {
    const response = await api.post(
      `/pre-cadastro/${encodeURIComponent(token)}/register`,
      input
    );
    const auth = extractData<AuthResponse & PreRegistrationClaimResultDTO>(response.data);
    useAuthStore.getState().setAuthenticatedSession(auth);
    return auth;
  },

  async claim(input: PreRegistrationClaimDTO): Promise<PreRegistrationClaimResultDTO> {
    const response = await api.post('/pre-registration/claim', input);
    return extractData<PreRegistrationClaimResultDTO>(response.data);
  },

  async listProcesses(): Promise<PreRegistrationProcessSummaryDTO[]> {
    const response = await api.get('/pre-registration/processes');
    return extractData<PreRegistrationProcessSummaryDTO[]>(response.data);
  },

  async requestGuardianAuthorization(
    alunoId: string,
    input: ConfirmGuardianAuthorizationDTO
  ): Promise<RequestGuardianAuthorizationResultDTO> {
    const response = await api.post(
      `/pre-registration/processes/${encodeURIComponent(alunoId)}/guardian-authorization`,
      input
    );
    return extractData<RequestGuardianAuthorizationResultDTO>(response.data);
  },

  async getSession(alunoId: string): Promise<PreRegistrationSessionDTO> {
    try {
      const response = await api.get(
        `/pre-registration/processes/${encodeURIComponent(alunoId)}/session`
      );
      return extractData<PreRegistrationSessionDTO>(response.data);
    } catch (error) {
      clearDraftAfterAuthoritativeDenial(error, alunoId);
      throw error;
    }
  },

  async saveStep(
    alunoId: string,
    input: SavePreRegistrationStepDTO
  ): Promise<PreRegistrationSessionDTO> {
    try {
      const response = await api.patch(
        `/pre-registration/processes/${encodeURIComponent(alunoId)}/steps`,
        input
      );
      return extractData<PreRegistrationSessionDTO>(response.data);
    } catch (error) {
      clearDraftAfterAuthoritativeDenial(error, alunoId);
      throw error;
    }
  },

  async complete(
    alunoId: string,
    input: CompletePreRegistrationDTO
  ): Promise<PreRegistrationSessionDTO> {
    try {
      const response = await api.post(
        `/pre-registration/processes/${encodeURIComponent(alunoId)}/complete`,
        input
      );
      return extractData<PreRegistrationSessionDTO>(response.data);
    } catch (error) {
      clearDraftAfterAuthoritativeDenial(error, alunoId);
      throw error;
    }
  },
};
