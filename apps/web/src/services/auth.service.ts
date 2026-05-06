import api from './api';
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
} from '@corrida/types';

type AuthUser = AuthResponse['user'];

function extractApiData<T>(payload: unknown): T {
  if (payload && typeof payload === 'object') {
    const maybeEnvelope = payload as { data?: unknown };

    if (maybeEnvelope.data !== undefined) {
      return maybeEnvelope.data as T;
    }

    return payload as T;
  }

  throw new Error('Resposta da API inválida. Verifique a URL da API configurada no frontend.');
}

export const authService = {
  /**
   * Fazer login
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await api.post('/auth/login', data);
    const authData = extractApiData<AuthResponse>(response.data);

    if (!authData?.token || !authData?.user) {
      throw new Error('Resposta de login inválida. Confira a API em uso e tente novamente.');
    }

    return authData;
  },

  /**
   * Registrar novo usuário
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await api.post('/auth/register', data);
    const authData = extractApiData<AuthResponse>(response.data);

    if (!authData?.token || !authData?.user) {
      throw new Error('Resposta de cadastro inválida. Confira a API em uso e tente novamente.');
    }

    return authData;
  },

  /**
   * Solicitar recuperação de senha
   */
  async forgotPassword(data: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    const response = await api.post(
      '/auth/forgot-password',
      data
    );
    return extractApiData<ForgotPasswordResponse>(response.data);
  },

  /**
   * Redefinir senha com token
   */
  async resetPassword(data: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    const response = await api.post(
      '/auth/reset-password',
      data
    );
    return extractApiData<ResetPasswordResponse>(response.data);
  },

  /**
   * Obter dados do usuário autenticado
   */
  async me(): Promise<AuthUser> {
    const response = await api.get('/auth/me');
    return extractApiData<AuthUser>(response.data);
  },

  /**
   * Fazer logout
   */
  async logout(): Promise<void> {
    await api.post('/auth/logout');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  /**
   * Verificar se está autenticado
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem('token');
  },

  /**
   * Obter token
   */
  getToken(): string | null {
    return localStorage.getItem('token');
  },

  /**
   * Salvar token
   */
  setToken(token: string): void {
    localStorage.setItem('token', token);
  },

  /**
   * Obter usuário do localStorage
   */
  getUser(): AuthUser | null {
    const user = localStorage.getItem('user');
    return user ? (JSON.parse(user) as AuthUser) : null;
  },

  /**
   * Salvar usuário no localStorage
   */
  setUser(user: AuthUser | null): void {
    localStorage.setItem('user', JSON.stringify(user));
  },
};
