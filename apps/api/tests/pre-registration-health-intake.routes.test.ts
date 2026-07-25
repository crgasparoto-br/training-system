jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({})),
}));

jest.mock('../src/modules/auth/auth.middleware', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
  alunoMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../src/modules/pre-registration-public/pre-registration-health-intake.service', () => ({
  HealthIntakeError: class HealthIntakeError extends Error {
    code: string;
    details?: Record<string, unknown>;
    constructor(message: string, code: string, details?: Record<string, unknown>) {
      super(message);
      this.code = code;
      this.details = details;
    }
  },
  preRegistrationHealthIntakeService: {},
}));

const {
  parseHealthIntakeComplete,
  parseHealthIntakeSave,
} = require('../src/modules/pre-registration-public/pre-registration-health-intake.routes');

describe('pre-registration health intake input allowlist', () => {
  it('accepts only the fields owned by the health-history step', () => {
    expect(
      parseHealthIntakeSave({
        expectedVersion: 1,
        step: 'HEALTH_HISTORY',
        consent: { privacyNoticeVersion: '2026-07', accepted: true },
        data: {
          mainGoal: 'Retomar a corrida',
          hasMedicalConditions: true,
          medicalHistory: 'Hipertensão controlada',
        },
      })
    ).toEqual(expect.objectContaining({ step: 'HEALTH_HISTORY' }));
  });

  it.each([
    ['PAR-Q', { parqResponses: { q1: true } }],
    ['questionário PAR-Q canônico legado', { questionnaireParq: { q1: true } }],
    ['antropometria', { weight: 75, height: 175, bodyFatPercentage: 15 }],
    ['cardiovascular', { systolicPressure: 120, restingHeartRate: 60 }],
    ['campos internos', { status: 'COMPLETED', contractId: 'other-tenant', version: 99 }],
  ])('rejects %s fields from the health module', (_label, extra) => {
    expect(() =>
      parseHealthIntakeSave({
        expectedVersion: 1,
        step: 'HEALTH_HISTORY',
        data: {
          mainGoal: 'Condicionamento',
          hasMedicalConditions: false,
          ...extra,
        },
      })
    ).toThrow();
  });

  it('rejects fields from another health-intake step', () => {
    expect(() =>
      parseHealthIntakeSave({
        expectedVersion: 2,
        step: 'MEDICATIONS',
        data: {
          usesMedication: false,
          hasAllergies: false,
          injuriesHistory: 'Não deveria estar nesta etapa',
        },
      })
    ).toThrow();
  });

  it('requires an explicit final declaration', () => {
    expect(() =>
      parseHealthIntakeComplete({ expectedVersion: 3, declarationAccepted: false })
    ).toThrow();
    expect(
      parseHealthIntakeComplete({ expectedVersion: 3, declarationAccepted: true })
    ).toEqual({ expectedVersion: 3, declarationAccepted: true });
  });
});
