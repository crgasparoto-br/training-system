import type { AdipometryProtocolDefinitionSnapshot } from '@corrida/types';
import {
  calculateAdipometry,
  type AdipometryCalculationContext,
} from './adipometry.service.js';

function definition(
  mode: AdipometryProtocolDefinitionSnapshot['rounding']['mode']
): AdipometryProtocolDefinitionSnapshot {
  return {
    schemaVersion: 2,
    population: {
      ageMinYears: 18,
      ageMaxYears: 30,
      sexCriteria: ['MALE', 'FEMALE'],
      maturationCriteria: 'NOT_REQUIRED',
    },
    requiredSkinfolds: [
      'tricepsMm',
      'subscapularMm',
      'suprailiacMm',
      'abdominalMm',
      'thighMm',
    ],
    calculationSkinfoldsBySex: {
      MALE: ['tricepsMm', 'suprailiacMm', 'abdominalMm'],
      FEMALE: ['subscapularMm', 'suprailiacMm', 'thighMm'],
    },
    inputUnits: {
      weightKg: 'kg',
      tricepsMm: 'mm',
      subscapularMm: 'mm',
      suprailiacMm: 'mm',
      abdominalMm: 'mm',
      thighMm: 'mm',
    },
    inputScales: {
      weightKg: 2,
      tricepsMm: 1,
      subscapularMm: 1,
      suprailiacMm: 1,
      abdominalMm: 1,
      thighMm: 1,
    },
    outputUnits: {
      skinfoldTotalMm: 'mm',
      bodyFatPercentage: 'percent',
      fatMassKg: 'kg',
      leanMassKg: 'kg',
    },
    equations: [
      {
        id: 'controlled-body-fat',
        output: 'bodyFatPercentage',
        expression: { op: 'constant', value: 18.245 },
      },
      {
        id: 'controlled-fat-mass',
        output: 'fatMassKg',
        expression: {
          op: 'divide',
          numerator: {
            op: 'multiply',
            args: [
              { op: 'variable', name: 'weightKg' },
              { op: 'variable', name: 'bodyFatPercentage' },
            ],
          },
          denominator: { op: 'constant', value: 100 },
        },
      },
      {
        id: 'controlled-lean-mass',
        output: 'leanMassKg',
        expression: {
          op: 'subtract',
          left: { op: 'variable', name: 'weightKg' },
          right: { op: 'variable', name: 'fatMassKg' },
        },
      },
    ],
    limits: {
      blocking: {
        weightKg: { min: 0.01, max: 999.99 },
        tricepsMm: { min: 0.1, max: 80 },
        subscapularMm: { min: 0.1, max: 80 },
        suprailiacMm: { min: 0.1, max: 80 },
        abdominalMm: { min: 0.1, max: 80 },
        thighMm: { min: 0.1, max: 80 },
      },
      warnings: [],
    },
    precision: {
      measurementScale: 1,
      resultScale: 2,
      internalScale: 8,
      skinfoldTotalScale: 1,
    },
    rounding: { mode, stage: 'FINAL_RESULTS_ONLY' },
    missingDataBehavior: {
      missingRequired: 'BLOCK',
      incompatibleProfile: 'BLOCK',
    },
    testVectors: [],
  };
}

function context(
  mode: AdipometryProtocolDefinitionSnapshot['rounding']['mode']
): AdipometryCalculationContext {
  return {
    assessmentId: `assessment-${mode}`,
    alunoId: 'aluno-rounding',
    assessmentDate: '2026-08-03',
    measurements: {
      weightKg: 80,
      tricepsMm: 10,
      suprailiacMm: 10,
      abdominalMm: 10,
    },
    protocolSex: 'male',
    protocolSexSource: 'profile',
    protocolSexOverrideReason: null,
    profile: { birthDate: '2001-08-03', profileSex: 'male' },
    protocol: {
      protocolId: `protocol-${mode}`,
      protocolCode: `ROUNDING_${mode}`,
      protocolVersion: 1,
      protocolName: `Rounding ${mode}`,
      protocolStatus: 'DRAFT',
      protocolReference: 'controlled-test',
      definitionSnapshot: definition(mode),
      approvalId: `approval-${mode}`,
      responsibilityId: 'responsibility-rounding',
      approvedAt: new Date('2026-08-01T12:00:00.000Z'),
      approvedByProfessorId: 'professor-rounding',
      approvedByName: 'Responsável técnico',
      approvedByCref: 'CREF-ROUNDING',
      approvedSpecificationHash: 'a'.repeat(64),
    },
    capacityWarningConfirmed: false,
    actorUserId: 'user-rounding',
    calculatedAt: new Date('2026-08-03T12:00:00.000Z'),
  } as AdipometryCalculationContext;
}

describe('adipometry approved rounding contract', () => {
  it('distinguishes HALF_UP from HALF_EVEN at the exact midpoint', () => {
    const halfUp = calculateAdipometry(context('HALF_UP'));
    const halfEven = calculateAdipometry(context('HALF_EVEN'));

    expect(halfUp.results?.bodyFatPercentage).toBe(18.25);
    expect(halfEven.results?.bodyFatPercentage).toBe(18.24);
  });
});
