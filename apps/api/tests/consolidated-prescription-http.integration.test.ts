import express from 'express';
import jwt from 'jsonwebtoken';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  StudentLifecycleStatus,
  UserType,
} from '@prisma/client';

const request = require('supertest');
const { consolidatedPrescriptionRoutes } = require('../src/modules/consolidated-prescriptions/index');
const { agendaRoutes } = require('../src/modules/agenda/index');

const runDatabaseIntegrationTests = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractA = 'consolidated-http-contract-a';
const contractB = 'consolidated-http-contract-b';
const alunoA = 'consolidated-http-aluno-a';
const alunoOther = 'consolidated-http-aluno-other';
const emailPrefix = 'consolidated-http-test-';
const capacities = ['resisted', 'flexibility', 'cyclic', 'balance'] as const;

function tokenFor(user: { id: string; email: string; type: UserType }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function createContract(id: string, document: string) {
  return prisma.companyContract.create({
    data: { id, type: ContractType.academy, document, name: `Contrato ${id}` },
  });
}

async function createProfessor(input: {
  contractId: string;
  suffix: string;
  role?: ProfessorRole;
  view?: boolean;
  manage?: boolean;
  approve?: boolean;
  dataScope?: 'self' | 'managed' | 'contract';
  responsibleManagerId?: string | null;
}) {
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: input.contractId,
      name: `Função ${input.suffix}`,
      code: `consolidated-http-${input.suffix}`,
      isActive: true,
    },
  });
  await prisma.accessPermission.createMany({
    data: [
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: '',
        canView: true,
        dataScope: input.dataScope ?? 'contract',
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.consolidatedPrescriptions.view',
        canView: input.view ?? true,
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.consolidatedPrescriptions.manage',
        canView: input.manage ?? true,
      },
      {
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'plans',
        blockKey: 'plans.consolidatedPrescriptions.approve',
        canView: input.approve ?? false,
      },
    ],
  });
  const user = await prisma.user.create({
    data: {
      email: `${emailPrefix}${input.suffix}@example.com`,
      passwordHash: 'test-hash',
      type: UserType.professor,
      profile: { create: { name: `Professor ${input.suffix}` } },
    },
  });
  const professor = await prisma.professor.create({
    data: {
      userId: user.id,
      contractId: input.contractId,
      role: input.role ?? ProfessorRole.professor,
      collaboratorFunctionId: collaboratorFunction.id,
      responsibleManagerId: input.responsibleManagerId ?? null,
    },
  });
  return { user, professor, token: tokenFor(user) };
}

async function createAlunoGoal(input: {
  contractId: string;
  alunoId: string;
  professorId: string;
  suffix: string;
}) {
  const aluno = await prisma.aluno.create({
    data: {
      id: input.alunoId,
      contractId: input.contractId,
      professorId: input.professorId,
      status: StudentLifecycleStatus.ACTIVE_STUDENT,
    },
  });
  const record = await prisma.prontuarioRecord.create({
    data: {
      contractId: input.contractId,
      alunoId: aluno.id,
      professorId: input.professorId,
      code: `PRNT-CONSOLIDATED-${input.suffix}`,
      summary: 'Fonte estruturada para montagem consolidada',
    },
  });
  const goal = await prisma.prontuarioGoal.create({
    data: { recordId: record.id, title: `Objetivo ${input.suffix}`, priority: 1 },
  });
  return { aluno, goal };
}

