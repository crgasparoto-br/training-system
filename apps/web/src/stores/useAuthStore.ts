import { create } from 'zustand';
import { authService } from '../services/auth.service';
import type { AuthResponse, LoginRequest, RegisterRequest } from '@corrida/types';

type User = AuthResponse['user'];

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  setAuthenticatedSession: (response: AuthResponse) => void;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: authService.getUser(),
  token: authService.getToken(),
  isAuthenticated: authService.isAuthenticated(),
  isLoading: false,
  error: null,

  setAuthenticatedSession: (response: AuthResponse) => {
    authService.setToken(response.token);
    authService.setUser(response.user);
    set({
      user: response.user,
      token: response.token,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  },

  login: async (data: LoginRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(data);
      get().setAuthenticatedSession(response);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Erro ao fazer login';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  register: async (data: RegisterRequest) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register(data);
      get().setAuthenticatedSession(response);
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Erro ao registrar';
      set({ error: errorMessage, isLoading: false });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await authService.logout();
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      // Mesmo com erro, fazer logout local
      authService.setToken('');
      authService.setUser(null);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  loadUser: async () => {
    if (!authService.isAuthenticated()) {
      return;
    }

    set({ isLoading: true });
    try {
      const user = await authService.me();
      authService.setUser(user);
      set({ user, isLoading: false });
    } catch (error: any) {
      // Só derruba sessão quando o token realmente é inválido/expirado.
      if (error?.response?.status === 401) {
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
