import type { AdipometryAssessmentDetail } from '@corrida/types';
import { describe, expect, it } from 'vitest';
import {
  adipometryRevisionStatusLabel,
  buildAdipometryGuidedSteps,
} from './AdipometryViewSections';

function detail(overrides: Partial<AdipometryAssessmentDetail> = {}): AdipometryAssessmentDetail {
  return {
    id: 'assessment-1',
    contractId: 'contract-1',
    alunoId: 'aluno-1',
    professorId: 'professor-1',
    code: 'ADPT-001',
    sequenceNumber: 1,
    assessmentDate: '2026-08-04',
    status: 'DRAFT',
    revisionStatus: 'DRAFT',
    rootAssessmentId: 'assessment-1',
    revisionNumber: 1,
    createdAt: '2026-08-04T12:00:00.000Z',
    updatedAt: '2026-08-04T12:00:00.000Z',
    measurements: {},
    ...overrides,
  };
}

describe('adipometryRevisionStatusLabel', () => {
  it.each([
    ['DRAFT', 'Rascunho'],
    ['FINALIZED', 'Concluída'],
    ['SUPERSEDED', 'Substituída'],
    ['CANCELLED', 'Cancelada'],
    ['VOIDED', 'Invalidada'],
  ] as const)('traduz %s sem colapsar estados distintos', (status, label) => {
    expect(adipometryRevisionStatusLabel(status)).toBe(label);
  });
});

describe('buildAdipometryGuidedSteps', () => {
  it('não conclui contexto sem protocolo persistido', () => {
    const steps = buildAdipometryGuidedSteps({
      detail: detail(),
      preview: null,
      selectedStudent: true,
    });

    expect(steps[0].done).toBe(true);
    expect(steps[1].done).toBe(false);
  });

  it('não conclui coleta com apenas parte das medidas persistidas', () => {
    const steps = buildAdipometryGuidedSteps({
      detail: detail({
        protocolCode: 'GUEDES_1991_ADULT_YOUNG',
        protocolVersion: 1,
        measurements: { weightKg: 80, tricepsMm: 12 },
      }),
      preview: null,
      selectedStudent: true,
    });

    expect(steps[1].done).toBe(true);
    expect(steps[2].done).toBe(false);
  });

  it('conclui coleta somente com peso e cinco dobras persistidos', () => {
    const steps = buildAdipometryGuidedSteps({
      detail: detail({
        protocolCode: 'GUEDES_1991_ADULT_YOUNG',
        protocolVersion: 1,
        measurements: {
          weightKg: 80,
          tricepsMm: 12,
          subscapularMm: 14,
          suprailiacMm: 18,
          abdominalMm: 20,
          thighMm: 16,
        },
      }),
      preview: null,
      selectedStudent: true,
    });

    expect(steps[1].done).toBe(true);
    expect(steps[2].done).toBe(true);
  });
});
