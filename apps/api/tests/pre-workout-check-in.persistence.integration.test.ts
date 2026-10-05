import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { createPreWorkoutCheckInService } from '../src/modules/workout/pre-workout-check-in.service.js';

const integration = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

integration('Issue #388 - PostgreSQL check-in persistence', () => {
  const schema = `checkin388_${randomUUID().replace(/-/g, '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let peer: PrismaClient;
  let service: ReturnType<typeof createPreWorkoutCheckInService>;
  let created = false;
  const observations: Array<Record<string, unknown>> = [];
  const record = (scenario: string, observed: unknown) => {
    const entry = { scenario, passed: true, observed };
    observations.push(entry);
    console.info('ISSUE_388_DB_EVIDENCE', JSON.stringify(entry));
  };
  const counts = async () => ({
    checkIns: await db.preWorkoutCheckIn.count(),
    operations: await db.preWorkoutCheckInOperation.count(),
    events: await db.studentLifecycleEvent.count(),
  });
  const input = (payload: Record<string, unknown> = {}, scope: Record<string, string> = {}) => ({
    sessionId: 'day-a', alunoId: 'aluno-a', contractId: 'contract-a', actorUserId: 'user-a',
    ...scope, payload: { operationKey: 'checkin-operation-a', psr: 6, painLevel: 5, ...payload },
  });
  const save = (payload: Record<string, unknown> = {}, scope: Record<string, string> = {}) => service.saveForStudent(input(payload, scope));

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || '');
    if (!['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(url.hostname) || !/test/i.test(url.pathname)) {
      throw new Error('Check-in integration requires an explicitly enabled local test database');
    }
    admin = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url.searchParams.set('schema', schema);
    db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    peer = new PrismaClient({ datasources: { db: { url: url.toString() } } });
    const [current] = await db.$queryRawUnsafe<Array<{ name: string }>>('SELECT current_schema() AS name');
    expect(current.name).toBe(schema);
    // Upstream rows are explicit release fixtures. The check-in tables below
    // come from the real migration; reads/writes execute the real Prisma service.
    for (const sql of [
      'CREATE TABLE "Contract" (id TEXT PRIMARY KEY)',
      'CREATE TABLE "Aluno" (id TEXT PRIMARY KEY, "contractId" TEXT NOT NULL)',
      'CREATE TABLE "TrainingPlan" (id TEXT PRIMARY KEY, "alunoId" TEXT NOT NULL)',
      'CREATE TABLE "WorkoutTemplate" (id TEXT PRIMARY KEY, "planId" TEXT NOT NULL, released BOOLEAN NOT NULL)',
      'CREATE TABLE "WorkoutDay" (id TEXT PRIMARY KEY, "templateId" TEXT NOT NULL, status TEXT NOT NULL)',
      'CREATE TABLE "ConsolidatedPrescriptionOperationalRelease" (id TEXT PRIMARY KEY, "workoutTemplateId" TEXT NOT NULL, "alunoId" TEXT NOT NULL, "contractId" TEXT NOT NULL)',
      `CREATE TYPE "${schema}"."StudentLifecycleEventType" AS ENUM ('STATUS_CHANGED')`,
      `CREATE TABLE "StudentLifecycleEvent" (id TEXT PRIMARY KEY, "alunoId" TEXT NOT NULL, "contractId" TEXT NOT NULL, "eventType" "${schema}"."StudentLifecycleEventType" NOT NULL, "actorUserId" TEXT, "actorProfessorId" TEXT, metadata JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    ]) await db.$executeRawUnsafe(sql);
    const migration = readFileSync(path.resolve(process.cwd(), 'prisma/migrations/20261002223000_issue_388_pre_workout_check_in/migration.sql'), 'utf8');
    for (const sql of migration.split(';').map((part) => part.trim()).filter(Boolean)) await db.$executeRawUnsafe(sql);
    service = createPreWorkoutCheckInService(db);
  }, 30_000);

  beforeEach(async () => {
    await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS reject_checkin_event ON "StudentLifecycleEvent"');
    await db.$executeRawUnsafe('TRUNCATE "PreWorkoutCheckInOperation", "PreWorkoutCheckIn", "StudentLifecycleEvent", "ConsolidatedPrescriptionOperationalRelease", "WorkoutDay", "WorkoutTemplate", "TrainingPlan", "Aluno", "Contract" CASCADE');
    for (const suffix of ['a', 'b']) {
      await db.$executeRaw`INSERT INTO "Contract" (id) VALUES (${`contract-${suffix}`})`;
      await db.$executeRaw`INSERT INTO "Aluno" (id, "contractId") VALUES (${`aluno-${suffix}`}, ${`contract-${suffix}`})`;
      await db.$executeRaw`INSERT INTO "TrainingPlan" (id, "alunoId") VALUES (${`plan-${suffix}`}, ${`aluno-${suffix}`})`;
      await db.$executeRaw`INSERT INTO "WorkoutTemplate" (id, "planId", released) VALUES (${`template-${suffix}`}, ${`plan-${suffix}`}, TRUE)`;
      await db.$executeRaw`INSERT INTO "WorkoutDay" (id, "templateId", status) VALUES (${`day-${suffix}`}, ${`template-${suffix}`}, 'planned')`;
      await db.$executeRaw`INSERT INTO "ConsolidatedPrescriptionOperationalRelease" (id, "workoutTemplateId", "alunoId", "contractId") VALUES (${`release-${suffix}`}, ${`template-${suffix}`}, ${`aluno-${suffix}`}, ${`contract-${suffix}`})`;
    }
  });

  afterAll(async () => {
    const output = { subjectSha: process.env.VERIFICATION_HEAD_SHA || process.env.GITHUB_SHA || 'local', fixtureScope: 'isolated PostgreSQL schema; production check-in migration and service; explicit upstream release fixtures', observations };
    const dir = path.resolve(process.cwd(), '../../artifacts/issue-388');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'database.json'), JSON.stringify(output, null, 2));
    console.info('ISSUE_388_DB_SUMMARY', JSON.stringify(output));
    await Promise.all([db?.$disconnect(), peer?.$disconnect()]);
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('persists full input and canonical guidance without changing the workout', async () => {
    const before = await db.$queryRaw`SELECT * FROM "WorkoutDay" ORDER BY id`;
    const result = await save({ sleepQuality: 8, fatigue: 3, motivation: 9, availableMinutes: 45, notes: '  Observe discomfort  ' });
    const row = await db.preWorkoutCheckIn.findUniqueOrThrow({ where: { id: result.id } });
    expect(row).toMatchObject({ workoutDayId: 'day-a', alunoId: 'aluno-a', contractId: 'contract-a', psr: 6, sleepQuality: 8, fatigue: 3, motivation: 9, painLevel: 5, availableMinutes: 45, notes: 'Observe discomfort' });
    expect(result.guidance).toMatchObject({ painTriage: 'alert', blocksWorkout: false, changesWorkoutAutomatically: false });
    expect(result).not.toHaveProperty('technical');
    expect(await db.$queryRaw`SELECT * FROM "WorkoutDay" ORDER BY id`).toEqual(before);
    const events = await db.studentLifecycleEvent.findMany();
    expect(events[0].metadata).toMatchObject({ checkInId: result.id, workoutDayId: 'day-a', ruleSetVersion: 'pre-workout-check-in-v1' });
    for (const field of ['psr', 'sleepQuality', 'fatigue', 'painLevel', 'motivation', 'notes']) expect(events[0].metadata).not.toHaveProperty(field);
    record('full-input-alert-reference-only-timeline-no-workout-mutation', { values: result.values, guidance: result.guidance, counts: await counts() });
  });

  it('partial updates and replay preserve the latest values and do not duplicate events', async () => {
    await save();
    await save({ operationKey: 'checkin-operation-b', fatigue: 2 });
    const result = await save();
    expect(result.values.fatigue).toBe(2);
    expect(await counts()).toEqual({ checkIns: 1, operations: 2, events: 2 });
    await expect(save({ psr: 9 })).rejects.toMatchObject({ code: 'PRE_WORKOUT_CHECK_IN_IDEMPOTENCY_CONFLICT' });
    expect(await counts()).toEqual({ checkIns: 1, operations: 2, events: 2 });
    record('partial-update-intervening-update-replay-and-conflicting-key', { values: result.values, counts: await counts() });
  });

  it('foreign student, foreign tenant, missing session and revoked release fail without effects', async () => {
    for (const scope of [{ sessionId: 'day-b' }, { alunoId: 'aluno-b' }, { contractId: 'contract-b' }, { sessionId: 'absent' }]) {
      await expect(save({}, scope)).rejects.toMatchObject({ code: 'PRE_WORKOUT_CHECK_IN_SESSION_NOT_FOUND' });
    }
    await db.$executeRaw`DELETE FROM "ConsolidatedPrescriptionOperationalRelease" WHERE id = 'release-a'`;
    await expect(save()).rejects.toMatchObject({ code: 'PRE_WORKOUT_CHECK_IN_SESSION_NOT_FOUND' });
    expect(await counts()).toEqual({ checkIns: 0, operations: 0, events: 0 });
    record('student-tenant-release-isolation-and-absence', await counts());
  });

  it.each(['in_progress', 'completed'])('freezes existing check-in and forbids late creation in %s', async (status) => {
    const saved = await save();
    await db.$executeRaw`UPDATE "WorkoutDay" SET status = ${status}`;
    await expect(save({ operationKey: 'late-update', psr: 9 })).rejects.toMatchObject({ code: 'PRE_WORKOUT_CHECK_IN_LOCKED' });
    await expect(save({}, { sessionId: 'day-b', alunoId: 'aluno-b', contractId: 'contract-b' })).rejects.toMatchObject({ code: 'PRE_WORKOUT_CHECK_IN_LOCKED' });
    const view = await service.getForSession({ sessionId: 'day-a', alunoId: 'aluno-a', contractId: 'contract-a', audience: 'professor' });
    expect(view?.editable).toBe(false);
    expect(view?.values).toEqual(saved.values);
    expect(view?.technical?.ruleSetVersion).toBe('pre-workout-check-in-v1');
    expect(await counts()).toEqual({ checkIns: 1, operations: 1, events: 1 });
    record(`immutable-${status}-and-no-backfill`, { values: view?.values, counts: await counts() });
  });

  it('rolls back check-in and operation when the database rejects timeline insertion', async () => {
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "${schema}".reject_checkin_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'issue388 rollback probe'; END $$`);
    await db.$executeRawUnsafe(`CREATE TRIGGER reject_checkin_event BEFORE INSERT ON "StudentLifecycleEvent" FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_checkin_event()`);
    await expect(save()).rejects.toThrow();
    expect(await counts()).toEqual({ checkIns: 0, operations: 0, events: 0 });
    await db.$executeRawUnsafe('DROP TRIGGER reject_checkin_event ON "StudentLifecycleEvent"');
    await save();
    expect(await counts()).toEqual({ checkIns: 1, operations: 1, events: 1 });
    record('database-rollback-and-retry-same-operation', await counts());
  });

  it('concurrent identical submissions and serialization retry keep one canonical record', async () => {
    const other = createPreWorkoutCheckInService(peer);
    const results = await Promise.allSettled([save(), other.saveForStudent(input())]);
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);
    for (const result of results) {
      if (result.status === 'rejected') {
        const error = result.reason as { code?: string; meta?: { code?: string } };
        expect(['P2034', 'P2002'].includes(error.code || '') || error.meta?.code === '40001').toBe(true);
        await save();
      }
    }
    expect(await counts()).toEqual({ checkIns: 1, operations: 1, events: 1 });
    record('concurrent-submissions-with-retry', { attempts: results.map((result) => result.status), counts: await counts() });
  });
});
