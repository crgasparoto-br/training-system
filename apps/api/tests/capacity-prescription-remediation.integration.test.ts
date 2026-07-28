import express from 'express';
import jwt from 'jsonwebtoken';
import {
  ContractType,
  PrismaClient,
  ProfessorRole,
  ProntuarioActivityType,
  StudentLifecycleStatus,
  UserType,
} from '@prisma/client';

const request = require('supertest');
const { capacityPrescriptionRoutes } = require('../src/modules/capacity-prescriptions/index');

const runDatabaseIntegrationTests =
  process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const describeDatabase = runDatabaseIntegrationTests ? describe : describe.skip;
const prisma = new PrismaClient();

const contractId = 'capacity-remediation-contract';
const alunoId = 'capacity-remediation-aluno';
const email = 'capacity-remediation@example.com';

function tokenFor(user: { id: string; email: string; type: UserType }) {
  return jwt.sign(
    { userId: user.id, email: user.email, type: user.type },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

describeDatabase('capacity prescription remediation with PostgreSQL', () => {
  const app = express();
  app.use(express.json());
  app.use('/capacity-prescriptions', capacityPrescriptionRoutes);

  let token = '';
  let professorId = '';
  let assessmentId = '';
  let adipometryId = '';
  let activityId = '';
  let parameterA = '';
  let parameterB = '';

  beforeEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email } });

    await prisma.companyContract.create({
      data: {
        id: contractId,
        type: ContractType.academy,
        document: '57365610000901',
        name: 'Contrato remediação 136',
      },
    });
    const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
      data: {
        contractId,
        name: 'Professor remediação',
        code: 'capacity-remediation-professor',
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
        {
          collaboratorFunctionId: collaboratorFunction.id,
          screenKey: 'students.details',
          blockKey: '',
          canView: true,
        },
        {
          collaboratorFunctionId: collaboratorFunction.id,
          screenKey: 'students.details',
          blockKey: 'students.details.assessments',
          canView: true,
        },
      ],
    });

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'test-hash',
        type: UserType.professor,
        profile: { create: { name: 'Professor Remediação' } },
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
        maxHeartRate: 190,
        restingHeartRate: 60,
      },
    });

    const prontuario = await prisma.prontuarioRecord.create({
      data: {
        alunoId,
        contractId,
        professorId,
        code: 'PRNT-REM-136',
      },
    });
    const activity = await prisma.prontuarioActivityHistory.create({
      data: {
        recordId: prontuario.id,
        activityType: ProntuarioActivityType.running,
        description: 'Corrida recreativa controlada',
        frequency: '3 vezes por semana',
        duration: '45 minutos',
        intensity: 'Moderada',
        startedAt: new Date('2026-07-10T10:00:00.000Z'),
      },
    });
    activityId = activity.id;

    const assessment = await prisma.studentAssessmentRecord.create({
      data: {
        alunoId,
        contractId,
        assessmentCategory: 'ventilometry',
        assessmentCode: 'VENT-001',
        title: 'Ventilometria 2026',
        sourceReference: 'VENT-CANONICA-001',
        performedByProfessorId: professorId,
        recordedByUserId: user.id,
        performedAt: new Date('2026-07-20T10:00:00.000Z'),
        status: 'completed',
        measurements: {
          create: [
            {
              metricKey: 'lan',
              metricLabel: 'LAn',
              valueType: 'number',
              valueNumber: 168,
              unit: 'bpm',
            },
          ],
        },
      },
    });
    assessmentId = assessment.id;

    const adipometry = await prisma.studentAssessmentRecord.create({
      data: {
        alunoId,
        contractId,
        assessmentCategory: 'adipometry',
        assessmentCode: 'ADPT-001',
        title: 'Adipometria 2026',
        performedByProfessorId: professorId,
        recordedByUserId: user.id,
        performedAt: new Date('2026-07-21T10:00:00.000Z'),
        status: 'completed',
        measurements: {
          create: [
            { metricKey: 'sexo', metricLabel: 'Sexo', valueType: 'text', valueText: 'masculino' },
            { metricKey: 'peso_kg', metricLabel: 'Peso', valueType: 'number', valueNumber: 80, unit: 'kg' },
            { metricKey: 'tricipital', metricLabel: 'Tricipital', valueType: 'number', valueNumber: 10, unit: 'mm' },
            { metricKey: 'subscapular', metricLabel: 'Subescapular', valueType: 'number', valueNumber: 15, unit: 'mm' },
            { metricKey: 'suprailiaca', metricLabel: 'Suprailíaca', valueType: 'number', valueNumber: 20, unit: 'mm' },
            { metricKey: 'abdominal', metricLabel: 'Abdominal', valueType: 'number', valueNumber: 25, unit: 'mm' },
            { metricKey: 'coxa', metricLabel: 'Coxa', valueType: 'number', valueNumber: 30, unit: 'mm' },
          ],
        },
      },
    });
    adipometryId = adipometry.id;

    const createdA = await prisma.capacityPrescriptionParameterSet.create({
      data: {
        contractId,
        capacity: 'cyclic',
        code: 'RUN_A',
        name: 'Corrida A',
        version: 1,
        methodologyVersion: 'run-a-v1',
        parameters: {
          type: 'cyclic',
          cyclic: {
            zoneBasis: 'heart_rate_reserve',
            zones: [{ name: 'Z2', minPercent: 60, maxPercent: 70 }],
          },
        },
        isCurrent: true,
        createdByProfessorId: professorId,
      },
    });
    const createdB = await prisma.capacityPrescriptionParameterSet.create({
      data: {
        contractId,
        capacity: 'cyclic',
        code: 'RUN_B',
        name: 'Corrida B',
        version: 1,
        methodologyVersion: 'run-b-v1',
        parameters: {
          type: 'cyclic',
          cyclic: {
            zoneBasis: 'max_hr',
            zones: [{ name: 'Z3', minPercent: 70, maxPercent: 80 }],
          },
        },
        isCurrent: true,
        createdByProfessorId: professorId,
      },
    });
    parameterA = createdA.id;
    parameterB = createdB.id;
  });

  afterEach(async () => {
    await prisma.companyContract.deleteMany({ where: { id: contractId } });
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejeita múltiplos conjuntos antes de criar versão sem snapshot', async () => {
    const response = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        capacity: 'cyclic',
        parameterSetIds: [parameterA, parameterB],
        methodologyVersion: 'forjada',
        sourceRefs: [
          {
            type: 'physical_assessment',
            id: assessmentId,
            label: 'Ventilometria 2026',
          },
        ],
        technicalJustification: 'Prescrição por zonas.',
        professorSummary: 'Controle por frequência cardíaca.',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      'Selecione no máximo um conjunto versionado por capacidade'
    );
    expect(
      await prisma.capacityPrescription.count({ where: { contractId, alunoId } })
    ).toBe(0);
  });

  it('deriva metodologia e reconstrói o snapshot canônico da avaliação no backend', async () => {
    const response = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        capacity: 'cyclic',
        parameterSetIds: [parameterA],
        methodologyVersion: 'forjada-pelo-cliente',
        sourceRefs: [
          {
            type: 'physical_assessment',
            id: assessmentId,
            label: 'Rótulo forjado',
            assessedAt: '2000-01-01T00:00:00.000Z',
            origin: 'origem-forjada',
            version: 'versao-forjada',
            responsibleProfessorId: 'professor-forjado',
          },
        ],
        technicalJustification: 'Prescrição por zonas.',
        professorSummary: 'Controle por frequência cardíaca.',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.latestVersion.methodologyVersion).toBe('run-a-v1');
    expect(response.body.data.latestVersion.parameters).toMatchObject({
      type: 'cyclic',
      cyclic: { zones: [{ name: 'Z2' }] },
    });
    expect(response.body.data.latestVersion.sourceRefs[0]).toMatchObject({
      type: 'ventilometry',
      id: assessmentId,
      label: 'Ventilometria 2026',
      assessedAt: '2026-07-20T10:00:00.000Z',
      origin: 'VENT-CANONICA-001',
      responsibleProfessorId: professorId,
    });
    expect(response.body.data.latestVersion.sourceRefs[0].version).not.toBe('versao-forjada');
  });

  it('reconstrói o histórico de atividade física a partir do PRNT', async () => {
    const response = await request(app)
      .post(`/capacity-prescriptions/alunos/${alunoId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        capacity: 'balance',
        parameterSetIds: [],
        sourceRefs: [
          {
            type: 'professor_note',
            id: activityId,
            label: 'Atividade forjada',
            assessedAt: '2000-01-01T00:00:00.000Z',
            origin: 'origem-forjada',
            version: 'versao-forjada',
            responsibleProfessorId: 'professor-forjado',
          },
        ],
        technicalJustification: 'Considerar histórico esportivo.',
        professorSummary: 'Progressão de equilíbrio validada pelo professor.',
        parameters: {
          type: 'balance',
          balance: {
            focus: 'estabilidade_geral',
            progressionNotes: 'Progredir somente após reavaliação.',
            expectedPse: 4,
          },
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.data.latestVersion.sourceRefs[0]).toMatchObject({
      type: 'professor_note',
      id: activityId,
      label: 'Histórico de atividade física: Corrida recreativa controlada',
      assessedAt: '2026-07-10T10:00:00.000Z',
      origin: 'PRNT - histórico de atividade física',
      responsibleProfessorId: professorId,
    });
    expect(response.body.data.latestVersion.sourceRefs[0].version).not.toBe('versao-forjada');
  });

  it('expõe dados-base e responsável técnico das avaliações no contrato', async () => {
    const response = await request(app)
      .get(`/capacity-prescriptions/alunos/${alunoId}/assessment-sources`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: expect.objectContaining({
            id: assessmentId,
            type: 'ventilometry',
            responsibleProfessorId: professorId,
          }),
          details: expect.arrayContaining([
            expect.objectContaining({ label: 'LAn', value: 168, unit: 'bpm' }),
          ]),
        }),
        expect.objectContaining({
          ref: expect.objectContaining({
            id: adipometryId,
            type: 'adipometry',
            responsibleProfessorId: professorId,
          }),
          details: expect.arrayContaining([
            expect.objectContaining({ label: '% Gordura', unit: '%' }),
            expect.objectContaining({
              label: 'Versão da fórmula',
              value: 'pollock-wilmore-1993-three-fold-siri-v1',
            }),
          ]),
        }),
      ])
    );
  });
});
