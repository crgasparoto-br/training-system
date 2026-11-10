import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { libraryService } from '../library/library.service.js';
import { assertApprovedWorkoutExerciseIds } from '../workout/workout-planning.helpers.js';
import {
  PRODUCT_ASSESSMENT_TYPES,
  PRODUCT_TRAINING_PARAMETERS,
} from '../../common/product-defaults.js';
import {
  installContractDefaults,
  loadProductExerciseDefaults,
} from './contract-defaults.service.js';

const describeDatabase =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

const prisma = new PrismaClient();
const concurrentPrisma = new PrismaClient();

describeDatabase('installContractDefaults database integration', () => {
  let targetContractId: string | null = null;
  let actorUserId: string | null = null;
  const originalDefaultContractId = process.env.DEFAULT_CONTRACT_ID;

  afterEach(async () => {
    if (targetContractId) {
      await prisma.companyContract.deleteMany({ where: { id: targetContractId } });
      targetContractId = null;
    }
    if (actorUserId) {
      await prisma.user.delete({ where: { id: actorUserId } });
      actorUserId = null;
    }
    if (originalDefaultContractId === undefined) delete process.env.DEFAULT_CONTRACT_ID;
    else process.env.DEFAULT_CONTRACT_ID = originalDefaultContractId;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await concurrentPrisma.$disconnect();
  });

  it('persiste os padrões criando somente o contrato alvo da fixture e ignora DEFAULT_CONTRACT_ID inválido', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const target = await prisma.companyContract.create({
      data: {
        type: 'academy',
        document: `defaults-target-${suffix}`,
        name: 'Defaults integration target',
      },
    });
    targetContractId = target.id;
    process.env.DEFAULT_CONTRACT_ID = `missing-source-${suffix}`;

    const result = await installContractDefaults(target.id, prisma);

    expect(result.trainingParameters.installed).toBe(PRODUCT_TRAINING_PARAMETERS.length);
    expect(result.assessmentTypes.installed).toBe(PRODUCT_ASSESSMENT_TYPES.length);
    expect(result.exercises.installed).toBe(loadProductExerciseDefaults().length);
    expect(await prisma.trainingParameter.count({ where: { contractId: target.id } })).toBe(
      PRODUCT_TRAINING_PARAMETERS.length
    );
    expect(await prisma.assessmentType.count({ where: { contractId: target.id } })).toBe(
      PRODUCT_ASSESSMENT_TYPES.length
    );
    expect(await prisma.exerciseLibrary.count({ where: { contractId: target.id } })).toBe(
      loadProductExerciseDefaults().length
    );
    expect(await prisma.exerciseLibrary.count({
      where: { contractId: target.id, curationStatus: 'draft', legacyGrandfathered: false },
    })).toBe(loadProductExerciseDefaults().length);
    expect(await libraryService.listExercises(target.id)).toEqual([]);
    const first = await prisma.exerciseLibrary.findFirstOrThrow({ where: { contractId: target.id } });
    const revision = await prisma.exerciseLibraryRevision.findFirstOrThrow({
      where: { exerciseId: first.id, version: 1, action: 'system_defaults_install' },
    });
    await expect(prisma.exerciseLibraryRevision.update({
      where: { id: revision.id }, data: { action: 'tampered' },
    })).rejects.toThrow();
    await expect(prisma.exerciseLibraryRevision.delete({ where: { id: revision.id } }))
      .rejects.toThrow();
    await prisma.exerciseLibrary.update({
      where: { id: first.id },
      data: { aliases: ['Alternativa exclusiva XyZzY'], curationStatus: 'approved',
        capacity: 'resisted', category: 'RESISTIDO', instructions: ['Posicionar o corpo'],
        videoUrl: null, reviewedByUserId: 'fixture-reviewer', reviewedAt: new Date(),
        lastCurationAction: 'approve' },
    });
    expect((await libraryService.listExercises(target.id, { search: 'xyZZy' }))
      .map((entry) => entry.id)).toContain(first.id);
    expect(await libraryService.listExercises('unknown-foreign-contract', { search: 'xyZZy' }))
      .toEqual([]);
  });

  it('#394 A-394-006: reuses a case/whitespace variant in PostgreSQL without a duplicate or media backfill', async () => {
    const canonical = loadProductExerciseDefaults().find((item) => item.name === 'Abdominal Canoa');
    expect(canonical?.videoUrl).toBeTruthy();
    const target = await prisma.companyContract.create({
      data: {
        type: 'academy', document: `issue394-canonical-${randomUUID()}`,
        name: 'Canonical defaults regression',
      },
    });
    targetContractId = target.id;
    const legacyName = '  ABDOMINAL   CANOA  ';
    const historical = await prisma.exerciseLibrary.create({
      data: {
        contractId: target.id, name: legacyName, category: null,
        loadType: null, videoUrl: null, curationStatus: 'approved', legacyGrandfathered: true,
      },
    });

    const first = await installContractDefaults(target.id, prisma);
    const second = await installContractDefaults(target.id, prisma);
    expect(first.exercises.installed).toBe(loadProductExerciseDefaults().length - 1);
    expect(second.exercises.installed).toBe(0);
    expect(second.exercises.skipped).toBe(loadProductExerciseDefaults().length);

    const matches = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ExerciseLibrary"
      WHERE "contractId" = ${target.id}
        AND issue394_exercise_canonical_name("name")
          = issue394_exercise_canonical_name(${canonical!.name})
    `;
    expect(matches).toEqual([{ id: historical.id }]);
    const after = await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: historical.id } });
    expect(after.name).toBe(legacyName);
    expect(after.loadType).toBe(canonical!.loadType);
    expect(after.videoUrl).toBeNull();
    expect(after.curationStatus).toBe('approved');
    expect(await prisma.exerciseLibraryRevision.findFirst({
      where: { exerciseId: historical.id, action: 'system_defaults_repair' },
    })).not.toBeNull();
  });

  it('#394 A-394-006: JSON import is canonical and idempotent, including dry runs', async () => {
    const target = await prisma.companyContract.create({
      data: {
        type: 'academy', document: `issue394-import-${randomUUID()}`,
        name: 'Canonical import regression',
      },
    });
    targetContractId = target.id;
    await prisma.exerciseLibrary.create({
      data: { contractId: target.id, name: '  REMADA   BAIXA  ' },
    });
    const directory = mkdtempSync(path.join(tmpdir(), 'issue394-import-'));
    const file = path.join(directory, 'exercise-input.json');
    writeFileSync(file, JSON.stringify([
      { name: 'remada baixa' },
      { name: 'Flexão lateral' },
      { name: '  FLEXÃO     LATERAL ' },
    ]), 'utf8');

    // Exercise the real CLI against the same PostgreSQL used by this suite.
    const executable = path.resolve(process.cwd(), 'node_modules/.bin/tsx');
    const run = (dryRun: boolean) => execFileSync(
      executable, [
        'src/scripts/import-exercises.ts',
        ...(dryRun ? ['--dry-run'] : []),
        file,
      ], {
        cwd: process.cwd(),
        env: { ...process.env, CONTRACT_ID: target.id },
        encoding: 'utf8',
      },
    );

    try {
      expect(run(true)).toContain('Importáveis: 1');
      expect(await prisma.exerciseLibrary.count({ where: { contractId: target.id } })).toBe(1);
      expect(run(false)).toContain('Importados: 1');
      expect(run(false)).toContain('Importados: 0');
      const rows = await prisma.exerciseLibrary.findMany({
        where: { contractId: target.id }, orderBy: { name: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows.find((entry) => entry.name === 'Flexão Lateral')).toMatchObject({
        curationStatus: 'draft', legacyGrandfathered: false,
      });
      expect(rows.some((entry) => entry.name === '  REMADA   BAIXA  ')).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('#394 A-394-01: defaults of Prisma and raw SQL inserts are drafts, never approved legacy', async () => {
    const target = await prisma.companyContract.create({
      data: { type: 'academy', document: `issue394-defaults-${randomUUID()}`, name: 'Curadoria default' },
    });
    targetContractId = target.id;
    const viaPrisma = await prisma.exerciseLibrary.create({
      data: { contractId: target.id, name: 'Flexão de braço sem revisão' },
    });
    const rawId = `issue394-raw-${randomUUID()}`;
    await prisma.$executeRaw`
      INSERT INTO "ExerciseLibrary" ("id", "contractId", "name", "createdAt", "updatedAt")
      VALUES (${rawId}, ${target.id}, 'Remada unilateral sem revisão', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `;
    const viaRaw = await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: rawId } });
    for (const exercise of [viaPrisma, viaRaw]) {
      expect(exercise.curationStatus).toBe('draft');
      expect(exercise.legacyGrandfathered).toBe(false);
      expect(exercise.reviewedByUserId).toBeNull();
    }
    expect(await libraryService.listExercises(target.id)).toEqual([]);
    expect(await prisma.exerciseLibraryRevision.count({
      where: { contractId: target.id, action: 'bootstrap' },
    })).toBe(2);
  });

  it('#394 A-394-03: disallows canonical duplicates across API/SQL and simultaneous inserts', async () => {
    const target = await prisma.companyContract.create({
      data: { type: 'academy', document: `issue394-dup-${randomUUID()}`, name: 'Curadoria nomes' },
    });
    targetContractId = target.id;
    const first = await prisma.exerciseLibrary.create({
      data: { contractId: target.id, name: 'Agachamento Livre', curationStatus: 'approved', legacyGrandfathered: true },
    });
    await expect(prisma.exerciseLibrary.create({
      data: { contractId: target.id, name: '  AGACHAMENTO   LIVRE  ' },
    })).rejects.toThrow();
    const other = await prisma.exerciseLibrary.create({
      data: { contractId: target.id, name: 'Supino Reto' },
    });
    await expect(prisma.exerciseLibrary.update({
      where: { id: other.id }, data: { name: ' agachamento \t livre ' },
    })).rejects.toThrow();
    expect((await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: other.id } })).name)
      .toBe('Supino Reto');
    expect((await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: first.id } })).curationStatus)
      .toBe('approved');

    const competing = await Promise.allSettled([
      prisma.exerciseLibrary.create({ data: { contractId: target.id, name: 'Remada Fechada' } }),
      concurrentPrisma.exerciseLibrary.create({ data: { contractId: target.id, name: '  REMADA   FECHADA ' } }),
    ]);
    expect(competing.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(competing.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);
    const normalized = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "ExerciseLibrary"
      WHERE "contractId" = ${target.id}
        AND issue394_exercise_canonical_name("name") = 'remada fechada'
    `;
    expect(normalized).toHaveLength(1);

    const anotherContract = await prisma.companyContract.create({
      data: { type: 'academy', document: `issue394-other-${randomUUID()}`, name: 'Contrato distinto' },
    });
    try {
      await expect(prisma.exerciseLibrary.create({
        data: { contractId: anotherContract.id, name: ' AGACHAMENTO  LIVRE ' },
      })).resolves.toMatchObject({ curationStatus: 'draft' });
    } finally {
      await prisma.companyContract.delete({ where: { id: anotherContract.id } });
    }
  });

  it('#394 A-394-02: validates master role and active user within the definitive transaction', async () => {
    const target = await prisma.companyContract.create({
      data: { type: 'academy', document: `issue394-actor-${randomUUID()}`, name: 'Curadoria administrativa' },
    });
    targetContractId = target.id;
    const functionOption = await prisma.collaboratorFunctionOption.create({
      data: { contractId: target.id, name: 'Administrativo', code: `admin-${randomUUID()}` },
    });
    const user = await prisma.user.create({
      data: { email: `issue394-${randomUUID()}@example.com`, type: 'professor', passwordHash: 'test-only' },
    });
    actorUserId = user.id;
    const professor = await prisma.professor.create({
      data: { contractId: target.id, userId: user.id, collaboratorFunctionId: functionOption.id, role: 'master' },
    });
    const approved = await prisma.exerciseLibrary.create({
      data: { contractId: target.id, name: 'Agachamento revisado', category: 'RESISTIDO',
        capacity: 'resisted', instructions: ['Posicionar os pés'] },
    });
    const inReview = await prisma.exerciseLibrary.update({
      where: { id: approved.id }, data: { curationStatus: 'in_review' },
    });
    await expect(libraryService.reviewExercise(
      target.id, approved.id, inReview.version, 'approve', user.id,
    )).resolves.toMatchObject({ curationStatus: 'approved', reviewedByUserId: user.id });

    const draft = await prisma.exerciseLibrary.create({
      data: { contractId: target.id, name: 'Remada aguardando revisão', category: 'RESISTIDO',
        capacity: 'resisted', instructions: ['Ajustar escápulas'] },
    });
    const pending = await prisma.exerciseLibrary.update({
      where: { id: draft.id }, data: { curationStatus: 'in_review' },
    });
    const originalRevisions = await prisma.exerciseLibraryRevision.count({ where: { exerciseId: draft.id } });
    await prisma.professor.update({ where: { id: professor.id }, data: { role: 'professor' } });
    await expect(libraryService.reviewExercise(
      target.id, draft.id, pending.version, 'approve', user.id,
    )).rejects.toMatchObject({ kind: 'forbidden' });
    expect(await prisma.exerciseLibraryRevision.count({ where: { exerciseId: draft.id } }))
      .toBe(originalRevisions);
    expect((await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: draft.id } })).curationStatus)
      .toBe('in_review');

    await prisma.professor.update({ where: { id: professor.id }, data: { role: 'master' } });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    await expect(libraryService.reviewExercise(
      target.id, draft.id, pending.version, 'approve', user.id,
    )).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(libraryService.createExercise(
      target.id, { name: 'Sem acesso' }, user.id,
    )).rejects.toMatchObject({ kind: 'forbidden' });
    expect(await prisma.exerciseLibraryRevision.count({ where: { exerciseId: draft.id } }))
      .toBe(originalRevisions);
  });

  it('#394 A-007/A-008: separates legacy history, canonical validation and operational eligibility in PostgreSQL', async () => {
    const target = await prisma.companyContract.create({
      data: { type: 'academy', document: `issue394-legacy-${randomUUID()}`,
        name: 'Curadoria legado operacional' },
    });
    targetContractId = target.id;
    const historical = await prisma.exerciseLibrary.create({
      data: { contractId: target.id, name: 'Vídeo legado sem licença',
        videoUrl: 'https://example.org/third-party',
        curationStatus: 'approved', legacyGrandfathered: true },
    });
    expect(await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: historical.id } }))
      .toMatchObject({ videoUrl: 'https://example.org/third-party', curationStatus: 'approved' });
    expect((await libraryService.getExerciseById(target.id, historical.id, false))?.id).toBe(historical.id);
    expect(await libraryService.getExerciseById(target.id, historical.id, true)).toBeNull();
    expect(await libraryService.listExercises(target.id)).toEqual([]);
    await expect(assertApprovedWorkoutExerciseIds(prisma as never, [historical.id], target.id))
      .rejects.toMatchObject({ code: 'INVALID_RESISTANCE_STRUCTURE' });

    const draft = await prisma.exerciseLibrary.create({
      data: { contractId: target.id, name: 'Nova versão regularizada',
        category: 'RESISTIDO', capacity: 'resistance', instructions: ['Preparar'],
      },
    });
    const approvalMetadata = { curationStatus: 'approved' as const,
      reviewedByUserId: 'fixture-reviewer', reviewedAt: new Date(),
      lastCurationAction: 'approve' };
    await expect(prisma.exerciseLibrary.update({ where: { id: draft.id },
      data: approvalMetadata })).rejects.toThrow();
    await prisma.exerciseLibrary.update({ where: { id: draft.id },
      data: { capacity: 'resisted' } });
    await expect(prisma.exerciseLibrary.update({ where: { id: draft.id },
      data: { ...approvalMetadata, videoUrl: 'https://example.org/no-license' } }))
      .rejects.toThrow();
    await expect(prisma.exerciseLibrary.update({ where: { id: draft.id },
      data: approvalMetadata })).resolves.toMatchObject({ curationStatus: 'approved',
        legacyGrandfathered: false });
    expect((await libraryService.listExercises(target.id)).map(({ id }) => id)).toEqual([draft.id]);
    expect((await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: historical.id } }))
      .videoUrl).toBe('https://example.org/third-party');
  });

  it('does not backfill media without provenance into a legacy approved record', async () => {
    const canonical = loadProductExerciseDefaults().find(
      (item) => item.name === 'Abdominal Bicicleta'
    );
    expect(canonical?.videoUrl).toBeTruthy();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const target = await prisma.companyContract.create({
      data: { type: 'academy', document: `defaults-media-${suffix}`, name: 'Defaults media boundary' },
    });
    targetContractId = target.id;
    const exercise = await prisma.exerciseLibrary.create({
      data: {
        contractId: target.id,
        name: canonical!.name,
        videoUrl: null,
        loadType: null,
        curationStatus: 'approved',
        legacyGrandfathered: true,
      },
    });

    await installContractDefaults(target.id, prisma);

    const after = await prisma.exerciseLibrary.findUniqueOrThrow({ where: { id: exercise.id } });
    expect(after.curationStatus).toBe('approved');
    expect(after.videoUrl).toBeNull();
    expect(after.mediaLicense).toBeNull();
    expect(after.mediaOrigin).toBeNull();
    expect(after.loadType).toBe(canonical!.loadType);
    const revision = await prisma.exerciseLibraryRevision.findFirstOrThrow({
      where: { exerciseId: exercise.id, action: 'system_defaults_repair' },
    });
    expect(revision.actorUserId).toBeNull();
  });
});
