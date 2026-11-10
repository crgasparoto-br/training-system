import { sanitizeConsolidatedOperationalMedia } from './consolidated-prescription-operational-media.js';

describe('#394 A-394-018: historical operational video redaction at the API boundary', () => {
  const unsafeUrl = 'https://example.org/historical-unlicensed-video';
  const licensedUrl = 'https://example.org/owned-licensed-video';

  it('removes an unverified mapping video without erasing the original snapshot', () => {
    const response = {
      technicalCatalogItemId: 'technical-a',
      curationStatus: 'inactive',
      operationalExerciseSnapshot: { id: 'exercise-a', name: 'Histórico', videoUrl: unsafeUrl },
    };
    const publicResponse = sanitizeConsolidatedOperationalMedia(response);
    expect(publicResponse).toMatchObject({
      technicalCatalogItemId: 'technical-a',
      curationStatus: 'inactive',
      operationalExerciseSnapshot: { id: 'exercise-a', name: 'Histórico', videoUrl: null },
    });
    expect(response.operationalExerciseSnapshot.videoUrl).toBe(unsafeUrl);
    expect(publicResponse).not.toBe(response);
  });

  it.each([
    ['no origin', { mediaLicense: 'owned' }],
    ['no license', { mediaOrigin: 'company_production' }],
    ['empty origin', { mediaOrigin: '  ', mediaLicense: 'owned' }],
    ['legacy grandfathered', { mediaOrigin: 'company_production', mediaLicense: 'owned', legacyGrandfathered: true }],
  ])('hides %s even if an outdated URL exists', (_, fields) => {
    const result = sanitizeConsolidatedOperationalMedia({
      operationalExerciseSnapshot: { name: 'Histórico', videoUrl: unsafeUrl, ...fields },
    });
    expect(result.operationalExerciseSnapshot.videoUrl).toBeNull();
  });

  it('keeps video only when provenance belongs to that exact snapshot', () => {
    const licensedSnapshot = {
      name: 'Revisado', videoUrl: licensedUrl,
      mediaOrigin: 'company_production', mediaLicense: 'owned',
      legacyGrandfathered: false,
    };
    const result = sanitizeConsolidatedOperationalMedia({
      operationalExerciseSnapshot: licensedSnapshot,
      // An unlicensed original cannot borrow the substitute's later rights.
      originalExerciseSnapshot: { name: 'Anterior', videoUrl: unsafeUrl },
    });
    expect(result.operationalExerciseSnapshot.videoUrl).toBe(licensedUrl);
    expect(result.originalExerciseSnapshot.videoUrl).toBeNull();
  });

  it('sanitizes all nested substitution history without changing stored data or unrelated payloads', () => {
    const time = new Date('2026-08-11T10:00:00.000Z');
    const stored = {
      versions: [{
        createdAt: time,
        dataRefs: [{
          origin: 'consolidated_exercise_substitution_v1',
          context: {
            originalExerciseSnapshot: { id: 'historical', name: 'Original', videoUrl: unsafeUrl },
            substituteExerciseSnapshot: {
              id: 'approved', name: 'Substituto', videoUrl: licensedUrl,
              mediaOrigin: 'company_production', mediaLicense: 'owned',
            },
            auditNotes: { videoUrl: 'metadata-not-an-exercise-snapshot' },
          },
        }],
      }],
    };
    const result = sanitizeConsolidatedOperationalMedia(stored);
    expect(result.versions[0].createdAt).toBe(time);
    expect(result.versions[0].dataRefs[0].context.originalExerciseSnapshot.videoUrl).toBeNull();
    expect(result.versions[0].dataRefs[0].context.substituteExerciseSnapshot.videoUrl).toBe(licensedUrl);
    expect(result.versions[0].dataRefs[0].context.auditNotes.videoUrl).toBe('metadata-not-an-exercise-snapshot');
    expect(stored.versions[0].dataRefs[0].context.originalExerciseSnapshot.videoUrl).toBe(unsafeUrl);
  });

  it('fails closed for malformed historical snapshots with URL but no exercise name', () => {
    const result = sanitizeConsolidatedOperationalMedia({
      exerciseSnapshot: { videoUrl: unsafeUrl, mediaOrigin: 'company', mediaLicense: 'owned' },
    });
    expect(result.exerciseSnapshot.videoUrl).toBeNull();
  });
});
