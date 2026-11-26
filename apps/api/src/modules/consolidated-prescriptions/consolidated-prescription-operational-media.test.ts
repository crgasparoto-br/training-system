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
    ['noncanonical owned origin', { mediaOrigin: ' Própria ', legacyGrandfathered: false }],
    ['noncanonical Unicode origin', { mediaOrigin: 'Própria\u00a0', legacyGrandfathered: false }],
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

  it('#579 exposes own media recorded in that snapshot without third-party license', () => {
    const owned = {
      name: 'Vídeo próprio', videoUrl: licensedUrl,
      mediaOrigin: 'Própria', mediaLicense: null, legacyGrandfathered: false,
    };
    const stored = {
      operationalExerciseSnapshot: owned,
      originalExerciseSnapshot: {
        name: 'Origem de terceiros', videoUrl: unsafeUrl,
        mediaOrigin: 'Licenciada', mediaLicense: null, legacyGrandfathered: false,
      },
    };
    const result = sanitizeConsolidatedOperationalMedia(stored);
    expect(result.operationalExerciseSnapshot.videoUrl).toBe(licensedUrl);
    expect(result.originalExerciseSnapshot.videoUrl).toBeNull();
    expect(stored.originalExerciseSnapshot.videoUrl).toBe(unsafeUrl);
  });

  it.each([
    { label: 'absent', marker: {}, allowed: false },
    { label: 'null', marker: { legacyGrandfathered: null }, allowed: false },
    { label: 'string', marker: { legacyGrandfathered: 'false' }, allowed: false },
    { label: 'numeric', marker: { legacyGrandfathered: 0 }, allowed: false },
    { label: 'legacy', marker: { legacyGrandfathered: true }, allowed: false },
    { label: 'non-legacy', marker: { legacyGrandfathered: false }, allowed: true },
  ])('#579 A-008 applies the own-media waiver only with a boolean false marker: $label', ({ marker, allowed }) => {
    const snapshot = { name: 'Histórico', videoUrl: unsafeUrl, mediaOrigin: 'Própria', mediaLicense: null, ...marker };
    const stored = { versions: [{ context: {
      exerciseSnapshot: snapshot,
      operationalExerciseSnapshot: snapshot,
      originalExerciseSnapshot: snapshot,
      substituteExerciseSnapshot: snapshot,
    } }] };
    const before = JSON.stringify(stored);
    const result = sanitizeConsolidatedOperationalMedia(stored);
    for (const projected of Object.values(result.versions[0].context)) {
      expect(projected).toEqual({ ...snapshot, videoUrl: allowed ? unsafeUrl : null });
    }
    expect(JSON.stringify(stored)).toBe(before);
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
