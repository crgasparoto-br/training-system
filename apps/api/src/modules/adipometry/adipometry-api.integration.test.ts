import express from 'express';
import jwt from 'jsonwebtoken';
import { Prisma, PrismaClient } from '@prisma/client';
import type {
  AdipometryCalculationPreviewRequest,
  CreateAdipometryDraftInput,
} from '@corrida/types';
import {
  adipometryGovernanceService,
  buildAdipometrySpecificationHash,
} from './adipometry-governance.service.js';
import { adipometryRoutes } from './index.js';
import { adipometryService } from './adipometry.service.js';

const request = require('supertest');
const prisma = new PrismaClient();
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const app = express();
app.use(express.json());
app.use('/adipometry', adipometryRoutes);

type Fixture = {
  contractId: string;
  otherContractId: string;
  functionId: string;
  otherFunctionId: string;
  userId: string;
  otherUserId: string;
  professorId: string;
  otherProfessorId: string;
  alunoId: string;
  otherAlunoId: string;
  anthropometryId: string;
  protocolCode: string;
  protocolVersion: number;
};

const fixtures: Fixture[] = [];

function tokenFor(userId: string) {
  return jwt.sign(
    {
      userId,
      email: `adpt-http-${userId}@example.invalid`,
      type: 'professor',
    },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '1h' }
  );
}

async function createFixture(): Promise<Fixture> {
  const token = suffix();
  const [contract, otherContract] = await Promise.all([
    prisma.companyContract.create({
      data: { type: 'academy', document: `adpt-api-a-${token}`, name: `ADPT API A ${token}` },
    }),
    prisma.companyContract.create({
      data: { type: 'academy', document: `adpt-api-b-${token}`, name: `ADPT API B ${token}` },
    }),
  ]);

  const [collaboratorFunction, otherFunction] = await Promise.all([
    prisma.collaboratorFunctionOption.create({
      data: {
        contractId: contract.id,
        name: `Responsável ADPT ${token}`,
        code: `ADPT-${token}`,
      },
    }),
    prisma.collaboratorFunctionOption.create({
      data: {
        contractId: otherContract.id,
        name: `Outro contrato ${token}`,
        code: `ADPT-B-${token}`,
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
  await prisma.accessPermission.updateMany({
    where: {
      collaboratorFunctionId: collaboratorFunction.id,
      screenKey: 'settings.contract',
      blockKey: { in: governanceBlocks },
    },
    data: { canView: true },
  });

  const [user, otherUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `adpt-api-a-${token}@example.invalid`,
        passwordHash: 'not-a-password',
        type: 'professor',
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        email: `adpt-api-b-${token}@example.invalid`,
        passwordHash: 'not-a-password',
        type: 'professor',
        isActive: true,
      },
    }),
  ]);

  const [professor, otherProfessor] = await Promise.all([
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
      data: { userId: user.id, name: `Responsável ADPT ${token}`, cref: `CREF-${token}` },
    }),
    prisma.profile.create({
      data: { userId: otherUser.id, name: `Outro professor ${token}`, cref: `CREF-B-${token}` },
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

  const anthropometry = await prisma.anthropometryAssessment.create({
    data: {
      contractId: contract.id,
      alunoId: aluno.id,
      professorId: professor.id,
      code: `ANT-${token}`,
      assessmentDate: new Date('2026-08-02T00:00:00.000Z'),
    },
  });

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
        'Aprovo tecnicamente esta versão clínica para uso controlado neste contrato de teste.',
      approvedSpecificationHash: specificationHash,
    }
  );

  const fixture: Fixture = {
    contractId: contract.id,
    otherContractId: otherContract.id,
    functionId: collaboratorFunction.id,
    otherFunctionId: otherFunction.id,
    userId: user.id,
    otherUserId: otherUser.id,
    professorId: professor.id,
    otherProfessorId: otherProfessor.id,
    alunoId: aluno.id,
    otherAlunoId: otherAluno.id,
    anthropometryId: anthropometry.id,
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
  await prisma.profile.deleteMany({ where: { userId: { in: [fixture.userId, fixture.otherUserId] } } });
  await prisma.professor.deleteMany({
    where: { id: { in: [fixture.professorId, fixture.otherProfessorId] } },
  });
  await prisma.accessPermission.deleteMany({
    where: { collaboratorFunctionId: { in: [fixture.functionId, fixture.otherFunctionId] } },
  });
  await prisma.collaboratorFunctionOption.deleteMany({
    where: { id: { in: [fixture.functionId, fixture.otherFunctionId] } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [fixture.userId, fixture.otherUserId] } } });
  await prisma.companyContract.deleteMany({
    where: { id: { in: [fixture.contractId, fixture.otherContractId] } },
  });
}

async function prepareCalculableDraft(
  fixture: Fixture,
  measurements: { weightKg: number; tricepsMm: number; suprailiacMm: number; abdominalMm: number }
) {
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
      measurements,
    }
  );
  return draft.id;
}

