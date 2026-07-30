import { describe, expect, it } from 'vitest';
import type { ProntuarioOverview } from '@corrida/types';
import type { StudentSegmentedProfile } from '../../services/aluno.service';
import { buildTechnicalSourceSuggestions } from './capacityPrescriptionScreen.model';

describe('capacity prescription profile source', () => {
  it('expõe preferências como fonte canônica quando a API fornece o recordId do StudentProfile', () => {
    const profile = {
      alunoId: 'aluno-a',
      source: { type: 'student' },
      identification: {},
      preferences: {
        preferredActivities: ['Corrida ao ar livre'],
        restrictions: ['Evitar progressões abruptas'],
      },
      objectives: null,
      updatedAt: '2026-07-26T10:00:00.000Z',
    } as StudentSegmentedProfile;

    const suggestions = buildTechnicalSourceSuggestions({
      overview: { currentRecord: null } as unknown as ProntuarioOverview,
      profile,
      profileRecordId: 'student-profile-a',
      assessmentSources: [],
    });

    expect(suggestions).toEqual([
      expect.objectContaining({
        key: 'student_preference:student-profile-a',
        kind: 'preferencia',
        ref: expect.objectContaining({
          type: 'student_preference',
          id: 'student-profile-a',
          version: '2026-07-26T10:00:00.000Z',
        }),
      }),
    ]);
  });
});
