export class LegacyParqWriteError extends Error {
  readonly code = 'LEGACY_WRITE_DISABLED';
  readonly statusCode = 410;

  constructor() {
    super('Novas respostas do PAR-Q devem ser registradas pelo fluxo autenticado do questionário.');
    this.name = 'LegacyParqWriteError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function assertNoLegacyParqWrite(input: unknown): void {
  const root = record(input);
  const intake = record(root?.intakeForm);
  const formResponses = record(intake?.formResponses);
  if (
    (intake && Object.prototype.hasOwnProperty.call(intake, 'parqResponses')) ||
    (formResponses && Object.prototype.hasOwnProperty.call(formResponses, 'parqResponses'))
  ) {
    throw new LegacyParqWriteError();
  }
}
