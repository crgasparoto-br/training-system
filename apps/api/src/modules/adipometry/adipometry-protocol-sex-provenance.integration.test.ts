import { Prisma, PrismaClient } from '@prisma/client';
import { adipometryService } from './index.js';

const prisma = new PrismaClient();
const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

type Fixture = {
  contractId: string;
  functionId: string;
  confirmingUserId: string;
  editingUserId: string;
  confirmingProfessorId: string;
  editingProfessorId: string;
  alunoId: string;
};

const fixtures: Fixture[] = [];

async function createFixture(): Promise<Fixture> {
  const token = suffix();
  const contract = await prisma.companyContract.create({
    data: {
      type: 'academy',
      document: `adpt-provenance-${token}`,
      name: `ADPT provenance ${token}`,
    },
  });
  const collaboratorFunction = await prisma.collaboratorFunctionOption.create({
    data: {
      contractId: contract.id,
      name: `ADPT provenance ${token}`,
      code: `ADPT-PROVENANCE-${token}`,
    },
  });
  await prisma.accessPermission.createMany({
    data: [
      {
        id: `adpt-provenance-screen-${token}`,
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'physicalAssessment.protocol',
        blockKey: '',
        canView: true,
      },
      {
        id: `adpt-provenance-manage-${token}`,
        collaboratorFunctionId: collaboratorFunction.id,
        screenKey: 'physicalAssessment.protocol',
        blockKey: 'physicalAssessment.adpt.actions.manage',
        canView: true,
      },
    ],
  });
  const [confirmingUser, editingUser] = await Promise.all([
    prisma.user.create({
      data: {
        email: `adpt-provenance-confirm-${token}@example.invalid`,
        passwordHash: 'not-a-password',
        type: 'professor',
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        email: `adpt-provenance-edit-${token}@example.invalid`,
        passwordHash: 'not-a-password',
        type: 'professor',
        isActive: true,
      },
    }),
  ]);
  const [confirmingProfessor, editingProfessor] = await Promise.all([
    prisma.professor.create({
      data: {
        userId: confirmingUser.id,
        contractId: contract.id,
        collaboratorFunctionId: collaboratorFunction.id,
        role: 'professor',
        currentStatus: 'active',
      },
    }),
    prisma.professor.create({
      data: {
        userId: editingUser.id,
        contractId: contract.id,
        collaboratorFunctionId: collaboratorFunction.id,
        role: 'professor',
        currentStatus: 'active',
      },
    }),
  ]);
  const aluno = await prisma.aluno.create({
    data: {
      contractId: contract.id,
      professorId: confirmingProfessor.id,
    },
  });
  await prisma.studentProfile.create({
    data: {
      alunoId: aluno.id,
      contractId: contract.id,
      identificationData: {
        birthDate: '2001-08-04',
        gender: 'male',
      } satisfies Prisma.InputJsonValue,
    },
  });

  const fixture = {
    contractId: contract.id,
    functionId: collaboratorFunction.id,
    confirmingUserId: confirmingUser.id,
    editingUserId: editingUser.id,
    confirmingProfessorId: confirmingProfessor.id,
    editingProfessorId: editingProfessor.id,
    alunoId: aluno.id,
  };
  fixtures.push(fixture);
  return fixture;
}

async function cleanupFixture(fixture: Fixture) {
  await prisma.adipometryAuditEvent.deleteMany({ where: { contractId: fixture.contractId } });
  await prisma.adipometryAssessment.deleteMany({ where: { contractId: fixture.contractId } });
  await prisma.adipometrySequence.deleteMany({ where: { contractId: fixture.contractId } });
  await prisma.studentProfile.deleteMany({ where: { contractId: fixture.contractId } });
  await prisma.aluno.deleteMany({ where: { contractId: fixture.contractId } });
  await prisma.professor.deleteMany({
    where: { id: { in: [fixture.confirmingProfessorId, fixture.editingProfessorId] } },
  });
  await prisma.collaboratorFunctionOption.delete({ where: { id: fixture.functionId } });
  await prisma.user.deleteMany({
    where: { id: { in: [fixture.confirmingUserId, fixture.editingUserId] } },
  });
  await prisma.companyContract.delete({ where: { id: fixture.contractId } });
}

