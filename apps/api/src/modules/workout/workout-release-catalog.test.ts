import {
  projectReleasedExerciseCatalog, projectWorkoutDayExerciseCatalog,
} from './workout-release-catalog.js';

describe('#394 A-007: exercise media provenance at historical response boundaries', () => {
  const historical = {
    name: 'Movimento legado', videoUrl: 'https://example.org/third-party',
    mediaOrigin: null, mediaLicense: null, legacyGrandfathered: true,
  };
  const approved = {
    ...historical, legacyGrandfathered: false,
    mediaOrigin: 'Produção própria', mediaLicense: 'Autorização arquivada',
  };

  it('keeps the historical name while removing unlicensed video from released and draft views', () => {
    const released = projectReleasedExerciseCatalog(historical, {
      catalog: { name: 'Nome liberado', videoUrl: 'https://example.org/third-party' },
    });
    expect(released.name).toBe('Nome liberado');
    expect(released.videoUrl).toBeNull();
    const week = { exercises: [{ exercise: historical, releasedCatalog: null }] };
    expect(projectWorkoutDayExerciseCatalog(week, false).exercises[0].exercise.videoUrl).toBeNull();
    expect(week.exercises[0].exercise.videoUrl).toBe('https://example.org/third-party');
  });

  it('does not assign newly licensed live provenance to an old unlicensed snapshot video', () => {
    expect(projectReleasedExerciseCatalog(approved, {
      catalog: { name: 'Histórico', videoUrl: 'https://example.org/old-unlicensed' },
    }).videoUrl).toBeNull();
    expect(projectReleasedExerciseCatalog(approved, {
      catalog: { name: 'Histórico autorizado', videoUrl: 'https://example.org/licensed',
        mediaOrigin: 'Licença de arquivo', mediaLicense: 'Contrato 2025' },
    }).videoUrl).toBe('https://example.org/licensed');
  });

  it('#394 A-394-019: freezes the original legacy status and license with the released URL', () => {
    const original = { name: 'Movimento', videoUrl: 'https://example.org/licensed',
      mediaOrigin: 'Origem atual', mediaLicense: 'Licenca atual', legacyGrandfathered: true };
    const licensedAtRelease = projectReleasedExerciseCatalog(original, {
      catalog: { name: 'Capturado na liberacao', videoUrl: 'https://example.org/licensed',
        mediaOrigin: 'Arquivo da equipe', mediaLicense: 'Direito registrado', legacyGrandfathered: false },
    });
    expect(licensedAtRelease).toMatchObject({ name: 'Capturado na liberacao',
      videoUrl: 'https://example.org/licensed', mediaOrigin: 'Arquivo da equipe',
      mediaLicense: 'Direito registrado', legacyGrandfathered: false });
    const grandfatheredAtRelease = projectReleasedExerciseCatalog({ ...original, legacyGrandfathered: false }, {
      catalog: { name: 'Historico', videoUrl: 'https://example.org/legacy',
        mediaOrigin: 'Origem', mediaLicense: 'Licenca', legacyGrandfathered: true },
    });
    expect(grandfatheredAtRelease.videoUrl).toBeNull();
    expect(original.legacyGrandfathered).toBe(true);
  });

  it('allows licensed curator-approved media but never infers provenance from a URL', () => {
    expect(projectReleasedExerciseCatalog(approved, null).videoUrl)
      .toBe('https://example.org/third-party');
    expect(projectReleasedExerciseCatalog({ ...approved, mediaLicense: ' ' }, null).videoUrl)
      .toBeNull();
  });
});
