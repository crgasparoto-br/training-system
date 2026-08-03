import express from 'express';
import jwt from 'jsonwebtoken';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  adipometryGovernanceService,
  buildAdipometrySpecificationHash,
} from './adipometry-governance.service.js';
import { adipometryAnthropometrySupportService, adipometryRoutes } from './index.js';
import { adipometryService } from './adipometry.service.js';

const request = require('supertest');
const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use('/adipometry', adipometryRoutes);

const SCREEN_KEY = 'physicalAssessment.protocol';
const VIEW_KEY = 'physicalAssessment.adpt.view';
const MANAGE_KEY = 'physicalAssessment.adpt.actions.manage';
const CORRECT_KEY = 'physicalAssessment.adpt.actions.correctCompleted';
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Fixture = {
  contractId: string;
  otherContractId: string;
  functionId: string;
  operatorFunctionId: string;
  otherFunctionId: string;
  userId: string;
  operatorUserId: string;
  otherUserId: string;
  professorId: string;
  operatorProfessorId: string;
  otherProfessorId: string;
  alunoId: string;
  otherAlunoId: string;
  protocolCode: string;
  protocolVersion: number;
};

const fixtures: Fixture[] = [];

function tokenFor(userId: string, type: 'professor' | 'aluno' = 'professor') {
  return jwt.sign(
    {
      userId,
      email: `adpt-remediation-${userId}@example.invalid`,
      type,
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function setPermission(functionId: string, blockKey: string, canView: boolean) {
  await prisma.accessPermission.createMany({
    data: [{
      collaboratorFunctionId: functionId,
      screenKey: SCREEN_KEY,
      blockKey,
      canView,
    }],
    skipDuplicates: true,
  });
  await prisma.accessPermission.updateMany({
    where: {
      collaboratorFunctionId: functionId,
      screenKey: SCREEN_KEY,
      blockKey,
    },
    data: { canView },
  });
}

async function createFixture(): Promise<Fixture> {
  const token = suffix();
  const [contract, otherContract] = await Promise.all([
    prisma.companyContract.create({
      data: { type: 'academy', document: `adpt-remediation-a-${token}` },
    }),
    prisma.companyContract.create({
      data: { type: 'academy', document: `adpt-remediation-b-${token}` },
    }),
  ]);

  const [collaboratorFunction, operatorFunction, otherFunction] = await Promise.all([
  prisma.collaboratorFunctionOption.create({
    data: {
      contractId: contract.id,
      name: `ADPT remediation ${token}`,
      code: `ADPT-REMEDIATION-${token}`,
    },
  }),
  prisma.collaboratorFunctionOption.create({
    data: {
      contractId: contract.id,
      name: `ADPT operator ${token}`,
      code: 'professor',
    },
  }),
  prisma.collaboratorFunctionOption.create({
    data: {
      contractId: otherContract.id,
      name: `ADPT other ${token}`,
      code: `ADPT-OTHER-${token}`,
    },
  }),
]);

  const governanceBlocks = [
    'settings.contract.actions.manageClinicalTechnicalResponsibility',
    'settings.contract.adipometryProtocolApproval',
  ];
  await prisma.accessPermission.createMany({
    data: governanceBlocks.map((blockKey) => ({
      collaboratorFunctionId: collaboratorFunction.id,
      screenKey: 'settings.contract',
      blockKey,
      canView: true,
    })),
    skipDuplicates: true,
  });
  await Promise.all([
  setPermission(operatorFunction.id, '', true),
  setPermission(operatorFunction.id, VIEW_KEY, true),
  setPermission(operatorFunction.id, MANAGE_KEY, true),
  setPermission(operatorFunction.id, CORRECT_KEY, false),
]);

  const [user, operatorUser, otherUser] = await Promise.all([
  prisma.user.create({
    data: {
      email: `adpt-remediation-a-${token}@example.invalid`,
      passwordHash: 'not-a-password',
      type: 'professor',
      isActive: true,
    },
  }),
  prisma.user.create({
    data: {
      email: `adpt-remediation-operator-${token}@example.invalid`,
      passwordHash: 'not-a-password',
      type: 'professor',
      isActive: true,
    },
  }),
  prisma.user.create({
    data: {
      email: `adpt-remediation-b-${token}@example.invalid`,
      passwordHash: 'not-a-password',
      type: 'professor',
      isActive: true,
    },
  }),
]);

  const [professor, operatorProfessor, otherProfessor] = await Promise.all([
  prisma.professor.create({
    data: {
      userId: user.id,
      contractId: contract.id,
      collaboratorFunctionId: collaboratorFunction.id,
      role: 'master',
      currentStatus: 'active',
    },
  }),
  prisma.professor.create({
    data: {
      userId: operatorUser.id,
      contractId: contract.id,
      collaboratorFunctionId: operatorFunction.id,
      role: 'professor',
      currentStatus: 'active',
    },
  }),
  prisma.professor.create({
    data: {
      userId: otherUser.id,
      contractId: otherContract.id,
      collaboratorFunctionId: otherFunction.id,
      role: 'master',
      currentStatus: 'active',
    },
  }),
]);

  await Promise.all([
  prisma.profile.create({
    data: { userId: user.id, name: `ADPT remediation ${token}`, cref: `CREF-${token}` },
  }),
  prisma.profile.create({
    data: {
      userId: operatorUser.id,
      name: `ADPT operator ${token}`,
      cref: `CREF-OP-${token}`,
    },
  }),
  prisma.profile.create({
    data: { userId: otherUser.id, name: `ADPT other ${token}`, cref: `CREF-B-${token}` },
  }),
]);

  const [aluno, otherAluno] = await Promise.all([
    prisma.aluno.create({ data: { contractId: contract.id, professorId: professor.id } }),
    prisma.aluno.create({ data: { contractId: otherContract.id, professorId: otherProfessor.id } }),
  ]);
  await Promise.all([
    prisma.studentProfile.create({
      data: {
        alunoId: aluno.id,
        contractId: contract.id,
        identificationData: {
          birthDate: '2001-08-03',
          gender: 'male',
        } satisfies Prisma.InputJsonValue,
      },
    }),
    prisma.studentProfile.create({
      data: {
        alunoId: otherAluno.id,
        contractId: otherContract.id,
        identificationData: {
          birthDate: '2001-08-03',
          gender: 'male',
        } satisfies Prisma.InputJsonValue,
      },
    }),
  ]);

  const protocol = await prisma.adipometryProtocol.findFirstOrThrow({
    where: { code: 'GUEDES_1991_ADULT_YOUNG', version: 1 },
  });
  const specificationHash = buildAdipometrySpecificationHash({
    code: protocol.code,
    version: protocol.version,
    reference: protocol.reference,
    definitionSnapshot: protocol.definitionSnapshot,
  });
  await adipometryGovernanceService.designate(
    contract.id,
    user.id,
    professor.id,
    { professorId: professor.id }
  );
  await adipometryGovernanceService.approve(
    contract.id,
    user.id,
    professor.id,
    protocol.code,
    protocol.version,
    {
      approvalStatement:
        'Aprovo tecnicamente esta versão clínica para o teste de remediação da issue 247.',
      approvedSpecificationHash: specificationHash,
    }
  );


  const fixture: Fixture = {
  contractId: contract.id,
  otherContractId: otherContract.id,
  functionId: collaboratorFunction.id,
  operatorFunctionId: operatorFunction.id,
  otherFunctionId: otherFunction.id,
  userId: user.id,
  operatorUserId: operatorUser.id,
  otherUserId: otherUser.id,
  professorId: professor.id,
  operatorProfessorId: operatorProfessor.id,
  otherProfessorId: otherProfessor.id,
  alunoId: aluno.id,
  otherAlunoId: otherAluno.id,
  protocolCode: protocol.code,
  protocolVersion: protocol.version,
};
  fixtures.push(fixture);
  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  await prisma.adipometryAuditEvent.deleteMany({
    where: { contractId: { in: [fixture.contractId, fixture.otherContractId] } },
  });
  await prisma.adipometryAssessment.deleteMany({
    where: { contractId: { in: [fixture.contractId, fixture.otherContractId] } },
  });
  await prisma.adipometrySequence.deleteMany({
    where: { contractId: { in: [fixture.contractId, fixture.otherContractId] } },
  });
  await prisma.adipometryProtocolApproval.deleteMany({ where: { contractId: fixture.contractId } });
  await prisma.adipometryClinicalResponsibility.deleteMany({ where: { contractId: fixture.contractId } });
  await prisma.anthropometryAssessment.deleteMany({
    where: { contractId: { in: [fixture.contractId, fixture.otherContractId] } },
  });
  await prisma.studentProfile.deleteMany({
    where: { contractId: { in: [fixture.contractId, fixture.otherContractId] } },
  });
  await prisma.aluno.deleteMany({
    where: { contractId: { in: [fixture.contractId, fixture.otherContractId] } },
  });
  await prisma.profile.deleteMany({
    where: { userId: { in: [fixture.userId, fixture.operatorUserId, fixture.otherUserId] } },
  });
  await prisma.professor.deleteMany({
    where: { id: { in: [fixture.professorId, fixture.operatorProfessorId, fixture.otherProfessorId] } },
  });
  await prisma.accessPermission.deleteMany({
    where: { collaboratorFunctionId: { in: [fixture.functionId, fixture.operatorFunctionId, fixture.otherFunctionId] } },
  });
  await prisma.collaboratorFunctionOption.deleteMany({
    where: { id: { in: [fixture.functionId, fixture.operatorFunctionId, fixture.otherFunctionId] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: [fixture.userId, fixture.operatorUserId, fixture.otherUserId] } },
  });
  await prisma.companyContract.deleteMany({
    where: { id: { in: [fixture.contractId, fixture.otherContractId] } },
  });
}

async function prepareCalculableDraft(fixture: Fixture) {
  const draft = await adipometryService.createDraft(
    fixture.contractId,
    fixture.alunoId,
    fixture.userId,
    fixture.professorId,
    { assessmentDate: '2026-08-03' }
  );
  await adipometryService.updateDraft(
    fixture.contractId,
    draft.id,
    fixture.userId,
    {
      protocolCode: fixture.protocolCode,
      protocolVersion: fixture.protocolVersion,
      protocolSex: 'male',
      protocolSexSource: 'profile',
      measurements: {
        weightKg: 80,
        tricepsMm: 12,
        suprailiacMm: 18,
        abdominalMm: 20,
      },
    }
  );
  return draft.id;
}

describe('issue 247 audit remediations on PostgreSQL', () => {
  afterAll(async () => {
    for (const fixture of [...fixtures].reverse()) {
      await cleanupFixture(fixture).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('finalizes exactly once when two transactions conclude the same draft', async () => {
    const fixture = await createFixture();
    const assessmentId = await prepareCalculableDraft(fixture);
    const preview = await adipometryService.calculate(
      fixture.contractId,
      assessmentId,
      fixture.userId
    );
    const auditCountBefore = await prisma.adipometryAuditEvent.count({
      where: { contractId: fixture.contractId, assessmentId },
    });

    const results = await Promise.all([
      adipometryService.finalize(
        fixture.contractId,
        assessmentId,
        fixture.userId,
        { inputFingerprint: preview.inputFingerprint }
      ),
      adipometryService.finalize(
        fixture.contractId,
        assessmentId,
        fixture.userId,
        { inputFingerprint: preview.inputFingerprint }
      ),
    ]);

    expect(results.map((item) => item.alreadyFinalized).sort()).toEqual([false, true]);
    expect(new Set(results.map((item) => item.assessment.id))).toEqual(new Set([assessmentId]));
    await expect(
      prisma.adipometryAssessment.findUniqueOrThrow({ where: { id: assessmentId } })
    ).resolves.toMatchObject({ status: 'COMPLETED', revisionStatus: 'FINALIZED' });
    const auditCountAfter = await prisma.adipometryAuditEvent.count({
      where: { contractId: fixture.contractId, assessmentId },
    });
    expect(auditCountAfter - auditCountBefore).toBe(1);
  });

  it('uses the identifier as the final deterministic tie breaker', async () => {
    const fixture = await createFixture();
    const [first, second] = await Promise.all([
      adipometryService.createDraft(
        fixture.contractId,
        fixture.alunoId,
        fixture.userId,
        fixture.professorId,
        { assessmentDate: '2026-08-03' }
      ),
      adipometryService.createDraft(
        fixture.contractId,
        fixture.alunoId,
        fixture.userId,
        fixture.professorId,
        { assessmentDate: '2026-08-03' }
      ),
    ]);
    const tiedAt = new Date('2026-08-03T12:00:00.000Z');
    await prisma.adipometryAssessment.updateMany({
      where: { id: { in: [first.id, second.id] } },
      data: { createdAt: tiedAt, updatedAt: tiedAt },
    });
    const histories = await Promise.all(
    Array.from({ length: 4 }, () =>
      adipometryService.listAssessments(fixture.contractId, fixture.alunoId)
    )
  );
  const tiedAssessmentIds = new Set([first.id, second.id]);
  const observedOrders = histories.map((history) =>
    history.filter((item) => tiedAssessmentIds.has(item.id)).map((item) => item.id)
  );
  expect(new Set(observedOrders.map((order) => JSON.stringify(order))).size).toBe(1);
  expect(new Set(observedOrders[0])).toEqual(tiedAssessmentIds);

    const token = suffix();
    const [anthropometryA, anthropometryB] = await Promise.all([
      prisma.anthropometryAssessment.create({
        data: {
          id: `anthropometry-a-${token}`,
          contractId: fixture.contractId,
          alunoId: fixture.alunoId,
          professorId: fixture.professorId,
          code: `ANT-A-${token}`,
          assessmentDate: tiedAt,
          createdAt: tiedAt,
        },
      }),
      prisma.anthropometryAssessment.create({
        data: {
          id: `anthropometry-b-${token}`,
          contractId: fixture.contractId,
          alunoId: fixture.alunoId,
          professorId: fixture.professorId,
          code: `ANT-B-${token}`,
          assessmentDate: tiedAt,
          createdAt: tiedAt,
        },
      }),
    ]);
    const supports = await Promise.all(
    Array.from({ length: 4 }, () =>
      adipometryAnthropometrySupportService.getSupport(
        fixture.contractId,
        fixture.alunoId,
        '2026-08-03'
      )
    )
  );
  const observedSupportIds = supports.map(
    (support) => support.latestEligible?.anthropometryAssessmentId
  );
  expect(new Set(observedSupportIds).size).toBe(1);
  expect([anthropometryA.id, anthropometryB.id]).toContain(observedSupportIds[0]);
  });

  it('enforces authentication, role, view and tenant boundaries over HTTP', async () => {
  const fixture = await createFixture();
  const professorToken = tokenFor(fixture.operatorUserId);
  const historyUrl = `/adipometry/alunos/${fixture.alunoId}/assessments`;

  const unauthenticated = await request(app).get(historyUrl);
  expect(unauthenticated.status).toBe(401);

  const wrongRole = await request(app)
    .get(historyUrl)
    .set('Authorization', `Bearer ${tokenFor(fixture.userId, 'aluno')}`);
  expect(wrongRole.status).toBe(403);

  await setPermission(fixture.operatorFunctionId, VIEW_KEY, false);
  const withoutView = await request(app)
    .get(historyUrl)
    .set('Authorization', `Bearer ${professorToken}`);
  expect(withoutView.status).toBe(403);

  await setPermission(fixture.operatorFunctionId, VIEW_KEY, true);
  const otherDraft = await adipometryService.createDraft(
    fixture.otherContractId,
    fixture.otherAlunoId,
    fixture.otherUserId,
    fixture.otherProfessorId,
    { assessmentDate: '2026-08-03' }
  );
  const crossTenant = await request(app)
    .get(`/adipometry/assessments/${otherDraft.id}`)
    .set('Authorization', `Bearer ${professorToken}`);
  expect(crossTenant.status).toBe(404);
  expect(crossTenant.body.details?.code).toBe('ADIPOMETRY_RESOURCE_NOT_FOUND');
});

it('allows read-only access while management is denied over HTTP', async () => {
  const fixture = await createFixture();
  const professorToken = tokenFor(fixture.operatorUserId);
  const historyUrl = `/adipometry/alunos/${fixture.alunoId}/assessments`;

  await setPermission(fixture.operatorFunctionId, '', true);
  await setPermission(fixture.operatorFunctionId, VIEW_KEY, true);
  await setPermission(fixture.operatorFunctionId, MANAGE_KEY, false);

  const permissions = await prisma.accessPermission.findMany({
    where: {
      collaboratorFunctionId: fixture.operatorFunctionId,
      screenKey: SCREEN_KEY,
      blockKey: { in: ['', VIEW_KEY, MANAGE_KEY] },
    },
    select: { blockKey: true, canView: true },
  });
  expect(permissions).toEqual(expect.arrayContaining([
    { blockKey: '', canView: true },
    { blockKey: VIEW_KEY, canView: true },
    { blockKey: MANAGE_KEY, canView: false },
  ]));

  const readOnly = await request(app)
    .get(historyUrl)
    .set('Authorization', `Bearer ${professorToken}`);
  expect(readOnly.status).toBe(200);

  const createDenied = await request(app)
    .post(historyUrl)
    .set('Authorization', `Bearer ${professorToken}`)
    .send({ assessmentDate: '2026-08-03' });
  expect(createDenied.status).toBe(403);
});

it('allows management but requires the correction capability over HTTP', async () => {
  const fixture = await createFixture();
  const professorToken = tokenFor(fixture.operatorUserId);
  const historyUrl = `/adipometry/alunos/${fixture.alunoId}/assessments`;

  const createAllowed = await request(app)
    .post(historyUrl)
    .set('Authorization', `Bearer ${professorToken}`)
    .send({ assessmentDate: '2026-08-03' });
  expect(createAllowed.status).toBe(201);

  const finalizedId = await prepareCalculableDraft(fixture);
  const preview = await adipometryService.calculate(
    fixture.contractId,
    finalizedId,
    fixture.userId
  );
  await adipometryService.finalize(
    fixture.contractId,
    finalizedId,
    fixture.userId,
    { inputFingerprint: preview.inputFingerprint }
  );

  const correctionDenied = await request(app)
    .post(`/adipometry/assessments/${finalizedId}/corrections`)
    .set('Authorization', `Bearer ${professorToken}`)
    .send({
      category: 'DATA_ENTRY_ERROR',
      reason: 'Correção proposital para validar a permissão específica.',
    });
  expect(correctionDenied.status).toBe(403);
});
});
