import { prismaRuntimeClient } from '../src/common/prisma-runtime-client';
import { libraryService } from '../src/modules/library/library.service';

jest.mock('../src/common/prisma-runtime-client', () => {
  const exerciseLibrary = {
    create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(), updateMany: jest.fn(), count: jest.fn(),
  };
  const exerciseLibraryRevision = { findMany: jest.fn() };
  const professor = { findMany: jest.fn() };
  const workoutExercise = { count: jest.fn() };
  const aluno = { findFirst: jest.fn() };
  const alunoExerciseProgress = { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() };
  const $queryRaw = jest.fn();
  return {
    prismaRuntimeClient: {
      exerciseLibrary, exerciseLibraryRevision, workoutExercise, professor,
      aluno, alunoExerciseProgress, $queryRaw,
      $transaction: jest.fn(async (callback) => callback({ exerciseLibrary, exerciseLibraryRevision, workoutExercise, $queryRaw })),
    },
  };
});

const db = prismaRuntimeClient as unknown as {
  exerciseLibrary: Record<string, jest.Mock>;
  exerciseLibraryRevision: Record<string, jest.Mock>;
  professor: Record<string, jest.Mock>;
  workoutExercise: Record<string, jest.Mock>;
  aluno: Record<string, jest.Mock>;
  alunoExerciseProgress: Record<string, jest.Mock>;
  $queryRaw: jest.Mock;
};
const sample = {
  id: 'exercise-1', contractId: 'contract-1', name: 'Agachamento',
  version: 2, curationStatus: 'in_review', category: 'RESISTIDO',
  capacity: 'resisted', instructions: ['Ajustar postura'],
  videoUrl: null, mediaOrigin: null, mediaLicense: null,
};