async function createCapacityVersion(input: {
  contractId: string;
  alunoId: string;
  professorId: string;
  capacity: (typeof capacities)[number];
  version: number;
  goalId: string;
  rootId?: string;
  alertSeverity?: 'info' | 'warning' | 'critical';
}) {
  let rootId = input.rootId;
  if (!rootId) {
    const root = await prisma.capacityPrescription.create({
      data: {
        contractId: input.contractId,
        alunoId: input.alunoId,
        capacity: input.capacity,
        status: 'active',
        currentVersion: input.version,
        createdByProfessorId: input.professorId,
        updatedByProfessorId: input.professorId,
        publishesTodayWorkout: false,
      },
    });
    rootId = root.id;
  } else {
    await prisma.capacityPrescription.update({
      where: { id: rootId },
      data: {
        status: 'active',
        currentVersion: input.version,
        updatedByProfessorId: input.professorId,
      },
    });
  }

  const version = await prisma.capacityPrescriptionVersion.create({
    data: {
      prescriptionId: rootId,
      contractId: input.contractId,
      alunoId: input.alunoId,
      responsibleProfessorId: input.professorId,
      capacity: input.capacity,
      status: 'active',
      version: input.version,
      technicalJustification: `Justificativa estruturada ${input.capacity}.`,
      professorSummary: `Resumo ${input.capacity}.`,
      studentMessage: null,
      methodologyVersion: null,
      parameterSetIds: [],
      publishesTodayWorkout: false,
      sources: {
        create: {
          sourceType: 'prontuario_goal',
          sourceId: input.goalId,
          label: 'Objetivo canônico do PRNT',
          origin: 'PRNT',
          sourceVersion: '1',
          responsibleProfessorId: input.professorId,
        },
      },
      ...(input.alertSeverity
        ? {
            alerts: {
              create: {
                code: `alert-${input.capacity}-${input.version}`,
                message: 'Alerta estruturado persistido.',
                severity: input.alertSeverity,
                sourceRefId: input.goalId,
              },
            },
          }
        : {}),
    },
  });
  return { rootId, versionId: version.id };
}

async function createCapacitySet(input: {
  contractId: string;
  alunoId: string;
  professorId: string;
  goalId: string;
  critical?: boolean;
}) {
  const result: Record<string, { rootId: string; versionId: string }> = {};
  for (const capacity of capacities) {
    result[capacity] = await createCapacityVersion({
      ...input,
      capacity,
      version: 1,
      alertSeverity: input.critical && capacity === 'resisted' ? 'critical' : undefined,
    });
  }
  return result;
}

function compositionPayload(versions: Record<string, { versionId: string }>) {
  return {
    capacityBlocks: capacities.map((capacity) => ({
      capacityPrescriptionVersionId: versions[capacity].versionId,
    })),
    professorJustification:
      'Dor intensa no joelho, agachamento forte e alta intensidade aparecem somente em texto livre.',
    studentInstruction: 'Aguarde a validação profissional.',
  };
}

