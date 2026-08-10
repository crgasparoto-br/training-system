import { describe, expect, it } from 'vitest';
import type { AdipometryAssessmentDetail } from '@corrida/types';
import { createEmptyAdipometryForm } from './adipometry-ui';
import { buildAdipometryDraftPayload } from './adipometry-screen-utils';

const current = {
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
  measurements: { weightKg: 70, tricepsMm: 12 },
  createdAt: '2026-08-04T12:00:00.000Z',
  updatedAt: '2026-08-04T12:00:00.000Z',
} satisfies AdipometryAssessmentDetail;

describe('buildAdipometryDraftPayload', () => {
  it('envia null ao remover uma medida persistida e preserva campos nunca informados', () => {
    const form = createEmptyAdipometryForm();
    form.assessmentDate = current.assessmentDate;
    form.measurements.weightKg = '70';
    form.measurements.tricepsMm = '';

    const result = buildAdipometryDraftPayload({
      form,
      current,
      isCorrectionDraft: false,
    });

    expect(result.fieldErrors).toEqual({});
    expect(result.payload?.measurements).toEqual({
      weightKg: 70,
      tricepsMm: null,
    });
    expect(result.payload?.measurements).not.toHaveProperty('subscapularMm');
  });

  it('mantem erro local para decimal invalido sem produzir payload parcial', () => {
    const form = createEmptyAdipometryForm();
    form.measurements.tricepsMm = '12,3,4';

    const result = buildAdipometryDraftPayload({
      form,
      current,
      isCorrectionDraft: false,
    });

    expect(result.payload).toBeUndefined();
    expect(result.fieldErrors.tricepsMm).toMatch(/vírgula ou ponto/i);
  });
});
