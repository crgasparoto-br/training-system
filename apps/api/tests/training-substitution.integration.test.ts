import { randomUUID } from 'node:crypto';
import { PrismaClient, ContractType, ProfessorRole, UserType } from '@prisma/client';
import { createTrainingSubstitutionService, type SubstitutionActor } from '../src/modules/workout/training-substitution.service.js';
import { createWorkoutSessionExecutionService } from '../src/modules/workout/workout-session-execution.service.js';
import { createTrainingRoutineService } from '../src/modules/workout/training-routine.service.js';
import { syncAccessPermissionsForFunction } from '../src/modules/access-control/access-control.service.js';

const describeDatabase = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;
if (process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true') jest.setTimeout(30_000);
const client = new PrismaClient();
const concurrentClient = new PrismaClient();
const svc = createTrainingSubstitutionService(client);
const concurrentSvc = createTrainingSubstitutionService(concurrentClient);

async function fixture(label: string, options: { legacySnapshot?: boolean; professorRole?: ProfessorRole } = {}) {
  const contractId = 'issue404-' + randomUUID();
  await client.companyContract.create({ data: {
    id: contractId, type: ContractType.academy,
    document: randomUUID().replace(/-/g, '').slice(0, 14), name: 'Substituicao ' + label,
  } });
  const fn = await client.collaboratorFunctionOption.create({ data: {
    contractId, name: 'Professor', code: 'issue404-' + randomUUID(), isActive: true,
  } });
  const profUser = await client.user.create({ data: {
    email: 'issue404-prof-' + randomUUID() + '@example.com',
    passwordHash: 'test-hash', type: UserType.professor,
    profile: { create: { name: 'Professor ' + label } },
  } });
  const professor = await client.professor.create({ data: {
    userId: profUser.id, contractId, collaboratorFunctionId: fn.id,
    role: options.professorRole ?? ProfessorRole.master,
  } });
  const alunoUser = await client.user.create({ data: {
    email: 'issue404-student-' + randomUUID() + '@example.com',
    passwordHash: 'test-hash', type: UserType.aluno,
    profile: { create: { name: 'Aluno ' + label } },
  } });
  const aluno = await client.aluno.create({ data: {
    userId: alunoUser.id, professorId: professor.id,
    contractId, schedulePlan: 'free', age: 35, status: 'ACTIVE_STUDENT',
  } });
  const plan = await client.trainingPlan.create({ data: {
    professorId: professor.id, alunoId: aluno.id, name: 'Plano issue404',
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
  } });
  const assembly = await client.consolidatedPrescription.create({ data: {
    contractId, alunoId: aluno.id, currentVersion: 2, currentStatus: 'released',
    createdByProfessorId: professor.id, updatedByProfessorId: professor.id,
  } });
  const approved = await client.consolidatedPrescriptionVersion.create({ data: {
    assemblyId: assembly.id, contractId, alunoId: aluno.id, version: 1,
    status: 'approved', responsibleProfessorId: professor.id,
    professorJustification: 'Aprovado para teste', approvedByProfessorId: professor.id,
    approvedAt: new Date('2026-10-01T12:00:00.000Z'),
    createdByProfessorId: professor.id, conflicts: [],
  } });
  const released = await client.consolidatedPrescriptionVersion.create({ data: {
    assemblyId: assembly.id, contractId, alunoId: aluno.id, version: 2,
    previousVersionId: approved.id, status: 'released',
    responsibleProfessorId: professor.id, professorJustification: 'Aprovado para teste',
    approvedByProfessorId: professor.id, approvedAt: approved.approvedAt,
    createdByProfessorId: professor.id, conflicts: [],
  } });
  const template = await client.workoutTemplate.create({ data: {
    planId: plan.id, mesocycleNumber: 1, weekNumber: 1,
    weekStartDate: new Date('2026-10-05T00:00:00.000Z'),
    trainingMethod: 'combined', released: false,
  } });
  const day = await client.workoutDay.create({ data: {
    templateId: template.id, dayOfWeek: 2,
    workoutDate: new Date('2026-10-06T00:00:00.000Z'), method: 'continuous',
  } });
  const otherDay = await client.workoutDay.create({ data: {
    templateId: template.id, dayOfWeek: 3,
    workoutDate: new Date('2026-10-07T00:00:00.000Z'), method: 'continuous',
  } });
  const library = await Promise.all(['Origem', 'Alternativa', 'Outra alternativa'].map(async (name, index) =>
    client.exerciseLibrary.create({ data: {
      contractId, name: name + ' ' + label, category: 'RESISTIDO', capacity: 'resisted',
      instructions: ['Postura'], curationStatus: 'approved', legacyGrandfathered: false,
      movementPattern: index === 2 ? 'other' : 'squat',
      equipment: index === 2 ? ['barra'] : ['halteres'], difficulty: 'intermediate',
      reviewedByUserId: profUser.id, reviewedAt: new Date(), lastCurationAction: 'approve',
    } }),
  ));
  const original = await client.workoutExercise.create({ data: {
    workoutDayId: day.id, exerciseId: library[0].id, section: 'principal',
    exerciseOrder: 1, sets: 3, reps: 10,
  } });
  if (options.legacySnapshot) {
    await client.workoutReleasedExerciseSnapshot.create({
      data: {
        workoutExerciseId: original.id,
        catalog: { name: 'Nome congelado do catálogo legado' },
      },
    });
  }
  const releasedAt = new Date('2026-10-05T12:00:00.000Z');
  await client.$executeRaw`
    INSERT INTO "ConsolidatedPrescriptionOperationalRelease" (
      "id", "assemblyId", "sourceAssemblyVersionId", "sourceAssemblyVersion",
      "releasedAssemblyVersionId", "releasedAssemblyVersion", "contractId", "alunoId",
      "trainingPlanId", "workoutTemplateId", "requestFingerprint",
      "releasedByProfessorId", "releasedAt", "createdAt"
    ) VALUES (
      ${randomUUID()}, ${assembly.id}, ${approved.id}, 1,
      ${released.id}, 2, ${contractId}, ${aluno.id},
      ${plan.id}, ${template.id}, ${randomUUID()},
      ${professor.id}, ${releasedAt}, ${releasedAt}
    )
  `;
  await client.workoutTemplate.update({
    where: { id: template.id }, data: { released: true, releasedAt },
  });
  const teacher: Extract<SubstitutionActor, { kind: 'professor' }> = {
    kind: 'professor', userId: profUser.id, professorId: professor.id, contractId,
  };
  const student: Extract<SubstitutionActor, { kind: 'student' }> = {
    kind: 'student', userId: alunoUser.id, alunoId: aluno.id, contractId,
  };
  return { contractId, alunoId: aluno.id, dayId: day.id, otherDayId: otherDay.id,
    professorFunctionId: fn.id,
    originalId: original.id, library, teacher, student };
}
type Seed = Awaited<ReturnType<typeof fixture>>;
function request(f: Seed, suffix: string = randomUUID(), replacementId: string = f.library[1].id) {
  return {
    sessionId: f.dayId, actor: f.teacher, kind: 'exercise' as const,
    context: 'planning' as const, originalUnitId: f.originalId,
    replacementUnitId: replacementId, reason: 'Equipamento alternativo disponível',
    operationKey: 'issue404-' + suffix,
  };
}

describeDatabase('#404 substition history, eligibility, authority and concurrency', () => {
  afterAll(async () => { await client.$disconnect(); await concurrentClient.$disconnect(); });

  it('preapproves an alternative, returns identical retry and retains snapshot after deactivation', async () => {
    const f = await fixture('approved');
    const command = request(f);
    const approved = await svc.create(command);
    const replay = await svc.create(command);
    expect(replay.id).toBe(approved.id);
    expect(approved).toMatchObject({
      status: 'approved', context: 'planning', actorUserId: f.teacher.userId,
      originalVersion: 'exercicio:1', replacementVersion: 'exercicio:1',
    });
    await client.exerciseLibrary.update({
      where: { id: f.library[1].id }, data: { curationStatus: 'inactive' },
    });
    const history = await svc.list({ sessionId: f.dayId, actor: f.student });
    expect(history).toHaveLength(1);
    expect(history[0].replacement.name).toContain('Alternativa');
    await expect(svc.create(request(f, 'inactive-target', f.library[1].id)))
      .rejects.toMatchObject({ status: 409 });
    const actual = await client.workoutExercise.findUniqueOrThrow({ where: { id: f.originalId } });
    expect(actual.exerciseId).toBe(f.library[0].id);
  });

  it('separates training read from substitution write and revalidates revocation before review', async () => {
    const f = await fixture('read-only-permission', { professorRole: ProfessorRole.professor });
    await syncAccessPermissionsForFunction(f.professorFunctionId, 'professor', client);
    const permission = {
      collaboratorFunctionId: f.professorFunctionId,
      blockKey: 'students.actions.manageTrainingSubstitutions',
    };
    const initialGrant = await client.accessPermission.findFirstOrThrow({ where: permission });
    expect(initialGrant.canView).toBe(false); // No automatic elevation on permission catalog upgrades.

    // A concession to view the training tab is NOT a concession to approve.
    expect(await svc.list({ sessionId: f.dayId, actor: f.teacher })).toEqual([]);
    const page = await svc.alternatives({
      sessionId: f.dayId, actor: f.teacher, kind: 'exercise', originalUnitId: f.originalId,
    });
    expect(page.items.some(item => item.replacement.id === f.library[1].id)).toBe(true);
    const eventsBeforeDeniedCreate = await client.studentLifecycleEvent.count({
      where: { alunoId: f.alunoId, contractId: f.contractId },
    });
    await expect(svc.create(request(f, 'read-only'))).rejects
      .toMatchObject({ status: 403, code: 'SUBSTITUTION_FORBIDDEN' });
    expect(await client.workoutSubstitution.count({ where: { workoutDayId: f.dayId } })).toBe(0);
    expect(await client.studentLifecycleEvent.count({
      where: { alunoId: f.alunoId, contractId: f.contractId },
    })).toBe(eventsBeforeDeniedCreate);

    await client.accessPermission.updateMany({ where: permission, data: { canView: true } });
    const allowed = await svc.create(request(f, 'write-granted'));
    expect(allowed.status).toBe('approved');

    const execution = createWorkoutSessionExecutionService(client);
    await execution.transition({
      sessionId: f.dayId, alunoId: f.alunoId, contractId: f.contractId,
      actorUserId: f.student.userId,
      payload: { operationKey: 'issue404-start-' + randomUUID(), expectedVersion: 0, targetStatus: 'in_progress' },
    });
    const pending = await svc.create({
      ...request(f, 'student-pending', f.library[2].id),
      actor: f.student, context: 'execution', expectedExecutionVersion: 1,
    });
    expect(pending.status).toBe('pending_review');

    // Revoking the permission AFTER the request also forbids review.
    await client.accessPermission.updateMany({ where: permission, data: { canView: false } });
    const eventsBeforeDeniedReview = await client.studentLifecycleEvent.count({
      where: { alunoId: f.alunoId, contractId: f.contractId },
    });
    await expect(svc.review({
      sessionId: f.dayId, substitutionId: pending.id, actor: f.teacher,
      action: 'approve', expectedVersion: 1,
    })).rejects.toMatchObject({ status: 403, code: 'SUBSTITUTION_FORBIDDEN' });
    const unchanged = await client.workoutSubstitution.findUniqueOrThrow({ where: { id: pending.id } });
    expect(unchanged).toMatchObject({ status: 'pending_review', version: 1, reviewedByUserId: null });
    expect(await client.studentLifecycleEvent.count({
      where: { alunoId: f.alunoId, contractId: f.contractId },
    })).toBe(eventsBeforeDeniedReview);

    await client.accessPermission.updateMany({ where: permission, data: { canView: true } });
    const reviewed = await svc.review({
      sessionId: f.dayId, substitutionId: pending.id, actor: f.teacher,
      action: 'approve', expectedVersion: 1,
    });
    expect(reviewed).toMatchObject({ status: 'approved', version: 2 });
  });

  it('reviews a valid historical execution request after a later catalog deactivation', async () => {
    const f = await fixture('historical-review');
    const execution = createWorkoutSessionExecutionService(client);
    await execution.transition({
      sessionId: f.dayId, alunoId: f.alunoId, contractId: f.contractId,
      actorUserId: f.student.userId,
      payload: { operationKey: 'issue404-start-' + randomUUID(), expectedVersion: 0, targetStatus: 'in_progress' },
    });
    const pending = await svc.create({
      ...request(f, 'historical-request'), actor: f.student,
      context: 'execution', expectedExecutionVersion: 1,
    });
    await client.exerciseLibrary.update({
      where: { id: f.library[1].id }, data: { curationStatus: 'inactive' },
    });
    // The review judges what was recorded earlier; it does not create a new replacement.
    const accepted = await svc.review({
      sessionId: f.dayId, substitutionId: pending.id, actor: f.teacher,
      action: 'approve', expectedVersion: 1,
    });
    expect(accepted.status).toBe('approved');
    expect(accepted.replacement.name).toBe(pending.replacement.name);
    expect(accepted.replacementVersion).toBe(pending.replacementVersion);
    const currentOptions = await svc.alternatives({
      sessionId: f.dayId, actor: f.student, kind: 'exercise', originalUnitId: f.originalId,
    });
    expect(currentOptions.items.some(item => item.replacement.id === f.library[1].id)).toBe(false);
  });

  it('reports unknown release version instead of fabricating it from a newer catalog', async () => {
    const f = await fixture('historical', { legacySnapshot: true });
    const recorded = await svc.create(request(f, 'historical-release'));
    expect(recorded.originalVersion).toBe('historico:versao_indisponivel');
    expect(recorded.original.name).toBe('Nome congelado do catálogo legado');
    expect(recorded.original.movementPattern).toBeNull();
    expect(recorded.replacementVersion).toBe('exercicio:1');
  });

  it('accepts only matching tenant and approved catalog, rejects self and stale idempotency', async () => {
    const own = await fixture('own');
    const alien = await fixture('alien');
    const candidates = await svc.alternatives({
      sessionId: own.dayId, actor: own.student, kind: 'exercise', originalUnitId: own.originalId,
    });
    expect(candidates.items.some(option => option.replacement.id === alien.library[1].id)).toBe(false);
    expect(candidates.items.find(option => option.replacement.id === own.library[1].id)?.suitability.sameMovementPattern)
      .toBe(true);
    await expect(svc.create(request(own, 'cross-catalog', alien.library[1].id)))
      .rejects.toMatchObject({ status: 409 });
    await expect(svc.create(request(own, 'same-catalog', own.library[0].id)))
      .rejects.toMatchObject({ status: 400 });
    await expect(svc.list({ sessionId: alien.dayId, actor: own.student }))
      .rejects.toMatchObject({ status: 404 });
    await expect(svc.create({ ...request(own, 'cross-scope'), actor: alien.teacher }))
      .rejects.toMatchObject({ status: 404 });
    const first = await svc.create(request(own, 'reused-op'));
    expect(first.status).toBe('approved');
    await expect(svc.create({
      ...request(own, 'reused-op'), reason: 'Outro motivo',
    })).rejects.toMatchObject({ status: 409 });
  });

  it('allows substitution of a released session without replacing the origin', async () => {
    const f = await fixture('session');
    const candidate = await svc.create({
      sessionId: f.dayId, actor: f.teacher,
      kind: 'session', context: 'review',
      originalUnitId: f.dayId, replacementUnitId: f.otherDayId,
      reason: 'Sessão reagendada em outra data', operationKey: 'issue404-session-' + randomUUID(),
    });
    expect(candidate.original.version).toBe('liberacao:2');
    expect(candidate.replacement.version).toBe('liberacao:2');
    expect(candidate.original.unitId).toBe(f.dayId);
    expect(candidate.replacement.unitId).toBe(f.otherDayId);
    expect(await client.workoutDay.findUnique({ where: { id: f.dayId } })).not.toBeNull();
    const byDate = await svc.alternatives({
      sessionId: f.dayId, actor: f.teacher, kind: 'session', originalUnitId: f.dayId,
      search: '2026-10-07', offset: 0,
    });
    expect(byDate.items.map(item => item.replacement.unitId)).toEqual([f.otherDayId]);
    expect(byDate.nextOffset).toBeNull();
    const missing = await svc.alternatives({
      sessionId: f.dayId, actor: f.teacher, kind: 'session', originalUnitId: f.dayId,
      search: '2026-10-08',
    });
    expect(missing.items).toEqual([]);
  });

  it('records student execution substitution and professor review without changing the prescription', async () => {
    const f = await fixture('during');
    const execute = createWorkoutSessionExecutionService(client);
    await execute.transition({
      sessionId: f.dayId, alunoId: f.alunoId, contractId: f.contractId,
      actorUserId: f.student.userId,
      payload: { operationKey: 'issue404-start-' + randomUUID(), expectedVersion: 0, targetStatus: 'in_progress' },
    });
    const changed = await svc.create({
      ...request(f, 'executed'), actor: f.student, context: 'execution',
      expectedExecutionVersion: 1,
    });
    expect(changed.status).toBe('pending_review');
    expect(changed.reviewedAt).toBeNull();
    await expect(svc.review({
      sessionId: f.dayId, substitutionId: changed.id, actor: f.teacher,
      action: 'reject', expectedVersion: 1,
    })).rejects.toMatchObject({ status: 400 });
    const reviewed = await svc.review({
      sessionId: f.dayId, substitutionId: changed.id, actor: f.teacher,
      action: 'approve', expectedVersion: 1,
    });
    expect(reviewed).toMatchObject({ status: 'approved', context: 'execution', version: 2 });
    await expect(svc.review({
      sessionId: f.dayId, substitutionId: changed.id, actor: f.teacher,
      action: 'reject', expectedVersion: 1, reason: 'Incompatível',
    })).rejects.toMatchObject({ status: 409 });
    const routine = await createTrainingRoutineService(client).getRoutine({
      alunoId: f.alunoId, contractId: f.contractId,
      audience: 'student', date: '2026-10-06', now: new Date('2026-10-06T13:00:00.000Z'),
    });
    const detail = routine.today.sessions.find(day => day.sessionId === f.dayId);
    expect(detail?.substitutions?.[0].replacement.id).toBe(f.library[1].id);
    expect(detail?.comparison?.substitutions?.[0].context).toBe('execution');
    expect(detail?.comparison?.substitutions?.[0].status).toBe('approved');
    const planRecord = await client.workoutExercise.findUniqueOrThrow({ where: { id: f.originalId } });
    expect(planRecord.exerciseId).toBe(f.library[0].id);
  });

  it('paginates all eligible catalog alternatives and searches without crossing scope', async () => {
    const f = await fixture('paged');
    await client.exerciseLibrary.createMany({ data: Array.from({ length: 28 }, (_, index) => ({
      contractId: f.contractId, name: 'Pagina ' + String(index).padStart(3, '0'),
      category: 'RESISTIDO', capacity: 'resisted', instructions: ['Postura'],
      curationStatus: 'approved' as const, legacyGrandfathered: false,
      aliases: index === 19 ? ['sinonimo-exclusivo'] : [],
      reviewedByUserId: f.teacher.userId, reviewedAt: new Date(), lastCurationAction: 'approve',
    })) });
    const base = { sessionId: f.dayId, actor: f.student, kind: 'exercise' as const,
      originalUnitId: f.originalId };
    const first = await svc.alternatives(base);
    expect(first.items).toHaveLength(25);
    expect(first.nextOffset).toBe(25);
    const second = await svc.alternatives({ ...base, offset: first.nextOffset! });
    expect(second.items).toHaveLength(5);
    expect(second.nextOffset).toBeNull();
    const allIds = [...first.items, ...second.items].map(item => item.replacement.id);
    expect(new Set(allIds).size).toBe(30);
    expect(allIds).not.toContain(f.library[0].id);
    const byName = await svc.alternatives({ ...base, search: 'Pagina 019' });
    expect(byName.items).toHaveLength(1);
    const byAlias = await svc.alternatives({ ...base, search: 'sinonimo-exclusivo' });
    expect(byAlias.items).toHaveLength(1);
    expect(byAlias.items[0].replacement.name).toBe('Pagina 019');
    await expect(svc.alternatives({ ...base, offset: -1 })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects stale execution version and serializes concurrent swaps for the same planned unit', async () => {
    const f = await fixture('concurrent');
    const a = request(f, 'parallel-a', f.library[1].id);
    const b = request(f, 'parallel-b', f.library[2].id);
    const outcomes = await Promise.allSettled([svc.create(a), concurrentSvc.create(b)]);
    const succeeded = outcomes.filter(item => item.status === 'fulfilled');
    expect(succeeded).toHaveLength(1);
    const ledger = await svc.list({ sessionId: f.dayId, actor: f.teacher });
    expect(ledger).toHaveLength(1);
    const student = await fixture('version-conflict');
    await expect(svc.create({
      ...request(student, 'not-started'),
      actor: student.student, context: 'execution', expectedExecutionVersion: 0,
    })).rejects.toMatchObject({ status: 409 });
  });
});
