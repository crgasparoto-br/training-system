export type CepAddress = {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  complement?: string;
};

type ViaCepResponse = {
  erro?: boolean;
  logradouro?: unknown;
  bairro?: unknown;
  localidade?: unknown;
  uf?: unknown;
  complemento?: unknown;
};

const VIACEP_BASE_URL = 'https://viacep.com.br/ws';
const CEP_NOT_FOUND_ERROR = 'CEP não encontrado';
const CEP_LOOKUP_ERROR = 'Não foi possível consultar o CEP';

export const cepLookupFeedback = {
  notFound: 'CEP não encontrado. Confira os números digitados.',
  lookupError: 'Não foi possível consultar o CEP. Verifique sua conexão e tente novamente.',
} as const;

export function onlyCepDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8);
}

export function formatCep(value: string): string {
  const digits = onlyCepDigits(value);

  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function isValidCep(value: string): boolean {
  return onlyCepDigits(value).length === 8;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function lookupCep(value: string): Promise<CepAddress | null> {
  const cep = onlyCepDigits(value);

  if (cep.length < 8) {
    return null;
  }

  let response: Response;

  try {
    response = await fetch(`${VIACEP_BASE_URL}/${cep}/json/`);
  } catch {
    throw new Error(CEP_LOOKUP_ERROR);
  }

  if (!response.ok) {
    throw new Error(CEP_LOOKUP_ERROR);
  }

  let data: ViaCepResponse;

  try {
    data = (await response.json()) as ViaCepResponse;
  } catch {
    throw new Error(CEP_LOOKUP_ERROR);
  }

  if (data.erro) {
    throw new Error(CEP_NOT_FOUND_ERROR);
  }

  return {
    street: asString(data.logradouro),
    neighborhood: asString(data.bairro),
    city: asString(data.localidade),
    state: asString(data.uf),
    complement: asString(data.complemento) || undefined,
  };
}

export function getCepLookupFeedbackMessage(error: unknown): string {
  if (error instanceof Error && error.message === CEP_NOT_FOUND_ERROR) {
    return cepLookupFeedback.notFound;
  }

  return cepLookupFeedback.lookupError;
}
