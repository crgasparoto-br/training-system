import { PrismaClient } from '@prisma/client';
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { CapacityPrescriptionSourceRef } from '@corrida/types';
import { sendError } from '@corrida/utils';
import { canProfessorAccessBlock } from '../access-control/access-control.service.js';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';

const router: Router = Router();
const prisma = new PrismaClient();

type CanonicalSourceActor = { contractId: string; professorId: string };
type CanonicalSourceRequest = Request & { canonicalSourceActor?: CanonicalSourceActor };

function requireCapacityManageBlock(
  req: CanonicalSourceRequest,
  res: Response,
  next: NextFunction
) {
  return (async () => {
    try {
      const contractId = req.user?.contractId;
      const professorId = req.user?.professorId;
      if (!contractId || !professorId) return sendError(res, 'Não autenticado', 401);

      const professor = await prisma.professor.findFirst({
        where: { id: professorId, contractId },
        include: { collaboratorFunction: true },
      });
      if (
        !professor ||
        !(await canProfessorAccessBlock(professor, 'plans.capacityPrescriptions.manage'))
      ) {
        return sendError(res, 'Perfil sem permissão para acessar este recurso', 403);
      }

      req.canonicalSourceActor = { contractId, professorId };
      return next();
    } catch (error) {
      console.error('Erro ao validar canonicalização das fontes da prescrição:', error);
      return sendError(res, 'Erro ao verificar permissão', 500);
    }
  })();
}

async function professorIdFromUser(contractId: string, userId: string | null) {
  if (!userId) return null;
  return (
    (
      await prisma.professor.findFirst({
        where: { contractId, userId },
        select: { id: true },
      })
    )?.id ?? null
  );
}

async function canonicalizeProntuarioAlert(
  contractId: string,
  alunoId: string,
  source: CapacityPrescriptionSourceRef
): Promise<CapacityPrescriptionSourceRef> {
  const painCase = await prisma.prontuarioPainCase.findFirst({
    where: { id: source.id, record: { contractId, alunoId } },
    select: {
      id: true,
      title: true,
      onsetDate: true,
      createdAt: true,
      updatedAt: true,
      record: { select: { professorId: true } },
    },
  });
  if (painCase) {
    return {
      type: 'prontuario_alert',
      id: painCase.id,
      label: `Dor ou condição em acompanhamento: ${painCase.title}`,
      assessedAt: (painCase.onsetDate ?? painCase.createdAt).toISOString(),
      origin: 'PRNT - casos de dor',
      version: painCase.updatedAt.toISOString(),
      responsibleProfessorId: painCase.record.professorId,
    };
  }

  const followUp = await prisma.prontuarioAnamnesisFollowUp.findFirst({
    where: { id: source.id, record: { contractId, alunoId } },
    select: {
      id: true,
      itemLabel: true,
      createdAt: true,
      updatedAt: true,
      record: { select: { professorId: true } },
    },
  });
  if (followUp) {
    return {
      type: 'prontuario_alert',
      id: followUp.id,
      label: `Acompanhamento de anamnese: ${followUp.itemLabel}`,
      assessedAt: followUp.createdAt.toISOString(),
      origin: 'PRNT - acompanhamento da anamnese',
      version: followUp.updatedAt.toISOString(),
      responsibleProfessorId: followUp.record.professorId,
    };
  }

  const medication = await prisma.prontuarioMedicationProcedure.findFirst({
    where: { id: source.id, record: { contractId, alunoId } },
    select: {
      id: true,
      type: true,
      name: true,
      startDate: true,
      createdAt: true,
      updatedAt: true,
      record: { select: { professorId: true } },
    },
  });
  if (medication) {
    return {
      type: 'prontuario_alert',
      id: medication.id,
      label: `${medication.type === 'medication' ? 'Medicamento' : 'Procedimento'}: ${medication.name}`,
      assessedAt: (medication.startDate ?? medication.createdAt).toISOString(),
      origin: 'PRNT - medicações e procedimentos',
      version: medication.updatedAt.toISOString(),
      responsibleProfessorId: medication.record.professorId,
    };
  }

  const discomfort = await prisma.prontuarioDiscomfortSnapshot.findFirst({
    where: { id: source.id, contractId, alunoId },
    select: {
      id: true,
      snapshotAt: true,
      updatedAt: true,
      record: { select: { professorId: true } },
    },
  });
  if (discomfort) {
    return {
      type: 'prontuario_alert',
      id: discomfort.id,
      label: 'Mapa corporal com desconfortos registrados',
      assessedAt: discomfort.snapshotAt.toISOString(),
      origin: 'PRNT - desconfortos',
      version: discomfort.updatedAt.toISOString(),
      responsibleProfessorId: discomfort.record.professorId,
    };
  }

  return source;
}

async function canonicalizeSource(
  contractId: string,
  alunoId: string,
  source: CapacityPrescriptionSourceRef
): Promise<CapacityPrescriptionSourceRef> {
  if (source.type === 'prontuario_goal') {
    const goal = await prisma.prontuarioGoal.findFirst({
      where: { id: source.id, record: { contractId, alunoId } },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        record: { select: { code: true, professorId: true } },
      },
    });
    if (!goal) return source;
    return {
      type: 'prontuario_goal',
      id: goal.id,
      label: goal.title,
      assessedAt: goal.createdAt.toISOString(),
      origin: `PRNT ${goal.record.code} - objetivos`,
      version: goal.updatedAt.toISOString(),
      responsibleProfessorId: goal.record.professorId,
    };
  }

  if (source.type === 'prontuario_alert') {
    return canonicalizeProntuarioAlert(contractId, alunoId, source);
  }

  if (source.type === 'student_preference') {
    const profile = await prisma.studentProfile.findFirst({
      where: { id: source.id, contractId, alunoId },
      select: {
        id: true,
        sourceType: true,
        sourceReference: true,
        recordedByUserId: true,
        updatedAt: true,
      },
    });
    if (!profile) return source;
    return {
      type: 'student_preference',
      id: profile.id,
      label: 'Preferências e restrições cadastradas pelo aluno',
      assessedAt: profile.updatedAt.toISOString(),
      origin:
        profile.sourceReference ||
        `Perfil segmentado do aluno (${String(profile.sourceType)})`,
      version: profile.updatedAt.toISOString(),
      responsibleProfessorId: await professorIdFromUser(
        contractId,
        profile.recordedByUserId
      ),
    };
  }

  return source;
}

router.post(
  '/alunos/:alunoId',
  authMiddleware,
  professorMiddleware,
  requireCapacityManageBlock,
  async (req: CanonicalSourceRequest, res: Response, next: NextFunction) => {
    try {
      const actor = req.canonicalSourceActor!;
      const body = req.body as Record<string, unknown>;
      if (!Array.isArray(body.sourceRefs)) return next();

      body.sourceRefs = await Promise.all(
        (body.sourceRefs as CapacityPrescriptionSourceRef[]).map((source) =>
          canonicalizeSource(actor.contractId, req.params.alunoId, source)
        )
      );
      return next();
    } catch (error) {
      console.error('Erro ao reconstruir fontes canônicas da prescrição:', error);
      return sendError(res, 'Erro ao validar fontes técnicas', 500);
    }
  }
);

export default router;
