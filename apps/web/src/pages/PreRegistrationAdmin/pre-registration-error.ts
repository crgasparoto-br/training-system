type PreRegistrationFailure = {
  response?: {
    data?: {
      error?: string;
      message?: string;
      code?: string;
      correlationId?: string;
    };
  };
  message?: string;
};

export function preRegistrationErrorMessage(error: unknown, fallback: string): string {
  const value = error as PreRegistrationFailure;
  const data = value.response?.data;

  if (data?.error === 'PRE_REGISTRATION_INTERNAL_ERROR') {
    if (data.correlationId) {
      return `${fallback} Tente novamente e, se o problema continuar, informe o código de atendimento ${data.correlationId} à equipe.`;
    }
    return `${fallback} Tente novamente e, se o problema continuar, procure a equipe responsável.`;
  }

  if (data?.message && /^[A-Z0-9_]+$/.test(data.error || '')) {
    return data.message;
  }

  return data?.error || data?.message || value.message || fallback;
}
