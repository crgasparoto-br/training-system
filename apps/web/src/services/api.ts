import axios, { type AxiosError, type AxiosResponse } from 'axios';

const API_URL = import.meta.env.VITE_API_URL;
const API_TIMEOUT_MS = 30000;

function resolveApiBaseUrl(value?: string) {
  const normalized = value?.replace(/\/+$/, '');

  if (!normalized) {
    return '/api/v1';
  }

  return normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`;
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

    if (status === 401 && !isAuthRequest) {
      const hasToken = !!localStorage.getItem('token');

      // Evita logout em loop para requisições públicas e evita redirecionamento redundante.
      if (hasToken) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