async function cleanupFixtures() {
  const contractIds = [contractA, contractB];

  await prisma.consolidatedPrescription.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.capacityPrescription.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.prontuarioRecord.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.aluno.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.professor.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.collaboratorFunctionOption.deleteMany({
    where: { contractId: { in: contractIds } },
  });
  await prisma.companyContract.deleteMany({ where: { id: { in: contractIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } });
}

describeDatabase('consolidated prescription workflow HTTP integration with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use('/consolidated-prescriptions', consolidatedPrescriptionRoutes);
  app.use('/agenda', agendaRoutes);

  let master: Awaited<ReturnType<typeof createProfessor>>;
  let tenantB: Awaited<ReturnType<typeof createProfessor>>;
  let deniedApprover: Awaited<ReturnType<typeof createProfessor>>;
  let selfProfessor: Awaited<ReturnType<typeof createProfessor>>;
  let goalA = '';

  beforeEach(async () => {
    await cleanupFixtures();
    await createContract(contractA, '57365610000701');
    await createContract(contractB, '57365610000702');

    master = await createProfessor({
      contractId: contractA,
      suffix: 'master',
      role: ProfessorRole.master,
      approve: true,
    });
    deniedApprover = await createProfessor({
      contractId: contractA,
      suffix: 'denied-approve',
      view: true,
      manage: true,
      approve: false,
      dataScope: 'contract',
    });
    selfProfessor = await createProfessor({
      contractId: contractA,
      suffix: 'self',
      view: true,
      manage: true,
      approve: false,
      dataScope: 'self',
    });
    tenantB = await createProfessor({
      contractId: contractB,
      suffix: 'tenant-b',
      role: ProfessorRole.master,
      approve: true,
    });

    goalA = (
      await createAlunoGoal({
        contractId: contractA,
        alunoId: alunoA,
        professorId: master.professor.id,
        suffix: 'A',
      })
    ).goal.id;
    await createAlunoGoal({
      contractId: contractA,
      alunoId: alunoOther,
      professorId: selfProfessor.professor.id,
      suffix: 'OTHER',
    });
  });

  afterEach(async () => {
    await cleanupFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('consulta prévia combinada apenas com escopo clínico autorizado, sem presumir ausência de riscos', async () => {
    const path = '/consolidated-prescriptions/alunos/' + alunoA + '/combined-conflicts';
    const dates = '?start=2026-11-01T00:00:00.000Z&end=2026-11-10T00:00:00.000Z';
    const authorized = await request(app).get(path + dates)
      .set('Authorization', 'Bearer ' + master.token);
    expect(authorized.status).toBe(200);
    expect(authorized.body.data).toMatchObject({
      state: 'no_active_rules', evaluations: [], changesWorkoutAutomatically: false,
      coverage: 'partial', releasedSessionCount: 0,
    });

    const clinicalDenied = await request(app).get(path + dates)
      .set('Authorization', 'Bearer ' + deniedApprover.token);
    expect(clinicalDenied.status).toBe(403);

    const crossTenant = await request(app).get(path + dates)
      .set('Authorization', 'Bearer ' + tenantB.token);
    expect(crossTenant.status).toBe(404);

    const outsideScope = await request(app).get(path + dates)
      .set('Authorization', 'Bearer ' + selfProfessor.token);
    expect(outsideScope.status).toBe(404);

    const invalidWindow = await request(app).get(path + '?start=invalid&end=2026-11-10T00:00:00.000Z')
      .set('Authorization', 'Bearer ' + master.token);
    expect(invalidWindow.status).toBe(400);
  });

  it('expõe estado combinado ainda não avaliado na revisão da montagem, sem liberar risco por ausência de regras', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
    });
    const created = await request(app)
      .post('/consolidated-prescriptions/alunos/' + alunoA)
      .set('Authorization', 'Bearer ' + master.token)
      .send(compositionPayload(versions));
    expect(created.status).toBe(201);
    const conflictPath = '/consolidated-prescriptions/alunos/' + alunoA + '/conflicts';
    const first = await request(app).get(conflictPath)
      .set('Authorization', 'Bearer ' + master.token);
    expect(first.status).toBe(200);
    expect(first.body.data.combinedReview).toMatchObject({
      source: 'persisted_assembly', assemblyVersion: 1,
      state: 'no_active_rules', coverage: 'partial', activeRuleCount: 0,
      mayConcludeNoConflict: false, changesWorkoutAutomatically: false,
    });
    expect(first.body.data.combinedReview.capacitySources).toHaveLength(4);
    expect(first.body.data.combinedReview.assemblyVersionId).toBe(created.body.data.latestVersion.id);
    expect(JSON.stringify(first.body.data.combinedReview)).not.toContain('painLevel');

    // A view-only assembly grant must not imply access to clinical signals.
    const withoutClinicalGrants = await request(app).get(conflictPath)
      .set('Authorization', 'Bearer ' + deniedApprover.token);
    expect(withoutClinicalGrants.status).toBe(200);
    expect(withoutClinicalGrants.body.data.combinedReview).toEqual(first.body.data.combinedReview);
    expect(JSON.stringify(withoutClinicalGrants.body.data)).not.toContain('"painLevel"');

    const sent = await request(app)
      .post('/consolidated-prescriptions/alunos/' + alunoA + '/send-for-review')
      .set('Authorization', 'Bearer ' + master.token)
      .send({ expectedCurrentVersion: 1 });
    expect(sent.status).toBe(200);
    expect(sent.body.data.currentStatus).toBe('ready_for_review');

    const reviewed = await request(app).get(conflictPath)
      .set('Authorization', 'Bearer ' + master.token);
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.data.combinedReview).toMatchObject({
      assemblyVersion: 2, state: 'no_active_rules', mayConcludeNoConflict: false,
    });
    expect(reviewed.body.data.combinedReview.assemblyVersionId).toBe(sent.body.data.latestVersion.id);

    const crossTenant = await request(app).get(conflictPath)
      .set('Authorization', 'Bearer ' + tenantB.token);
    expect(crossTenant.status).toBe(404);
    const outsideScope = await request(app).get(conflictPath)
      .set('Authorization', 'Bearer ' + selfProfessor.token);
    expect(outsideScope.status).toBe(404);
  });

  it('TEMP-FUTURE: vincula agendamentos futuros explicitamente à versão correta e nunca conclui ausência de risco', async () => {
    const set = await createCapacitySet({
      contractId: contractA, alunoId: alunoA, professorId: master.professor.id, goalId: goalA,
    });
    const created = await request(app)
      .post('/consolidated-prescriptions/alunos/' + alunoA)
      .set('Authorization', 'Bearer ' + master.token)
      .send(compositionPayload(set));
    expect(created.status).toBe(201);

    const clock = new Date();
    const date1 = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate() + 7));
    const date2 = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate() + 8));
    const first = await prisma.agendaBooking.create({ data: {
      contractId: contractA, alunoId: alunoA, professorId: master.professor.id,
      bookingDate: date1, bookingCivilDate: date1, startTime: '08:00', endTime: '09:00',
      status: 'scheduled', type: 'free',
    } });
    const second = await prisma.agendaBooking.create({ data: {
      contractId: contractA, alunoId: alunoA, professorId: master.professor.id,
      bookingDate: date2, bookingCivilDate: date2, startTime: '10:00', endTime: '11:00',
      status: 'scheduled', type: 'free',
    } });
    const root = '/consolidated-prescriptions/alunos/' + alunoA;
    const windowStart = new Date(clock.getTime() - 60_000).toISOString();
    const windowEnd = new Date(clock.getTime() + 28 * 86_400_000).toISOString();
    const candidates = await request(app)
      .get(root + '/combined-future-bookings')
      .query({ start: windowStart, end: windowEnd })
      .set('Authorization', 'Bearer ' + master.token);
    expect(candidates.status).toBe(200);
    expect(candidates.body.data.map((item: { bookingId: string }) => item.bookingId))
      .toEqual(expect.arrayContaining([first.id, second.id]));

    const command = {
      expectedCurrentVersion: 1, windowStart, windowEnd, timeZone: 'UTC',
      bindings: [{
        bookingId: first.id, capacityPrescriptionVersionId: set.resisted.versionId,
        expectedBookingUpdatedAt: first.updatedAt.toISOString(),
      }, {
        bookingId: second.id, capacityPrescriptionVersionId: set.cyclic.versionId,
        expectedBookingUpdatedAt: second.updatedAt.toISOString(),
      }],
    };
    const preview = await request(app)
      .post(root + '/combined-future-temporal-preview')
      .set('Authorization', 'Bearer ' + master.token).send(command);
    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({
      state: 'no_active_rules', coverage: 'partial', mayConcludeNoConflict: false,
      changesWorkoutAutomatically: false, timeZone: 'UTC',
      assemblyVersionId: created.body.data.latestVersion.id,
      temporalEvidenceStatus: 'verified_bindings_only',
    });
    expect(preview.body.data.mappedSessions).toHaveLength(2);
    expect(preview.body.data.mappedSessions.every((item: { proof: string }) => item.proof === 'verified')).toBe(true);
    expect(preview.body.data.gaps[0].hoursFromEndToStart).toBe(25);
    expect(preview.body.data.unlinkedCapacities).toEqual(expect.arrayContaining(['flexibility', 'balance']));

    // Both API boundaries must reject a short distant-future window and stale start.
    const invalidWindows = [
      { start: new Date(clock.getTime() + 400 * 86_400_000).toISOString(),
        end: new Date(clock.getTime() + 401 * 86_400_000).toISOString() },
      { start: new Date(clock.getTime() - 10 * 60_000).toISOString(), end: windowEnd },
      { start: windowStart, end: new Date(clock.getTime() + 32 * 86_400_000).toISOString() },
    ];
    for (const invalidWindow of invalidWindows) {
      const deniedList = await request(app)
        .get(root + '/combined-future-bookings').query(invalidWindow)
        .set('Authorization', 'Bearer ' + master.token);
      expect(deniedList.status).toBe(400);
      const deniedPreview = await request(app)
        .post(root + '/combined-future-temporal-preview')
        .set('Authorization', 'Bearer ' + master.token)
        .send({ ...command, windowStart: invalidWindow.start, windowEnd: invalidWindow.end });
      expect(deniedPreview.status).toBe(400);
    }
    const boundaryWindow = {
      start: new Date(clock.getTime() + 60_000).toISOString(),
      end: new Date(clock.getTime() + 31 * 86_400_000).toISOString(),
    };
    const boundaryList = await request(app)
      .get(root + '/combined-future-bookings').query(boundaryWindow)
      .set('Authorization', 'Bearer ' + master.token);
    expect(boundaryList.status).toBe(200);
    const boundaryPreview = await request(app)
      .post(root + '/combined-future-temporal-preview')
      .set('Authorization', 'Bearer ' + master.token)
      .send({ ...command, windowStart: boundaryWindow.start, windowEnd: boundaryWindow.end });
    expect(boundaryPreview.status).toBe(200);

    const otherTenant = await request(app)
      .post(root + '/combined-future-temporal-preview')
      .set('Authorization', 'Bearer ' + tenantB.token).send(command);
    expect(otherTenant.status).toBe(404);
    // A professor has the Agenda screen enabled by the default profile:
    // explicitly revoke it to prove the independent authorization boundary.
    await prisma.accessPermission.upsert({
      where: {
        collaboratorFunctionId_screenKey_blockKey: {
          collaboratorFunctionId: deniedApprover.professor.collaboratorFunctionId,
          screenKey: 'agenda', blockKey: '',
        },
      },
      create: {
        collaboratorFunctionId: deniedApprover.professor.collaboratorFunctionId,
        screenKey: 'agenda', blockKey: '', canView: false,
      },
      update: { canView: false },
    });
    const noAgenda = await request(app)
      .get(root + '/combined-future-bookings')
      .query({ start: windowStart, end: windowEnd })
      .set('Authorization', 'Bearer ' + deniedApprover.token);
    expect(noAgenda.status).toBe(403);

    const forged = await request(app)
      .post(root + '/combined-future-temporal-preview')
      .set('Authorization', 'Bearer ' + master.token)
      .send({ ...command, bindings: [{ ...command.bindings[0], capacityPrescriptionVersionId: 'other-tenant-capacity' }] });
    expect(forged.status).toBe(409);
    const outdated = await request(app)
      .post(root + '/combined-future-temporal-preview')
      .set('Authorization', 'Bearer ' + master.token)
      .send({ ...command, expectedCurrentVersion: 0 });
    expect(outdated.status).toBe(400);

    await prisma.agendaBooking.update({ where: { id: first.id }, data: { status: 'canceled' } });
    const canceled = await request(app)
      .post(root + '/combined-future-temporal-preview')
      .set('Authorization', 'Bearer ' + master.token).send(command);
    expect(canceled.status).toBe(409);
    expect(await prisma.workoutTemplate.count({
      where: { plan: { alunoId: alunoA } },
    })).toBe(0);
  });

  it('A-539-003/004 pagina 81 futuros após eliminar 81 agendamentos definitivamente passados', async () => {
    const now = new Date();
    const pastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const futureDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7));
    const makeBookings = (day: Date, prefix: string) => Array.from({ length: 81 }, (_, i) => ({
      id: `${prefix}-${i}`,
      contractId: contractA, alunoId: alunoA, professorId: master.professor.id,
      bookingDate: day, bookingCivilDate: day, startTime: '08:00', endTime: '09:00',
      status: 'scheduled' as const, type: 'free' as const,
    }));
    await prisma.agendaBooking.createMany({ data: [
      ...makeBookings(pastDay, 'a539-expired'), ...makeBookings(futureDay, 'a539-future'),
    ] });
    const root = '/consolidated-prescriptions/alunos/' + alunoA + '/combined-future-bookings';
    const query = {
      start: new Date(now.getTime() - 60_000).toISOString(),
      end: new Date(now.getTime() + 28 * 86_400_000).toISOString(),
    };
    const loadPage = (page: number) => request(app).get(root)
      .query({ ...query, page }).set('Authorization', 'Bearer ' + master.token);
    const first = await loadPage(1);
    const second = await loadPage(2);
    const third = await loadPage(3);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);
    expect(first.body.data).toHaveLength(80);
    expect(second.body.data).toHaveLength(1);
    expect(third.body.data).toHaveLength(0);
    const all = [...first.body.data, ...second.body.data] as Array<{ bookingId: string }>;
    expect(new Set(all.map((item) => item.bookingId)).size).toBe(81);
    expect(all.every((item) => item.bookingId.startsWith('a539-future'))).toBe(true);
    const invalidPage = await loadPage(101);
    expect(invalidPage.status).toBe(400);
    const crossTenant = await request(app).get(root).query(query)
      .set('Authorization', 'Bearer ' + tenantB.token);
    expect(crossTenant.status).toBe(404);
  });

  it('A-539-002 persists the source civil date through Agenda POST and future GET/preview in three host zones', async () => {
    const aluno = await prisma.aluno.create({ data: {
      contractId: contractA, professorId: master.professor.id,
      status: StudentLifecycleStatus.ACTIVE_STUDENT,
    } });
    const record = await prisma.prontuarioRecord.create({ data: {
      contractId: contractA, alunoId: aluno.id, professorId: master.professor.id,
      code: 'PRNT-TEMP-CIVIL', summary: 'Comprovação de data civil independente de timezone',
    } });
    const goal = await prisma.prontuarioGoal.create({ data: {
      recordId: record.id, title: 'Comprovar origem temporal', priority: 1,
    } });
    const set = await createCapacitySet({
      contractId: contractA, alunoId: aluno.id, professorId: master.professor.id, goalId: goal.id,
    });
    const created = await request(app)
      .post('/consolidated-prescriptions/alunos/' + aluno.id)
      .set('Authorization', 'Bearer ' + master.token)
      .send(compositionPayload(set));
    expect(created.status).toBe(201);

    const clock = new Date();
    const day = (offset: number) => new Date(Date.UTC(
      clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate() + offset,
    )).toISOString().slice(0, 10);
    const createdBookings: Array<{ bookingId: string; bookingDate: string; sourceUpdatedAt: string }> = [];
    const originalTz = process.env.TZ;
    try {
      for (const [index, tz] of ['UTC', 'America/Sao_Paulo', 'Pacific/Auckland'].entries()) {
        const civilDay = day(index + 7);
        const weekday = new Date(`${civilDay}T00:00:00.000Z`).getUTCDay() || 7;
        await prisma.professorAvailability.create({ data: {
          professorId: master.professor.id, dayOfWeek: weekday,
          startTime: '07:00', endTime: '12:00',
        } });
        process.env.TZ = tz;
        const booked = await request(app).post('/agenda/bookings')
          .set('Authorization', 'Bearer ' + master.token).send({
            alunoId: aluno.id, professorId: master.professor.id,
            bookingDate: civilDay, startTime: '08:00', endTime: '09:00', bookingType: 'free',
          });
        expect(booked.status).toBe(201);
        expect(booked.body.data.bookingCivilDate).toBe(`${civilDay}T00:00:00.000Z`);
        expect(booked.body.data.bookingDate).toBe(new Date(`${civilDay}T00:00:00`).toISOString());
        createdBookings.push({
          bookingId: booked.body.data.id, bookingDate: civilDay,
          sourceUpdatedAt: booked.body.data.updatedAt,
        });
      }
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }

    const root = '/consolidated-prescriptions/alunos/' + aluno.id;
    const windowStart = new Date(clock.getTime() - 60_000).toISOString();
    const windowEnd = new Date(clock.getTime() + 28 * 86_400_000).toISOString();
    const candidates = await request(app).get(root + '/combined-future-bookings')
      .query({ start: windowStart, end: windowEnd })
      .set('Authorization', 'Bearer ' + master.token);
    expect(candidates.status).toBe(200);
    for (const expected of createdBookings) {
      expect(candidates.body.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ bookingId: expected.bookingId, bookingDate: expected.bookingDate }),
      ]));
    }
    const bindings = createdBookings.map(({ bookingId, sourceUpdatedAt }) => ({
      bookingId, expectedBookingUpdatedAt: sourceUpdatedAt,
      capacityPrescriptionVersionId: set.cyclic.versionId,
    }));
    const command = {
      expectedCurrentVersion: 1, windowStart, windowEnd,
      timeZone: 'America/Sao_Paulo', bindings,
    };
    const preview = await request(app).post(root + '/combined-future-temporal-preview')
      .set('Authorization', 'Bearer ' + master.token).send(command);
    expect(preview.status).toBe(200);
    expect(preview.body.data.mappedSessions).toHaveLength(3);
    expect(preview.body.data.mappedSessions.every((item: { proof: string }) => item.proof === 'verified')).toBe(true);
    expect(preview.body.data).toMatchObject({
      temporalEvidenceStatus: 'verified_bindings_only',
      state: 'no_active_rules', coverage: 'partial', mayConcludeNoConflict: false,
    });

    // A pre-migration row cannot be assigned a civil date from server-local midnight alone.
    const legacy = await prisma.agendaBooking.create({ data: {
      contractId: contractA, alunoId: aluno.id, professorId: master.professor.id,
      bookingDate: new Date(`${day(10)}T03:00:00.000Z`),
      startTime: '08:00', endTime: '09:00', type: 'free', status: 'scheduled',
    } });
    const legacyCandidates = await request(app).get(root + '/combined-future-bookings')
      .query({ start: windowStart, end: windowEnd })
      .set('Authorization', 'Bearer ' + master.token);
    expect(legacyCandidates.status).toBe(200);
    expect(legacyCandidates.body.data).toContainEqual(expect.objectContaining({
      bookingId: legacy.id, bookingDate: null,
    }));
    const legacyPreview = await request(app).post(root + '/combined-future-temporal-preview')
      .set('Authorization', 'Bearer ' + master.token).send({
        ...command, bindings: [{
          bookingId: legacy.id, expectedBookingUpdatedAt: legacy.updatedAt.toISOString(),
          capacityPrescriptionVersionId: set.cyclic.versionId,
        }],
      });
    expect(legacyPreview.status).toBe(200);
    expect(legacyPreview.body.data.mappedSessions[0]).toMatchObject({
      proof: 'invalid_source_date', startAtUtc: null, endAtUtc: null,
    });
    expect(legacyPreview.body.data).toMatchObject({
      temporalEvidenceStatus: 'insufficient_data', coverage: 'partial', mayConcludeNoConflict: false,
    });
  });

  it('rejeita autoridade forjada, isolamento cross-tenant/dataScope e permissão específica de aprovação', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
    });

    const forged = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ ...compositionPayload(versions), status: 'approved', contractId: contractB });
    expect(forged.status).toBe(400);

    const created = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions));
    expect(created.status).toBe(201);

    const crossTenant = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${tenantB.token}`);
    const outsideSelfScope = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${selfProfessor.token}`);
    const deniedApproval = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/approve`)
      .set('Authorization', `Bearer ${deniedApprover.token}`)
      .send({ expectedCurrentVersion: 1 });

    expect(crossTenant.status).toBe(404);
    expect(outsideSelfScope.status).toBe(404);
    expect(deniedApproval.status).toBe(403);
  });

  it('não bloqueia por texto livre e conclui draft -> ready_for_review -> approved', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
    });
    const created = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions));

    expect(created.status).toBe(201);
    expect(created.body.data.latestVersion.conflicts).toEqual([]);

    const review = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/send-for-review`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1 });
    expect(review.status).toBe(200);
    expect(review.body.data.currentStatus).toBe('ready_for_review');

    const approved = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/approve`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 2 });
    expect(approved.status).toBe(200);
    expect(approved.body.data.currentStatus).toBe('approved');
    expect(approved.body.data.latestVersion.approvedByProfessorId).toBe(master.professor.id);

    const release = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/release`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 3 });
    expect(release.status).toBe(404);
  });

  it('cria nova revisão a partir de montagem liberada sem alterar a versão histórica liberada', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
    });
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions))
      .expect(201);
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/send-for-review`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1 })
      .expect(200);
    const approved = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/approve`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 2 });
    expect(approved.status).toBe(200);

    const assemblyId = approved.body.data.id as string;
    const releasedVersionId = approved.body.data.latestVersion.id as string;
    await prisma.$transaction([
      prisma.consolidatedPrescription.update({
        where: { id: assemblyId },
        data: { currentStatus: 'released' },
      }),
      prisma.consolidatedPrescriptionVersion.update({
        where: { id: releasedVersionId },
        data: { status: 'released' },
      }),
    ]);

    const revision = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/revisions`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 3, reason: 'Revisão após liberação operacional.' });

    expect(revision.status).toBe(201);
    expect(revision.body.data.currentStatus).toBe('draft');
    expect(revision.body.data.latestVersion).toEqual(
      expect.objectContaining({
        previousVersionId: releasedVersionId,
        status: 'draft',
        approvedByProfessorId: null,
        approvedAt: null,
      })
    );

    const releasedVersion = await prisma.consolidatedPrescriptionVersion.findUnique({
      where: { id: releasedVersionId },
      select: { status: true },
    });
    expect(releasedVersion?.status).toBe('released');

    const history = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/history`)
      .set('Authorization', `Bearer ${master.token}`);
    expect(history.status).toBe(200);
    expect(history.body.data.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'revision_created',
          previousStatus: 'released',
          newStatus: 'draft',
          reason: 'Revisão após liberação operacional.',
        }),
      ])
    );
  });

  it('bloqueia critical estruturado, permite remediação ainda bloqueada e exige desbloqueio explícito', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
      critical: true,
    });
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions))
      .expect(201);

    const blocked = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/send-for-review`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1 });
    expect(blocked.status).toBe(200);
    expect(blocked.body.data.currentStatus).toBe('blocked');
    expect(blocked.body.data.latestVersion.conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ severity: 'critical' })])
    );

    const unblockStillCritical = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/unblock`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 2, targetStatus: 'ready_for_review' });
    expect(unblockStillCritical.status).toBe(400);

    const replacement = await createCapacityVersion({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      capacity: 'resisted',
      version: 2,
      goalId: goalA,
      rootId: versions.resisted.rootId,
    });
    const remediatedVersions = {
      ...versions,
      resisted: { ...versions.resisted, versionId: replacement.versionId },
    };

    const remediation = await request(app)
      .patch(`/consolidated-prescriptions/alunos/${alunoA}/composition`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({
        ...compositionPayload(remediatedVersions),
        expectedCurrentVersion: 2,
      });
    expect(remediation.status).toBe(200);
    expect(remediation.body.data.currentStatus).toBe('blocked');
    expect(remediation.body.data.latestVersion.conflicts).toEqual([]);

    const unblocked = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/unblock`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 3, targetStatus: 'ready_for_review', reason: 'Restrição resolvida.' });
    expect(unblocked.status).toBe(200);
    expect(unblocked.body.data.currentStatus).toBe('ready_for_review');
    expect(unblocked.body.data.latestVersion.approvedByProfessorId).toBeNull();
    expect(unblocked.body.data.latestVersion.blockReason).toBeNull();

    const approved = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/approve`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 4 });
    expect(approved.body.data.currentStatus).toBe('approved');

    const revision = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/revisions`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 5, reason: 'Novo ciclo de planejamento.' });
    expect(revision.status).toBe(201);
    expect(revision.body.data.currentStatus).toBe('draft');
    expect(revision.body.data.latestVersion.blockReason).toBeNull();

    const history = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/history`)
      .set('Authorization', `Bearer ${master.token}`);
    expect(history.status).toBe(200);
    expect(history.body.data.auditEvents.map((event: { action: string }) => event.action)).toEqual(
      expect.arrayContaining([
        'created',
        'blocked_by_conflict',
        'composition_updated',
        'unblocked',
        'approved',
        'revision_created',
      ])
    );
    expect(history.body.data.auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'unblocked', reason: 'Restrição resolvida.' }),
        expect.objectContaining({ action: 'revision_created', reason: 'Novo ciclo de planejamento.' }),
      ])
    );
  });

  it('não herda motivo de bloqueio quando o desbloqueio não informa motivo', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
    });
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions))
      .expect(201);

    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/block`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1, reason: 'Bloqueio temporário.' })
      .expect(200);

    const unblocked = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/unblock`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 2, targetStatus: 'draft' });
    expect(unblocked.status).toBe(200);
    expect(unblocked.body.data.latestVersion.blockReason).toBeNull();

    const history = await request(app)
      .get(`/consolidated-prescriptions/alunos/${alunoA}/history`)
      .set('Authorization', `Bearer ${master.token}`);
    expect(history.status).toBe(200);
    const unblockedEvent = history.body.data.auditEvents.find(
      (event: { action: string }) => event.action === 'unblocked'
    );
    expect(unblockedEvent).toEqual(expect.objectContaining({ reason: null }));
  });

  it('retorna 409 para expectedCurrentVersion obsoleto sem criar versão parcial', async () => {
    const versions = await createCapacitySet({
      contractId: contractA,
      alunoId: alunoA,
      professorId: master.professor.id,
      goalId: goalA,
    });
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}`)
      .set('Authorization', `Bearer ${master.token}`)
      .send(compositionPayload(versions))
      .expect(201);
    await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/send-for-review`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1 })
      .expect(200);

    const stale = await request(app)
      .post(`/consolidated-prescriptions/alunos/${alunoA}/block`)
      .set('Authorization', `Bearer ${master.token}`)
      .send({ expectedCurrentVersion: 1, reason: 'Comando obsoleto.' });
    expect(stale.status).toBe(409);

    const current = await prisma.consolidatedPrescription.findFirst({
      where: { contractId: contractA, alunoId: alunoA },
    });
    expect(current?.currentVersion).toBe(2);
  });
});
