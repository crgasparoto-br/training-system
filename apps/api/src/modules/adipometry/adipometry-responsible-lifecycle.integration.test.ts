import { PrismaClient } from '@prisma/client';
import { reassignAdipometryResponsibleProfessor } from './adipometry-responsible-reassignment.js';
import { adipometryService } from './adipometry.service.js';
import { installAdipometryRuntimeHardening } from './adipometry-runtime-hardening.js';

const prisma = new PrismaClient();
const SCREEN_KEY = 'physicalAssessment.protocol';
const MANAGE_KEY = 'physicalAssessment.adpt.actions.manage';

installAdipometryRuntimeHardening();

function suffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe('adipometry responsible lifecycle guard on PostgreSQL', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('bloqueia o responsável revogado e recupera o mesmo rascunho com reassociação auditada', async () => {
    const token = suffix();
    const contract = await prisma.companyContract.create({
      data: { type: 'academy', document: `adpt-responsible-lifecycle-${token}` },
    });
    const [actorFunction, responsibleFunction, replacementFunction] = await Promise.all([
      prisma.collaboratorFunctionOption.create({
        data: {
          contractId: contract.id,
          name: `Ator ADPT ${token}`,
          code: `ADPT-LIFECYCLE-ACTOR-${token}`,
        },
      }),
      prisma.collaboratorFunctionOption.create({
        data: {
          contractId: contract.id,
          name: `Responsável ADPT ${token}`,
          code: `ADPT-LIFECYCLE-RESPONSIBLE-${token}`,
        },
      }),
      prisma.collaboratorFunctionOption.create({
        data: {
          contractId: contract.id,
          name: `Substituto ADPT ${token}`,
          code: `ADPT-LIFECYCLE-REPLACEMENT-${token}`,
        },
      }),
    ]);
    const [actorUser, responsibleUser, replacementUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `adpt-lifecycle-actor-${token}@example.invalid`,
          passwordHash: 'not-a-password',
          type: 'professor',
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          email: `adpt-lifecycle-responsible-${token}@example.invalid`,
          passwordHash: 'not-a-password',
          type: 'professor',
          isActive: true,
        },
      }),
      prisma.user.create({
        data: {
          email: `adpt-lifecycle-replacement-${token}@example.invalid`,
          passwordHash: 'not-a-password',
          type: 'professor',
          isActive: true,
        },
      }),
    ]);
    const [actor, responsible, replacement] = await Promise.all([
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
      prisma.professor.create({
        data: {
          userId: replacementUser.id,
          contractId: contract.id,
          collaboratorFunctionId: replacementFunction.id,
          role: 'professor',
          currentStatus: 'active',
        },
      }),
    ]);
    const aluno = await prisma.aluno.create({
      data: { contractId: contract.id, professorId: actor.id },
    });

    await prisma.accessPermission.createMany({
      data: [responsibleFunction.id, replacementFunction.id].flatMap(
        (collaboratorFunctionId) => [
          {
            collaboratorFunctionId,
            screenKey: SCREEN_KEY,
            blockKey: '',
            canView: true,
          },
          {
            collaboratorFunctionId,
            screenKey: SCREEN_KEY,
            blockKey: MANAGE_KEY,
            canView: true,
          },
        ]
      ),
    });

    try {
      const draft = await adipometryService.createDraft(
        contract.id,
        aluno.id,
        actorUser.id,
        responsible.id,
        { assessmentDate: '2026-08-04' }
      );
      const beforeRevocation = await prisma.adipometryAssessment.findUniqueOrThrow({
        where: { id: draft.id },
      });
      const auditEventsBeforeRevocation = await prisma.adipometryAuditEvent.count({
        where: { contractId: contract.id, assessmentId: draft.id },
      });

      await prisma.accessPermission.updateMany({
        where: {
          collaboratorFunctionId: responsibleFunction.id,
          screenKey: SCREEN_KEY,
          blockKey: MANAGE_KEY,
        },
        data: { canView: false },
      });

      await expect(
        adipometryService.updateDraft(
          contract.id,
          draft.id,
          actorUser.id,
          { notes: 'não deve persistir após a revogação' }
        )
      ).rejects.toThrow('ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE');

      await expect(
        adipometryService.calculate(contract.id, draft.id, actorUser.id)
      ).rejects.toThrow('ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE');

      await expect(
        adipometryService.finalize(
          contract.id,
          draft.id,
          actorUser.id,
          { inputFingerprint: 'a'.repeat(64) }
        )
      ).rejects.toThrow('ADIPOMETRY_RESPONSIBLE_NOT_AVAILABLE');

      const persisted = await prisma.adipometryAssessment.findUniqueOrThrow({
        where: { id: draft.id },
      });
      expect(persisted.status).toBe('DRAFT');
      expect(persisted.revisionStatus).toBe('DRAFT');
      expect(persisted.notes).toBeNull();
      expect(persisted.skinfoldTotalMm).toBeNull();
      expect(persisted.bodyFatPercentage).toBeNull();
      expect(persisted.fatMassKg).toBeNull();
      expect(persisted.leanMassKg).toBeNull();
      expect(persisted.calculationSnapshot).toBeNull();
      expect(persisted.completedAt).toBeNull();
      expect(persisted.protocolSexConfirmedByUserId).toBeNull();
      expect(persisted.protocolSexConfirmedAt).toBeNull();
      expect(persisted.skinfoldCapacityWarningConfirmedByUserId).toBeNull();
      expect(persisted.skinfoldCapacityWarningConfirmedAt).toBeNull();
      expect(persisted.updatedAt.toISOString()).toBe(beforeRevocation.updatedAt.toISOString());
      await expect(
        prisma.adipometryAuditEvent.count({
          where: { contractId: contract.id, assessmentId: draft.id },
        })
      ).resolves.toBe(auditEventsBeforeRevocation);

      await expect(
        reassignAdipometryResponsibleProfessor({
          contractId: contract.id,
          assessmentId: draft.id,
          actorUserId: actorUser.id,
          responsibleProfessorId: replacement.id,
          expectedUpdatedAt: '2026-01-01T00:00:00.000Z',
        })
      ).rejects.toThrow('O rascunho foi atualizado por outra sessão');

      const reassigned = await reassignAdipometryResponsibleProfessor({
        contractId: contract.id,
        assessmentId: draft.id,
        actorUserId: actorUser.id,
        responsibleProfessorId: replacement.id,
        expectedUpdatedAt: persisted.updatedAt.toISOString(),
      });
      expect(reassigned.id).toBe(draft.id);
      expect(reassigned.professorId).toBe(replacement.id);
      expect(reassigned.notes).toBeUndefined();

      const recovered = await adipometryService.updateDraft(
        contract.id,
        draft.id,
        actorUser.id,
        {
          notes: 'rascunho recuperado sem perda',
          expectedUpdatedAt: reassigned.updatedAt,
        }
      );
      expect(recovered.professorId).toBe(replacement.id);
      expect(recovered.notes).toBe('rascunho recuperado sem perda');

      await expect(
        adipometryService.calculate(contract.id, draft.id, actorUser.id)
      ).rejects.toThrow('Selecione um protocolo antes de calcular.');
      await expect(
        adipometryService.finalize(
          contract.id,
          draft.id,
          actorUser.id,
          { inputFingerprint: 'a'.repeat(64), expectedUpdatedAt: recovered.updatedAt }
        )
      ).rejects.toThrow('Selecione um protocolo antes de calcular.');

      const auditEvents = await prisma.adipometryAuditEvent.findMany({
        where: { contractId: contract.id, assessmentId: draft.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(auditEvents.length).toBeGreaterThan(auditEventsBeforeRevocation);
      expect(auditEvents.some((event) =>
        JSON.stringify(event.afterSnapshot).includes(replacement.id)
      )).toBe(true);
    } finally {
      // Audit events are append-only by design. This file is executed as an
      // isolated database test, so fixture cleanup is best-effort and must not
      // weaken the production trigger merely to remove ephemeral test rows.
      await (async () => {
        await prisma.adipometryAuditEvent.deleteMany({ where: { contractId: contract.id } });
        await prisma.adipometryAssessment.deleteMany({ where: { contractId: contract.id } });
        await prisma.adipometrySequence.deleteMany({ where: { contractId: contract.id } });
        await prisma.aluno.deleteMany({ where: { contractId: contract.id } });
        await prisma.professor.deleteMany({
          where: { id: { in: [actor.id, responsible.id, replacement.id] } },
        });
        await prisma.accessPermission.deleteMany({
          where: {
            collaboratorFunctionId: {
              in: [actorFunction.id, responsibleFunction.id, replacementFunction.id],
            },
          },
        });
        await prisma.collaboratorFunctionOption.deleteMany({
          where: { id: { in: [actorFunction.id, responsibleFunction.id, replacementFunction.id] } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: [actorUser.id, responsibleUser.id, replacementUser.id] } },
        });
        await prisma.companyContract.delete({ where: { id: contract.id } });
      })().catch(() => undefined);
    }
  });
});
