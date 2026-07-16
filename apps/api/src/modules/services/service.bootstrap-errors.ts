export const SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE =
  'Não foi possível concluir a carga agora. Nenhuma alteração foi salva. Tente novamente.';

const TRANSACTION_UNAVAILABLE_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2028',
]);

const TRANSACTION_UNAVAILABLE_PATTERNS = [
  /transaction api error/i,
  /transaction not found/i,
  /old closed transaction/i,
  /unable to start a transaction/i,
  /timed out.*transaction/i,
  /transaction.*timed out/i,
  /connection pool.*tim(?:e|ed) out/i,
  /server has closed the connection/i,
];

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  cause?: unknown;
};

export function isServiceCatalogTransactionUnavailable(error: unknown): boolean {
  let current: unknown = error;
  const visited = new Set<unknown>();

  for (let depth = 0; depth < 4 && current && !visited.has(current); depth += 1) {
    visited.add(current);

    if (typeof current === 'object') {
      const candidate = current as ErrorLike;
      if (
        typeof candidate.code === 'string' &&
        TRANSACTION_UNAVAILABLE_CODES.has(candidate.code)
      ) {
        return true;
      }

      if (
        typeof candidate.message === 'string' &&
        TRANSACTION_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(candidate.message))
      ) {
        return true;
      }

      current = candidate.cause;
      continue;
    }

    if (
      typeof current === 'string' &&
      TRANSACTION_UNAVAILABLE_PATTERNS.some((pattern) => pattern.test(current))
    ) {
      return true;
    }

    break;
  }

  return false;
}

export class ServiceCatalogBootstrapUnavailableError extends Error {
  readonly technicalCause: unknown;

  constructor(technicalCause: unknown) {
    super(SERVICE_CATALOG_BOOTSTRAP_UNAVAILABLE_MESSAGE);
    this.name = 'ServiceCatalogBootstrapUnavailableError';
    this.technicalCause = technicalCause;
  }
}
