import { Router, Request, Response } from 'express';
import { sendError, sendSuccess } from '@corrida/utils';
import { authMiddleware, professorMiddleware } from '../auth/auth.middleware.js';
import {
  blockAccessMiddleware,
  screenAccessMiddleware,
} from '../access-control/access-control.middleware.js';
import { studentDomainService } from '../alunos/student-domain.service.js';
import { stripLegacyParqFields } from '../alunos/student-parq-boundary.service.js';

const router: Router = Router();

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
}

export function sanitizeInitialAnamnesisForProntuario(intake: unknown) {
  const sanitized = asRecord(stripLegacyParqFields(intake));
  if (!sanitized) return intake;

  const questionnaires = asRecord(sanitized.questionnaires);
  if (!questionnaires) return sanitized;

  const { parq: _parq, ...questionnairesWithoutParq } = questionnaires;
  return {
    ...sanitized,
    questionnaires: questionnairesWithoutParq,
  };
}

function toClinicalIdentity(profile: unknown, alunoId: string) {
  const profileRecord = asRecord(profile);
  const identification = asRecord(profileRecord?.identification);

  return {
    alunoId,
    name: typeof identification?.name === 'string' ? identification.name : null,
    email: typeof identification?.email === 'string' ? identification.email : null,
  };
}

function requestContractId(req: Request) {
  return (req as any).user.contractId as string | undefined;
}

router.get(
  '/alunos/:alunoId/clinical-identity',
  authMiddleware,
  professorMiddleware,
  screenAccessMiddleware('physicalAssessment.protocol'),
  blockAccessMiddleware('physicalAssessment.prnt.summary'),
  async (req: Request, res: Response) => {
    try {
      const contractId = requestContractId(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

      const profile = await studentDomainService.getProfile(req.params.alunoId, {
        companyContractId: contractId,
      });
      if (!profile) return sendError(res, 'Aluno não encontrado no contrato', 404);

      return sendSuccess(
        res,
        toClinicalIdentity(profile, req.params.alunoId),
        'Identificação clínica carregada'
      );
    } catch (error) {
      console.error('Erro ao carregar identificação clínica do PRNT:', error);
      return sendError(res, 'Erro ao carregar identificação clínica', 500);
    }
  }
);

router.get(
  '/alunos/:alunoId/initial-anamnesis',
  authMiddleware,
  professorMiddleware,
  screenAccessMiddleware('physicalAssessment.protocol'),
  blockAccessMiddleware('physicalAssessment.prnt.anamnesisFollowUp'),
  async (req: Request, res: Response) => {
    try {
      const contractId = requestContractId(req);
      if (!contractId) return sendError(res, 'Contrato não encontrado', 404);

      const intake = await studentDomainService.getHealthIntake(req.params.alunoId, {
        companyContractId: contractId,
      });
      if (!intake) return sendError(res, 'Aluno não encontrado no contrato', 404);

      return sendSuccess(
        res,
        sanitizeInitialAnamnesisForProntuario(intake),
        'Anamnese Inicial carregada'
      );
    } catch (error) {
      console.error('Erro ao carregar Anamnese Inicial do PRNT:', error);
      return sendError(res, 'Erro ao carregar Anamnese Inicial', 500);
    }
  }
);

export default router;