describe('adipometry protocol-sex decision provenance on PostgreSQL', () => {
  afterAll(async () => {
    for (const fixture of [...fixtures].reverse()) {
      await cleanupFixture(fixture).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('merges partial decision patches and preserves or transfers provenance only for effective changes', async () => {
    const fixture = await createFixture();
    const draft = await adipometryService.createDraft(
      fixture.contractId,
      fixture.alunoId,
      fixture.confirmingUserId,
      fixture.confirmingProfessorId,
      { assessmentDate: '2026-08-04' }
    );

    await adipometryService.updateDraft(
      fixture.contractId,
      draft.id,
      fixture.confirmingUserId,
      {
        protocolSex: 'male',
        protocolSexSource: 'profile',
        measurements: { weightKg: 80 },
      }
    );
    const original = await prisma.adipometryAssessment.findUniqueOrThrow({
      where: { id: draft.id },
      select: {
        protocolSex: true,
        profileSexSnapshot: true,
        protocolSexSource: true,
        protocolSexConfirmedByUserId: true,
        protocolSexConfirmedAt: true,
        protocolSexOverrideReason: true,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    await adipometryService.updateDraft(
      fixture.contractId,
      draft.id,
      fixture.editingUserId,
      {
        protocolSex: 'male',
        measurements: { weightKg: 81 },
      }
    );
    const unchanged = await prisma.adipometryAssessment.findUniqueOrThrow({
      where: { id: draft.id },
      select: {
        protocolSex: true,
        profileSexSnapshot: true,
        protocolSexSource: true,
        protocolSexConfirmedByUserId: true,
        protocolSexConfirmedAt: true,
        protocolSexOverrideReason: true,
        weightKg: true,
      },
    });

    expect(unchanged.weightKg?.toNumber()).toBe(81);
    expect(unchanged).toMatchObject({
      protocolSex: original.protocolSex,
      profileSexSnapshot: original.profileSexSnapshot,
      protocolSexSource: original.protocolSexSource,
      protocolSexConfirmedByUserId: original.protocolSexConfirmedByUserId,
      protocolSexOverrideReason: original.protocolSexOverrideReason,
    });
    expect(unchanged.protocolSexConfirmedAt?.toISOString()).toBe(
      original.protocolSexConfirmedAt?.toISOString()
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    await adipometryService.updateDraft(
      fixture.contractId,
      draft.id,
      fixture.editingUserId,
      { protocolSexSource: 'professional_confirmation' }
    );
    const sourceChanged = await prisma.adipometryAssessment.findUniqueOrThrow({
      where: { id: draft.id },
      select: {
        protocolSex: true,
        protocolSexSource: true,
        protocolSexConfirmedByUserId: true,
        protocolSexConfirmedAt: true,
      },
    });
    expect(sourceChanged).toMatchObject({
      protocolSex: 'male',
      protocolSexSource: 'professional_confirmation',
      protocolSexConfirmedByUserId: fixture.editingUserId,
    });
    expect(sourceChanged.protocolSexConfirmedAt?.getTime()).toBeGreaterThan(
      original.protocolSexConfirmedAt?.getTime() ?? 0
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    await adipometryService.updateDraft(
      fixture.contractId,
      draft.id,
      fixture.confirmingUserId,
      {
        protocolSex: 'female',
        protocolSexSource: 'professional_override',
        protocolSexOverrideReason: 'Decisão clínica revisada pelo profissional.',
      }
    );
    const changed = await prisma.adipometryAssessment.findUniqueOrThrow({
      where: { id: draft.id },
      select: {
        protocolSex: true,
        profileSexSnapshot: true,
        protocolSexSource: true,
        protocolSexConfirmedByUserId: true,
        protocolSexConfirmedAt: true,
        protocolSexOverrideReason: true,
      },
    });

    expect(changed).toMatchObject({
      protocolSex: 'female',
      profileSexSnapshot: 'male',
      protocolSexSource: 'professional_override',
      protocolSexConfirmedByUserId: fixture.confirmingUserId,
      protocolSexOverrideReason: 'Decisão clínica revisada pelo profissional.',
    });
    expect(changed.protocolSexConfirmedAt?.getTime()).toBeGreaterThan(
      sourceChanged.protocolSexConfirmedAt?.getTime() ?? 0
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    await adipometryService.updateDraft(
      fixture.contractId,
      draft.id,
      fixture.editingUserId,
      {
        protocolSexOverrideReason: 'Justificativa clínica atualizada pelo segundo profissional.',
      }
    );
    const reasonChanged = await prisma.adipometryAssessment.findUniqueOrThrow({
      where: { id: draft.id },
      select: {
        protocolSex: true,
        protocolSexSource: true,
        protocolSexConfirmedByUserId: true,
        protocolSexConfirmedAt: true,
        protocolSexOverrideReason: true,
      },
    });
    expect(reasonChanged).toMatchObject({
      protocolSex: 'female',
      protocolSexSource: 'professional_override',
      protocolSexConfirmedByUserId: fixture.editingUserId,
      protocolSexOverrideReason:
        'Justificativa clínica atualizada pelo segundo profissional.',
    });
    expect(reasonChanged.protocolSexConfirmedAt?.getTime()).toBeGreaterThan(
      changed.protocolSexConfirmedAt?.getTime() ?? 0
    );
  });

  it('rejects source or reason patches before a protocol sex exists', async () => {
    const fixture = await createFixture();
    const draft = await adipometryService.createDraft(
      fixture.contractId,
      fixture.alunoId,
      fixture.confirmingUserId,
      fixture.confirmingProfessorId,
      { assessmentDate: '2026-08-04' }
    );

    await expect(
      adipometryService.updateDraft(
        fixture.contractId,
        draft.id,
        fixture.editingUserId,
        { protocolSexSource: 'professional_confirmation' }
      )
    ).rejects.toMatchObject({
      code: 'ADIPOMETRY_INVALID_PROTOCOL_SEX_DECISION',
      statusCode: 400,
    });

    const persisted = await prisma.adipometryAssessment.findUniqueOrThrow({
      where: { id: draft.id },
      select: {
        protocolSex: true,
        protocolSexSource: true,
        protocolSexConfirmedByUserId: true,
        protocolSexConfirmedAt: true,
      },
    });
    expect(persisted).toEqual({
      protocolSex: null,
      protocolSexSource: null,
      protocolSexConfirmedByUserId: null,
      protocolSexConfirmedAt: null,
    });
  });
});
