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

export const authService = {
  /**
   * Fazer login
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<{ success: boolean; data: AuthResponse }>('/auth/login', data);
    return response.data.data;
  },

  /**
   * Registrar novo usuário
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await api.post<{ success: boolean; data: AuthResponse }>('/auth/register', data);
    return response.data.data;
  },

  /**
   * Solicitar recuperação de senha
   */
  async forgotPassword(data: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    const response = await api.post<{ success: boolean; data: ForgotPasswordResponse }>(
      '/auth/forgot-password',
      data
    );
    return response.data.data;
  },

  /**
   * Redefinir senha com token
   */
  async resetPassword(data: ResetPasswordRequest): Promise<ResetPasswordResponse> {
    const response = await api.post<{ success: boolean; data: ResetPasswordResponse }>(
      '/auth/reset-password',
      data
    );
    return response.data.data;
  },

  /**
   * Obter dados do usuário autenticado
   */
  async me() {
    const response = await api.get('/auth/me');
    return response.data.data;
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
  getUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  /**
   * Salvar usuário no localStorage
   */
  setUser(user: any): void {
    localStorage.setItem('user', JSON.stringify(user));
  },
};
