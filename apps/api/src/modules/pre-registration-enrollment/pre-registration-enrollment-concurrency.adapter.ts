import {
  PreRegistrationEnrollmentError,
  preRegistrationEnrollmentService,
} from './pre-registration-enrollment.service.js';

type RuntimeService = typeof preRegistrationEnrollmentService & {
  __issue274ConcurrencyAdapterApplied?: boolean;
};

type PrismaLikeError = {
  code?: unknown;
  meta?: unknown;
  message?: unknown;
  cause?: unknown;
};

const runtime = preRegistrationEnrollmentService as RuntimeService;

function serializedErrorText(error: PrismaLikeError): string {
  return [error.message, error.meta, error.cause]
    .map((value) => {
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value ?? '');
      }
    })
    .join(' ')
    .toLowerCase();
}

export function isEnrollmentConcurrencyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as PrismaLikeError;
  const meta = candidate.meta && typeof candidate.meta === 'object'
    ? candidate.meta as Record<string, unknown>
    : undefined;
  const sqlState = String(meta?.code ?? meta?.sqlState ?? '').toUpperCase();
  const text = serializedErrorText(candidate);

  return candidate.code === 'P2034' ||
    (candidate.code === 'P2010' && sqlState === '40001') ||
    sqlState === '40001' ||
    text.includes('could not serialize access') ||
    text.includes('serialization failure') ||
    text.includes('deadlock detected');
}

export function translateEnrollmentConcurrencyError(error: unknown): never {
  if (error instanceof PreRegistrationEnrollmentError) throw error;
  if (isEnrollmentConcurrencyError(error)) {
    throw new PreRegistrationEnrollmentError(
      'Os dados foram alterados por outra operação. Recarregue e refaça a revisão antes de continuar.',
      'CONCURRENT_MODIFICATION'
    );
  }
  throw error;
}

if (!runtime.__issue274ConcurrencyAdapterApplied) {
  const decideOriginal = runtime.decide.bind(runtime);
  const markReadyOriginal = runtime.markReady.bind(runtime);
  const confirmEnrollmentOriginal = runtime.confirmEnrollment.bind(runtime);

  runtime.decide = async (...args: Parameters<typeof decideOriginal>) => {
    try {
      return await decideOriginal(...args);
    } catch (error) {
      return translateEnrollmentConcurrencyError(error);
    }
  };

  runtime.markReady = async (...args: Parameters<typeof markReadyOriginal>) => {
    try {
      return await markReadyOriginal(...args);
    } catch (error) {
      return translateEnrollmentConcurrencyError(error);
    }
  };

  runtime.confirmEnrollment = async (...args: Parameters<typeof confirmEnrollmentOriginal>) => {
    try {
      return await confirmEnrollmentOriginal(...args);
    } catch (error) {
      return translateEnrollmentConcurrencyError(error);
    }
  };

  runtime.__issue274ConcurrencyAdapterApplied = true;
}
