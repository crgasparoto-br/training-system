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

  it('resolves historical executions without changing the original record or exposing internals', () => {
    const execution = { id: 'execution-1', setsCompleted: 3, workoutExercise: {
      id: 'row-1', exercise: approved,
      releasedCatalog: { catalog: { name: 'Captured name', videoUrl: 'https://example.org/old' } },
      workoutDay: { template: { released: true } },
    } };
    const actual = projectWorkoutExecutionHistory(execution);
    expect(actual.workoutExercise.exercise).toMatchObject({ name: 'Captured name', videoUrl: null });
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
