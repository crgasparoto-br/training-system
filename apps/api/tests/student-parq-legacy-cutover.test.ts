import {
  LegacyParqWriteError,
  assertNoLegacyParqWrite,
} from '../src/modules/alunos/student-parq-legacy-cutover.js';

describe('legacy PAR-Q cutover', () => {
  it('allows unrelated legacy intake updates', () => {
    expect(() =>
      assertNoLegacyParqWrite({ intakeForm: { medicalHistory: 'Histórico confirmado' } })
    ).not.toThrow();
  });

  it.each([
    { intakeForm: { parqResponses: { q1: true } } },
    { intakeForm: { formResponses: { parqResponses: { q1: true } } } },
  ])('rejects new legacy writes with a recognizable 410 error', (payload) => {
    expect(() => assertNoLegacyParqWrite(payload)).toThrowError(
      expect.objectContaining<Partial<LegacyParqWriteError>>({
        code: 'LEGACY_WRITE_DISABLED',
        statusCode: 410,
      })
    );
  });
});
