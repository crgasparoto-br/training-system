import {
  projectReleasedExerciseCatalog, projectWorkoutDayExerciseCatalog,
  projectWorkoutExecutionHistory, projectWorkoutExerciseMedia,
} from './workout-release-catalog.js';

describe('#394 A-007: exercise media provenance at historical response boundaries', () => {
  const historical = {
    name: 'Movimento legado', videoUrl: 'https://example.org/third-party',
    mediaOrigin: null, mediaLicense: null, legacyGrandfathered: true,
  };
  const approved = {
    ...historical, legacyGrandfathered: false, curationStatus: 'approved',
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

  it('#579 allows explicitly owned video without a license, but not legacy or later-inferred rights', () => {
    const owned = { ...approved, mediaOrigin: 'Própria', mediaLicense: null };
    expect(projectWorkoutExerciseMedia({ exercise: owned }).exercise.videoUrl)
      .toBe('https://example.org/third-party');
    expect(projectWorkoutExerciseMedia({ exercise: { ...owned, legacyGrandfathered: true } }).exercise.videoUrl)
      .toBeNull();
    expect(projectReleasedExerciseCatalog(approved, {
      catalog: { name: 'Vídeo próprio', videoUrl: 'https://example.org/owned',
        mediaOrigin: 'Própria', mediaLicense: null, legacyGrandfathered: false },
    }).videoUrl).toBe('https://example.org/owned');
    expect(projectReleasedExerciseCatalog(owned, {
      catalog: { name: 'Vídeo antigo', videoUrl: 'https://example.org/unlicensed',
        mediaOrigin: 'Licenciada', mediaLicense: null, legacyGrandfathered: false },
    }).videoUrl).toBeNull();
    expect(projectReleasedExerciseCatalog(owned, {
      catalog: { name: 'Origem desconhecida', videoUrl: 'https://example.org/unlicensed',
        mediaLicense: null, legacyGrandfathered: false },
    }).videoUrl).toBeNull();
  });

  it.each(['draft', 'in_review', 'inactive', undefined])(
    '#579 A-002 hides live owned media with status %s but preserves the released snapshot',
    (curationStatus) => {
      const owned = { ...approved, curationStatus, mediaOrigin: 'Própria', mediaLicense: null };
      expect(projectWorkoutExerciseMedia({ exercise: owned }).exercise.videoUrl).toBeNull();
      expect(projectWorkoutDayExerciseCatalog({ exercises: [{ exercise: owned }] }, false)
        .exercises[0].exercise.videoUrl).toBeNull();
      expect(projectReleasedExerciseCatalog(owned, {
        catalog: { name: 'Capturado', videoUrl: 'https://example.org/captured',
          mediaOrigin: 'Própria', mediaLicense: null, legacyGrandfathered: false },
      }).videoUrl).toBe('https://example.org/captured');
      expect(owned.videoUrl).toBe('https://example.org/third-party');
    },
  );

  it.each([' Própria ', 'Própria\u00a0'])('#579 A-001 rejects noncanonical origin %j in live and released media', (mediaOrigin) => {
    const owned = { ...approved, mediaOrigin, mediaLicense: null };
    expect(projectWorkoutExerciseMedia({ exercise: owned }).exercise.videoUrl).toBeNull();
    expect(projectReleasedExerciseCatalog(approved, { catalog: owned }).videoUrl).toBeNull();
    const licensed = { ...owned, mediaLicense: 'Autorização' };
    expect(projectWorkoutExerciseMedia({ exercise: licensed }).exercise.videoUrl).toBe(licensed.videoUrl);
    expect(projectReleasedExerciseCatalog(approved, { catalog: licensed }).videoUrl).toBe(licensed.videoUrl);
  });

  it('does not assign newly licensed live provenance to an old unlicensed snapshot video', () => {
    expect(projectReleasedExerciseCatalog(approved, {
      catalog: { name: 'Histórico', videoUrl: 'https://example.org/old-unlicensed' },
    }).videoUrl).toBeNull();
    expect(projectReleasedExerciseCatalog(approved, {
      catalog: { name: 'Histórico autorizado', videoUrl: 'https://example.org/licensed',
        mediaOrigin: 'Licença de arquivo', mediaLicense: 'Contrato 2025', legacyGrandfathered: false },
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

  it('cannot infer media rights from a missing or incomplete release snapshot', () => {
    expect(projectReleasedExerciseCatalog(approved, null).videoUrl).toBeNull();
    expect(projectReleasedExerciseCatalog(approved, { catalog: { name: 'No video' } }).videoUrl).toBeNull();
    expect(projectReleasedExerciseCatalog(approved, { catalog: {
      name: 'Old recording', videoUrl: 'https://example.org/old',
      mediaOrigin: 'Archive', mediaLicense: 'Prior license',
    } }).videoUrl).toBeNull();
    expect(projectReleasedExerciseCatalog(approved, { catalog: {
      name: 'Old recording', videoUrl: 'https://example.org/old',
    } }).videoUrl).toBeNull();
  });

  it.each([
    { label: 'absent', captured: null, origin: null, license: null, legacy: true },
    { label: 'pre-provenance', captured: { catalog: { name: 'Old', videoUrl: 'https://example.org/old' } }, origin: null, license: null, legacy: true },
    { label: 'missing origin', captured: { catalog: { name: 'Old', mediaLicense: 'Archive', legacyGrandfathered: false } }, origin: null, license: 'Archive', legacy: false },
    { label: 'missing license', captured: { catalog: { name: 'Old', mediaOrigin: 'Licenciada', legacyGrandfathered: false } }, origin: 'Licenciada', license: null, legacy: false },
    { label: 'malformed', captured: { catalog: { mediaOrigin: 'Própria', mediaLicense: 'Later', legacyGrandfathered: false } }, origin: null, license: null, legacy: true },
  ])('#579 A-006 does not inherit media provenance from the live catalog: $label', ({ captured, origin, license, legacy }) => {
    const live = { ...approved, mediaAuthor: 'Later author' };
    const before = JSON.stringify({ live, captured });
    expect(projectReleasedExerciseCatalog(live, captured)).toMatchObject({
      videoUrl: null, mediaOrigin: origin, mediaLicense: license,
      mediaAuthor: null, legacyGrandfathered: legacy,
    });
    expect(JSON.stringify({ live, captured })).toBe(before);
  });

  it('#579 A-006 uses captured own-media rights even if later rights differ, without adding unselected fields', () => {
    const captured = { catalog: { name: 'Released', videoUrl: 'https://example.org/released',
      mediaOrigin: 'Própria', legacyGrandfathered: false } };
    expect(projectReleasedExerciseCatalog({ ...approved, mediaAuthor: 'Later author' }, captured))
      .toMatchObject({ videoUrl: captured.catalog.videoUrl, mediaOrigin: 'Própria', mediaLicense: null, mediaAuthor: null });
    expect(projectReleasedExerciseCatalog({ name: 'Later' }, captured)).toEqual({ name: 'Released' });
    expect(projectReleasedExerciseCatalog({ name: 'Later', videoUrl: approved.videoUrl }, captured))
      .toEqual({ name: 'Released', videoUrl: captured.catalog.videoUrl });
  });

  it('resolves historical executions without changing the original record or exposing internals', () => {
    const execution = { id: 'execution-1', setsCompleted: 3, workoutExercise: {
      id: 'row-1', exercise: approved,
      releasedCatalog: { catalog: { name: 'Captured name', videoUrl: 'https://example.org/old' } },
      workoutDay: { template: { released: true } },
    } };
    const actual = projectWorkoutExecutionHistory(execution);
    expect(actual.workoutExercise.exercise).toMatchObject({ name: 'Captured name', videoUrl: null, mediaOrigin: null, mediaLicense: null });
    expect(actual.setsCompleted).toBe(3);
    expect(JSON.stringify(actual)).not.toContain('releasedCatalog');
    expect(execution.workoutExercise.exercise.videoUrl).toBe('https://example.org/third-party');
    expect(execution.workoutExercise.releasedCatalog.catalog.videoUrl).toBe('https://example.org/old');
  });

  it('preserves licensed release media after later live edits and hides draft legacy media', () => {
    const released = { workoutExercise: {
      exercise: { ...approved, videoUrl: 'https://example.org/changed' },
      releasedCatalog: { catalog: { name: 'Released name', videoUrl: 'https://example.org/original',
        mediaOrigin: 'Original author', mediaLicense: 'Original license', legacyGrandfathered: false } },
      workoutDay: { template: { released: true } },
    } };
    expect(projectWorkoutExecutionHistory(released).workoutExercise.exercise.videoUrl)
      .toBe('https://example.org/original');
    expect(projectWorkoutExecutionHistory({ workoutExercise: {
      ...released.workoutExercise, workoutDay: { template: { released: false } },
      exercise: historical,
    } }).workoutExercise.exercise.videoUrl).toBeNull();
    expect(projectWorkoutExerciseMedia({ exercise: historical }).exercise.videoUrl).toBeNull();
    expect(projectWorkoutExerciseMedia({ exercise: approved }).exercise.videoUrl)
      .toBe('https://example.org/third-party');
  });
});
