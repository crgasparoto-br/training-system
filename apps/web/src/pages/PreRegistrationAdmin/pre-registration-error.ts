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
    const reference = data.correlationId
      ? ` Código de atendimento: ${data.correlationId}.`
      : '';
    return `${fallback} Tente novamente e, se o problema continuar, informe este código à equipe.${reference}`;
  }

  if (data?.message && /^[A-Z0-9_]+$/.test(data.error || '')) {
    return data.message;
  }

  return data?.error || data?.message || value.message || fallback;
}