describe('issue #394: persistence and tenant-aware curation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.professor.findMany.mockResolvedValue([]);
    db.workoutExercise.count.mockResolvedValue(0);
    db.$queryRaw.mockResolvedValue([{
      role: 'master', isActive: true, currentStatus: 'active', dismissalDate: null,
      collaboratorFunctionId: 'function-1', functionCode: 'administrador',
    }]);
  });

  it('creates API exercises as unpublished drafts with an explicit author', async () => {
    db.exerciseLibrary.create.mockResolvedValue({ id: 'exercise-1' });
    await libraryService.createExercise('contract-1', { name: 'Agachamento' }, 'actor-1');
    expect(db.exerciseLibrary.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractId: 'contract-1', curationStatus: 'draft', version: 1,
        legacyGrandfathered: false, createdByUserId: 'actor-1',
      }),
    });
  });

  it('defaults selection to approved within the contract', async () => {
    db.exerciseLibrary.findMany.mockResolvedValue([]);
    await libraryService.listExercises('contract-1', { search: 'Agachamento' });
    expect(db.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contractId: 'contract-1', curationStatus: 'approved' }),
    }));
  });

  it('searches aliases with tenant and approved-only filters', async () => {
    db.exerciseLibrary.findMany.mockResolvedValue([]);
    db.$queryRaw.mockResolvedValueOnce([{ id: 'alias-match' }])
      .mockResolvedValueOnce([{ id: 'secondary-match' }]);
    await libraryService.listExercises('contract-1', { search: 'RotAÇÃO' });
    const args = db.$queryRaw.mock.calls[0];
    expect(args[0].join('')).toContain('strpos(lower(a.value), lower(');
    expect(args).toContain('contract-1');
    expect(args).toContain('RotAÇÃO');
    expect(db.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contractId: 'contract-1', curationStatus: 'approved',
        OR: expect.arrayContaining([{ id: { in: ['alias-match', 'secondary-match'] } }]),
      }),
    }));
  });

  it('#394 R-001: searches secondary muscles with SQL tenant isolation and no ILIKE wildcard expansion', async () => {
    db.exerciseLibrary.findMany.mockResolvedValue([]);
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'secondary-only' }]);
    await libraryService.listExercises('contract-1', { search: 'bÍceps' });
    const args = db.$queryRaw.mock.calls[1];
    expect(args[0].join('')).toContain('e."secondaryMuscleGroups"');
    expect(args[0].join('')).toContain('strpos(lower(m.value), lower(');
    expect(args).toContain('contract-1');
    expect(args).toContain('bÍceps');
    expect(db.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contractId: 'contract-1', curationStatus: 'approved', legacyGrandfathered: false,
        OR: expect.arrayContaining([{ id: { in: ['secondary-only'] } }]),
      }),
    }));
  });

  it('#394 R-001: filters secondary muscles case-insensitively without leaking to other contracts', async () => {
    db.exerciseLibrary.findMany.mockResolvedValue([]);
    db.$queryRaw.mockResolvedValueOnce([{ id: 'secondary-only' }]);
    await libraryService.listExercises('contract-1', { muscleGroup: 'deltÓide' });
    const args = db.$queryRaw.mock.calls[0];
    expect(args[0].join('')).toContain('lower(btrim(m.value)) = lower(');
    expect(args).toContain('contract-1');
    expect(args).toContain(true);
    expect(db.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        contractId: 'contract-1', legacyGrandfathered: false,
        AND: [{ OR: expect.arrayContaining([{ id: { in: ['secondary-only'] } }]) }],
      }),
    }));
  });

  it('#394 A-007: the official picker never grants new-use rights to grandfathered approvals', async () => {
    db.exerciseLibrary.findMany.mockResolvedValue([]);
    await libraryService.listExercises('contract-1');
    expect(db.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { contractId: 'contract-1', curationStatus: 'approved', legacyGrandfathered: false },
    }));
    db.exerciseLibrary.findFirst.mockResolvedValue(null);
    await libraryService.getExerciseById('contract-1', 'legacy-1', true);
    expect(db.exerciseLibrary.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'legacy-1', contractId: 'contract-1', curationStatus: 'approved', legacyGrandfathered: false },
    }));
    await libraryService.getExerciseById('contract-1', 'legacy-1', false);
    expect(db.exerciseLibrary.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'legacy-1', contractId: 'contract-1' },
    }));
  });

  it('#394 A-394-020: selects only exercise metadata, never student loads or plans', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ ...sample, curationStatus: 'approved' });
    const result = await libraryService.getExerciseById('contract-1', 'exercise-1');
    expect(result).toMatchObject({ id: 'exercise-1', name: 'Agachamento' });
    const query = db.exerciseLibrary.findFirst.mock.calls[0][0];
    expect(query.where).toEqual({ id: 'exercise-1', contractId: 'contract-1' });
    expect(query.include).toBeUndefined();
    expect(query.select).toEqual(expect.objectContaining({
      id: true, name: true, instructions: true, mediaOrigin: true,
      mediaLicense: true, curationStatus: true, legacyGrandfathered: true,
    }));
    for (const forbidden of ['alunoProgress', 'workoutExercises', 'workoutDay',
      'template', 'plan', 'aluno', 'revisions', 'contract']) {
      expect(query.select).not.toHaveProperty(forbidden);
    }
  });

  it('allows an explicitly requested administrative list across curation statuses in one tenant', async () => {
    db.exerciseLibrary.findMany.mockResolvedValue([]);
    await libraryService.listExercises('contract-1', { scope: 'all', curationStatus: 'draft' as never });
    expect(db.exerciseLibrary.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ contractId: 'contract-1', curationStatus: 'draft' }),
    }));
  });

  it('rejects foreign records without attempting any transition', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue(null);
    await expect(
      libraryService.reviewExercise('contract-1', 'cross-tenant-id', 2, 'approve', 'actor-1'),
    ).rejects.toMatchObject({ kind: 'not_found' });
    expect(db.exerciseLibrary.updateMany).not.toHaveBeenCalled();
  });

  it('rejects stale versions atomically', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ ...sample, version: 3 });
    await expect(
      libraryService.reviewExercise('contract-1', sample.id, 2, 'approve', 'actor-1'),
    ).rejects.toMatchObject({ kind: 'conflict' });
    expect(db.exerciseLibrary.updateMany).not.toHaveBeenCalled();
  });

  it('approves only a reviewed exercise and records the reviewer', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue(sample);
    db.exerciseLibrary.updateMany.mockResolvedValue({ count: 1 });
    db.exerciseLibrary.findFirstOrThrow.mockResolvedValue({ ...sample, curationStatus: 'approved', version: 3 });
    await libraryService.reviewExercise('contract-1', sample.id, 2, 'approve', 'actor-1');
    expect(db.exerciseLibrary.updateMany).toHaveBeenCalledWith({
      where: { id: sample.id, contractId: 'contract-1', version: 2 },
      data: expect.objectContaining({
        curationStatus: 'approved', reviewedByUserId: 'actor-1',
        lastCurationAction: 'approve', legacyGrandfathered: false, systemDefault: false,
        version: { increment: 1 },
      }),
    });
  });

  it('rejects a concurrency race that loses the compare-and-swap update', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue(sample);
    db.exerciseLibrary.updateMany.mockResolvedValue({ count: 0 });
    await expect(libraryService.reviewExercise('contract-1', sample.id, 2, 'approve', 'actor-1'))
      .rejects.toMatchObject({ kind: 'conflict' });
  });

  it('never mutates an exercise linked to historical sessions', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ ...sample, curationStatus: 'approved' });
    db.workoutExercise.count.mockResolvedValue(1);
    await expect(libraryService.updateExercise(
      'contract-1', sample.id, { name: 'Novo nome' }, 2, 'actor-1',
    )).rejects.toMatchObject({ kind: 'conflict' });
    expect(db.exerciseLibrary.updateMany).not.toHaveBeenCalled();
  });

  it('rechecks workout linkage in the atomic edit predicate', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ ...sample, curationStatus: 'draft' });
    db.workoutExercise.count.mockResolvedValue(0);
    db.exerciseLibrary.updateMany.mockResolvedValue({ count: 0 });
    await expect(libraryService.updateExercise(
      'contract-1', sample.id, { name: 'Nome revisado' }, 2, 'actor-1',
    )).rejects.toMatchObject({ kind: 'conflict' });
    expect(db.exerciseLibrary.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: sample.id, contractId: 'contract-1', version: 2,
        workoutExercises: { none: {} },
      },
    }));
  });

  it('does not physically delete an exercise when deactivating it', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ ...sample, curationStatus: 'approved' });
    db.exerciseLibrary.updateMany.mockResolvedValue({ count: 1 });
    db.exerciseLibrary.findFirstOrThrow.mockResolvedValue({ ...sample, curationStatus: 'inactive' });
    await libraryService.deleteExercise('contract-1', sample.id, 2, 'actor-1');
    expect(db.exerciseLibrary.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ curationStatus: 'inactive' }),
    }));
  });

  it('rejects a role revocation after HTTP preflight and before the definitive transaction', async () => {
    db.$queryRaw.mockResolvedValueOnce([{
      role: 'professor', isActive: true, currentStatus: 'active', dismissalDate: null,
      collaboratorFunctionId: 'function-1', functionCode: 'professor',
    }]);
    await expect(libraryService.reviewExercise(
      'contract-1', sample.id, 2, 'approve', 'actor-1',
    )).rejects.toMatchObject({ kind: 'forbidden' });
    expect(db.exerciseLibrary.findFirst).not.toHaveBeenCalled();
    expect(db.exerciseLibrary.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    { isActive: false, currentStatus: 'active', dismissalDate: null },
    { isActive: true, currentStatus: 'inactive', dismissalDate: null },
    { isActive: true, currentStatus: 'active', dismissalDate: new Date('2025-01-01') },
  ])('rejects a deactivated manager within the write transaction: %o', async (revoked) => {
    db.$queryRaw.mockResolvedValueOnce([{
      role: 'master', collaboratorFunctionId: 'function-1', functionCode: 'admin', ...revoked,
    }]);
    await expect(libraryService.reviewExercise(
      'contract-1', sample.id, 2, 'deactivate', 'actor-1',
    )).rejects.toMatchObject({ kind: 'forbidden' });
    expect(db.exerciseLibrary.updateMany).not.toHaveBeenCalled();
  });

  it('rejects exercise creation when the administrator has moved to another tenant', async () => {
    db.$queryRaw.mockResolvedValueOnce([]);
    await expect(libraryService.createExercise(
      'contract-1', { name: 'Novo agachamento' }, 'actor-1',
    )).rejects.toMatchObject({ kind: 'forbidden' });
    expect(db.exerciseLibrary.create).not.toHaveBeenCalled();
  });

  it('maps a concurrent canonical-name conflict to an actionable 409 domain error', async () => {
    db.exerciseLibrary.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(libraryService.createExercise(
      'contract-1', { name: '  AGACHAMENTO  ' }, 'actor-1',
    )).rejects.toMatchObject({ kind: 'conflict', message: expect.stringContaining('Já existe') });
  });


  it('#570 resolves curator names only through professors of the same contract', async () => {
    db.exerciseLibrary.findMany.mockResolvedValue([{
      ...sample, createdByUserId: 'creator-1', reviewedByUserId: 'reviewer-1',
    }]);
    db.professor.findMany.mockResolvedValue([
      { userId: 'creator-1', user: { profile: { name: 'Ana Souza' } } },
      { userId: 'reviewer-1', user: { profile: { name: 'Carlos Pereira' } } },
    ]);
    const items = await libraryService.listExercises('contract-1', { scope: 'all' });
    expect(items[0]).toMatchObject({
      createdByName: 'Ana Souza', reviewedByName: 'Carlos Pereira',
    });
    expect(db.professor.findMany).toHaveBeenCalledWith({
      where: { contractId: 'contract-1', userId: { in: ['creator-1', 'reviewer-1'] } },
      select: { userId: true, user: { select: { profile: { select: { name: true } } } } },
    });
    db.professor.findMany.mockResolvedValue([]);
    const hidden = await libraryService.listExercises('contract-1', { scope: 'all' });
    expect(hidden[0]).toMatchObject({
      createdByName: 'Usuário não disponível', reviewedByName: 'Usuário não disponível',
    });
    expect(JSON.stringify(hidden[0].createdByName)).not.toContain('creator-1');
  });

  it('#570 redacts unverified system videos from operational readers while retaining admin source links', async () => {
    const item = {
      ...sample, curationStatus: 'approved', legacyGrandfathered: false,
      systemDefault: true, videoUrl: 'https://www.youtube.com/watch?v=source-video',
      mediaOrigin: null, mediaLicense: null, createdByUserId: null,
    };
    db.exerciseLibrary.findMany.mockResolvedValue([item]);
    const official = await libraryService.listExercises('contract-1');
    expect(official[0].videoUrl).toBeNull();
    const admin = await libraryService.listExercises('contract-1', { scope: 'all' });
    expect(admin[0]).toMatchObject({
      videoUrl: item.videoUrl, createdByName: 'Catálogo do sistema',
      reviewedByName: 'Aprovação do sistema',
    });
  });

  it('#570 maps editorial versions from immutable snapshots and names from tenant-bound user profiles', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ id: sample.id });
    db.exerciseLibraryRevision.findMany.mockResolvedValue([
      { id: 'e3', version: 3, action: 'submit', actorUserId: 'actor-1', snapshot: { name: 'Movimento novo' } },
      { id: 'e2', version: 2, action: 'edit', actorUserId: 'actor-1', snapshot: { name: 'Movimento novo' } },
      { id: 'e1', version: 1, action: 'create', actorUserId: 'actor-1', snapshot: { name: 'Movimento inicial' } },
    ]);
    db.professor.findMany.mockResolvedValue([
      { userId: 'actor-1', user: { profile: { name: 'Fernanda Lima' } } },
    ]);
    const revisions = await libraryService.listExerciseRevisions('contract-1', sample.id);
    expect(revisions.map((item) => item.contentVersion)).toEqual([2, 2, 1]);
    expect(revisions.every((item) => item.actorName === 'Fernanda Lima')).toBe(true);
    expect(db.professor.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { contractId: 'contract-1', userId: { in: ['actor-1'] } },
    }));
  });

  it('resolves revision history only after validating the exercise tenant', async () => {
    db.exerciseLibrary.findFirst.mockResolvedValue({ id: sample.id });
    db.exerciseLibraryRevision.findMany.mockResolvedValue([
      { version: 2, action: 'submit', actorUserId: null, snapshot: { name: 'Agachamento' } },
      { version: 1, action: 'create', actorUserId: null, snapshot: { name: 'Agachamento' } },
    ]);
    await libraryService.listExerciseRevisions('contract-1', sample.id);
    expect(db.exerciseLibraryRevision.findMany).toHaveBeenCalledWith({
      where: { contractId: 'contract-1', exerciseId: sample.id },
      orderBy: { version: 'desc' },
    });
  });
});

