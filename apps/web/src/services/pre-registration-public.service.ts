import api from './api';
import { authService } from './auth.service';
import type {
  AuthResponse,
  CompletePreRegistrationDTO,
  ConfirmGuardianAuthorizationDTO,
  PreRegistrationAccountRegistrationDTO,
  PreRegistrationClaimDTO,
  PreRegistrationClaimResultDTO,
  PreRegistrationProcessSummaryDTO,
  PreRegistrationPublicLandingDTO,
  PreRegistrationSessionDTO,
  SavePreRegistrationStepDTO,
} from '@corrida/types';

function extractData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
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
    authService.setToken(auth.token);
    authService.setUser(auth.user);
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

  async confirmGuardianAuthorization(
    alunoId: string,
    input: ConfirmGuardianAuthorizationDTO
  ): Promise<PreRegistrationSessionDTO> {
    const response = await api.post(
      `/pre-registration/processes/${encodeURIComponent(alunoId)}/guardian-authorization`,
      input
    );
    return extractData<PreRegistrationSessionDTO>(response.data);
  },

  async getSession(alunoId: string): Promise<PreRegistrationSessionDTO> {
    const response = await api.get(
      `/pre-registration/processes/${encodeURIComponent(alunoId)}/session`
    );
    return extractData<PreRegistrationSessionDTO>(response.data);
  },

  async saveStep(
    alunoId: string,
    input: SavePreRegistrationStepDTO
  ): Promise<PreRegistrationSessionDTO> {
    const response = await api.patch(
      `/pre-registration/processes/${encodeURIComponent(alunoId)}/steps`,
      input
    );
    return extractData<PreRegistrationSessionDTO>(response.data);
  },

  async complete(
    alunoId: string,
    input: CompletePreRegistrationDTO
  ): Promise<PreRegistrationSessionDTO> {
    const response = await api.post(
      `/pre-registration/processes/${encodeURIComponent(alunoId)}/complete`,
      input
    );
    return extractData<PreRegistrationSessionDTO>(response.data);
  },
};