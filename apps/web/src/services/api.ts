import axios, { type AxiosError, type AxiosResponse } from 'axios';
import {
  dispatchPreRegistrationDisabled,
  isPreRegistrationDisabledResponse,
  isPreRegistrationRequestUrl,
} from '../config/pre-registration-availability';

const API_URL = import.meta.env.VITE_API_URL;
const API_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_DELAY_MS = 1500;

export type ApiFailureKind = 'http' | 'timeout' | 'network' | 'unknown';

export type ApiResilienceEvent = {
  operation: string;
  phase: 'retry' | 'terminal';
  failureKind: ApiFailureKind;
  attempt: number;
  status?: number;
};

export function classifyApiFailure(error: unknown): ApiFailureKind {
  if (!axios.isAxiosError(error)) {
    return 'unknown';
  }

  if (error.response) {
    return 'http';
  }

  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return 'timeout';
  }

  return 'network';
}

export function reportApiResilienceEvent(event: ApiResilienceEvent) {
  console.warn('[api-resilience]', event);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('api-resilience', { detail: event }));
  }
}

const wait = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));

export async function requestWithTransientRetry<T>(
  request: () => Promise<T>,
  options: {
    operation?: string;
    maxRetries?: number;
    delayMs?: number;
    onRetry?: (event: Omit<ApiResilienceEvent, 'phase'>) => void;
    onTerminal?: (event: Omit<ApiResilienceEvent, 'phase'>) => void;
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const delayMs = options.delayMs ?? DEFAULT_RETRY_DELAY_MS;
  let attempt = 0;

  while (true) {
    try {
      return await request();
    } catch (error) {
      const failureKind = classifyApiFailure(error);
      const isTransient = failureKind === 'timeout' || failureKind === 'network';
      if (!isTransient || attempt >= maxRetries) {
        options.onTerminal?.({
          operation: options.operation ?? 'unknown',
          failureKind,
          attempt: attempt + 1,
          status: axios.isAxiosError(error) ? error.response?.status : undefined,
        });
        throw error;
      }

      attempt += 1;
      options.onRetry?.({
        operation: options.operation ?? 'unknown',
        failureKind,
        attempt,
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
      });
      await wait(delayMs * attempt);
    }
  }
}

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