describe('adipometry API service on PostgreSQL', () => {
  afterAll(async () => {
    for (const fixture of [...fixtures].reverse()) {
      await cleanupFixture(fixture).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('serializes codes, requires current preview, rolls back and preserves correction history', async () => {
    const fixture = await createFixture();
    const draftInput = { assessmentDate: '2026-08-03' } satisfies CreateAdipometryDraftInput;

    const concurrent = await Promise.all([
      adipometryService.createDraft(
        fixture.contractId,
        fixture.alunoId,
        fixture.userId,
        fixture.professorId,
        draftInput
      ),
      adipometryService.createDraft(
        fixture.contractId,
        fixture.alunoId,
        fixture.userId,
        fixture.professorId,
        draftInput
      ),
    ]);

    expect(concurrent.map((item) => item.code).sort()).toEqual(['ADPT-001', 'ADPT-002']);

    await prisma.adipometrySequence.update({
      where: {
        contractId_alunoId: {
          contractId: fixture.contractId,
          alunoId: fixture.alunoId,
        },
      },
      data: { lastValue: 999 },
    });
    const highSequence = await adipometryService.createDraft(
      fixture.contractId,
      fixture.alunoId,
      fixture.userId,
      fixture.professorId,
      draftInput
    );
    const highSequenceRow = await prisma.adipometryAssessment.findUniqueOrThrow({
      where: { id: highSequence.id },
      select: { code: true, sequenceNumber: true },
    });
    expect(highSequenceRow.code).toBe('ADPT-1000');
    expect(highSequenceRow.sequenceNumber).toBe(1000);

    const assessmentId = concurrent[0].id;
    const updated = await adipometryService.updateDraft(
      fixture.contractId,
      assessmentId,
      fixture.userId,
      {
        assessmentDate: '2026-08-03',
        anthropometryAssessmentId: fixture.anthropometryId,
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
    expect(updated.anthropometryReference?.anthropometryAssessmentId).toBe(
      fixture.anthropometryId
    );

    const preview = await adipometryService.calculate(
      fixture.contractId,
      assessmentId,
      fixture.userId
    );
    expect(preview.canFinalize).toBe(true);
    expect(preview.usedSkinfolds).toEqual(['tricepsMm', 'suprailiacMm', 'abdominalMm']);
    expect(preview.results?.bodyFatPercentage).toBe(18.12);

    await expect(
      adipometryService.finalize(
        fixture.contractId,
        assessmentId,
        fixture.userId,
        {} as any
      )
    ).rejects.toMatchObject({ code: 'ADIPOMETRY_PREVIEW_REQUIRED', statusCode: 409 });

    await adipometryService.updateDraft(
      fixture.contractId,
      assessmentId,
      fixture.userId,
      { measurements: { abdominalMm: 20.1 } }
    );
    await expect(
      adipometryService.finalize(
        fixture.contractId,
        assessmentId,
        fixture.userId,
        { inputFingerprint: preview.inputFingerprint }
      )
    ).rejects.toMatchObject({ code: 'ADIPOMETRY_PREVIEW_INVALIDATED', statusCode: 409 });
    await adipometryService.updateDraft(
      fixture.contractId,
      assessmentId,
      fixture.userId,
      { measurements: { abdominalMm: 20 } }
    );
    const refreshedPreview = await adipometryService.calculate(
      fixture.contractId,
      assessmentId,
      fixture.userId
    );

    await prisma.user.update({ where: { id: fixture.userId }, data: { isActive: false } });
    await expect(
      adipometryService.finalize(
        fixture.contractId,
        assessmentId,
        fixture.userId,
        { inputFingerprint: refreshedPreview.inputFingerprint }
      )
    ).rejects.toBeDefined();

    const afterRollback = await prisma.adipometryAssessment.findUniqueOrThrow({
      where: { id: assessmentId },
    });
    expect(afterRollback.status).toBe('DRAFT');
    expect(afterRollback.calculationSnapshot).toBeNull();
    expect(afterRollback.bodyFatPercentage).toBeNull();

    await prisma.user.update({ where: { id: fixture.userId }, data: { isActive: true } });
    const finalized = await adipometryService.finalize(
      fixture.contractId,
      assessmentId,
      fixture.userId,
      { inputFingerprint: refreshedPreview.inputFingerprint }
    );
    expect(finalized.alreadyFinalized).toBe(false);
    expect(finalized.assessment.status).toBe('COMPLETED');
    expect(finalized.assessment.auditEvents?.length).toBeGreaterThan(0);

    const repeated = await adipometryService.finalize(
      fixture.contractId,
      assessmentId,
      fixture.userId,
      { inputFingerprint: refreshedPreview.inputFingerprint }
    );
    expect(repeated.alreadyFinalized).toBe(true);
    expect(repeated.assessment.id).toBe(assessmentId);

    await expect(
      adipometryService.updateDraft(
        fixture.contractId,
        assessmentId,
        fixture.userId,
        { notes: 'Tentativa indevida' }
      )
    ).rejects.toMatchObject({ code: 'ADIPOMETRY_FINALIZED_IMMUTABLE' });

    await expect(
      adipometryService.getAssessment(fixture.otherContractId, assessmentId)
    ).rejects.toMatchObject({ code: 'ADIPOMETRY_RESOURCE_NOT_FOUND', statusCode: 404 });

    const correction = await adipometryService.startCorrection(
      fixture.contractId,
      assessmentId,
      fixture.userId,
      'MEASUREMENT_TRANSCRIPTION_ERROR',
      'Correção da dobra abdominal registrada incorretamente.'
    );
    const correctedDraft = await adipometryService.updateDraft(
      fixture.contractId,
      correction.id,
      fixture.userId,
      { measurements: { abdominalMm: 21 } }
    );
    const correctionPreview = await adipometryService.calculate(
      fixture.contractId,
      correctedDraft.id,
      fixture.userId
    );
    const corrected = await adipometryService.finalize(
      fixture.contractId,
      correctedDraft.id,
      fixture.userId,
      { inputFingerprint: correctionPreview.inputFingerprint }
    );

    expect(corrected.assessment.revisionNumber).toBe(2);
    expect(corrected.assessment.revisionStatus).toBe('FINALIZED');
    const original = await prisma.adipometryAssessment.findUniqueOrThrow({
      where: { id: assessmentId },
    });
    expect(original.revisionStatus).toBe('SUPERSEDED');
    expect(original.correctedByAssessmentId).toBe(correctedDraft.id);

    const current = await adipometryService.listAssessments(
      fixture.contractId,
      fixture.alunoId
    );
    expect(current.some((item) => item.id === assessmentId)).toBe(false);
    expect(current.some((item) => item.id === correctedDraft.id)).toBe(true);
  });

  it('rejects an approved protocol lookup in a contract without active approval', async () => {
    const fixture = await createFixture();
    const draft = await adipometryService.createDraft(
      fixture.otherContractId,
      fixture.otherAlunoId,
      fixture.otherUserId,
      fixture.otherProfessorId,
      { assessmentDate: '2026-08-03' }
    );

    await expect(
      adipometryService.updateDraft(
        fixture.otherContractId,
        draft.id,
        fixture.otherUserId,
        {
          protocolCode: fixture.protocolCode,
          protocolVersion: fixture.protocolVersion,
        }
      )
    ).rejects.toMatchObject({ code: 'PROTOCOL_NOT_APPROVED_FOR_CONTRACT', statusCode: 409 });
  });

  it('revalidates active user and professor status on the real HTTP boundary', async () => {
    const fixture = await createFixture();
    const token = tokenFor(fixture.userId);
    const url = `/adipometry/alunos/${fixture.alunoId}/assessments`;

    const active = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${token}`);
    expect(active.status).toBe(200);

    await prisma.user.update({ where: { id: fixture.userId }, data: { isActive: false } });
    const inactiveUser = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${token}`);
    expect(inactiveUser.status).toBe(404);
    expect(inactiveUser.body.error).toBe('Professor não encontrado');

    await prisma.user.update({ where: { id: fixture.userId }, data: { isActive: true } });
    await prisma.professor.update({
      where: { id: fixture.professorId },
      data: { currentStatus: 'inactive' },
    });
    const inactiveProfessor = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${token}`);
    expect(inactiveProfessor.status).toBe(404);
    expect(inactiveProfessor.body.error).toBe('Professor não encontrado');

    await prisma.professor.update({
      where: { id: fixture.professorId },
      data: { currentStatus: 'active' },
    });
  });

  it('rejects impossible civil dates through HTTP without creating a draft', async () => {
    const fixture = await createFixture();
    const token = tokenFor(fixture.userId);
    const before = await prisma.adipometryAssessment.count({
      where: { contractId: fixture.contractId, alunoId: fixture.alunoId },
    });
    const invalidBody = {
      assessmentDate: '2026-02-31',
    } satisfies CreateAdipometryDraftInput;

    const response = await request(app)
      .post(`/adipometry/alunos/${fixture.alunoId}/assessments`)
      .set('Authorization', `Bearer ${token}`)
      .send(invalidBody);

    expect(response.status).toBe(400);
    expect(response.body.details?.code).toBe('ADIPOMETRY_INVALID_INPUT');
    await expect(
      prisma.adipometryAssessment.count({
        where: { contractId: fixture.contractId, alunoId: fixture.alunoId },
      })
    ).resolves.toBe(before);
  });

  it('persists capacity confirmation only when the approved preview has no other blocker', async () => {
    const fixture = await createFixture();
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
          tricepsMm: 46,
          suprailiacMm: 18,
        },
      }
    );

    const confirmation = {
      skinfoldCapacityWarningConfirmed: true,
    } satisfies AdipometryCalculationPreviewRequest;
    const blocked = await adipometryService.calculate(
      fixture.contractId,
      draft.id,
      fixture.userId,
      confirmation
    );
    expect(blocked.canFinalize).toBe(false);
    expect(blocked.compatibility.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MISSING_MEASUREMENT', field: 'abdominalMm' }),
      expect.objectContaining({ code: 'SKINFOLD_CAPACITY_WARNING_CONFIRMATION_REQUIRED' }),
    ]));
    await expect(
      prisma.adipometryAssessment.findUniqueOrThrow({ where: { id: draft.id } })
    ).resolves.toMatchObject({
      skinfoldCapacityWarningConfirmedByUserId: null,
      skinfoldCapacityWarningConfirmedAt: null,
    });

    await adipometryService.updateDraft(
      fixture.contractId,
      draft.id,
      fixture.userId,
      { measurements: { abdominalMm: 20 } }
    );
    const confirmed = await adipometryService.calculate(
      fixture.contractId,
      draft.id,
      fixture.userId,
      confirmation
    );
    expect(confirmed.canFinalize).toBe(true);
    await expect(
      prisma.adipometryAssessment.findUniqueOrThrow({ where: { id: draft.id } })
    ).resolves.toMatchObject({
      skinfoldCapacityWarningConfirmedByUserId: fixture.userId,
      skinfoldCapacityWarningConfirmedAt: expect.any(Date),
    });
  });

  it('uses completion time and id as stable same-day comparison tie breakers', async () => {
    const fixture = await createFixture();
    const firstId = await prepareCalculableDraft(fixture, {
      weightKg: 80,
      tricepsMm: 12,
      suprailiacMm: 18,
      abdominalMm: 20,
    });
    const firstPreview = await adipometryService.calculate(
      fixture.contractId,
      firstId,
      fixture.userId
    );
    await adipometryService.finalize(
      fixture.contractId,
      firstId,
      fixture.userId,
      { inputFingerprint: firstPreview.inputFingerprint }
    );

    await new Promise((resolve) => setTimeout(resolve, 10));

    const secondId = await prepareCalculableDraft(fixture, {
      weightKg: 81,
      tricepsMm: 13,
      suprailiacMm: 19,
      abdominalMm: 21,
    });
    const secondPreview = await adipometryService.calculate(
      fixture.contractId,
      secondId,
      fixture.userId
    );
    await adipometryService.finalize(
      fixture.contractId,
      secondId,
      fixture.userId,
      { inputFingerprint: secondPreview.inputFingerprint }
    );

    const comparison = await adipometryService.compare(
      fixture.contractId,
      fixture.alunoId,
      [firstId, secondId]
    );
    expect(comparison.previous?.assessment.id).toBe(firstId);
    expect(comparison.current.assessment.id).toBe(secondId);
    expect(comparison.deltas?.weightKg).toBe(1);
    expect(comparison.deltas?.tricepsMm).toBe(1);
  });
});
