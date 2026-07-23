import api from './api';
import { authService } from './auth.service';
import type {
  AuthResponse,
  CompletePreRegistrationDTO,
  PreRegistrationAccountRegistrationDTO,
  PreRegistrationClaimDTO,
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
  ): Promise<AuthResponse> {
    const response = await api.post(
      `/pre-cadastro/${encodeURIComponent(token)}/register`,
      input
    );
    const auth = extractData<AuthResponse>(response.data);
    authService.setToken(auth.token);
    authService.setUser(auth.user);
    return auth;
  },

  async claim(input: PreRegistrationClaimDTO): Promise<void> {
    await api.post('/pre-registration/claim', input);
  },

  async getSession(): Promise<PreRegistrationSessionDTO> {
    const response = await api.get('/pre-registration/session');
    return extractData<PreRegistrationSessionDTO>(response.data);
  },

  async saveStep(input: SavePreRegistrationStepDTO): Promise<PreRegistrationSessionDTO> {
    const response = await api.patch('/pre-registration/steps', input);
    return extractData<PreRegistrationSessionDTO>(response.data);
  },

  async complete(input: CompletePreRegistrationDTO): Promise<PreRegistrationSessionDTO> {
    const response = await api.post('/pre-registration/complete', input);
    return extractData<PreRegistrationSessionDTO>(response.data);
  },
};
