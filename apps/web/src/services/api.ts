import axios, { type AxiosError, type AxiosResponse } from 'axios';
import {
  dispatchPreRegistrationDisabled,
  isPreRegistrationDisabledResponse,
  isPreRegistrationRequestUrl,
} from '../config/pre-registration-availability';

const API_URL = import.meta.env.VITE_API_URL;
const API_TIMEOUT_MS = 30000;

function resolveApiBaseUrl(value?: string) {
  const normalized = value?.replace(/\/+$/, '');

  if (!normalized) {
    return '/api/v1';
  }

  return normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
}

function currentLocalReturnPath() {
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/login')
    ? path
    : '/';
}

export function responseErrorMessage(error: AxiosError) {
  const data = error.response?.data;
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as { error?: unknown; message?: unknown };
  const message = typeof payload.error === 'string'
    ? payload.error
    : typeof payload.message === 'string'
      ? payload.message
      : null;

  return message?.trim() || null;
}

// Criar instância do Axios
export const api = axios.create({
  baseURL: resolveApiBaseUrl(API_URL),
  timeout: API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor - Adicionar token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor - Tratar erros
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url || '';
    const isAuthRequest = [
      '/auth/login',
      '/auth/register',
      '/auth/forgot-password',
      '/auth/reset-password',
    ].some((path) => requestUrl.includes(path));

    if (
      isPreRegistrationRequestUrl(requestUrl) &&
      isPreRegistrationDisabledResponse(status, error.response?.data)
    ) {
      dispatchPreRegistrationDisabled();
    }

    if (status === 401 && !isAuthRequest) {
      const hasToken = !!localStorage.getItem('token');

      // Evita logout em loop para requisições públicas e preserva somente uma
      // rota local para retomada após a nova autenticação.
      if (hasToken) {
        const returnTo = currentLocalReturnPath();
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        if (window.location.pathname !== '/login') {
          window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
        }
      }
    }

    const apiMessage = responseErrorMessage(error);
    if (apiMessage) {
      error.message = apiMessage;
    }

    return Promise.reject(error);
  }
);

export default api;