describe('#394 A-394-017: operational progress never publishes unverified media', () => {
  const historicalExercise = {
    id: 'legacy-394', name: 'Movimento histórico', contractId: 'tenant-394',
    videoUrl: 'https://third-party.invalid/legacy-video', mediaOrigin: null,
    mediaLicense: null, legacyGrandfathered: true, curationStatus: 'approved',
  };
  const licensedExercise = {
    ...historicalExercise, id: 'licensed-394', name: 'Movimento curado',
    videoUrl: 'https://own.invalid/licensed-video', mediaOrigin: 'Produção própria',
    mediaLicense: 'Licença verificada', legacyGrandfathered: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    db.aluno.findFirst.mockResolvedValue({ id: 'student-394' });
    db.exerciseLibrary.findFirst.mockResolvedValue({ id: 'legacy-394' });
  });

  it('strips unlicensed legacy video in a single progress response without mutating storage', async () => {
    const stored = {
      id: 'progress-394', alunoId: 'student-394', exerciseId: 'legacy-394',
      lastLoad: 30, exercise: historicalExercise,
    };
    db.alunoExerciseProgress.findUnique.mockResolvedValue(stored);
    const result = await libraryService.getAlunoProgress('tenant-394', 'student-394', 'legacy-394');
    expect(result).toMatchObject({ lastLoad: 30, exercise: { videoUrl: null, name: 'Movimento histórico' } });
    expect(stored.exercise.videoUrl).toBe('https://third-party.invalid/legacy-video');
    expect(db.exerciseLibrary.findFirst).toHaveBeenCalledWith({
      where: { id: 'legacy-394', contractId: 'tenant-394' },
    });
    expect(db.alunoExerciseProgress.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: { exercise: true },
    }));
  });

  it('filters unlicensed, licensed and legacy-licensed progress consistently and by tenant', async () => {
    db.alunoExerciseProgress.findMany.mockResolvedValue([
      { id: 'p-unsafe', exercise: { ...licensedExercise, mediaLicense: null } },
      { id: 'p-licensed', exercise: licensedExercise },
      { id: 'p-owned', exercise: { ...licensedExercise, id: 'owned-394',
        mediaOrigin: 'Própria', mediaLicense: null } },
      { id: 'p-legacy', exercise: { ...licensedExercise, legacyGrandfathered: true } },
    ]);
    const result = await libraryService.listAlunoProgress('tenant-394', 'student-394');
    expect(result.map(row => row.exercise.videoUrl)).toEqual([
      null, 'https://own.invalid/licensed-video',
      'https://own.invalid/licensed-video', null,
    ]);
    expect(db.alunoExerciseProgress.findMany).toHaveBeenCalledWith({
      where: { alunoId: 'student-394', exercise: { contractId: 'tenant-394' } },
      include: { exercise: true },
      orderBy: { lastUpdated: 'desc' },
    });
  });

  it('#579 A-002 preserves progress while hiding live owned media until approval', async () => {
    const exercise = {
      ...licensedExercise, mediaOrigin: 'Própria', mediaLicense: null, curationStatus: 'draft',
    };
    const progress = { alunoId: 'student-394', exerciseId: exercise.id, lastLoad: 30 };
    db.exerciseLibrary.findFirst.mockResolvedValue(exercise);
    db.alunoExerciseProgress.upsert.mockResolvedValue(progress);
    db.alunoExerciseProgress.findUnique.mockResolvedValue({ ...progress, exercise });
    db.alunoExerciseProgress.findMany.mockResolvedValue([{ ...progress, exercise }]);

    expect(await libraryService.updateAlunoProgress('tenant-394', progress.alunoId, exercise.id, { lastLoad: 30 }))
      .toEqual(progress);
    for (const status of ['draft', 'in_review', 'inactive', 'approved']) {
      exercise.curationStatus = status;
      const expectedVideo = status === 'approved' ? exercise.videoUrl : null;
      expect(await libraryService.getAlunoProgress('tenant-394', progress.alunoId, exercise.id))
        .toMatchObject({ lastLoad: 30, exercise: { videoUrl: expectedVideo } });
      expect(await libraryService.listAlunoProgress('tenant-394', progress.alunoId))
        .toMatchObject([{ lastLoad: 30, exercise: { videoUrl: expectedVideo } }]);
    }
    expect(exercise.videoUrl).toBe('https://own.invalid/licensed-video');
  });

  it('does not load progress for an absent or foreign student', async () => {
    db.aluno.findFirst.mockResolvedValue(null);
    expect(await libraryService.listAlunoProgress('tenant-394', 'foreign-student')).toEqual([]);
    expect(await libraryService.getAlunoProgress('tenant-394', 'foreign-student', 'legacy-394')).toBeNull();
    expect(db.alunoExerciseProgress.findMany).not.toHaveBeenCalled();
    expect(db.alunoExerciseProgress.findUnique).not.toHaveBeenCalled();
  });
});
