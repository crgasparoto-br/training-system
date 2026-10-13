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
const { capacityPrescriptionRoutes } = require('../src/modules/capacity-prescriptions/index');

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractId = 'capacity-canonical-source-contract';
const alunoId = 'capacity-canonical-source-aluno';
const email = 'capacity-canonical-source@example.com';

function tokenFor(user: { id: string; email: string; type: UserType }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

describeDatabase('capacity prescription canonical source metadata with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use('/capacity-prescriptions', capacityPrescriptionRoutes);

  let token = '';
  let professorId = '';
  let goalId = '';
  let painCaseId = '';
  let profileId = '';

  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email } });

    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: '57365610001001',
        name: 'Contrato canonicalização 136',
      },
    });
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId,
        name: 'Professor canonicalização',
        code: 'capacity-canonical-source-professor',
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
        },
        {
          collaboratorFunctionId: collaboratorFunction.id,
          screenKey: 'plans',
          blockKey: 'plans.capacityPrescriptions.view',
          canView: true,
        },
        {
          collaboratorFunctionId: collaboratorFunction.id,
          screenKey: 'plans',
          blockKey: 'plans.capacityPrescriptions.manage',
          canView: true,
        },
      ],
    });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Professor Canonicalização' } },
      },
    });
    const professor = await prisma.professor.create({
      data: {
        userId: user.id,
        contractId,
        role: ProfessorRole.master,
        collaboratorFunctionId: collaboratorFunction.id,
      },
    });
    professorId = professor.id;
    token = tokenFor(user);

    await prisma.aluno.create({
      data: {
        id: alunoId,
        contractId,
        professorId,
        status: StudentLifecycleStatus.ACTIVE_STUDENT,
      },
    });
    const prontuario = await prisma.prontuarioRecord.create({
      data: {
        alunoId,
        contractId,
        professorId,
        code: 'PRNT-CANON-136',
      },
    });

    const goal = await prisma.prontuarioGoal.create({
      data: {
        recordId: prontuario.id,
        title: 'Retomar corrida com progressão controlada',
        description: 'Objetivo canônico do prontuário.',
        createdAt: new Date('2026-07-01T10:00:00.000Z'),
        updatedAt: new Date('2026-07-02T10:00:00.000Z'),
      },
    });
    goalId = goal.id;
    await prisma.prontuarioHistoryEvent.create({
      data: {
        recordId: prontuario.id, contractId, alunoId,
        entityType: 'goal', entityId: goalId, version: 1, action: 'baseline',
        source: 'legacy-baseline', snapshot: {
          title: goal.title, description: goal.description, status: goal.status,
          priority: goal.priority, targetDate: goal.targetDate, closedAt: null,
        },
      },
    });
    await prisma.prontuarioGoalCapacityClassification.create({
      data: {
        goalId,
        contractId,
        alunoId,
        capacities: ['resisted'],
        relatesToAssessment: false,
        relatesToActionPlan: false,
        updatedByProfessorId: professorId,
      },
    });

    const painCase = await prisma.prontuarioPainCase.create({
      data: {
        recordId: prontuario.id,
        title: 'Desconforto anterior no joelho direito',
        region: 'Joelho direito',
        onsetDate: new Date('2026-07-12T10:00:00.000Z'),
        createdAt: new Date('2026-07-12T10:00:00.000Z'),
        updatedAt: new Date('2026-07-25T10:00:00.000Z'),
      },
    });
    painCaseId = painCase.id;
    await prisma.prontuarioHistoryEvent.create({
      data: {
        recordId: prontuario.id, contractId, alunoId,
        entityType: 'painCase', entityId: painCaseId, version: 1, action: 'baseline',
        source: 'legacy-baseline', snapshot: {
          title: painCase.title, region: painCase.region, status: painCase.status,
          onsetDate: painCase.onsetDate, description: painCase.description, closedAt: null,
        },
      },
    });

    const profile = await prisma.studentProfile.create({
      data: {
        alunoId,
        contractId,
        sourceType: 'student',
        sourceReference: 'PROFILE-CANONICO-001',
        recordedByUserId: user.id,
        preferenceData: {
          preferredActivities: ['Corrida ao ar livre'],
          restrictions: ['Evitar progressões abruptas'],
        },
        createdAt: new Date('2026-07-20T10:00:00.000Z'),
        updatedAt: new Date('2026-07-26T10:00:00.000Z'),
      },
    });
    profileId = profile.id;
  });

  afterEach(async () => {
    // Test-only cleanup for append-only fixture rows. SET LOCAL ensures trigger
    // bypass applies only to this transaction, never to the application.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
      await tx.prontuarioHistoryEvent.deleteMany({ where: { contractId } });
    });
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('ignora metadados forjados de objetivo, alerta do PRNT e preferência', async () => {
    const forged = {
      label: 'Sem restrições clínicas',
      assessedAt: '2000-01-01T00:00:00.000Z',
      origin: 'origem-forjada',
      version: 'versao-forjada',
      responsibleProfessorId: 'professor-forjado',
    };

    const response = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        capacity: 'resisted',
        parameterSetIds: [],
        sourceRefs: [
          { type: 'prontuario_goal', id: goalId, ...forged },
          { type: 'prontuario_alert', id: painCaseId, ...forged },
          { type: 'student_preference', id: profileId, ...forged },
        ],
        linkedProntuarioGoalIds: [goalId],
        technicalJustification: 'Usar objetivo, condição e preferência como contexto técnico.',
        professorSummary: 'Metadados das fontes reconstruídos pelo backend.',
        parameters: {
          type: 'resisted',
          resisted: { sets: 3, repetitions: '8-12', expectedPse: 6 },
        },
      });

    expect(response.status).toBe(201);
    const refs = Object.fromEntries(
      response.body.data.latestVersion.sourceRefs.map((ref: { type: string }) => [ref.type, ref])
    );

    expect(refs.prontuario_goal).toMatchObject({
      id: goalId,
      label: 'Retomar corrida com progressão controlada',
      assessedAt: '2026-07-01T10:00:00.000Z',
      origin: 'PRNT PRNT-CANON-136 - objetivos',
      responsibleProfessorId: professorId,
    });
    expect(refs.prontuario_goal.version).toBe(1);

    expect(refs.prontuario_alert).toMatchObject({
      id: painCaseId,
      label: 'Dor ou condição em acompanhamento: Desconforto anterior no joelho direito',
      assessedAt: '2026-07-12T10:00:00.000Z',
      origin: 'PRNT - casos de dor',
      responsibleProfessorId: professorId,
    });
    expect(refs.prontuario_alert.version).toBe(1);

    expect(refs.student_preference).toMatchObject({
      id: profileId,
      label: 'Preferências e restrições cadastradas pelo aluno',
      assessedAt: '2026-07-26T10:00:00.000Z',
      origin: 'PROFILE-CANONICO-001',
      responsibleProfessorId: professorId,
    });
    expect(refs.student_preference.version).not.toBe('versao-forjada');

    expect(response.body.data.latestVersion.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PRNT_CONDITION',
          message:
            'Condição do prontuário a considerar: Dor ou condição em acompanhamento: Desconforto anterior no joelho direito',
          sourceRefId: painCaseId,
        }),
        expect.objectContaining({
          code: 'STUDENT_PREFERENCE',
          message:
            'Preferência ou restrição declarada pelo aluno: Preferências e restrições cadastradas pelo aluno',
          sourceRefId: profileId,
        }),
      ])
    );

    const persisted = await prisma.capacityPrescriptionSource.findMany({
      where: { versionId: response.body.data.latestVersion.id },
    });
    expect(persisted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: 'prontuario_goal',
          sourceId: goalId,
          label: 'Retomar corrida com progressão controlada',
          origin: 'PRNT PRNT-CANON-136 - objetivos',
          responsibleProfessorId: professorId,
        }),
        expect.objectContaining({
          sourceType: 'prontuario_alert',
          sourceId: painCaseId,
          label: 'Dor ou condição em acompanhamento: Desconforto anterior no joelho direito',
          origin: 'PRNT - casos de dor',
          responsibleProfessorId: professorId,
        }),
        expect.objectContaining({
          sourceType: 'student_preference',
          sourceId: profileId,
          label: 'Preferências e restrições cadastradas pelo aluno',
          origin: 'PROFILE-CANONICO-001',
          responsibleProfessorId: professorId,
        }),
      ])
    );
    expect(persisted.every((item) => item.sourceVersion !== 'versao-forjada')).toBe(true);
    expect(persisted.filter((item) => ['prontuario_goal', 'prontuario_alert'].includes(item.sourceType))
      .every((item) => item.sourceVersion === '1')).toBe(true);
  });

  it('keeps the exact PRNT event and original label after a later clinical edit', async () => {
    const first = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        capacity: 'resisted', sourceRefs: [{ type: 'prontuario_goal', id: goalId, label: 'client', version: 'legacy-timestamp' }],
        linkedProntuarioGoalIds: [goalId],
        technicalJustification: 'Objetivo original', professorSummary: 'Versão inicial',
      });
    expect(first.status).toBe(201);
    const ref = first.body.data.latestVersion.sourceRefs[0];
    expect(ref.version).toBe(1);

    const goal = await prisma.prontuarioGoal.findUniqueOrThrow({ where: { id: goalId } });
    await prisma.prontuarioGoal.update({ where: { id: goalId }, data: { title: 'Novo objetivo clínico' } });
    await prisma.prontuarioHistoryEvent.create({
      data: {
        recordId: goal.recordId, contractId, alunoId,
        entityType: 'goal', entityId: goalId, version: 2, action: 'updated',
        source: 'prnt-api', snapshot: {
          title: 'Novo objetivo clínico', status: goal.status, priority: goal.priority,
          description: goal.description, targetDate: goal.targetDate, closedAt: null,
        },
      },
    });

    const second = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        capacity: 'resisted', expectedCurrentVersion: 1,
        sourceRefs: [ref], linkedProntuarioGoalIds: [goalId],
        technicalJustification: 'Manter origem clinica historica', professorSummary: 'Versão seguinte',
      });
    expect(second.status).toBe(201);
    expect(second.body.data.latestVersion.sourceRefs[0]).toMatchObject({
      id: goalId, version: 1, label: 'Retomar corrida com progressão controlada',
    });
    const stored = await prisma.capacityPrescriptionSource.findFirstOrThrow({
      where: { versionId: second.body.data.latestVersion.id, sourceId: goalId },
    });
    expect(stored.sourceVersion).toBe('1');
    expect(stored.label).toBe('Retomar corrida com progressão controlada');
  });

  it('rejects a client supplied revision that does not exist in this tenant', async () => {
    const response = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        capacity: 'resisted',
        sourceRefs: [{ type: 'prontuario_goal', id: goalId, label: 'Falsa versão', version: 999 }],
        linkedProntuarioGoalIds: [goalId],
        technicalJustification: 'Teste de isolamento', professorSummary: 'Não deve gravar',
      });
    expect(response.status).toBe(400);
    expect(await prisma.capacityPrescription.count({ where: { contractId, alunoId } })).toBe(0);
  });
});
