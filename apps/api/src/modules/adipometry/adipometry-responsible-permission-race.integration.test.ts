import { PrismaClient } from '@prisma/client';
import { adipometryService } from './adipometry.service.js';
import { requireAdipometryResponsibleProfessor } from './adipometry-responsible-professor.js';

const prisma = new PrismaClient();
const SCREEN_KEY = 'physicalAssessment.protocol';
const MANAGE_KEY = 'physicalAssessment.adpt.actions.manage';

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe('adipometry responsible permission race on PostgreSQL', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejeita o INSERT quando a gestão ADPT é revogada após a validação HTTP', async () => {
    const token = suffix();
    const contract = await prisma.companyContract.create({
      data: { type: 'academy', document: `adpt-responsible-race-${token}` },
    });
    const [actorFunction, responsibleFunction] = await Promise.all([
      prisma.collaboratorFunctionOption.create({
        data: {
          contractId: contract.id,
          name: `Ator ADPT ${token}`,
          code: `ADPT-ACTOR-${token}`,
        },
      }),
      prisma.collaboratorFunctionOption.create({
        data: {
          contractId: contract.id,
          name: `Responsável ADPT ${token}`,
          code: `ADPT-RESPONSIBLE-${token}`,
        },
      }),
    ]);
    const [actorUser, responsibleUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `adpt-actor-${token}@example.invalid`,
          passwordHash: 'not-a-password',
          type: 'professor',
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          email: `adpt-responsible-${token}@example.invalid`,
          passwordHash: 'not-a-password',
          type: 'professor',
          isActive: true,
        },
      }),
    ]);
    const [actor, responsible] = await Promise.all([
      prisma.professor.create({
        data: {
          userId: actorUser.id,
          contractId: contract.id,
          collaboratorFunctionId: actorFunction.id,
          role: 'master',
          currentStatus: 'active',
        },
      }),
      prisma.professor.create({
        data: {
          userId: responsibleUser.id,
          contractId: contract.id,
          collaboratorFunctionId: responsibleFunction.id,
          role: 'professor',
          currentStatus: 'active',
        },
      }),
    ]);
    const aluno = await prisma.aluno.create({
      data: { contractId: contract.id, professorId: actor.id },
    });

    await prisma.accessPermission.createMany({
      data: [
        {
          collaboratorFunctionId: responsibleFunction.id,
          screenKey: SCREEN_KEY,
          blockKey: '',
          canView: true,
        },
        {
          collaboratorFunctionId: responsibleFunction.id,
          screenKey: SCREEN_KEY,
          blockKey: MANAGE_KEY,
          canView: true,
        },
      ],
    });

    try {
      await expect(
        requireAdipometryResponsibleProfessor(contract.id, responsible.id)
      ).resolves.toMatchObject({ id: responsible.id });

      await prisma.accessPermission.updateMany({
        where: {
          collaboratorFunctionId: responsibleFunction.id,
          screenKey: SCREEN_KEY,
          blockKey: MANAGE_KEY,
        },
        data: { canView: false },
      });

      await expect(
        adipometryService.createDraft(
          contract.id,
          aluno.id,
          actorUser.id,
          responsible.id,
          { assessmentDate: '2026-08-04' }
        )
      ).rejects.toThrow('ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE');

      await expect(
        prisma.adipometryAssessment.count({
          where: { contractId: contract.id, alunoId: aluno.id },
        })
      ).resolves.toBe(0);
    } finally {
      await prisma.adipometryAuditEvent.deleteMany({ where: { contractId: contract.id } });
      await prisma.adipometryAssessment.deleteMany({ where: { contractId: contract.id } });
      await prisma.adipometrySequence.deleteMany({ where: { contractId: contract.id } });
      await prisma.aluno.deleteMany({ where: { contractId: contract.id } });
      await prisma.professor.deleteMany({
        where: { id: { in: [actor.id, responsible.id] } },
      });
      await prisma.accessPermission.deleteMany({
        where: {
          collaboratorFunctionId: { in: [actorFunction.id, responsibleFunction.id] },
        },
      });
      await prisma.collaboratorFunctionOption.deleteMany({
        where: { id: { in: [actorFunction.id, responsibleFunction.id] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [actorUser.id, responsibleUser.id] } },
      });
      await prisma.companyContract.delete({ where: { id: contract.id } });
    }
  });
});
