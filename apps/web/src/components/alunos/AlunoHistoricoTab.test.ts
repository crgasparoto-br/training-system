import { describe, expect, it } from 'vitest';
import type { StudentTimelineEvent } from '../../services/aluno.service';
import { canonicalSourceLink } from './canonicalSourceLink';

const event = (
  sourceType: string, sourceId: string, metadata: StudentTimelineEvent['metadata'] = {},
): StudentTimelineEvent => ({
  id: `clinical-${sourceId}`, type: 'clinical_event', title: 'Evento',
  occurredAt: '2026-10-13T12:00:00Z',
  source: { type: 'professional', reference: sourceId, recordedByUserId: null },
  sourceType, sourceId, metadata,
});

const target = (url: string | null) => {
  expect(url).not.toBeNull();
  return new URL(url!, 'https://example.test');
};

describe('clinical timeline source deep links', () => {
  it('opens the precise PRNT record, entity and immutable version', () => {
    const url = target(canonicalSourceLink(event('prontuario-history-event', 'history-123', {
      recordId: 'record-4', entityType: 'goal', entityId: 'goal-9', version: 2,
    }), 'student-1'));
    expect(url.pathname).toContain('/prontuario-entrevista-acompanhamento');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      alunoId: 'student-1', recordId: 'record-4', entityType: 'goal',
      entityId: 'goal-9', version: '2',
    });
  });

  it('targets a PAR-Q submission and exact initial intake revision', () => {
    const parq = target(canonicalSourceLink(event('student-parq-submission', 'submission-7'), 'student-1'));
    const intake = target(canonicalSourceLink(event('student-health-intake-revision', 'intake-3', {
      revision: 3,
    }), 'student-1'));
    expect(parq.searchParams.get('parqSubmissionId')).toBe('submission-7');
    expect(intake.searchParams.get('intakeRevision')).toBe('3');
  });

  it('uses the destination assessmentId contract for adipometry and corrected anthropometry', () => {
    const adpt = target(canonicalSourceLink(event('adipometry-assessment', 'revision-adpt-2'), 'student-1'));
    const anth = target(canonicalSourceLink(event('anthropometry-correction', 'correction-5', {
      assessmentId: 'assessment-antr-1', correctionId: 'correction-5',
    }), 'student-1'));
    expect(adpt.searchParams.get('assessmentId')).toBe('revision-adpt-2');
    expect(anth.searchParams.get('assessmentId')).toBe('assessment-antr-1');
    expect(anth.searchParams.get('correctionId')).toBe('correction-5');
  });

  it('does not create a misleading deep link when canonical identity is missing', () => {
    expect(canonicalSourceLink(event('prontuario-history-event', 'history-123'), 'student-1')).toBeNull();
  });
});
